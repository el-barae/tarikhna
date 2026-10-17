import { randomUUID } from 'node:crypto';
import { chmod, mkdir, open, readFile, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { datasetToGeoJSON, validateDataset } from '@history/core';
import type { Pool, PoolClient } from 'pg';
import type { Store, User, Version } from './types';

// Local storage is atomic and process-safe. DATABASE_URL selects PostgreSQL/PostGIS.
// Store files contain password hashes and sessions; never serve or commit this directory.
type Globals = typeof globalThis & { historyPool?: Pool; historySchema?: Promise<void> };
const globals = globalThis as Globals;
const storePath = () => process.env.HISTORY_STORE_PATH || path.join(process.cwd(), 'data', '.store.json');

async function initialStore(): Promise<Store> {
  const seed = JSON.parse(await readFile(path.join(process.cwd(), 'public', 'islamic-history.json'), 'utf8'));
  const validation = validateDataset(seed);
  if (!validation.valid || !validation.data) throw new Error('The seed dataset did not pass validation.');
  const now = new Date().toISOString();
  const version: Version = { id: randomUUID(), version: '1', author: 'Dataset de démonstration', authorId: 'system', date: now,
    changes: 'Import initial du fichier islamic-history.json', status: 'published', dataset: validation.data,
    history: [{ action: 'initialize', actor: 'system', date: now }] };
  return { schemaVersion: 1, publishedVersionId: version.id, versions: [version], users: [], sessions: [], loginAttempts: {} };
}

async function withLocalStore<T>(callback: (store: Store) => T | Promise<T>): Promise<T> {
  const target = storePath();
  const directory = path.dirname(target);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const lock = `${target}.lock`;
  const deadline = Date.now() + 15_000;
  while (true) {
    try { await mkdir(lock, { mode: 0o700 }); break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      try {
        if (Date.now() - (await stat(lock)).mtimeMs > 120_000) { await rm(lock, { recursive: true, force: true }); continue; }
      } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
      if (Date.now() > deadline) throw new Error('The local data store is busy.');
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  }
  try {
    let store: Store;
    let original: string | undefined;
    try { original = await readFile(/*turbopackIgnore: true*/ target, 'utf8'); store = JSON.parse(original) as Store; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; store = await initialStore(); }
    if (store.schemaVersion !== 1 || !Array.isArray(store.versions) || !Array.isArray(store.users)) throw new Error('Unsupported local store.');
    const result = await callback(store);
    const serialized = JSON.stringify(store);
    if (serialized === original) return result;
    const temp = `${target}.${randomUUID()}.tmp`;
    try {
      const file = await open(temp, 'wx', 0o600);
      try { await file.writeFile(serialized); await file.sync(); } finally { await file.close(); }
      await rename(temp, target);
      await chmod(target, 0o600);
    } finally { await rm(temp, { force: true }); }
    return result;
  } finally { await rm(lock, { recursive: true, force: true }); }
}

async function getPool(): Promise<Pool> {
  if (!globals.historyPool) {
    const { Pool } = await import('pg');
    globals.historyPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 8,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
    });
    // Serverless providers such as Neon close idle connections; keep the process alive.
    globals.historyPool.on('error', (error) => console.error('PostgreSQL idle client error:', error.message));
  }
  if (!globals.historySchema) {
    globals.historySchema = (async () => {
      // Transaction-scoped lock also works through Neon/PgBouncer transaction pooling.
      const schema = await readFile(path.join(process.cwd(), 'db', 'schema.sql'), 'utf8');
      const client = await globals.historyPool!.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(82462218)');
        await client.query(schema);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally { client.release(); }
    })().catch((error) => { globals.historySchema = undefined; throw error; });
  }
  await globals.historySchema;
  return globals.historyPool;
}

async function loadPostgres(client: PoolClient): Promise<{ store: Store; initialized: boolean }> {
  const datasetRow = await client.query('SELECT * FROM history_datasets WHERE id = $1', ['main']);
  if (!datasetRow.rowCount) return { store: await initialStore(), initialized: false };
  const userRows = await client.query('SELECT * FROM history_users');
  const versionRows = await client.query('SELECT * FROM history_versions ORDER BY created_at, id');
  const sessionRows = await client.query('SELECT * FROM history_sessions WHERE expires_at > $1', [Date.now()]);
  return { initialized: true, store: {
    schemaVersion: 1, publishedVersionId: datasetRow.rows[0].published_version_id,
    loginAttempts: datasetRow.rows[0].login_attempts,
    users: userRows.rows.map((row): User => ({ id: row.id, email: row.email, name: row.name, role: row.role, disabled: row.disabled, passwordHash: row.password_hash, createdAt: new Date(row.created_at).toISOString() })),
    versions: versionRows.rows.map((row): Version => ({ id: row.id, version: row.version, author: row.author, authorId: row.author_id, date: new Date(row.created_at).toISOString(), changes: row.changes, status: row.status, dataset: row.dataset, history: row.history, ...(row.restored_from ? { restoredFrom: row.restored_from } : {}), ...(row.base_version_id ? { baseVersionId: row.base_version_id } : {}) })),
    sessions: sessionRows.rows.map((row) => ({ id: row.id, userId: row.user_id, expiresAt: Number(row.expires_at) })),
  } };
}

async function savePostgres(client: PoolClient, store: Store): Promise<void> {
  for (const user of store.users) {
    await client.query(`INSERT INTO history_users(id,email,name,role,disabled,password_hash,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name, role=EXCLUDED.role, disabled=EXCLUDED.disabled, password_hash=EXCLUDED.password_hash`,
    [user.id, user.email, user.name, user.role, user.disabled, user.passwordHash, user.createdAt]);
  }
  for (const version of store.versions) {
    // Published snapshots are immutable; only review status and the audit history change.
    const inserted = await client.query(`INSERT INTO history_versions(id,version,author,author_id,created_at,changes,status,dataset,history,restored_from,base_version_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(id) DO NOTHING RETURNING id`,
    [version.id, version.version, version.author, version.authorId, version.date, version.changes, version.status, JSON.stringify(version.dataset), JSON.stringify(version.history), version.restoredFrom || null, version.baseVersionId || null]);
    if (inserted.rowCount) {
      for (const feature of datasetToGeoJSON(version.dataset).features) {
        if (!feature.geometry) continue;
        await client.query('INSERT INTO history_features(version_id,properties,geometry) VALUES($1,$2,ST_SetSRID(ST_GeomFromGeoJSON($3),4326))', [version.id, JSON.stringify(feature.properties || {}), JSON.stringify(feature.geometry)]);
      }
    } else {
      await client.query('UPDATE history_versions SET status=$2, history=$3 WHERE id=$1', [version.id, version.status, JSON.stringify(version.history)]);
    }
  }
  await client.query(`INSERT INTO history_datasets(id,published_version_id,login_attempts) VALUES('main',$1,$2)
    ON CONFLICT(id) DO UPDATE SET published_version_id=EXCLUDED.published_version_id,login_attempts=EXCLUDED.login_attempts`, [store.publishedVersionId, JSON.stringify(store.loginAttempts)]);
  await client.query('DELETE FROM history_sessions');
  for (const session of store.sessions) {
    await client.query('INSERT INTO history_sessions(id,user_id,expires_at) VALUES($1,$2,$3)', [session.id, session.userId, session.expiresAt]);
  }
}

export async function withStore<T>(callback: (store: Store) => T | Promise<T>): Promise<T> {
  if (!process.env.DATABASE_URL) return withLocalStore(callback);
  const client = await (await getPool()).connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(82462219)');
    const { store, initialized } = await loadPostgres(client);
    const original = JSON.stringify(store);
    const result = await callback(store);
    if (!initialized || original !== JSON.stringify(store)) await savePostgres(client, store);
    await client.query('COMMIT');
    return result;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

export async function closeStore(): Promise<void> {
  await globals.historyPool?.end();
  globals.historyPool = undefined;
  globals.historySchema = undefined;
}
