import {test, expect, type Page} from '@playwright/test';

const visitor = {id: 'assistant-test-user', name: 'Lectrice', email: 'reader@example.test', role: 'visitor'};

async function mockAccount(page: Page, signedIn = true) {
  await page.route('**/api/auth/me', route => route.fulfill({json: {user: signedIn ? visitor : null}}));
}

async function openAssistant(page: Page) {
  await page.getByRole('button', {name: 'Assistant', exact: true}).click();
  return page.getByRole('dialog', {name: 'Assistant de l’atlas'});
}

test('assistant explains missing setup and restores focus when closed', async ({page}) => {
  await mockAccount(page, false);
  await page.route('**/api/assistant', route => route.fulfill({json: {configured: false, authenticated: false}}));
  await page.goto('/');
  const dialog = await openAssistant(page);
  await expect(dialog.getByText('Assistant en cours de configuration', {exact: true})).toBeVisible();
  await expect(dialog.locator('textarea')).toHaveCount(0);
  await expect(page.locator('main')).toHaveAttribute('inert', '');
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', {name: 'Fermer l’assistant'})).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', {name: 'Réessayer'})).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', {name: 'Assistant', exact: true})).toBeFocused();
});

test('assistant returns after signing in with a visitor account', async ({page}) => {
  let authenticated = false;
  await mockAccount(page, false);
  await page.route('**/api/assistant', route => route.fulfill({json: {configured: true, authenticated}}));
  await page.route('**/api/auth/login', async route => {
    authenticated = true;
    await route.fulfill({json: {user: visitor}});
  });
  await page.goto('/');
  const dialog = await openAssistant(page);
  await dialog.getByRole('button', {name: 'Se connecter', exact: true}).click();
  await expect(page.locator('.login-dialog')).toBeVisible();
  await page.getByLabel('Adresse e-mail').fill(visitor.email);
  await page.getByLabel('Mot de passe').fill('test-only-placeholder');
  await page.locator('.login-dialog').getByRole('button', {name: 'Se connecter', exact: true}).click();
  await expect(page.getByRole('dialog', {name: 'Assistant de l’atlas'})).toBeVisible();
  await expect(page.getByRole('textbox', {name: 'Votre question'})).toBeVisible();
  await expect(page.locator('.studio-dialog')).toHaveCount(0);
  await page.screenshot({path: '/tmp/athar-assistant-desktop-fr.png', fullPage: true});
});

test('assistant sends map context, retains references across close and clears on logout', async ({page}) => {
  await mockAccount(page);
  const requests: Array<{messages: Array<{role: string; content: string}>; context: unknown}> = [];
  await page.route('**/api/assistant', async route => {
    if (route.request().method() === 'GET') { await route.fulfill({json: {configured: true, authenticated: true}}); return; }
    requests.push(route.request().postDataJSON());
    await route.fulfill({json: {
      message: 'En **836**, Samarra devient une résidence califale. [M1]\n\n<img src=x onerror=alert(1)>',
      sources: [
        {id: 'M1', title: 'Chronique historique', url: 'https://makteb.org/book/example', locator: 'Volume 2, page 45'},
        {id: 'M2', title: 'Référence sans lien sûr', url: 'javascript:alert(1)', locator: 'Page 12'},
      ],
      warnings: ['TOOL_FAILED', 'MCP_UNAVAILABLE'],
    }});
  });
  await page.route('**/api/auth/logout', route => route.fulfill({json: {ok: true}}));
  await page.goto('/?year=836');
  await page.locator('.legend-card button').filter({hasText: 'Califat abbasside'}).click();
  const dialog = await openAssistant(page);
  await expect(dialog.locator('.assistant-context')).toContainText('836');
  await expect(dialog.locator('.assistant-context')).toContainText('Califat abbasside');
  await dialog.getByRole('textbox', {name: 'Votre question'}).fill('Quelle est la résidence califale à cette date ?');
  await dialog.getByRole('button', {name: 'Envoyer', exact: true}).click();
  await expect(dialog.locator('.assistant-message-assistant')).toContainText('Samarra');
  expect(requests[0].context).toEqual({year: 836, locale: 'fr', selection: {kind: 'state', id: 'abbasid-caliphate'}});
  expect(requests[0].messages).toHaveLength(1);
  await expect(dialog.locator('.assistant-sources a')).toHaveCount(1);
  await expect(dialog.locator('.assistant-sources a')).toHaveAttribute('href', 'https://makteb.org/book/example');
  await expect(dialog.locator('.assistant-sources')).toContainText('Volume 2, page 45');
  await expect(dialog.locator('.assistant-warnings')).toContainText('Une partie de la recherche documentaire n’a pas abouti.');
  await expect(dialog.locator('.assistant-warnings')).toContainText('La recherche Makteb est indisponible.');
  await expect(dialog.locator('img')).toHaveCount(0);
  await expect(dialog.locator('.assistant-reply-text')).toContainText('<img src=x onerror=alert(1)>');
  await page.keyboard.press('Escape');
  await expect(page.locator('.detail-panel h2')).toHaveText('Califat abbasside');
  await openAssistant(page);
  await expect(page.locator('.assistant-sources a')).toHaveCount(1);
  await page.getByRole('textbox', {name: 'Votre question'}).fill('Et après cette période ?');
  await page.getByRole('button', {name: 'Envoyer', exact: true}).click();
  await expect(page.locator('.assistant-message-assistant')).toHaveCount(2);
  expect(requests[1].messages.map(message => message.role)).toEqual(['user', 'assistant', 'user']);
  await page.keyboard.press('Escape');
  await page.locator('.settings-button').click();
  await page.getByRole('button', {name: 'Déconnexion'}).click();
  await openAssistant(page);
  await expect(page.locator('.assistant-message-assistant')).toHaveCount(0);
  await expect(page.getByRole('dialog', {name: 'Assistant de l’atlas'}).getByRole('button', {name: 'Se connecter', exact: true})).toBeVisible();
});

test('failed questions can be retried, cancelled and edited without duplicate history', async ({page}) => {
  await mockAccount(page);
  let calls = 0;
  let releasePending: () => void = () => {};
  const pausedResponse = new Promise<void>(resolve => { releasePending = resolve; });
  const requests: Array<{messages: Array<{role: string; content: string}>}> = [];
  await page.route('**/api/assistant', async route => {
    if (route.request().method() === 'GET') { await route.fulfill({json: {configured: true, authenticated: true}}); return; }
    calls += 1;
    requests.push(route.request().postDataJSON());
    if (calls === 1) { await route.fulfill({status: 502, json: {error: 'Unavailable', code: 'ASSISTANT_MCP_UNAVAILABLE'}}); return; }
    if (calls === 2) {
      await pausedResponse;
      await route.fulfill({json: {message: 'Cette réponse a été annulée.', sources: []}}).catch(() => {});
      return;
    }
    await route.fulfill({json: {message: 'Voici une réponse à votre question précisée.', sources: []}});
  });
  await page.goto('/');
  const dialog = await openAssistant(page);
  await dialog.getByRole('textbox', {name: 'Votre question'}).fill('Parlez-moi de Bagdad.');
  await dialog.getByRole('button', {name: 'Envoyer', exact: true}).click();
  await expect(dialog.getByRole('alert')).toContainText('La réponse n’a pas pu être préparée.');
  await dialog.getByRole('button', {name: 'Réessayer', exact: true}).click();
  await expect(dialog.locator('.assistant-pending')).toBeVisible();
  await dialog.getByRole('button', {name: 'Arrêter', exact: true}).click();
  releasePending();
  await expect(dialog.locator('.assistant-error')).toContainText('Recherche arrêtée.');
  await expect(dialog.locator('.assistant-message-assistant')).toHaveCount(0);
  await dialog.getByRole('button', {name: 'Modifier la question', exact: true}).click();
  await expect(dialog.getByRole('textbox', {name: 'Votre question'})).toHaveValue('Parlez-moi de Bagdad.');
  await dialog.getByRole('textbox', {name: 'Votre question'}).fill('Comment Bagdad est-elle fondée ?');
  await dialog.getByRole('button', {name: 'Envoyer', exact: true}).click();
  await expect(dialog.locator('.assistant-message-assistant')).toHaveCount(1);
  expect(requests.at(-1)?.messages).toEqual([{role: 'user', content: 'Comment Bagdad est-elle fondée ?'}]);
  await dialog.getByRole('button', {name: 'Nouvelle conversation'}).click();
  await expect(dialog.locator('.assistant-message')).toHaveCount(0);
  await expect(dialog.locator('.assistant-suggestions')).toBeVisible();
});

test('Arabic mobile dark mode fits the viewport and sends Arabic context', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await mockAccount(page);
  const requests: Array<{context: {locale: string}}> = [];
  await page.route('**/api/assistant', async route => {
    if (route.request().method() === 'GET') { await route.fulfill({json: {configured: true, authenticated: true}}); return; }
    requests.push(route.request().postDataJSON());
    await route.fulfill({json: {message: 'كانت بغداد مركزًا للعلم والتبادل. [M1]', sources: [{id: 'M1', title: 'تاريخ بغداد', locator: 'المجلد الأول، الصفحة ١٢'}]}});
  });
  await page.goto('/?lang=ar&year=800');
  await page.locator('.theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', {name: 'المساعد', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'مساعد أثر'});
  await expect(dialog).toHaveAttribute('dir', 'rtl');
  await expect(dialog.getByRole('textbox', {name: 'سؤالك'})).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', {name: 'إغلاق المساعد'})).toBeFocused();
  await dialog.getByRole('textbox', {name: 'سؤالك'}).fill('ما أهمية بغداد في هذا العصر؟');
  await dialog.getByRole('button', {name: 'إرسال', exact: true}).click();
  await expect(dialog.locator('.assistant-message-assistant')).toContainText('مركزًا للعلم');
  expect(requests[0].context.locale).toBe('ar');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const panelBounds = await dialog.boundingBox();
  expect(panelBounds?.width).toBeLessThanOrEqual(390);
  expect(panelBounds?.height).toBeLessThanOrEqual(844);
  await page.screenshot({path: '/tmp/athar-assistant-mobile-ar-dark.png', fullPage: true});
});
