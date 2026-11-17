import {createRequire} from 'node:module';
import {spawn,execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);const {PrismaClient}=require('@prisma/client');
const {chromium}=createRequire('C:/Users/gubsB/Documents/adega-sistema/package.json')('playwright');
const evidence=path.resolve('docs/evidence/separate-directors');await fs.mkdir(evidence,{recursive:true});
const database='file:./test-directors-ui-'+process.pid+'.db';
execFileSync(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy'],{windowsHide:true,stdio:'ignore',env:{...process.env,DATABASE_URL:database}});
const db=new PrismaClient({datasources:{db:{url:database}}});
const niche=await db.niche.create({data:{name:'Teste isolado'}});
const format=await db.videoFormat.create({data:{name:'Desmontando o Mundo',nicheId:niche.id,directionStudy:'## A. História\nNão deve entrar no diretor\n## B. Direção\nLuz motivada; voz do kit.\n## C. Canal\nFamília 3D'}});
const ch=await db.myChannel.create({data:{name:'Por Que É Assim? — teste',nicheId:niche.id,durationSec:120,durationMinSec:60,durationMaxSec:180,characters:'Menino e avó',tone:'Leve'}});
for(const key of ['autoCollect','tracker','autoBackup'])await db.setting.create({data:{key,value:'false'}});
await db.setting.create({data:{key:'anthropicApiKey',value:'sk-ant-test'}});
const idea=await db.idea.create({data:{myChannelId:ch.id,nicheId:niche.id,formatId:format.id,format:'short',theme:'O fio do casaco — teste',titles:'[]',projectCode:'PQEA-TESTE',status:'SCRIPT'}});
const data={titulo:idea.theme,duracaoSeg:70,falado:[{personagem:'Menino',fala:'Eu puxei o fio.'},{personagem:'Avó',fala:'Era meu casaco!'}],cenas:[],pendencias:[],checklist:[],conferirFatos:[],channelReference:{name:ch.name,characters:'Menino e avó',rules:'Não mudar vozes'}};
const version=await db.scriptVersion.create({data:{ideaId:idea.id,number:1,content:JSON.stringify(data),markdown:'# Teste\n\n## Roteiro falado\nMenino: Eu puxei o fio.\nAvó: Era meu casaco!',category:'história',origin:'test',author:'Teste'}});
await db.idea.update({where:{id:idea.id},data:{currentVersionId:version.id,scriptData:version.content,script:version.markdown}});
let calls=0;
const mock=createServer(async(req,res)=>{
 let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);calls++;
 const scene={cenas:[{id:'C01',falaInicial:1,falaFinal:2,intencao:'Surpresa',atuacao:'Olha para o fio',posicoes:'Junto à mesa',movimento:'Puxa fio',continuidade:'Fio na mão',ritmo:'Preparação e reação'}],pendencias:[]};
 const photo={cenas:[{cenaId:'C01',plano:'Médio',camera:'Fixa',luz:'Janela à esquerda',cor:'Canônica',composicao:'Mãos e rosto visíveis',transicao:'Continuidade'}],pendencias:[]};
 const sound={falas:[1,2].map(falaId=>({falaId,intencao:'Contar',entrega:'Natural; voz canônica',pausas:'Respiração'})),cenas:[{cenaId:'C01',ambiencia:'Sala',foley:'Fio',efeitos:'Nenhum',musica:'Baixa sob a voz',mixagem:'Voz em primeiro plano'}],pendencias:[]};
 const reply=body.system.includes('Defina encenação')?scene:body.system.includes('Receba a encenação')?photo:sound;
 const event=(type,data)=>`event: ${type}\ndata: ${JSON.stringify({type,...data})}\n\n`;
 res.writeHead(200,{'content-type':'text/event-stream'});
 res.end(event('message_start',{message:{id:'msg_ui',type:'message',role:'assistant',model:'claude-opus-5-5',content:[],stop_reason:null,stop_sequence:null,usage:{input_tokens:100,output_tokens:0}}})+event('content_block_start',{index:0,content_block:{type:'text',text:''}})+event('content_block_delta',{index:0,delta:{type:'text_delta',text:JSON.stringify(reply)}})+event('content_block_stop',{index:0})+event('message_delta',{delta:{stop_reason:'end_turn',stop_sequence:null},usage:{output_tokens:100}})+event('message_stop',{}));
});
await new Promise(resolve=>mock.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:3018';
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p','3018'],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,DATABASE_URL:database,RADAR_BUILD_DIR:'.next-directors',RADAR_NO_TRACKER:'1',ANTHROPIC_API_KEY:'sk-ant-test',YOUTUBE_API_KEY:'',ANTHROPIC_BASE_URL:'http://127.0.0.1:'+mock.address().port}});
let log='';server.stdout.on('data',c=>log+=c);server.stderr.on('data',c=>log+=c);
let browser;
async function waitFor(fn){for(let i=0;i<70;i++){if(await fn())return;await new Promise(r=>setTimeout(r,250));}throw new Error('Timeout: '+log.slice(-4000));}
try{
 await waitFor(async()=>{if(server.exitCode!==null)throw new Error(log);try{return (await fetch(base)).ok;}catch{return false;}});
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1280,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/ideias/'+idea.id);await page.getByText('Aprove as falas desta versão para liberar os diretores.').waitFor();
 assert.equal(await page.getByRole('button',{name:'Preparar diretor de cena',exact:true}).count(),0);
 await page.getByRole('button',{name:'Aprovar falas',exact:true}).click();
 await page.getByRole('button',{name:'Preparar diretor de cena',exact:true}).waitFor();assert.equal(calls,0);
 await page.locator('#directors-title').scrollIntoViewIfNeeded();await page.locator('section[aria-labelledby="directors-title"]').screenshot({path:path.join(evidence,'approved-desktop.png')});
 for(const [stage,label] of [['scene','Preparar diretor de cena'],['photography','Preparar diretor de fotografia'],['sound','Preparar diretor de som e trilha'],['integration','Integrar direções']]){
  await page.getByRole('button',{name:label,exact:true}).click();
  await waitFor(async()=>Boolean((await db.directionRun.findUnique({where:{versionId:version.id}}))?.[stage]));
  await page.reload();
 }
 assert.equal(calls,3);assert.equal((await db.scriptVersion.findUniqueOrThrow({where:{id:version.id}})).content,version.content);
 const response=await page.request.get(base+'/api/ideias/'+idea.id+'/roteiro');assert.equal(response.status(),200);const exported=await response.text();assert.match(exported,/Direção integrada/);assert.match(exported,/Eu puxei o fio/);assert.match(exported,/C01/);await fs.writeFile(path.join(evidence,'export.md'),exported);
 await page.locator('#directors-title').scrollIntoViewIfNeeded();await page.locator('section[aria-labelledby="directors-title"]').screenshot({path:path.join(evidence,'integrated-desktop.png')});
 await page.setViewportSize({width:390,height:844});await page.locator('#directors-title').scrollIntoViewIfNeeded();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.locator('section[aria-labelledby="directors-title"]').screenshot({path:path.join(evidence,'integrated-mobile.png')});
 await page.goto(base+'/formatos/'+format.id);await page.getByLabel('Regras narrativas adicionais').fill('Preserve a lógica e o humor.');await page.getByRole('button',{name:'Salvar regras narrativas',exact:true}).click();await page.getByText('Regras narrativas salvas. Direção permanece separada.').waitFor();assert.equal((await db.videoFormat.findUniqueOrThrow({where:{id:format.id}})).narrativeRules,'Preserve a lógica e o humor.');assert.equal(calls,3);
 await page.locator('#narrative-title').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(evidence,'format-mobile.png')});
 const v2=await db.scriptVersion.create({data:{ideaId:idea.id,number:2,baseVersionId:version.id,content:version.content,markdown:version.markdown,category:'história',origin:'correction',author:'Teste'}});await db.idea.update({where:{id:idea.id},data:{currentVersionId:v2.id}});
 await page.goto(base+'/ideias/'+idea.id);await page.getByText('Aprove as falas desta versão para liberar os diretores.').waitFor();assert.equal(await page.getByRole('button',{name:'Preparar diretor de cena',exact:true}).count(),0);
 const stale=await (await page.request.get(base+'/api/ideias/'+idea.id+'/roteiro')).text();assert.doesNotMatch(stale,/Direção integrada/);
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(evidence,'result.json'),JSON.stringify({ok:true,apiCallsMocked:calls,desktop:'1280x1000',mobile:'390x844',approvalWithoutCall:true,immutable:true,export:true,newVersionBlocksDirection:true,pageErrors:errors},null,2));
 console.log('UI_OK: aprovação → cena → fotografia → som → integração → exportação; desktop/mobile; 3 chamadas simuladas.');
}catch(e){await fs.writeFile(path.join(evidence,'server.log'),log);throw e;}finally{await browser?.close();server.kill();await new Promise(r=>mock.close(r));await db.$disconnect();}
