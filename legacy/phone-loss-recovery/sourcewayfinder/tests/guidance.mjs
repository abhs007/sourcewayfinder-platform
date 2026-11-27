import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'../Product_Design');
const server=http.createServer((req,res)=>{const file=path.join(root,req.url==='/'?'index.html':req.url);try{res.setHeader('Content-Type',file.endsWith('.svg')?'image/svg+xml':file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true});
const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
const url='http://127.0.0.1:'+server.address().port;
const tests=[];
async function run(topic,answers){await page.goto(url);await page.locator(`[data-start="${topic}"]`).click();for(const answer of answers){await page.locator(`input[value="${answer}"]`).check();await page.locator('#continue').click();}await page.waitForURL('**/#results');await page.locator('.status').waitFor();}
try{
 await page.goto(url);await page.keyboard.press('Tab');assert.equal(await page.locator('.skip').evaluate(e=>e===document.activeElement),true);tests.push('Skip link is first keyboard target');
 await run('phone',['yes','yes','yes']);assert.match(await page.locator('h1').innerText(),/documented/);tests.push('Verizon supported route');
 await run('phone',['yes','yes','unknown']);assert.match(await page.locator('h1').innerText(),/clarification/);tests.push('Unknown access remains unresolved');
 await page.locator('summary').first().click();await page.locator('#edit').click();assert.equal(await page.locator('input[value=yes]').isChecked(),true);await page.locator('#continue').click();await page.locator('#back').click();assert.equal(await page.locator('input[value=yes]').isChecked(),true);tests.push('Edit and back preserve answers');
 await run('ssa',Array(6).fill('yes'));assert.match(await page.locator('h1').innerText(),/summarized/);tests.push('SSA positive path remains qualified');
 let download=page.waitForEvent('download');await page.locator('#save').click();assert.equal((await download).suggestedFilename(),'guidance-summary.txt');tests.push('Summary download');
 await run('ssa',['no','yes','yes','yes','unknown','yes']);assert.match(await page.locator('h1').innerText(),/confirm/);tests.push('SSA out-of-scope and unknown route');
 await page.goto(url+'/#report');await page.locator('#report-url').fill('https://www.ssa.gov/number-card/replace-card');await page.locator('#report-detail').fill('The two source pages appear to describe different eligibility conditions.');download=page.waitForEvent('download');await page.getByRole('button',{name:'Download report draft'}).click();assert.equal((await download).suggestedFilename(),'guidance-issue-draft.txt');tests.push('Issue draft downloads without sending');
 for(const width of [320,390,768,1024,1440]){await page.setViewportSize({width,height:900});for(const route of ['home','sources','method','report']){await page.goto(url+'/#'+route);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${width} ${route}`);}await run('phone',['yes','yes','unknown']);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`result overflow ${width}`);tests.push(`Reflow ${width}px`);}
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('main').evaluate(e=>getComputedStyle(e).animationName),'none');tests.push('Reduced motion');
 await page.reload();assert.equal(await page.locator('[data-start]').count(),2);tests.push('Refresh clears answers');
 assert.equal(errors.length,0);tests.push('No browser runtime errors');
 console.log(JSON.stringify({passed:tests,errors},null,2));
 fs.writeFileSync(path.join(root,'QA_results.json'),JSON.stringify({date:'2026-11-21',passed:tests,errors},null,2));
}finally{await browser.close();server.close();}
