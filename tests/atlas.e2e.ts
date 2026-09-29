import {test,expect} from '@playwright/test';

test('interactive atlas: map, exact year filtering, layers, search and sources',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('.city-label').first()).toBeVisible();
  const dimensions=await page.locator('.map-canvas').boundingBox();
  expect(dimensions?.height).toBeGreaterThan(300);
  await expect(page.locator('.territory-label').filter({hasText:'abbasside'})).toBeVisible();
  await page.getByRole('checkbox',{name:'États & califats'}).uncheck();
  await expect(page.locator('.territory-label').filter({hasText:'abbasside'})).toHaveCount(0);
  await page.getByRole('checkbox',{name:'États & califats'}).check();
  const timeline=page.getByRole('slider');
  await timeline.fill('740');
  await expect(page.locator('.territory-label').filter({hasText:'abbasside'})).toHaveCount(0);
  await expect(page.locator('.territory-label').filter({hasText:'Califat omeyyade'})).toBeVisible();
  const search=page.getByRole('combobox',{name:'Rechercher une ville, une dynastie, un événement…'});
  await search.fill('Bagdad');
  await page.getByRole('option').filter({hasText:'Fondation de Bagdad'}).first().click();
  await expect(page.locator('.detail-panel h2')).toHaveText('Fondation de Bagdad');
  await expect(page.getByRole('spinbutton',{name:'Année'})).toHaveValue('762');
  await expect(page.locator('.detail-sources a').first()).toHaveAttribute('href',/^https:\/\//);
  await page.locator('.detail-panel').getByRole('button',{name:'Fermer'}).click();
  await page.getByRole('button',{name:'Animer la chronologie'}).click();
  await expect(page.getByRole('spinbutton',{name:'Année'})).not.toHaveValue('762');
  await page.getByRole('button',{name:'Mettre en pause'}).click();
  await expect(page.locator('.map-error')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Arabic RTL and mobile navigation remain usable without overflow',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/?lang=ar&year=800');
  await expect(page.locator('html')).toHaveAttribute('dir','rtl');
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  await page.locator('.mobile-explore').click();
  await expect(page.getByRole('checkbox',{name:'المدن التاريخية'})).toBeVisible();
  await page.getByRole('checkbox',{name:'المدن التاريخية'}).uncheck();
  await page.locator('.mobile-explore').click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.locator('.language-select select').selectOption('en');
  await expect(page.locator('html')).toHaveAttribute('dir','ltr');
  await expect(page.locator('.time-readout .eyebrow')).toHaveText('The world in');
  await page.reload();
  // An explicit URL locale takes priority over the saved preference.
  await expect(page.locator('html')).toHaveAttribute('lang','ar');
});

test('visitor cannot mutate datasets or read the contribution history',async({request})=>{
  const response=await request.get('/api/dataset');expect(response.ok()).toBeTruthy();
  const {dataset}=await response.json();
  const save=await request.post('/api/versions',{data:{dataset,summary:'Unauthorized'},headers:{Origin:'http://localhost:3100'}});
  expect(save.status()).toBe(401);
  expect((await request.get('/api/versions')).status()).toBe(401);
});

test('dated capitals, city names and symbolic markers follow the selected year',async({page})=>{
  await page.goto('/?year=836');
  const year=page.getByRole('spinbutton',{name:'Année'});
  await page.locator('.territory-label').filter({hasText:'Califat abbasside'}).click();
  await expect(page.locator('.detail-meta')).toContainText('Samarra');
  await year.fill('892');await year.press('Enter');
  await expect(page.locator('.detail-meta')).toContainText('Bagdad');
  await page.locator('.detail-panel').getByRole('button',{name:'Fermer'}).click();
  const search=page.getByRole('combobox',{name:'Rechercher une ville, une dynastie, un événement…'});
  await search.fill('Yathrib');await page.getByRole('option').first().click();
  await expect(page.locator('.detail-panel h2')).toHaveText('Yathrib');
  await year.fill('622');await year.press('Enter');
  await expect(page.locator('.detail-panel h2')).toHaveText('Médine');
  await page.locator('.detail-panel').getByRole('button',{name:'Fermer'}).click();
  await search.fill('Avènement des Abbassides');await page.getByRole('option').first().click();
  await expect(page.locator('.detail-panel')).toContainText('Repère symbolique');
  await year.fill('1923');await year.press('Enter');
  await expect(page.locator('.territory-label').filter({hasText:'Empire ottoman'})).toHaveCount(0);
  await expect(page.locator('.map-error')).toHaveCount(0);
});
