import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import type { Dataset } from '../packages/core/src';

const suppliedCredentials = !!(process.env.TEST_EMAIL && process.env.TEST_PASSWORD);
const email = suppliedCredentials ? process.env.TEST_EMAIL! : `browser-${randomUUID()}@athar.local`;
const password = suppliedCredentials ? process.env.TEST_PASSWORD! : randomBytes(24).toString('base64url');

test.describe('Contribution workshop', () => {
  test.beforeAll(async () => {
    if (suppliedCredentials) return;
    // Only the isolated /tmp store is modified; no application account is created.
    await promisify(execFile)(process.execPath, [resolve('node_modules/tsx/dist/cli.mjs'), 'scripts/setup.ts', '--name', 'Browser review'], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: '', HISTORY_STORE_PATH: process.env.HISTORY_E2E_STORE_PATH || '/tmp/athar-browser-tests-v2/.store.json', ADMIN_EMAIL: email, ADMIN_PASSWORD: password },
    });
  });

  test('validates imports, preserves drafts, publishes reviewed data and exports the result', async ({ page }) => {
    test.setTimeout(120_000);
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const summary = `Browser contribution ${suffix}`;
    const baselineResponse = await page.request.get('/api/dataset');
    expect(baselineResponse.ok()).toBeTruthy();
    const baseline = await baselineResponse.json() as { dataset: Dataset; versionId: string };
    await page.goto('/');
    await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
    const login = page.getByRole('dialog');
    await login.getByLabel('Adresse e-mail', { exact: true }).fill(email);
    await login.getByLabel('Mot de passe', { exact: true }).fill(password);
    await login.getByRole('button', { name: 'Se connecter', exact: true }).click();

    const studio = page.getByRole('dialog', { name: 'Écrire la prochaine page.' });
    await expect(studio).toBeVisible();
    await expect(studio.getByText('Administrateur', { exact: true })).toBeVisible();
    await expect(studio.locator('.entity-form')).toBeVisible();

    // A temporarily invalid field must remain editable, so it can be corrected.
    const initialState = baseline.dataset.states[0];
    expect(initialState).toBeTruthy();
    const startYear = studio.locator('.entity-form > .form-grid').first().getByLabel('Année de début', { exact: true });
    await startYear.fill('9000');
    await studio.getByRole('button', { name: 'Valider', exact: true }).click();
    await expect(studio.locator('.validation-errors')).toBeVisible();
    await expect(startYear).toHaveValue('9000');
    await startYear.fill(String(initialState.startYear));
    await studio.getByRole('button', { name: 'Valider', exact: true }).click();
    await expect(studio.getByRole('status')).toContainText('Structure et relations valides');

    // The graphical editor exposes geographic land and keyboard-editable vertices.
    const geometry = studio.locator('.geometry-editor').first();
    await expect(geometry.locator('svg')).toBeVisible();
    await expect.poll(() => geometry.locator('svg g path').count()).toBeGreaterThan(1);
    await geometry.getByLabel('sommets', { exact: true }).selectOption('0');
    const longitude = geometry.getByLabel('Longitude', { exact: true });
    const originalLongitude = await longitude.inputValue();
    await longitude.fill(String(Number(originalLongitude) + 0.1));
    await expect(longitude).toHaveValue(String(Number(originalLongitude) + 0.1));
    await longitude.fill(originalLongitude);
    await page.screenshot({ path: '/tmp/athar-studio.png', fullPage: true });

    // Reject malformed input without replacing the existing editable dataset.
    await studio.locator('input[type=file]').setInputFiles({ name: 'broken-history.json', mimeType: 'application/json', buffer: Buffer.from('{"metadata":') });
    await expect(studio.locator('.validation-errors')).toContainText('broken-history.json');
    await expect(studio.getByRole('alertdialog')).toHaveCount(0);
    await studio.getByRole('button', { name: 'Éditeur JSON', exact: true }).click();
    await expect(studio.locator('.cm-content')).toContainText(baseline.dataset.metadata.title);
    await expect(studio.locator('.cm-content')).not.toHaveText('{"metadata":');
    await studio.getByRole('button', { name: 'Valider', exact: true }).click();
    await expect(studio.getByRole('status')).toContainText('Structure et relations valides');
    await page.screenshot({ path: '/tmp/athar-json.png', fullPage: true });

    // Also reject a syntactically correct dataset with broken references.
    const badReferences = structuredClone(baseline.dataset);
    badReferences.states[0].capitals[0].city = `missing-city-${suffix}`;
    await studio.locator('input[type=file]').setInputFiles({ name: 'broken-reference.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(badReferences)) });
    await expect(studio.locator('.validation-errors')).toContainText('Unknown cities reference');
    await expect(studio.getByRole('alertdialog')).toHaveCount(0);

    // A valid import requires a difference review and an explicit save.
    const changed = structuredClone(baseline.dataset);
    changed.metadata.title = `Atlas browser verification ${suffix}`;
    const beforeVersionsResponse = await page.request.get('/api/versions');
    const beforeVersions = await beforeVersionsResponse.json();
    await studio.locator('input[type=file]').setInputFiles({ name: `verified-${suffix}.json`, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(changed)) });
    const review = studio.getByRole('alertdialog', { name: 'Vérifier les modifications' });
    await expect(review).toBeVisible();
    await expect(review).toContainText('Les métadonnées changent également.');
    expect((await (await page.request.get('/api/versions')).json()).versions).toHaveLength(beforeVersions.versions.length);
    await review.getByLabel('Résumé de la contribution', { exact: true }).fill(summary);
    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="alertdialog"]'))).toBeTruthy();
    const savedResponse = page.waitForResponse(response => response.url().endsWith('/api/versions') && response.request().method() === 'POST');
    await review.getByRole('button', { name: 'Confirmer et enregistrer', exact: true }).click();
    const saved = await (await savedResponse).json();
    expect(saved.version.status).toBe('draft');
    await expect(review).not.toBeVisible();
    const version = studio.locator('.version-card').filter({ hasText: summary });
    await expect(version).toHaveCount(1);
    await expect(version.locator('.version-status')).toHaveText('Brouillon');
    expect((await (await page.request.get('/api/dataset')).json()).versionId).toBe(baseline.versionId);

    await transition(page, version, 'Soumettre à relecture', 'review', saved.version.id);
    await expect(version.locator('.version-status')).toHaveText('En relecture');
    await transition(page, version, 'Approuver', 'approved', saved.version.id);
    await expect(version.locator('.version-status')).toHaveText('Approuvée');
    expect((await (await page.request.get('/api/dataset')).json()).versionId).toBe(baseline.versionId);
    await transition(page, version, 'Publier', 'published', saved.version.id);
    await expect(version.locator('.version-status')).toHaveText('Publiée');
    await expect.poll(async () => (await (await page.request.get('/api/dataset')).json()).dataset.metadata.title).toBe(changed.metadata.title);

    // Restoring preserves the published dataset and creates a new draft.
    const restoreResponse = page.waitForResponse(response => response.url().endsWith(`/api/versions/${saved.version.id}/transition`) && response.request().method() === 'POST');
    await version.getByRole('button', { name: 'Restaurer', exact: true }).click();
    const restored = await (await restoreResponse).json();
    expect(restored.version.id).not.toBe(saved.version.id);
    expect(restored.version.status).toBe('draft');
    expect(restored.version.restoredFrom).toBe(saved.version.id);
    await expect(studio.getByRole('status')).toContainText('Brouillon enregistré');
    expect((await (await page.request.get('/api/dataset')).json()).versionId).toBe(saved.version.id);

    // Both exported formats preserve the complete published dataset.
    await studio.locator('.studio-import-export summary').click();
    const jsonDownload = page.waitForEvent('download');
    await studio.getByRole('button', { name: 'JSON', exact: true }).click();
    const jsonFile = await jsonDownload;
    expect(jsonFile.suggestedFilename()).toBe('islamic-history.json');
    expect(JSON.parse(await readFile((await jsonFile.path())!, 'utf8'))).toEqual(changed);
    const geoDownload = page.waitForEvent('download');
    await studio.getByRole('button', { name: 'GeoJSON', exact: true }).click();
    const geoFile = await geoDownload;
    const geo = JSON.parse(await readFile((await geoFile.path())!, 'utf8'));
    expect(geo.type).toBe('FeatureCollection');
    expect(geo.features.length).toBeGreaterThan(0);
    expect(geo.dataset).toEqual(changed);
  });
});

async function transition(page: Page, card: Locator, button: string, status: string, versionId: string) {
  const response = page.waitForResponse(item => item.url().endsWith(`/api/versions/${versionId}/transition`) && item.request().method() === 'POST');
  await card.getByRole('button', { name: new RegExp(`^${button}`) }).click();
  const result = await response;
  expect(result.ok()).toBeTruthy();
  expect((await result.json()).version.status).toBe(status);
}
