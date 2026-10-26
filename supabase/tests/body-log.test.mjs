// Checks supabase/body_log.sql in an in-process Postgres (PGlite): one person's body log is invisible to everyone else, values are validated,
// an empty entry or a future date is refused, a second entry for a day replaces the first, and one account cannot fill the table.
//   node supabase/tests/body-log.test.mjs      (needs: npm install --no-save @electric-sql/pglite, or PGLITE_DIR)
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
  grant usage on schema public to anon, authenticated, service_role;
`);
await db.exec(readFileSync(ROOT + 'supabase/body_log.sql', 'utf8'));
await db.exec(readFileSync(ROOT + 'supabase/body_log.sql', 'utf8')); // repeatable

const A = '00000000-0000-0000-0000-00000000000a';
const B = '00000000-0000-0000-0000-00000000000b';
for (const id of [A, B]) await db.query('insert into auth.users (id) values ($1)', [id]);
const as = async (role, uid, sql, params = []) => {
  await db.exec('begin');
  try {
    await db.exec(`set local role ${role}`);
    await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid || '']);
    const r = await db.query(sql, params);
    await db.exec('commit');
    return r.rows;
  } catch (e) {
    await db.exec('rollback');
    throw e;
  }
};
const me = (uid, sql, params) => as('authenticated', uid, sql, params);
const add = (uid, cols, vals) => me(uid, `insert into body_log (${cols}) values (${vals.map((_, i) => '$' + (i + 1)).join(', ')}) returning id`, vals);

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

await t('a person can add and read their own entries, and the owner is set to them automatically', async () => {
  await add(A, 'logged_date, weight_kg', ['2026-10-01', 82.4]);
  await add(A, 'logged_date, weight_kg, waist_cm, body_fat_pct', ['2026-10-08', 81.9, 90.5, 18.2]);
  const rows = await me(A, 'select logged_date::text, weight_kg, user_id from body_log order by logged_date');
  assert.deepEqual(rows.map((r) => [r.logged_date, Number(r.weight_kg), r.user_id]), [['2026-10-01', 82.4, A], ['2026-10-08', 81.9, A]]);
});

await t('another person sees nothing and cannot change or delete it; they cannot write as someone else', async () => {
  assert.equal((await me(B, 'select * from body_log')).length, 0);
  assert.equal((await me(B, `update body_log set weight_kg = 50 where user_id = $1 returning id`, [A])).length, 0);
  assert.equal((await me(B, `delete from body_log where user_id = $1 returning id`, [A])).length, 0);
  await assert.rejects(() => me(B, `insert into body_log (user_id, logged_date, weight_kg) values ($1, '2026-10-02', 70)`, [A]), /row-level security/);
  await assert.rejects(() => me(A, `update body_log set user_id = $1`, [B]), /row-level security/);
  assert.equal((await db.query('select count(*)::int c from body_log where user_id = $1', [A])).rows[0].c, 2);
});

await t('anonymous visitors have no access at all', async () => {
  await assert.rejects(() => as('anon', null, 'select * from body_log'), /permission denied/);
  await assert.rejects(() => as('anon', null, 'insert into body_log default values'), /permission denied/);
});

await t('an entry with nothing in it is refused, and so is one with only notes', async () => {
  await assert.rejects(() => add(A, 'logged_date', ['2026-10-03']), /check constraint/);
  await assert.rejects(() => add(A, 'logged_date, notes', ['2026-10-03', 'just a note']), /check constraint/);
});

await t('values must be sensible', async () => {
  for (const [col, bad] of [['weight_kg', 19.9], ['weight_kg', 500], ['weight_kg', -5], ['body_fat_pct', 1.9], ['body_fat_pct', 71], ['waist_cm', 9], ['waist_cm', 301], ['arm_cm', 0]]) {
    await assert.rejects(() => add(A, `logged_date, ${col}`, ['2026-10-04', bad]), /check constraint|out of range/, `${col} ${bad}`);
  }
  await assert.rejects(() => add(A, 'logged_date, weight_kg, notes', ['2026-10-04', 80, 'x'.repeat(501)]), /check constraint/);
});

await t('dates: not before 2000, not more than a day ahead', async () => {
  await assert.rejects(() => add(A, 'logged_date, weight_kg', ['1999-12-31', 80]), /check constraint/);
  await assert.rejects(() => add(A, 'logged_date, weight_kg', ['2099-01-01', 80]), /check constraint/);
  const today = new Date().toISOString().slice(0, 10);
  assert.equal((await add(A, 'logged_date, weight_kg', [today, 80])).length, 1);
});

await t('a second entry for the same day is refused as a plain insert, and an upsert replaces it (what the app does)', async () => {
  await assert.rejects(() => add(A, 'logged_date, weight_kg', ['2026-10-01', 70]), /unique|duplicate/);
  await me(A, `insert into body_log (user_id, logged_date, weight_kg, waist_cm) values ($1, '2026-10-01', 82.0, 91.0) on conflict (user_id, logged_date) do update set weight_kg = excluded.weight_kg, waist_cm = excluded.waist_cm`, [A]);
  const r = (await me(A, `select weight_kg, waist_cm from body_log where logged_date = '2026-10-01'`))[0];
  assert.deepEqual([Number(r.weight_kg), Number(r.waist_cm)], [82, 91]);
});

await t('the same day for two different people is fine', async () => {
  await me(B, `insert into body_log (user_id, logged_date, weight_kg) values ($1, '2026-10-01', 65)`, [B]);
  assert.equal((await me(B, 'select * from body_log')).length, 1);
});

await t('updating a row moves its changed time', async () => {
  const before = (await db.query(`select updated_at from body_log where user_id = $1 and logged_date = '2026-10-08'`, [A])).rows[0].updated_at;
  await new Promise((r) => setTimeout(r, 15));
  await me(A, `update body_log set notes = 'felt strong' where logged_date = '2026-10-08'`);
  const after = (await db.query(`select updated_at from body_log where user_id = $1 and logged_date = '2026-10-08'`, [A])).rows[0].updated_at;
  assert.ok(new Date(after) > new Date(before));
});

await t('one account cannot create an unlimited number of rows', async () => {
  await db.query(`insert into body_log (user_id, logged_date, weight_kg) select $1, date '2001-01-01' + g, 80 from generate_series(0, 4990) g`, [B]); // B has 1 row now
  await me(B, `insert into body_log (user_id, logged_date, weight_kg) values ($1, '2020-01-01', 80)`, [B]).catch(() => {});
  const count = (await db.query('select count(*)::int c from body_log where user_id = $1', [B])).rows[0].c;
  assert.ok(count >= 4990);
  await db.query(`insert into body_log (user_id, logged_date, weight_kg) select $1, date '2020-01-01' + g, 80 from generate_series(1, ${5000 - count}) g on conflict do nothing`, [B]);
  await assert.rejects(() => me(B, `insert into body_log (user_id, logged_date, weight_kg) values ($1, '2025-06-06', 80)`, [B]), /body_log_limit|row-level|duplicate/);
});

await t('deleting an account removes the log', async () => {
  await db.query('delete from auth.users where id = $1', [A]);
  assert.equal((await db.query('select count(*)::int c from body_log where user_id = $1', [A])).rows[0].c, 0);
});

console.log(n, 'passed');
