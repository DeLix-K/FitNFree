// Checks supabase/sleep_source_apple_health.sql against the real sleep_tracking.sql + sleep_stages.sql in an in-process Postgres (PGlite):
// the new source is accepted, junk is still refused, the migration can run twice, and one person cannot touch another's sleep.
//   node supabase/tests/sleep-apple-health.test.mjs      (needs: npm install --no-save @electric-sql/pglite, or PGLITE_DIR)
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const ROOT = fileURLToPath(new URL('../../', import.meta.url)).replace(/\\/g, '/');
let PGlite = null;
for (const base of [ROOT, process.env.PGLITE_DIR ? process.env.PGLITE_DIR.replace(/\\/g, '/').replace(/\/?$/, '/') : null]) {
  if (!base) continue;
  try {
    const req = createRequire(pathToFileURL(base + 'x.js'));
    ({ PGlite } = await import(pathToFileURL(req.resolve('@electric-sql/pglite')).href));
    break;
  } catch {
    /* try the next place */
  }
}
if (!PGlite) {
  console.log('skipped: @electric-sql/pglite is not installed');
  process.exit(0);
}

const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
  grant usage on schema public to anon, authenticated;
`);
await db.exec(readFileSync(ROOT + 'supabase/sleep_tracking.sql', 'utf8'));
await db.exec(readFileSync(ROOT + 'supabase/sleep_stages.sql', 'utf8'));

const A = '00000000-0000-0000-0000-00000000000a';
const B = '00000000-0000-0000-0000-00000000000b';
for (const id of [A, B]) await db.query('insert into auth.users (id) values ($1)', [id]);
const as = async (uid, sql, params = []) => {
  await db.exec('begin');
  try {
    await db.exec('set local role authenticated');
    await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
    const r = await db.query(sql, params);
    await db.exec('commit');
    return r.rows;
  } catch (e) {
    await db.exec('rollback');
    throw e;
  }
};
const row = (uid, date, source) => as(uid, `insert into sleep_logs (user_id, sleep_date, duration_minutes, source, deep_minutes) values ($1, $2, 450, $3, 80) returning id`, [uid, date, source]);

let n = 0;
const t = async (name, fn) => {
  try {
    await fn();
    console.log('  ok  ', name);
    n++;
  } catch (e) {
    console.log('  FAIL', name, '\n      ', e.message);
    process.exitCode = 1;
  }
};

await t('before the migration, apple_health is refused', async () => {
  await assert.rejects(() => row(A, '2026-10-01', 'apple_health'), /check constraint/);
});

const migration = readFileSync(ROOT + 'supabase/sleep_source_apple_health.sql', 'utf8');
await db.exec(migration);
await db.exec(migration); // twice is fine

await t('after it, manual, oura, apple_health and health_connect are all accepted', async () => {
  for (const [d, s] of [['2026-10-02', 'manual'], ['2026-10-03', 'oura'], ['2026-10-04', 'apple_health'], ['2026-10-11', 'health_connect']]) assert.equal((await row(A, d, s)).length, 1);
});

await t('anything else is still refused', async () => {
  for (const bad of ['fitbit', '', 'APPLE_HEALTH', 'HEALTH_CONNECT', 'google_fit', 'health_connect; drop table sleep_logs', 'apple_health; drop table sleep_logs']) await assert.rejects(() => row(A, '2026-10-05', bad), /check constraint/);
});

await t('there is exactly one source constraint afterwards', async () => {
  const r = await db.query(`select conname from pg_constraint where conrelid = 'public.sleep_logs'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%source%'`);
  assert.deepEqual(r.rows.map((x) => x.conname), ['sleep_logs_source_check']);
});

await t('a person sees only their own nights and cannot write or delete someone else\'s', async () => {
  assert.equal((await as(B, 'select * from sleep_logs')).length, 0);
  await assert.rejects(() => row(B, '2026-10-06', 'apple_health').then(() => as(B, `insert into sleep_logs (user_id, sleep_date, source) values ($1, '2026-10-07', 'apple_health')`, [A])), /row-level security/);
  assert.equal((await as(B, `delete from sleep_logs where user_id = $1 returning id`, [A])).length, 0);
});

await t('imported nights can be deleted by their owner (the "remove imported sleep" button)', async () => {
  const gone = await as(A, `delete from sleep_logs where source = 'apple_health' returning id`);
  assert.equal(gone.length, 1);
  assert.equal((await as(A, 'select source from sleep_logs order by sleep_date')).map((x) => x.source).join(','), 'manual,oura,health_connect', 'only the Apple Health night went; the Health Connect one stays');
  const gone2 = await as(A, `delete from sleep_logs where source = 'health_connect' returning id`);
  assert.equal(gone2.length, 1);
  assert.equal((await as(A, 'select source from sleep_logs order by sleep_date')).map((x) => x.source).join(','), 'manual,oura');
});

await t('running the migration again after nights from both sources exist keeps every row', async () => {
  await row(A, '2026-10-20', 'apple_health');
  await row(A, '2026-10-21', 'health_connect');
  await db.exec(migration);
  assert.equal((await as(A, `select count(*)::int as c from sleep_logs where source in ('apple_health', 'health_connect')`))[0].c, 2);
  await as(A, `delete from sleep_logs where sleep_date in ('2026-10-20', '2026-10-21')`);
});

await t('an upsert by date replaces an earlier Apple Health night (a refresh), as the import does', async () => {
  await as(A, `insert into sleep_logs (user_id, sleep_date, duration_minutes, source) values ($1, '2026-10-10', 400, 'apple_health')`, [A]);
  await as(A, `insert into sleep_logs (user_id, sleep_date, duration_minutes, source) values ($1, '2026-10-10', 455, 'apple_health') on conflict (user_id, sleep_date) do update set duration_minutes = excluded.duration_minutes`, [A]);
  assert.equal((await as(A, `select duration_minutes from sleep_logs where sleep_date = '2026-10-10'`))[0].duration_minutes, 455);
});

console.log(n, 'passed');
