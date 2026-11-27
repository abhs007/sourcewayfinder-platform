#!/usr/bin/env python3
"""LaunchAgent supervisor: restart local infrastructure, never trigger model work."""
import json, os, pathlib, subprocess, time

ROOT=pathlib.Path(__file__).resolve().parents[1]
PRIVATE=ROOT/'private/runtime'
LOG=PRIVATE/'login-runtime.log'
os.environ['PATH']='/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin'

def log(message,**fields):
    PRIVATE.mkdir(parents=True,exist_ok=True)
    if LOG.exists() and LOG.stat().st_size>5*1024*1024:
        for i in range(3,0,-1):
            old=pathlib.Path(str(LOG)+'.'+str(i));new=pathlib.Path(str(LOG)+'.'+str(i+1))
            if old.exists():old.replace(new)
        LOG.replace(pathlib.Path(str(LOG)+'.1'))
    with LOG.open('a') as output:
        os.chmod(LOG,0o600)
        output.write(json.dumps({'service':'runtime-supervisor','time':time.time(),'message':message,**fields})+'\n')

def run(args):
    result=subprocess.run(args,cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=600)
    if result.returncode:
        log('startup command failed',command=args[0],code=result.returncode)
        raise SystemExit(result.returncode)

log('starting local runtime')
run(['colima','start','--profile','sourcewayfinder','--cpu','4','--memory','12','--disk','60','--mount','none','--ssh-agent=false'])
run(['/usr/bin/python3',str(ROOT/'ops/paperclip-runtime.py'),'up'])
log('local runtime started; model admission unchanged')
# A passive supervisor makes launchd recover a stopped/crashed VM after sleep.
# It performs infrastructure checks only; no agent or collector wake occurs here.
while True:
    time.sleep(60)
    result=subprocess.run(['docker','--context','colima-sourcewayfinder','info','--format','{{.ServerVersion}}'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=30)
    if result.returncode:
        log('runtime unavailable; exiting for throttled launchd restart')
        raise SystemExit(1)
