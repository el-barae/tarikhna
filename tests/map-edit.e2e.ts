import {test,expect} from '@playwright/test';
import {execFile} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import {promisify} from 'node:util';
import {resolve} from 'node:path';
import {getActiveData,localized,validateDataset,type Dataset} from '../packages/core/src';
const email=`map-${randomUUID()}@athar.local`,password=randomBytes(24).toString('base64url');
test.beforeAll(async()=>{
 await promisify(execFile)(process.execPath,[resolve('node_modules/tsx/dist/cli.mjs'),'scripts/setup.ts','--name','Map editing test'],{cwd:process.cwd(),env:{...process.env,DATABASE_URL:'',HISTORY_STORE_PATH:process.env.HISTORY_E2E_STORE_PATH||'/tmp/athar-browser-tests-v2/.store.json',ADMIN_EMAIL:email,ADMIN_PASSWORD:password}});
});
test('draws and drags a territory, saves one year, and preserves the published atlas',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const baseline=await (await page.request.get('/api/dataset')).json() as {dataset:Dataset;versionId:string};
 await page.goto('/?year=800');
 await page.locator('.territory-label').filter({hasText:'Califat abbasside'}).click();
 await page.getByRole('button',{name:'Mode modification',exact:true}).click();
 const login=page.getByRole('dialog');await expect(login).toBeVisible();
 await login.getByLabel('Adresse e-mail',{exact:true}).fill(email);await login.getByLabel('Mot de passe',{exact:true}).fill(password);await login.getByRole('button',{name:'Se connecter',exact:true}).click();
 const editor=page.getByRole('dialog',{name:'Modifier un État sur la carte'});
 await expect(editor).toBeVisible();await expect(editor.getByRole('combobox',{name:'État',exact:true})).toHaveValue('abbasid-caliphate');
 await expect(editor.getByLabel('Année à modifier',{exact:true})).toHaveValue('800');
 await expect(editor.locator('.draw-vertex').first()).toBeVisible();
 await editor.getByLabel('Nom',{exact:true}).fill('Abbassides — correction de 800');
 await editor.getByRole('button',{name:'Redessiner le territoire',exact:true}).click();
 const canvas=editor.locator('.maplibregl-canvas');const bounds=(await canvas.boundingBox())!;
 for(const [x,y] of [[.3,.3],[.65,.3],[.65,.65],[.3,.65]])await canvas.click({position:{x:bounds.width*x,y:bounds.height*y}});
 await editor.getByRole('button',{name:'Terminer le tracé',exact:true}).click();
 await expect(editor.locator('.draw-vertex')).toHaveCount(4);
 const first=(await editor.locator('.draw-vertex').first().boundingBox())!;
 await page.mouse.move(first.x+first.width/2,first.y+first.height/2);await page.mouse.down();await page.mouse.move(first.x+25,first.y+20,{steps:8});await page.mouse.up();
 await expect.poll(async()=> (await editor.locator('.draw-vertex').first().boundingBox())!.x).toBeGreaterThan(first.x+10);
 const vertex=editor.locator('.draw-vertex').first();await vertex.focus();await vertex.press('ArrowRight');await expect(vertex).toBeFocused();
 await editor.locator('.draw-midpoint').first().click();await expect(editor.locator('.draw-vertex')).toHaveCount(5);
 await editor.getByRole('button',{name:'Ajouter une zone',exact:true}).click();
 await canvas.click({position:{x:bounds.width*.8,y:bounds.height*.5}});await editor.getByRole('button',{name:'Annuler le tracé',exact:true}).click();
 await expect(editor.locator('.draw-vertex')).toHaveCount(5);
 const savedResponse=page.waitForResponse(r=>r.url().endsWith('/api/versions')&&r.request().method()==='POST');
 await editor.getByRole('button',{name:'Enregistrer un brouillon',exact:true}).click();
 const response=await savedResponse;expect(response.ok()).toBe(true);const {version}=await response.json();
 await expect(editor.getByText(/Brouillon enregistré/)).toBeVisible();expect(version.status).toBe('draft');
 const dataset=version.dataset as Dataset;expect(validateDataset(dataset).errors).toEqual([]);
 const at=(d:Dataset,y:number)=>getActiveData(d,y).states.find(s=>s.id==='abbasid-caliphate')!;
 expect(localized(at(dataset,800).name)).toBe('Abbassides — correction de 800');
 expect(at(dataset,800).territories.features[0].geometry).not.toEqual(at(baseline.dataset,800).territories.features[0].geometry);
 for(const year of [799,801]){expect(at(dataset,year).name).toEqual(at(baseline.dataset,year).name);expect(at(dataset,year).territories.features[0].geometry).toEqual(at(baseline.dataset,year).territories.features[0].geometry);}
 expect((await (await page.request.get('/api/dataset')).json()).versionId).toBe(baseline.versionId);
 await page.screenshot({path:'/tmp/athar-map-edit-desktop.png'});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/athar-map-edit-mobile.png'});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await expect(editor.getByRole('button',{name:'Enregistrer un brouillon',exact:true})).toBeVisible();
 await editor.getByRole('button',{name:'Ouvrir les versions',exact:true}).click();
 await expect(page.locator('.version-card').filter({hasText:'Abbassides — correction de 800'}).first()).toBeVisible();
 expect(errors).toEqual([]);
});

test('cancels a drawing without saving or changing the original geometry',async({page})=>{
 await page.goto('/?year=800');await page.getByRole('button',{name:'Mode modification',exact:true}).click();
 const login=page.getByRole('dialog');await login.getByLabel('Adresse e-mail',{exact:true}).fill(email);await login.getByLabel('Mot de passe',{exact:true}).fill(password);await login.getByRole('button',{name:'Se connecter',exact:true}).click();
 const editor=page.getByRole('dialog',{name:'Modifier un État sur la carte'});
 await expect(editor).toBeVisible();
 const before=await (await page.request.get('/api/versions')).json();
 await expect(editor.locator('.draw-vertex').first()).toBeVisible();const count=await editor.locator('.draw-vertex').count();
 await editor.getByRole('button',{name:'Redessiner le territoire',exact:true}).click();
 await editor.getByRole('button',{name:'Annuler le tracé',exact:true}).click();await expect(editor.locator('.draw-vertex')).toHaveCount(count);
 await editor.getByLabel('Nom',{exact:true}).fill('À abandonner');
 await editor.getByRole('button',{name:'Quitter le mode modification',exact:true}).click();
 await editor.getByRole('alertdialog').getByRole('button',{name:'Abandonner les modifications',exact:true}).click();
 await expect(editor).not.toBeVisible();expect((await (await page.request.get('/api/versions')).json()).versions).toHaveLength(before.versions.length);
});

test.describe('Touch drawing',()=>{
 test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,colorScheme:'dark'});
 test('draws on the Arabic mobile map in dark mode',async({page})=>{
  const login=await page.request.post('/api/auth/login',{data:{email,password},headers:{Origin:'http://localhost:3100'}});expect(login.ok()).toBe(true);
  await page.goto('/?year=800&lang=ar');await page.getByRole('button',{name:'وضع التعديل',exact:true}).tap();
  const editor=page.getByRole('dialog',{name:'تعديل دولة على الخريطة'});await expect(editor).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await expect(editor).toHaveAttribute('dir','rtl');
  await expect(editor.locator('.draw-vertex').first()).toBeVisible();
  await editor.getByRole('button',{name:'إعادة رسم الإقليم',exact:true}).tap();
  const canvas=editor.locator('.maplibregl-canvas'),bounds=(await canvas.boundingBox())!;
  for(const [x,y] of [[.25,.4],[.7,.4],[.5,.62]])await page.touchscreen.tap(bounds.x+bounds.width*x,bounds.y+bounds.height*y);
  await editor.getByRole('button',{name:'إنهاء الرسم',exact:true}).tap();await expect(editor.locator('.draw-vertex')).toHaveCount(3);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'/tmp/athar-map-edit-ar-dark.png'});
  await editor.getByRole('button',{name:'مغادرة وضع التعديل',exact:true}).tap();
  await editor.getByRole('button',{name:'التخلي عن التغييرات',exact:true}).tap();await expect(editor).not.toBeVisible();
 });
});
