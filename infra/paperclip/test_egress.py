import importlib.util,pathlib,unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('egress',pathlib.Path(__file__).with_name('egress.py'))
egress=importlib.util.module_from_spec(spec);spec.loader.exec_module(egress)

class FakeRequest:
    def __init__(self,data):self.data=data;self.sent=b''
    def settimeout(self,_):pass
    def recv(self,_):data=self.data;self.data=b'';return data
    def sendall(self,data):self.sent+=data

class EgressBoundary(unittest.TestCase):
    def test_private_and_mixed_dns_are_denied(self):
        for addresses in [[('127.0.0.1',443)],[('8.8.8.8',443),('10.0.0.1',443)]]:
            request=FakeRequest(b'CONNECT api.openai.com:443 HTTP/1.1\r\n\r\n')
            with patch.object(egress.socket,'getaddrinfo',return_value=[(2,1,6,'',addr) for addr in addresses]),patch.object(egress.socket,'socket') as connect:
                egress.Proxy(request,('fixture',0),None)
                connect.assert_not_called();self.assertIn(b'403 Forbidden',request.sent)
    def test_unapproved_host_port_and_plain_http_are_denied(self):
        for request_line in ['CONNECT example.com:443','CONNECT api.openai.com:80','CONNECT api.openai.com.evil.test:443','GET http://api.openai.com/']:
            request=FakeRequest((request_line+' HTTP/1.1\r\n\r\n').encode())
            with patch.object(egress.socket,'getaddrinfo') as resolve:
                egress.Proxy(request,('fixture',0),None)
                resolve.assert_not_called();self.assertIn(b'403 Forbidden',request.sent)
    def test_dangerous_api_routes_not_allowlisted(self):
        for path in ['/api/agents/00000000-0000-0000-0000-000000000000/permissions','/api/approvals/00000000-0000-0000-0000-000000000000/approve','/api/companies/00000000-0000-0000-0000-000000000000/agents','/api/environments/00000000-0000-0000-0000-000000000000']:
            self.assertIsNone(egress.WRITE_PATHS.fullmatch(path))
        self.assertIsNotNone(egress.WRITE_PATHS.fullmatch('/api/issues/00000000-0000-0000-0000-000000000000/comments'))

if __name__=='__main__':unittest.main()
