import {mkdirSync,rmSync,copyFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
rmSync(resolve(root,'dist'),{recursive:true,force:true});
mkdirSync(resolve(root,'dist/brand'),{recursive:true});
for(const file of ['index.html','styles.css','app.js','survey.html','survey.css','survey.js','brand/sourcewayfinder-mark.svg']) copyFileSync(resolve(root,'Product_Design',file),resolve(root,'dist',file));
console.log('Built 7 public assets; no responses, tests or internal documents included.');
