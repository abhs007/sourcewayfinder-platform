import {chromium} from 'playwright';
import {spawn,execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'sw-survey-'));
const server=spawn('python3',[root+'/Survey_Research/server.py','--port','0','--db',temp+'/test.sqlite3']);
let browser;
const checks=[];
try {
const url=await new Promise((resolve,reject)=>{server.stdout.once('data',d=>resolve(d.toString().trim().split('Local survey: ')[1]));server.on('error',reject);server.on('exit',c=>reject(new Error('server exit '+c)));});
const origin=new URL(url).origin;
browser=await chromium.launch({headless:true});
const page=await browser.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(url);await page.getByRole('button',{name:'Submit my answers',exact:true}).waitFor();
await page.waitForFunction(()=>!document.querySelector('#submit-survey').disabled);
await page.getByRole('button',{name:'Submit my answers',exact:true}).click();
assert.equal(await page.locator('[name=consent]').evaluate(e=>e.validity.valueMissing),true);checks.push('Consent required before submission');
for (const width of [320,390,768,1440]) {await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
checks.push('Survey reflow at 320, 390, 768 and 1440 pixels');
await page.setViewportSize({width:390,height:844});
await page.screenshot({path:root+'/Product_Design/shots/survey-mobile.png',fullPage:true});
await page.locator('[name=consent]').check();await page.locator('[name=experience][value=Yes]').check();
await page.locator('[name=obstacles]').nth(0).check();await page.locator('[name=obstacles]').nth(8).check();
await page.locator('#submit-survey').click();assert.match(await page.locator('#survey-error').innerText(),/on its own/);checks.push('Contradictory checkbox selections blocked');
await page.locator('[name=obstacles]').nth(8).uncheck();
await page.locator('#comment').fill('=SYNTHETIC QA ONLY');
await page.route('**/api/survey',r=>r.abort());await page.locator('#submit-survey').click();
await page.getByRole('button',{name:'Retry saving my answers'}).waitFor();
assert.equal(await page.locator('#survey-success').isVisible(),false);checks.push('Network failure never shows success; response preserved for retry');
await page.unroute('**/api/survey');await page.getByRole('button',{name:'Retry saving my answers'}).click();await page.locator('#survey-success').waitFor();checks.push('Successful retry persists response and shows confirmation');
const payload={id:crypto.randomUUID(),version:'needs-v1',consent:true,answers:{experience:'No',obstacles:[],comment:'SYNTHETIC API TEST'}};
async function post(body,from=origin) {return page.request.post(origin+'/api/survey',{headers:{Origin:from,'Content-Type':'application/json'},data:body});}
assert.equal((await post(payload)).status(),200);assert.equal((await post(payload)).status(),200);checks.push('Repeated response ID is idempotent');
assert.equal((await post({...payload,answers:{experience:'Yes'}})).status(),409);checks.push('Changed duplicate rejected');
assert.equal((await post({...payload,id:crypto.randomUUID(),consent:false})).status(),400);
assert.equal((await post({...payload,id:crypto.randomUUID(),answers:{experience:'invented'}})).status(),400);checks.push('Server rejects missing consent and invalid answer values');
assert.equal((await post({...payload,id:crypto.randomUUID()},'https://other.example')).status(),403);checks.push('Cross-origin submissions rejected');
assert.equal((await page.request.get(origin+'/../Survey_Research/.data/responses.sqlite3')).status(),404);checks.push('Private data not served by static route');
execFileSync('python3',[root+'/Survey_Research/server.py','--db',temp+'/test.sqlite3','--export',temp+'/test.csv']);
const csv=fs.readFileSync(temp+'/test.csv','utf8');assert.match(csv,/'=SYNTHETIC/);
const count=execFileSync('python3',['-c',"import sqlite3,sys;print(sqlite3.connect(sys.argv[1]).execute('select count(*) from responses').fetchone()[0])",temp+'/test.sqlite3']).toString().trim();assert.equal(count,'2');checks.push('CSV export escapes spreadsheet formulas; exactly two test responses stored');
await page.goto('file://'+root+'/Product_Design/survey.html');assert.equal(await page.locator('#submit-survey').isDisabled(),true);assert.match(await page.locator('#connection').innerText(),/not being collected/);checks.push('File preview clearly blocks collection');
assert.deepEqual(errors,[]);checks.push('No browser runtime errors');
const result={date:'2026-11-21',checks,synthetic:true,real_participants:0};fs.writeFileSync(root+'/Survey_Research/QA_results.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
} finally {if(browser)await browser.close();server.kill();fs.rmSync(temp,{recursive:true,force:true});}
