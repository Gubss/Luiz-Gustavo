import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
const load=createRequire(path.join(process.env.RADAR_PLAYWRIGHT_ROOT,'package.json'));const {chromium}=load('playwright');
const dir=process.env.RADAR_EVIDENCE_DIR;const item=JSON.parse(await fs.readFile(path.join(dir,'thor-v4-case.json'),'utf8'));
const db=new DatabaseSync('prisma/radar.db',{readOnly:true});
const spent=db.prepare('SELECT SUM(costUsd) total FROM Generation WHERE createdAt>=?').get(Date.parse('2026-11-15T17:33:57.338Z')).total??0;
assert.ok(spent+1<=5,'Reserva conservadora US$1 para esta única correção dentro do teto cumulativo');
const current=db.prepare('SELECT v.number FROM Idea i JOIN ScriptVersion v ON v.id=i.currentVersionId WHERE i.id=?').get(item.id);db.close();
const mission=await fs.readFile(process.env.RADAR_THOR_REQUEST,'utf8');const request=mission.split('## Roteiro:')[1].split('## Imagem:')[0].replace(/^[^\n]*\n/,'').trim();
const browser=await chromium.launch({executablePath:process.env.RADAR_BROWSER_PATH,headless:true});
try{const page=await browser.newPage({viewport:{width:1280,height:900}});await page.goto('http://127.0.0.1:3002/ideias/'+item.id);
await fs.writeFile(path.join(dir,'thor-v4-ui-before.txt'),await page.locator('main').innerText());
if(current.number===3){await page.getByLabel('Fala a corrigir').selectOption('1');await page.getByLabel('Até a fala').selectOption(String(item.lineCount));await page.getByLabel('O que você quer mudar?').fill(request);await page.getByLabel('Tipo de mudança').selectOption('história');await page.getByRole('button',{name:'Corrigir trecho',exact:true}).click();console.log('THOR_V4_SUBMITTED');}
await page.getByText(/versão 4 · Aguardando aprovação/).waitFor({timeout:240000});
const result=await page.request.get('http://127.0.0.1:3002/api/ideias/'+item.id+'/roteiro');assert.equal(result.status(),200);const markdown=await result.text();assert.match(markdown,/versão 4/);assert.match(markdown,/Referência do canal/);assert.match(markdown,/zonzo/);await fs.writeFile(process.env.RADAR_THOR_OUTPUT,markdown);await page.getByText('Texto para copiar',{exact:true}).click();assert.equal(await page.locator('textarea[readonly]').inputValue(),markdown);await page.screenshot({path:path.join(dir,'thor-v4-review.png'),fullPage:false});console.log('THOR_V4_EXPORTED');}finally{await browser.close()}
