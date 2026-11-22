"""Bounded HTTPS CONNECT proxy. Never log URL paths, headers, or payloads."""
import http.client, http.server, ipaddress, json, re, select, socket, socketserver, threading, time, uuid

ALLOWED = ('chatgpt.com', 'openai.com', 'github.com', 'githubusercontent.com',
           'npmjs.org', 'npmjs.com', 'pnpm.io')

class Proxy(socketserver.BaseRequestHandler):
    def handle(self):
        self.request.settimeout(15)
        peer = None
        try:
            data = b''
            while b'\r\n\r\n' not in data:
                chunk = self.request.recv(1024)
                if not chunk:
                    return
                data += chunk
                if len(data) > 8192:
                    raise ValueError('invalid_header')
            method, target, _ = data.split(b'\r\n', 1)[0].decode('ascii').split()
            host, port = target.rsplit(':', 1)
            host = host.lower().rstrip('.')
            if method != 'CONNECT' or port != '443' or not any(host == d or host.endswith('.'+d) for d in ALLOWED):
                raise ValueError('destination_denied')
            addresses = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
            if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):
                raise ValueError('address_denied')
            family, kind, proto, _, addr = addresses[0]
            peer = socket.socket(family, kind, proto)
            peer.settimeout(15)
            peer.connect(addr)  # Pin the checked address: no second DNS resolution.
            self.request.sendall(b'HTTP/1.1 200 Connection Established\r\n\r\n')
            deadline = time.monotonic() + 1800
            while time.monotonic() < deadline:
                readable, _, _ = select.select([self.request, peer], [], [], 30)
                for source in readable:
                    chunk = source.recv(65536)
                    if not chunk:
                        return
                    (peer if source is self.request else self.request).sendall(chunk)
        except Exception as exc:
            try: self.request.sendall(b'HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n')
            except OSError: pass
            print(json.dumps({'service':'agent-egress','error':type(exc).__name__}), flush=True)
        finally:
            if peer: peer.close()

class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True
    request_queue_size = 16
    slots = __import__('threading').BoundedSemaphore(64)
    def process_request(self, request, address):
        if not self.slots.acquire(blocking=False):
            request.close(); return
        super().process_request(request, address)
    def process_request_thread(self, request, address):
        try: super().process_request_thread(request, address)
        finally: self.slots.release()

class SshRelay(socketserver.BaseRequestHandler):
    def handle(self):
        peer = socket.create_connection(('agent',2222),timeout=15)
        try:
            deadline=time.monotonic()+1860
            while time.monotonic()<deadline:
                ready,_,_=select.select([peer,self.request],[],[],30)
                for source in ready:
                    chunk=source.recv(65536)
                    if not chunk: return
                    (peer if source is self.request else self.request).sendall(chunk)
        finally: peer.close()

# Deliberately expose task operations only. The controller is not on the agent
# network, so a malicious process cannot bypass this route allowlist.
READ_PATHS = re.compile(r'^/api/(agents/me(?:/inbox-lite)?|skills(?:/[^/?]+)*(?:/SKILL\.md)?|issues/[a-f0-9-]+(?:/(?:comments|documents|work-products))?|companies/[a-f0-9-]+/(?:issues|projects)(?:/[a-f0-9-]+)?)$')
WRITE_PATHS = re.compile(r'^/api/issues/[a-f0-9-]+(?:/(?:comments|checkout|release|documents|work-products))?$')

class ApiGateway(http.server.BaseHTTPRequestHandler):
    def log_message(self, *_): pass
    def do_GET(self): self.forward()
    def do_POST(self): self.forward()
    def do_PATCH(self): self.forward()
    def do_PUT(self): self.forward()
    def do_DELETE(self): self.deny()
    def deny(self):
        print(json.dumps({'service':'agent-api-gateway','event':'route_denied','requestId':str(uuid.uuid4()),'method':self.command,'status':403}),flush=True)
        self.send_response(403);self.send_header('Content-Length','0');self.end_headers()
    def forward(self):
        path=self.path.split('?',1)[0]
        allowed=READ_PATHS.fullmatch(path) if self.command=='GET' else WRITE_PATHS.fullmatch(path)
        if not allowed or not self.headers.get('Authorization','').startswith('Bearer '):
            return self.deny()
        try: length=int(self.headers.get('Content-Length','0'))
        except ValueError: return self.deny()
        if length<0 or length>1024*1024: return self.deny()
        body=self.rfile.read(length) if length else None
        connection=http.client.HTTPConnection('controller',3100,timeout=30)
        started=time.monotonic()
        try:
            headers={'Authorization':self.headers['Authorization'],'Content-Type':'application/json','Host':'controller:3100'}
            if self.headers.get('X-Paperclip-Run-Id'): headers['X-Paperclip-Run-Id']=self.headers['X-Paperclip-Run-Id']
            connection.request(self.command,self.path,body,headers)
            response=connection.getresponse();data=response.read(4*1024*1024+1)
            if len(data)>4*1024*1024: return self.deny()
            self.send_response(response.status)
            self.send_header('Content-Type',response.getheader('Content-Type','application/json'))
            self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
            print(json.dumps({'service':'agent-api-gateway','event':'task_request','requestId':str(uuid.uuid4()),'status':response.status,'durationMs':round((time.monotonic()-started)*1000)}),flush=True)
        except (OSError,ValueError):
            self.send_error(502,'Task service unavailable')
        finally: connection.close()

if __name__=='__main__':
    for server in (Server(('0.0.0.0',8080),Proxy),Server(('0.0.0.0',2222),SshRelay)):
        threading.Thread(target=server.serve_forever,daemon=True).start()
    http.server.ThreadingHTTPServer(('0.0.0.0',8081),ApiGateway).serve_forever()
