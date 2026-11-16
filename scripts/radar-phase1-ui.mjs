import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const load=process.env.RADAR_PLAYWRIGHT_ROOT?createRequire(path.join(process.env.RADAR_PLAYWRIGHT_ROOT,'package.json')):createRequire(import.meta.url);
const {chromium}=load('playwright');
(async()=>{
 const dir=process.env.RADAR_EVIDENCE_DIR;
 const run=JSON.parse(await fs.readFile(path.join(dir,'run.json'),'utf8'));
 const browser=await chromium.launch({executablePath:process.env.RADAR_BROWSER_PATH,headless:true});
 const context=await browser.newContext({viewport:{width:1280,height:900}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
 await page.goto('http://127.0.0.1:3002/ideias/'+run.ids[0],{waitUntil:'domcontentloaded',timeout:60000});
 await page.getByRole('tab',{name:'Roteiro falado',exact:true}).waitFor({timeout:30000});
 assert.equal(await page.getByRole('tab',{name:'Roteiro falado',exact:true}).getAttribute('aria-selected'),'true');
 const before=await page.getByRole('tabpanel').innerText();assert.match(before,/vem cá|ao contrário/i);
 await fs.writeFile(path.join(dir,'ui-before.txt'),await page.locator('main').innerText());
 await page.getByRole('tab',{name:'Animação e direção',exact:true}).click();await page.getByText('A direção será preparada após a aprovação das falas, na etapa de produção.',{exact:true}).waitFor();
 await page.getByRole('tab',{name:'Roteiro falado',exact:true}).click();
 await page.locator('#roteiro').screenshot({path:path.join(dir,'review-before.png')});
 if(process.env.RADAR_UI_CORRECTION==='1'){
  const options=await page.getByLabel('Fala a corrigir').locator('option').allTextContents();const index=options.findIndex(t=>/Mãe:/.test(t));assert.ok(index>=0);
  await page.getByLabel('Fala a corrigir').selectOption(String(index+1));
  await page.getByLabel('O que você quer mudar?').fill('Deixe esta fala da mãe mais natural, como mãe bronqueando. Preserve o sentido e a regra do Thor; não altere nenhuma outra fala.');
  await page.getByLabel('Tipo de mudança').selectOption('voz');
  await page.getByRole('button',{name:'Corrigir trecho',exact:true}).click();
  await page.getByText(/Começou em segundo plano/).waitFor();
  console.log('UI_CORRECTION_SUBMITTED');
  await page.getByText(/versão 2 · Aguardando aprovação/).waitFor({timeout:240000});
  assert.notEqual(await page.getByRole('tabpanel').innerText(),before);
 }
 await page.getByRole('button',{name:'Aprovar falas',exact:true}).click();await page.getByText(/Falas aprovadas/,{exact:false}).first().waitFor();
 await page.reload();await page.getByText(/Falas aprovadas/,{exact:false}).first().waitFor();
 if(process.env.RADAR_UI_CORRECTION==='1'||process.env.RADAR_UI_RESTORE_FROM){
 const baseVersion=process.env.RADAR_UI_RESTORE_FROM??'1';
 await page.getByText(/^Versões e comparação/).click();await page.getByRole('button',{name:'Restaurar versão '+baseVersion,exact:true}).click();await page.getByText(/versão \d+ · Aguardando aprovação/).waitFor();
 assert.equal(await page.getByRole('tabpanel').innerText(),before);
 await page.getByRole('button',{name:'Aprovar falas',exact:true}).click();await page.getByText(/versão \d+ · Falas aprovadas/).waitFor();
 }
 const exported=await page.request.get('http://127.0.0.1:3002/api/ideias/'+run.ids[0]+'/roteiro');assert.equal(exported.status(),200);const text=await exported.text();assert.match(text,/Referência do canal/);assert.doesNotMatch(text,/\[x\]|Pendências:\*\* nenhuma/);
 await page.getByText('Texto para copiar',{exact:true}).click();assert.equal(await page.locator('textarea[readonly]').inputValue(),text);
 await fs.writeFile(path.join(dir,'ui-export.md'),text);await page.locator('#roteiro').screenshot({path:path.join(dir,'review-after.png')});
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.locator('#roteiro').screenshot({path:path.join(dir,'review-mobile.png')});
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(dir,'ui-result.json'),JSON.stringify({ok:true,ids:run.ids,errors,corrected:process.env.RADAR_UI_CORRECTION==='1'},null,2));console.log('UI_OK');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
