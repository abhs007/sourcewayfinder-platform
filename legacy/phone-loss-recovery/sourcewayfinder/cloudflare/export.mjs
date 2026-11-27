import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const schema=JSON.parse(readFileSync(resolve(root,'Product_Design/survey-schema.json'),'utf8'));
const raw=execFileSync(resolve(root,'node_modules/.bin/wrangler'),['d1','execute','DB','--remote','--command','SELECT id,received_at,version,notice_version,payload FROM responses ORDER BY received_at','--json'],{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024});
const result=JSON.parse(raw);if(!result.every(r=>r.success))throw Error('Database export failed');
const rows=result.flatMap(r=>r.results);
const fields=['id','received_at','version','notice_version',...schema.questions.map(q=>q.id),'comment'];
const cell=value=>{let text=Array.isArray(value)?value.join(' | '):String(value??'');if(/^[\s]*[=+\-@]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
const lines=[fields.map(cell).join(',')];
for(const row of rows){const merged={...JSON.parse(row.payload).answers,...row};lines.push(fields.map(k=>cell(merged[k])).join(','));}
const dir=resolve(root,'exports');mkdirSync(dir,{recursive:true,mode:0o700});
const dest=resolve(dir,`survey-${new Date().toISOString().replaceAll(':','-')}.csv`);writeFileSync(dest,lines.join('\n')+'\n',{mode:0o600});console.log(`Exported ${rows.length} responses to ${dest}. Keep this file private.`);
