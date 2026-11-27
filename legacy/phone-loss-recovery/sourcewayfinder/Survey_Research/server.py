"""Local-only collection server. No public admin endpoint or third-party dependencies."""
import argparse, csv, io, json, mimetypes, os, sqlite3, uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent / 'Product_Design'
SCHEMA = json.loads((ROOT / 'survey-schema.json').read_text())
DEFAULT_DB = Path(__file__).resolve().parent / '.data' / 'responses.sqlite3'
ALLOWED = {'index.html', 'styles.css', 'app.js', 'survey.html', 'survey.css', 'survey.js', 'brand/sourcewayfinder-mark.svg'}

def connect(db):
    db.parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(db, timeout=10)
    c.execute('CREATE TABLE IF NOT EXISTS responses (id TEXT PRIMARY KEY, received_at TEXT NOT NULL, version TEXT NOT NULL, payload TEXT NOT NULL)')
    c.commit()
    os.chmod(db, 0o600)
    return c

def validate(data):
    if not isinstance(data, dict) or set(data) != {'id','version','consent','answers'}:
        raise ValueError('Invalid response')
    if not isinstance(data['id'], str) or str(uuid.UUID(data['id'])) != data['id']:
        raise ValueError('Invalid response ID')
    if data['version'] != SCHEMA['version'] or data['consent'] is not True:
        raise ValueError('Survey version and consent are required')
    answers = data['answers']
    if not isinstance(answers, dict) or set(answers) - ({q['id'] for q in SCHEMA['questions']} | {'comment'}):
        raise ValueError('Unexpected answers')
    for q in SCHEMA['questions']:
        value = answers.get(q['id'])
        if q['required'] and not value: raise ValueError('Required answer missing')
        if value is None: continue
        if q['type'] == 'checkbox':
            if not isinstance(value, list) or len(value) > len(q['options']) or any(not isinstance(x,str) or x not in q['options'] for x in value) or len(set(value)) != len(value):
                raise ValueError('Invalid selections')
            if len(value)>1 and any(x in value for x in ['Nothing made it difficult','Not sure / no recent task']): raise ValueError('Conflicting selections')
        elif not isinstance(value, str) or value not in q['options']: raise ValueError('Invalid answer')
    comment = answers.get('comment', '')
    if not isinstance(comment, str) or len(comment)>1000: raise ValueError('Invalid comment')
    return json.dumps(data, ensure_ascii=False, sort_keys=True)

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args): pass  # Do not persist request/IP logs.
    def send(self, status, body, content_type='application/json'):
        if not isinstance(body, bytes): body=json.dumps(body).encode()
        self.send_response(status)
        self.send_header('Content-Type',content_type)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Referrer-Policy','no-referrer')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
        self.end_headers()
        self.wfile.write(body)
    def valid_host(self):
        return self.headers.get('Host') in {f'127.0.0.1:{self.server.server_port}',f'localhost:{self.server.server_port}'}
    def do_GET(self):
        if not self.valid_host(): return self.send(403, {'error':'Invalid host'})
        path=urlsplit(self.path).path
        if path == '/api/survey/status': return self.send(200, {'version':SCHEMA['version'],'storage':'local'})
        name=path.lstrip('/') or 'index.html'
        if name not in ALLOWED: return self.send(404, {'error':'Not found'})
        file=ROOT/name
        self.send(200, file.read_bytes(), mimetypes.guess_type(file)[0] or 'application/octet-stream')
    def do_POST(self):
        if not self.valid_host(): return self.send(403, {'error':'Invalid host'})
        if urlsplit(self.path).path != '/api/survey': return self.send(404, {'error':'Not found'})
        if self.headers.get('Origin') != 'http://' + self.headers.get('Host',''):
            return self.send(403, {'error':'Use the survey on this server'})
        if self.headers.get('Content-Type') != 'application/json': return self.send(415, {'error':'JSON required'})
        try:
            size=int(self.headers.get('Content-Length','0'))
            if not 0<size<=12000: return self.send(413, {'error':'Response too large or empty'})
            data=json.loads(self.rfile.read(size))
            payload=validate(data)
        except (ValueError, TypeError, KeyError, AttributeError): return self.send(400, {'error':'Invalid survey response'})
        try:
            with connect(self.server.db) as c:
                old=c.execute('SELECT payload FROM responses WHERE id=?',(data['id'],)).fetchone()
                if old:
                    if old[0]!=payload: return self.send(409, {'error':'Response ID already used'})
                else:
                    c.execute('INSERT INTO responses VALUES (?,?,?,?)',(data['id'],datetime.now(timezone.utc).isoformat(),SCHEMA['version'],payload))
            self.send(200, {'saved':True,'id':data['id']})
        except sqlite3.Error: self.send(503, {'error':'Storage unavailable'})

def export(db, output):
    if not db.exists(): raise SystemExit('No response database exists yet.')
    fields=['id','received_at','version']+[q['id'] for q in SCHEMA['questions']]+['comment']
    def safe(value):
        value=' | '.join(value) if isinstance(value,list) else str(value or '')
        return "'"+value if value.lstrip().startswith(('=','+','-','@')) else value
    with sqlite3.connect(db) as c, open(output,'w',newline='') as f:
        writer=csv.DictWriter(f,fieldnames=fields);writer.writeheader()
        for rid, date, version, payload in c.execute('SELECT * FROM responses ORDER BY received_at'):
            row=json.loads(payload)['answers']; row.update(id=rid,received_at=date,version=version)
            writer.writerow({k:safe(v) for k,v in row.items()})
    os.chmod(output, 0o600)
    print('Export saved to '+str(output))

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port',type=int,default=8765)
    parser.add_argument('--db',type=Path,default=DEFAULT_DB)
    parser.add_argument('--export',type=Path)
    args=parser.parse_args()
    if args.export: export(args.db,args.export)
    else:
        with connect(args.db): pass
        server=ThreadingHTTPServer(('127.0.0.1',args.port),Handler);server.db=args.db
        print(f'Local survey: http://127.0.0.1:{server.server_port}/survey.html',flush=True)
        try: server.serve_forever()
        except KeyboardInterrupt: pass
        finally: server.server_close()
