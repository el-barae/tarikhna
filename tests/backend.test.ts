import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { GET as getDataset } from '../src/app/api/dataset/route';
import { GET as me } from '../src/app/api/auth/me/route';
import { POST as login } from '../src/app/api/auth/login/route';
import { POST as logout } from '../src/app/api/auth/logout/route';
import { GET as listVersions, POST as saveVersion } from '../src/app/api/versions/route';
import { POST as transition } from '../src/app/api/versions/[id]/transition/route';
import { GET as getUsers, POST as createUser, PATCH as patchUser } from '../src/app/api/users/route';
import { GET as exportDataset } from '../src/app/api/export/route';
import { withStore } from '../src/server/store';
import { addUser } from '../src/server/users';
import type { Dataset } from '@history/core';

let directory: string;
let adminCookie: string;
let editorCookie: string;
let visitorCookie: string;
let adminId: string;
let seed: Dataset;
const password = 'A strong test password 528!';
function request(url: string, method = 'GET', body?: unknown, cookie?: string, origin = 'http://localhost:3000') {
  return new Request(`http://localhost:3000${url}`, { method, headers: {
    ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    ...(cookie ? { Cookie: cookie } : {}), Origin: origin,
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function signIn(email: string) {
  const response = await login(request('/api/auth/login', 'POST', { email, password }));
  expect(response.status).toBe(200);
  return response.headers.get('set-cookie')!.split(';')[0];
}

beforeAll(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'athar-backend-'));
  vi.stubEnv('HISTORY_STORE_PATH', path.join(directory, '.store.json'));
  vi.stubEnv('DATABASE_URL', '');
  vi.stubEnv('APP_ORIGIN', 'http://localhost:3000');
  const admin = await withStore((store) => addUser(store, { name: 'Admin test', email: 'admin@example.org', password, role: 'administrator' }));
  adminId = admin.id;
  await withStore(async (store) => {
    await addUser(store, { name: 'Editor test', email: 'editor@example.org', password, role: 'editor' });
    await addUser(store, { name: 'Visitor test', email: 'visitor@example.org', password, role: 'visitor' });
  });
  adminCookie = await signIn('admin@example.org');
  editorCookie = await signIn('editor@example.org');
  visitorCookie = await signIn('visitor@example.org');
  seed = (await (await getDataset()).json()).dataset;
});
afterAll(async () => { vi.unstubAllEnvs(); await rm(directory, { recursive: true, force: true }); });

describe('server authorization and persistence', () => {
  it('serves only the public dataset and hides private routes from unauthenticated users', async () => {
    expect((await getDataset()).status).toBe(200);
    expect(await (await me(request('/api/auth/me'))).json()).toEqual({ user: null });
    expect((await listVersions(request('/api/versions'))).status).toBe(401);
    expect((await exportDataset(request('/api/export'))).status).toBe(401);
    expect((await getUsers(request('/api/users', 'GET', undefined, editorCookie))).status).toBe(403);
    expect((await saveVersion(request('/api/versions', 'POST', { dataset: seed }, visitorCookie))).status).toBe(403);
  });
  it('rejects a map edit based on an obsolete published version', async () => {
    const published = await (await getDataset()).json();
    const before = await (await listVersions(request('/api/versions', 'GET', undefined, editorCookie))).json();
    expect((await saveVersion(request('/api/versions', 'POST', {dataset:seed, baseVersionId:'obsolete-map'}, editorCookie))).status).toBe(409);
    expect((await (await listVersions(request('/api/versions', 'GET', undefined, editorCookie))).json()).versions).toHaveLength(before.versions.length);
    expect((await saveVersion(request('/api/versions', 'POST', {dataset:seed, baseVersionId:published.versionId}, editorCookie))).status).toBe(201);
  });
  it('accepts local login when Next.js uses a wildcard bind address internally', async () => {
    vi.stubEnv('APP_ORIGIN', '');
    try {
      const response = await login(new Request('http://0.0.0.0:3000/api/auth/login', {
        method: 'POST', headers: {'Content-Type':'application/json', Host:'localhost:3000', Origin:'http://localhost:3000', 'Sec-Fetch-Site':'same-origin'},
        body: JSON.stringify({email:'editor@example.org',password}),
      }));
      expect(response.status).toBe(200);
      expect((await response.json()).user.role).toBe('editor');
      const cookie=response.headers.get('set-cookie')!.split(';')[0];
      expect((await (await me(request('/api/auth/me','GET',undefined,cookie))).json()).user.email).toBe('editor@example.org');
    } finally { vi.stubEnv('APP_ORIGIN','http://localhost:3000'); }
  });
  it('stores hashes and private session tokens and uses HttpOnly Strict cookies', async () => {
    const response = await login(request('/api/auth/login', 'POST', { email: 'admin@example.org', password }));
    expect(response.headers.get('set-cookie')).toContain('HttpOnly; SameSite=Strict');
    const body = await response.json();
    expect(body.user.passwordHash).toBeUndefined();
    const disk = await readFile(path.join(directory, '.store.json'), 'utf8');
    expect(disk).not.toContain(password);
    expect(disk).not.toContain(adminCookie.split('=')[1]);
    expect((await stat(path.join(directory, '.store.json'))).mode & 0o777).toBe(0o600);
  });
  it('rejects cross-origin writes, invalid data and oversized uploads', async () => {
    expect((await saveVersion(request('/api/versions', 'POST', { dataset: seed }, editorCookie, 'https://attacker.example'))).status).toBe(403);
    expect((await saveVersion(request('/api/versions', 'POST', { dataset: { broken: true } }, editorCookie))).status).toBe(422);
    const oversized = request('/api/versions', 'POST', {}, editorCookie);
    oversized.headers.set('Content-Length', String(11 * 1024 * 1024));
    expect((await saveVersion(oversized)).status).toBe(413);
  });
  it('enforces every workflow step and restores into a new draft without rewriting history', async () => {
    const edited = structuredClone(seed);
    edited.metadata.version = 'test-2';
    const created = await saveVersion(request('/api/versions', 'POST', { dataset: edited, summary: 'A metadata edit' }, editorCookie));
    expect(created.status).toBe(201);
    const { version: draft } = await created.json();
    const context = { params: Promise.resolve({ id: draft.id }) };
    expect(draft.status).toBe('draft');
    expect((await transition(request('/api/transition', 'POST', { action: 'publish' }, editorCookie), context)).status).toBe(403);
    expect((await transition(request('/api/transition', 'POST', { action: 'publish' }, adminCookie), context)).status).toBe(409);
    expect((await (await getDataset()).json()).dataset.metadata.version).toBe(seed.metadata.version);
    expect((await transition(request('/api/transition', 'POST', { action: 'submit' }, editorCookie), context)).status).toBe(200);
    expect((await transition(request('/api/transition', 'POST', { action: 'approve' }, editorCookie), context)).status).toBe(403);
    expect((await transition(request('/api/transition', 'POST', { action: 'approve' }, adminCookie), context)).status).toBe(200);
    expect((await transition(request('/api/transition', 'POST', { action: 'publish' }, adminCookie), context)).status).toBe(200);
    expect((await (await getDataset()).json()).versionId).toBe(draft.id);
    const versions = await (await listVersions(request('/api/versions', 'GET', undefined, adminCookie))).json();
    const original = versions.versions.at(-1);
    const restored = await transition(request('/api/transition', 'POST', { action: 'restore' }, adminCookie), { params: Promise.resolve({ id: original.id }) });
    const { version } = await restored.json();
    expect(version.status).toBe('draft');
    expect(version.id).not.toBe(original.id);
    expect(version.restoredFrom).toBe(original.id);
    expect((await (await getDataset()).json()).versionId).toBe(draft.id);
    const stored = JSON.parse(await readFile(path.join(directory, '.store.json'), 'utf8'));
    expect(stored.versions.find((item: { id: string }) => item.id === original.id).dataset).toEqual(seed);
  });
  it('rejects stale drafts when a newer dataset has already been published', async () => {
    const first = await (await saveVersion(request('/api/versions', 'POST', { dataset: seed, summary: 'First concurrent draft' }, adminCookie))).json();
    const second = await (await saveVersion(request('/api/versions', 'POST', { dataset: seed, summary: 'Second concurrent draft' }, adminCookie))).json();
    for (const draft of [first.version, second.version]) {
      const context = { params: Promise.resolve({ id: draft.id }) };
      expect((await transition(request('/api/transition', 'POST', { action: 'submit' }, adminCookie), context)).status).toBe(200);
      expect((await transition(request('/api/transition', 'POST', { action: 'approve' }, adminCookie), context)).status).toBe(200);
    }
    expect((await transition(request('/api/transition', 'POST', { action: 'publish' }, adminCookie), { params: Promise.resolve({ id: first.version.id }) })).status).toBe(200);
    expect((await transition(request('/api/transition', 'POST', { action: 'publish' }, adminCookie), { params: Promise.resolve({ id: second.version.id }) })).status).toBe(409);
    expect((await (await getDataset()).json()).versionId).toBe(first.version.id);
  });
  it('reserves deletion and user management for administrators and protects the last active admin', async () => {
    const edited = structuredClone(seed);
    edited.periods = edited.periods.slice(1);
    expect((await saveVersion(request('/api/versions', 'POST', { dataset: edited }, editorCookie))).status).toBe(403);
    expect((await createUser(request('/api/users', 'POST', { name: 'New editor', email: 'new@example.org', password, role: 'editor' }, editorCookie))).status).toBe(403);
    expect((await patchUser(request('/api/users', 'PATCH', { id: adminId, role: 'visitor' }, adminCookie))).status).toBe(409);
    const created = await createUser(request('/api/users', 'POST', { name: 'New editor', email: 'new@example.org', password, role: 'editor' }, adminCookie));
    expect(created.status).toBe(201);
    const { user } = await created.json();
    expect(user.passwordHash).toBeUndefined();
    const cookie = await signIn('new@example.org');
    expect((await patchUser(request('/api/users', 'PATCH', { id: user.id, disabled: true }, adminCookie))).status).toBe(200);
    expect((await listVersions(request('/api/versions', 'GET', undefined, cookie))).status).toBe(401);
  });
  it('exports lossless GeoJSON and rejects invalid year and format parameters', async () => {
    const response = await exportDataset(request('/api/export?format=geojson&year=800', 'GET', undefined, editorCookie));
    expect(response.status).toBe(200);
    const output = await response.json();
    expect(output.type).toBe('FeatureCollection');
    expect(output.dataset).toEqual((await (await getDataset()).json()).dataset);
    expect((await exportDataset(request('/api/export?format=csv', 'GET', undefined, editorCookie))).status).toBe(400);
    expect((await exportDataset(request('/api/export?format=geojson&year=1.5', 'GET', undefined, editorCookie))).status).toBe(400);
  });
  it('persists rate limiting and revokes logout sessions immediately', async () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      expect((await login(request('/api/auth/login', 'POST', { email: 'missing@example.org', password: 'wrong' }))).status).toBe(401);
    }
    expect((await login(request('/api/auth/login', 'POST', { email: 'missing@example.org', password: 'wrong' }))).status).toBe(429);
    const cookie = await signIn('visitor@example.org');
    expect((await logout(request('/api/auth/logout', 'POST', undefined, cookie))).status).toBe(200);
    expect(await (await me(request('/api/auth/me', 'GET', undefined, cookie))).json()).toEqual({ user: null });
  });
  it('serializes concurrent local updates without losing immutable versions', async () => {
    const before = await (await listVersions(request('/api/versions', 'GET', undefined, adminCookie))).json();
    const results = await Promise.all(Array.from({ length: 5 }, (_, index) => saveVersion(request('/api/versions', 'POST', { dataset: seed, summary: `Concurrent edit ${index}` }, adminCookie))));
    expect(results.map((response) => response.status)).toEqual([201, 201, 201, 201, 201]);
    const after = await (await listVersions(request('/api/versions', 'GET', undefined, adminCookie))).json();
    expect(after.versions.length).toBe(before.versions.length + 5);
    expect(new Set(after.versions.map((version: { version: string }) => version.version)).size).toBe(after.versions.length);
  });
});
