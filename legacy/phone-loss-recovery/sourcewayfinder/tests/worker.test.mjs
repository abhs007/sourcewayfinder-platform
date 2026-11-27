import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{validate} from '../cloudflare/worker.js';
const payload=()=>({id:crypto.randomUUID(),version:'needs-v1',consent:true,answers:{experience:'Yes',obstacles:[]}});
const req=(data,origin='https://test.example')=>new Request('https://test.example/api/survey',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(data)});
test('valid consented responses preserve negative opinions',()=>{const data=payload();data.answers.interest='Definitely not';assert.equal(JSON.parse(validate(data)).answers.interest,'Definitely not');});
test('consent, valid IDs, known fields and required experience enforced',()=>{for(const change of [{consent:false},{id:'bad'},{version:'unknown'},{answers:{}},{answers:{experience:'Yes',email:'not collected'}}])assert.throws(()=>validate({...payload(),...change}));});
test('conflicting and duplicate choices rejected',()=>{for(const choices of [['Nothing made it difficult','Something else'],['Something else','Something else']])assert.throws(()=>validate({...payload(),answers:{experience:'Yes',obstacles:choices}}));});
test('comment bounded and omitted optional fields accepted',()=>{assert.doesNotThrow(()=>validate(payload()));assert.throws(()=>validate({...payload(),answers:{experience:'Yes',comment:'a'.repeat(1001)}}));});
test('cross-origin POST rejected before any database call',async()=>assert.equal((await worker.fetch(req(payload(),'https://other.example'),{})).status,403));
test('rate limit returns retry information',async()=>{const r=await worker.fetch(req(payload()),{SURVEY_LIMITER:{limit:async()=>({success:false})}});assert.equal(r.status,429);assert.equal(r.headers.get('Retry-After'),'60');});
test('oversized streamed bodies rejected',async()=>{const data=payload();data.answers.comment='a'.repeat(13000);const r=await worker.fetch(req(data),{SURVEY_LIMITER:{limit:async()=>({success:true})}});assert.equal(r.status,400);});
test('storage failure never reports success or exposes internals',async()=>{const r=await worker.fetch(req(payload()),{SURVEY_LIMITER:{limit:async()=>({success:true})},DB:{prepare(){throw Error('private database details')}}});assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/private database/);});
test('private paths and admin routes are unavailable',async()=>{for(const path of ['/exports','/api/admin','/Survey_Research/.data/responses.sqlite3'])assert.equal((await worker.fetch(new Request('https://test.example'+path),{})).status,404);});
test('retention cleanup uses bound cutoff',async()=>{let sql,args;await worker.scheduled({}, {DB:{prepare(s){sql=s;return {bind(...a){args=a;return {run:async()=>({success:true})}}}}}});assert.equal(sql,'DELETE FROM responses WHERE received_at < ?');assert(Math.abs(Date.parse(args[0])-(Date.now()-180*86400000))<1000);});

test('www URLs redirect with path and query intact',async()=>{for(const host of ['www.sourcewayfinder.org']){const r=await worker.fetch(new Request(`https://${host}/survey.html?from=link`),{});assert.equal(r.status,308);assert.equal(r.headers.get('Location'),'https://sourcewayfinder.org/survey.html?from=link');}});
test('HTTP primary domain redirects to HTTPS',async()=>{const r=await worker.fetch(new Request('http://sourcewayfinder.org/'),{});assert.equal(r.status,308);assert.equal(r.headers.get('Location'),'https://sourcewayfinder.org/');});
