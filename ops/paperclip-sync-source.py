#!/usr/bin/env python3
"""Import one reviewed Git commit into a new controller volume path, with no history/secrets."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
PRIVATE = ROOT / 'private/runtime'
DOCKER = ['docker', '--context', 'colima-sourcewayfinder']
CONTROLLER = 'sourcewayfinder-controller-1'
BASE = 'http://localhost:3100'
ALLOWED = {'apps', 'docs', 'domains', 'infra', 'ops', 'packages', 'tests', 'workers', '.github'}
SECRET = re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|sk-proj-[A-Za-z0-9_-]{30,})')


def run(args, **kwargs):
    return subprocess.run(args, cwd=ROOT, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, **kwargs).stdout


def api(method, path, body=None):
    headers = {'Cookie': (PRIVATE / 'owner-cookie.txt').read_text().strip(), 'Origin': BASE, 'Content-Type': 'application/json'}
    request = urllib.request.Request(BASE + '/api' + path, headers=headers, method=method,
                                     data=None if body is None else json.dumps(body).encode())
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def idle(company):
    agents = api('GET', '/companies/' + company + '/agents')
    if len(agents) != 7 or any(a['status'] != 'paused' or a.get('runtimeConfig', {}).get('heartbeat', {}).get('wakeOnDemand') is not False for a in agents):
        raise RuntimeError('All seven roles must be paused with demand wakes disabled')
    live = api('GET', '/companies/' + company + '/live-runs')
    if live if isinstance(live, list) else live.get('items', []):
        raise RuntimeError('Active runs prevent source synchronization')


REMOTE = r'''
import hashlib,json,os,pathlib,subprocess,sys,tarfile
archive,commitfile,target,commit,tree,manifestfile=sys.argv[1:]
expected=json.loads(pathlib.Path(manifestfile).read_text())
p=pathlib.Path(target)
def git(*args,input=None):
 return subprocess.run(['git','-C',target,*args],input=input,check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE).stdout.decode().strip()
created=False
if not p.exists():
 p.mkdir(parents=True);created=True
 with tarfile.open(archive) as tar:tar.extractall(p,filter='data')
 git('init','-q','-b','main')
 git('add','--force','--all')
 if git('write-tree')!=tree:raise RuntimeError('Imported tree differs from reviewed commit')
 if git('hash-object','-w','-t','commit','--stdin',input=pathlib.Path(commitfile).read_bytes())!=commit:raise RuntimeError('Commit object mismatch')
 (p/'.git/shallow').write_text(commit+'\n')
 git('update-ref','refs/heads/main',commit)
actual={}
for directory,dirs,files in os.walk(p):
 if pathlib.Path(directory)==p:dirs[:]=[d for d in dirs if d!='.git']
 for name in files:
  file=pathlib.Path(directory)/name
  if file.is_symlink():raise RuntimeError('Unexpected symbolic link')
  actual[str(file.relative_to(p))]=hashlib.sha256(file.read_bytes()).hexdigest()
if actual!=expected:raise RuntimeError('Replica file inventory or digest differs; prior work retained, refusing overwrite')
if git('rev-parse','HEAD')!=commit or git('rev-parse','HEAD^{tree}')!=tree or git('status','--porcelain') or git('remote'):raise RuntimeError('Replica Git identity or cleanliness differs')
print(json.dumps({'commit':commit,'tree':tree,'files':len(actual),'created':created,'path':target,'history':'single shallow commit','remotes':0}))
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--commit', required=True, help='Exact reviewed 40-character commit ID')
    args = parser.parse_args()
    if not re.fullmatch('[0-9a-f]{40}', args.commit):
        raise RuntimeError('An exact commit ID is required')
    commit = run(['git', 'rev-parse', args.commit + '^{commit}']).decode().strip()
    if commit != args.commit:
        raise RuntimeError('Commit resolution mismatch')
    if run(['git', 'diff', '--name-only', 'HEAD']) or run(['git', 'diff', '--cached', '--name-only']):
        raise RuntimeError('Commit all tracked candidate changes before synchronization')
    tree = run(['git', 'rev-parse', commit + '^{tree}']).decode().strip()
    entries = run(['git', 'ls-tree', '-r', '-z', commit]).split(b'\0')
    inventory = {}
    for entry in filter(None, entries):
        meta, rawpath = entry.split(b'\t', 1)
        mode, kind, oid = meta.decode().split()
        path = rawpath.decode('utf-8')
        parts = Path(path).parts
        if mode not in ('100644', '100755') or kind != 'blob' or not parts or any(x in ('..', '.git', 'private', 'node_modules') or x.startswith('.env') or x.startswith('.dev.vars') for x in parts):
            raise RuntimeError('Forbidden committed path or type: ' + path)
        if len(parts) > 1 and parts[0] not in ALLOWED:
            raise RuntimeError('Unreviewed top-level source directory: ' + parts[0])
        content = run(['git', 'cat-file', 'blob', oid])
        if len(content) > 5_000_000 or SECRET.search(content):
            raise RuntimeError('Oversized file or credential pattern: ' + path)
        inventory[path] = hashlib.sha256(content).hexdigest()
    if not inventory or 'package-lock.json' not in inventory or 'AGENTS.md' not in inventory:
        raise RuntimeError('Expected complete platform source')
    manifest = json.loads((PRIVATE / 'bootstrap-manifest.json').read_text())
    company = manifest['companyId']
    PRIVATE.mkdir(mode=0o700, exist_ok=True)
    lock = PRIVATE / 'qualification.lock'
    fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    os.close(fd)
    remote = '/tmp/swf-source-sync-' + os.urandom(8).hex()
    changed = []
    try:
        idle(company)
        mounts = json.loads(run(DOCKER + ['inspect', CONTROLLER, 'sourcewayfinder-agent-1']))
        if any(m['Type'] != 'volume' for container in mounts for m in container['Mounts']):
            raise RuntimeError('Unexpected host mount in controller or agent')
        target = '/paperclip/workspaces/sourcewayfinder-revisions/' + commit
        with tempfile.TemporaryDirectory(prefix='source-sync-', dir=PRIVATE) as local:
            local = Path(local)
            (local / 'source.tar').write_bytes(run(['git', 'archive', '--format=tar', commit]))
            (local / 'commit').write_bytes(run(['git', 'cat-file', 'commit', commit]))
            (local / 'manifest.json').write_text(json.dumps(inventory))
            run(DOCKER + ['exec', CONTROLLER, 'mkdir', remote])
            for name in ['source.tar', 'commit', 'manifest.json']:
                run(DOCKER + ['cp', str(local / name), CONTROLLER + ':' + remote + '/' + name])
            report = json.loads(run(DOCKER + ['exec', '-i', CONTROLLER, 'python3', '-', remote + '/source.tar', remote + '/commit', target, commit, tree, remote + '/manifest.json'], input=REMOTE.encode()))
        idle(company)
        for project in manifest['projects']:
            detail = api('GET', '/projects/' + project['id'])
            matches = [w for w in detail['workspaces'] if w.get('cwd') == '/paperclip/workspaces/sourcewayfinder' or re.fullmatch(r'/paperclip/workspaces/sourcewayfinder-revisions/[0-9a-f]{40}', w.get('cwd') or '')]
            if len(matches) != 1:
                raise RuntimeError('Expected exactly one managed source workspace')
            workspace = matches[0]
            endpoint = '/projects/' + project['id'] + '/workspaces/' + workspace['id']
            saved = {k: workspace.get(k) for k in ['sourceType', 'cwd', 'remoteWorkspaceRef']}
            changed.append((endpoint, saved))
            api('PATCH', endpoint, {'sourceType': 'local_path', 'cwd': target, 'remoteWorkspaceRef': None})
            verified = api('GET', '/projects/' + project['id'])
            if not any(w['id'] == workspace['id'] and w['cwd'] == target for w in verified['workspaces']):
                raise RuntimeError('Project source readback failed')
        idle(company)
        report.update(projects=len(manifest['projects']), allAgentsPaused=True, privatePathsExcluded=True, hostMounts=False, priorWorkspacesPreserved=True)
        output = PRIVATE / 'source-sync-report.json'
        output.write_text(json.dumps(report, indent=2) + '\n'); output.chmod(0o600)
        print(json.dumps(report))
    except Exception:
        for endpoint, saved in reversed(changed):
            try: api('PATCH', endpoint, saved)
            except Exception: print('Project source rollback needs owner reconciliation', flush=True)
        raise
    finally:
        try:
            run(DOCKER + ['exec', CONTROLLER, 'rm', '-rf', remote])
        finally:
            lock.unlink(missing_ok=True)


if __name__ == '__main__':
    main()
