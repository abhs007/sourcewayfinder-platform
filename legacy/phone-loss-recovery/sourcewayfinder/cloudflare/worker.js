import schema from '../Product_Design/survey-schema.json' with {type:'json'};
const headers={
 'Cache-Control':'no-store',
 'Strict-Transport-Security':'max-age=86400',
 'X-Content-Type-Options':'nosniff',
 'Referrer-Policy':'no-referrer',
 'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
 'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
};
const publicPaths=new Set(['/','/index.html','/styles.css','/app.js','/survey.html','/survey.css','/survey.js','/brand/sourcewayfinder-mark.svg']);
const json=(body,status=200,extra={})=>new Response(JSON.stringify(body),{status,headers:{...headers,'Content-Type':'application/json',...extra}});
export function validate(data) {
 if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).sort().join(',')!=='answers,consent,id,version') throw Error('Invalid response');
 if(typeof data.id!=='string'|| !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(data.id)||data.version!==schema.version||data.consent!==true) throw Error('Invalid consent or version');
 const answers=data.answers;
 if(!answers||typeof answers!=='object'||Array.isArray(answers)) throw Error('Invalid answers');
 const allowed=new Set([...schema.questions.map(q=>q.id),'comment']);
 if(Object.keys(answers).some(k=>!allowed.has(k))) throw Error('Unexpected answers');
 const clean={};
 for(const q of schema.questions){
  const value=answers[q.id];
  if(q.required&&!value)throw Error('Required answer');
  if(value===undefined)continue;
  if(q.type==='checkbox'){
   if(!Array.isArray(value)||value.length>q.options.length||value.some(v=>typeof v!=='string'||!q.options.includes(v))||new Set(value).size!==value.length)throw Error('Invalid choices');
   if(value.length>1&&value.some(v=>['Nothing made it difficult','Not sure / no recent task'].includes(v)))throw Error('Conflicting choices');
   clean[q.id]=[...value].sort();
  } else {if(typeof value!=='string'||!q.options.includes(value))throw Error('Invalid answer');clean[q.id]=value;}
 }
 if(answers.comment!==undefined&&(typeof answers.comment!=='string'||answers.comment.length>1000))throw Error('Invalid comment');
 clean.comment=answers.comment||'';
 return JSON.stringify({id:data.id,version:data.version,consent:true,answers:clean});
}
async function limitedBody(request){
 if(Number(request.headers.get('Content-Length'))>12000)throw Error('too large');
 const reader=request.body?.getReader();if(!reader)throw Error('empty');
 const chunks=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>12000){await reader.cancel();throw Error('too large');}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if (['GET','HEAD'].includes(request.method) && url.hostname==='www.sourcewayfinder.org') {
   url.protocol='https:';url.hostname='sourcewayfinder.org';
   return new Response(null,{status:308,headers:{...headers,Location:url.href}});
  }
  if(url.hostname==='sourcewayfinder.org' && url.protocol==='http:'){url.protocol='https:';return new Response(null,{status:308,headers:{...headers,Location:url.href}});}
  try {
   if(url.pathname==='/api/survey/status'&&request.method==='GET'){
    await env.DB.prepare('SELECT 1 FROM responses LIMIT 1').first();
    return json({version:schema.version,storage:'cloudflare',noticeVersion:'2026-11-21-public'});
   }
   if(url.pathname==='/api/survey'){
    if(request.method!=='POST')return json({error:'Method not allowed'},405,{Allow:'POST'});
    if(request.headers.get('Origin')!==url.origin)return json({error:'Please use the survey on this website.'},403);
    if(request.headers.get('Content-Type')!=='application/json')return json({error:'JSON required'},415);
    const {success}=await env.SURVEY_LIMITER.limit({key:request.headers.get('CF-Connecting-IP')||'unknown'});
    if(!success)return json({error:'Please wait one minute before trying again.'},429,{'Retry-After':'60'});
    let data,payload;
    try {data=await limitedBody(request);payload=validate(data);}catch{return json({error:'Check your survey answers.'},400);}
    await env.DB.prepare('INSERT INTO responses (id,received_at,version,notice_version,payload) VALUES (?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(data.id,new Date().toISOString(),schema.version,'2026-11-21-public',payload).run();
    const saved=await env.DB.prepare('SELECT payload FROM responses WHERE id=?').bind(data.id).first();
    if(saved?.payload!==payload)return json({error:'Response ID already used.'},409);
    return json({saved:true,id:data.id});
   }
   if(!publicPaths.has(url.pathname))return json({error:'Not found'},404);
   if(!['GET','HEAD'].includes(request.method))return json({error:'Method not allowed'},405);
   const assetRequest=url.pathname==='/' ? new Request(new URL('/index.html',url),request) : request;
   const response=await env.ASSETS.fetch(assetRequest);
   const secured=new Response(response.body,response);
   for(const [key,value] of Object.entries(headers))secured.headers.set(key,value);
   return secured;
  } catch {return json({error:'Service temporarily unavailable. Please retry.'},503);}
 },
 async scheduled(event,env){
  const cutoff=new Date(Date.now()-180*86400000).toISOString();
  await env.DB.prepare('DELETE FROM responses WHERE received_at < ?').bind(cutoff).run();
 }
};
