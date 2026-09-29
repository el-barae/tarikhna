import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { withStore, closeStore } from '../src/server/store';
import { addUser } from '../src/server/users';
import { createVersion, publishedVersion, transitionVersion } from '../src/server/workflow';

// Opt in with a disposable PostgreSQL/PostGIS database only. This exercises real writes.
const databaseUrl = process.env.HISTORY_TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)('PostgreSQL/PostGIS adapter', () => {
  let pool: Pool;
  beforeAll(() => {
    vi.stubEnv('DATABASE_URL', databaseUrl!);
    pool = new Pool({ connectionString: databaseUrl });
  });
  afterAll(async () => { await closeStore(); await pool.end(); vi.unstubAllEnvs(); });

  it('persists users, immutable snapshots, transitions and indexed spatial features across connections', async () => {
    const marker = randomUUID();
    const created = await withStore(async (store) => {
      const user = await addUser(store, { name: 'PostGIS integration', email: `${marker}@test.example`, password: 'Temporary integration test password', role: 'administrator' });
      const original = publishedVersion(store);
      const dataset = structuredClone(original.dataset);
      dataset.metadata.version = `integration-${marker}`;
      const version = createVersion(store, user, dataset, 'PostGIS integration test');
      transitionVersion(store, user, version.id, 'submit');
      transitionVersion(store, user, version.id, 'approve');
      transitionVersion(store, user, version.id, 'publish');
      return { id: version.id, userId: user.id, originalId: original.id, originalData: original.dataset };
    });
    await closeStore();
    const loaded = await withStore((store) => ({
      version: publishedVersion(store),
      user: store.users.find((user) => user.id === created.userId),
      original: store.versions.find((version) => version.id === created.originalId),
    }));
    expect(loaded.version.id).toBe(created.id);
    expect(loaded.version.status).toBe('published');
    expect(loaded.version.history.map((item) => item.action)).toEqual(['create', 'submit', 'approve', 'publish']);
    expect(loaded.user?.passwordHash).toMatch(/^scrypt\$/);
    expect(loaded.original?.dataset).toEqual(created.originalData);
    const features = await pool.query('SELECT count(*)::integer AS count, min(ST_SRID(geometry)) AS srid FROM history_features WHERE version_id=$1', [created.id]);
    expect(features.rows[0].count).toBeGreaterThan(0);
    expect(features.rows[0].srid).toBe(4326);
    const indexes = await pool.query("SELECT indexdef FROM pg_indexes WHERE tablename='history_features' AND indexname='history_features_geom_idx'");
    expect(indexes.rows[0].indexdef).toContain('USING gist');
  });

  it('rolls back failed transactions without partial users or versions', async () => {
    const email = `${randomUUID()}@rollback.example`;
    await expect(withStore(async (store) => {
      await addUser(store, { name: 'Rollback test', email, password: 'Temporary integration test password', role: 'editor' });
      throw new Error('Expected transaction rollback');
    })).rejects.toThrow('Expected transaction rollback');
    const users = await pool.query('SELECT id FROM history_users WHERE email=$1', [email]);
    expect(users.rowCount).toBe(0);
  });
});
