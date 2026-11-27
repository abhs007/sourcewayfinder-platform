import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const origin=process.env.SURVEY_ORIGIN||'http://127.0.0.1:8789';
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/');await page.getByRole('heading',{name:'Understand your options. Find your next step.'}).waitFor();
 await page.goto(origin+'/survey.html');await page.waitForFunction(()=>!document.querySelector('#submit-survey').disabled);
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 await page.locator('[name=consent]').check();await page.locator('[name=experience][value=No]').check();
 await page.locator('#comment').fill('SYNTHETIC DEPLOYMENT CHECK — exclude from research');
 const submitted=page.waitForRequest(r=>r.url().endsWith('/api/survey')&&r.method()==='POST');
 await page.locator('#submit-survey').click();const body=(await submitted).postDataJSON();await page.locator('#survey-success').waitFor();
 const duplicate=await page.request.post(origin+'/api/survey',{headers:{Origin:origin,'Content-Type':'application/json'},data:body});assert.equal(duplicate.status(),200);
 for(const path of ['/api/admin','/exports','/survey-schema.json'])assert.equal((await page.request.get(origin+path)).status(),404);
 assert.deepEqual(errors,[]);
 writeFileSync(new URL('../cloudflare-smoke.json',import.meta.url),JSON.stringify({origin,test_response_id:body.id,synthetic:true,checks:['homepage','survey readiness','four viewport widths','successful submission','idempotent retry','private paths blocked','no browser errors']},null,2));
 console.log('Cloudflare browser checks passed. Synthetic response ID: '+body.id);
}finally{await browser.close();}
