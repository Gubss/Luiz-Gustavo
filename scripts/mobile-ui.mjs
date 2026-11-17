import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const {chromium}=createRequire('C:/Users/gubsB/Documents/adega-sistema/package.json')('playwright');
const output='docs/evidence/mobile';await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const errors=[],results=[];
try{
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 page.on('pageerror',e=>errors.push(e.message));
 for(const host of ['localhost','127.0.0.1','192.168.0.132']){
  await page.goto('http://'+host+':3037/radar',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>Object.keys(document.querySelector('aside button')??{}).some(k=>k.startsWith('__reactProps')));
  await page.getByRole('button',{name:'Menu',exact:true}).tap();
  await page.getByRole('button',{name:'Fechar',exact:true}).waitFor();
  assert.equal(await page.locator('#menu-principal').isVisible(),true);
  await page.locator('#menu-principal').getByRole('link',{name:'Gerador',exact:true}).tap();
  await page.waitForURL('**/gerador');
  await page.getByRole('button',{name:'Menu',exact:true}).waitFor();
  assert.equal(await page.locator('#menu-principal').isVisible(),false);
  results.push({host,hydrated:true,menuOpened:true,navigated:true,closedAfterNavigation:true});
 }
 for(const width of [320,390,768,1280]){
  await page.setViewportSize({width,height:844});
  for(const route of ['/radar','/gerador','/ideias','/meus-canais','/meus-videos','/formatos','/formatos/cmwid2w8d0001fsjobic0l9s5','/ideias/cmwidtzdv001qfs6kciw8tczz']){
   await page.goto('http://127.0.0.1:3037'+route,{waitUntil:'domcontentloaded'});
   const sizes=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));
   assert.ok(sizes.scroll<=sizes.client+1,route+' at '+width+': '+JSON.stringify(sizes));
   results.push({route,width,noPageOverflow:true});
   if(width===320&&['/gerador','/meus-videos'].includes(route))await page.screenshot({caret:"initial",path:output+'/'+route.slice(1)+'-320.png'});
  }
 }
 await page.setViewportSize({width:390,height:844});await page.goto('http://192.168.0.132:3037/radar');await page.getByRole('button',{name:'Menu',exact:true}).tap();await page.getByRole('button',{name:'Fechar',exact:true}).waitFor();await page.screenshot({caret:"initial",path:output+'/menu-mobile.png'});
 await page.locator('#menu-principal').getByRole('link',{name:'Formatos',exact:true}).tap();await page.waitForURL('**/formatos');
 await page.goto('http://192.168.0.132:3037/formatos/cmwid2w8d0001fsjobic0l9s5');
 await page.getByRole('button',{name:'Salvar instruções de direção',exact:true}).click();await page.getByText('Instruções salvas.',{exact:false}).waitFor();
 results.push({serverAction:'save same instructions on isolated database',ok:true});
 assert.deepEqual(errors,[]);await fs.writeFile(output+'/results.json',JSON.stringify({ok:true,apiCost:0,results,errors},null,2));console.log('MOBILE_OK: 3 origens, menu e navegação, server action; 8 rotas x 4 larguras sem overflow.');
}finally{await browser.close();}
