// Checks supabase/trainer_tools.sql in an in-process Postgres (PGlite): one trainer's data is invisible and untouchable to everyone
// else, only real trainers can add rows, and the size limits and value checks hold. Run:  npm install --no-save @electric-sql/pglite
//   node supabase/tests/trainer-tools.test.mjs      (or set PGLITE_DIR to a folder whose node_modules has it)
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
  grant usage on schema public to anon, authenticated, service_role;
  create table trainer_profiles (id uuid primary key default gen_random_uuid(), user_id uuid not null unique references auth.users(id) on delete cascade);
  grant select on trainer_profiles to authenticated;
`);
await db.exec(readFileSync(ROOT + 'supabase/trainer_tools.sql', 'utf8'));
await db.exec(readFileSync(ROOT + 'supabase/trainer_tools.sql', 'utf8')); // repeatable

const ID = (i) => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`;
const [TA, TB, CL] = [ID(1), ID(2), ID(3)]; // two trainers and an ordinary user
for (const id of [TA, TB, CL]) await db.query('insert into auth.users (id) values ($1)', [id]);
for (const id of [TA, TB]) await db.query('insert into trainer_profiles (user_id) values ($1)', [id]);

async function as(role, uid, sql, params = []) {
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
}
const me = (uid, sql, params) => as('authenticated', uid, sql, params);

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

const addClient = async (uid, name = 'Sam') => (await me(uid, `insert into trainer_clients (name, package_name, check_in_day) values ($1, '12 week', 5) returning id`, [name]))[0].id;
let clientA;
let clientB;

await t('a trainer can add and read their own client, and the owner is set to them automatically', async () => {
  clientA = await addClient(TA, 'Chris');
  const rows = await me(TA, 'select name, trainer_id from trainer_clients');
  assert.deepEqual(rows.map((r) => [r.name, r.trainer_id]), [['Chris', TA]]);
});

await t('another trainer sees nothing of it and cannot change or delete it', async () => {
  clientB = await addClient(TB, 'Dana');
  assert.deepEqual((await me(TB, 'select name from trainer_clients')).map((r) => r.name), ['Dana']);
  assert.equal((await me(TB, `update trainer_clients set notes = 'hacked' where id = $1 returning id`, [clientA])).length, 0);
  assert.equal((await me(TB, `delete from trainer_clients where id = $1 returning id`, [clientA])).length, 0);
  assert.equal((await db.query(`select notes from trainer_clients where id = $1`, [clientA])).rows[0].notes, null);
});

await t('an ordinary user who is not a trainer cannot add anything, and sees nothing', async () => {
  await assert.rejects(() => addClient(CL), /row-level security/);
  await assert.rejects(() => me(CL, `insert into trainer_finance_entries (entry_date, kind, amount_cents) values (current_date, 'income', 100)`), /row-level security/);
  assert.equal((await me(CL, 'select * from trainer_clients')).length, 0);
});

await t('anonymous visitors and the public role have no access at all', async () => {
  for (const table of ['trainer_clients', 'trainer_checkins', 'trainer_finance_entries']) {
    await assert.rejects(() => as('anon', null, `select * from ${table}`), /permission denied/);
    await assert.rejects(() => as('anon', null, `insert into ${table} default values`), /permission denied/);
  }
});

await t('a trainer cannot create a row owned by someone else', async () => {
  await assert.rejects(() => me(TA, `insert into trainer_clients (trainer_id, name) values ($1, 'x')`, [TB]), /row-level security/);
  await assert.rejects(() => me(TA, `update trainer_clients set trainer_id = $1 where id = $2`, [TB, clientA]), /row-level security/);
});

await t('check-ins can only point at the trainer\'s own clients', async () => {
  const ok = await me(TA, `insert into trainer_checkins (client_id, checkin_date, weight_kg, photos_submitted, status) values ($1, '2026-10-30', 82.4, true, 'done') returning id`, [clientA]);
  assert.equal(ok.length, 1);
  await assert.rejects(() => me(TA, `insert into trainer_checkins (client_id, checkin_date) values ($1, '2026-10-30')`, [clientB]), /row-level security/);
  await assert.rejects(() => me(TB, `insert into trainer_checkins (client_id, checkin_date) values ($1, '2026-10-30')`, [clientA]), /row-level security/);
  assert.equal((await me(TB, 'select * from trainer_checkins')).length, 0);
  // moving a check-in onto another trainer's client is refused too
  await assert.rejects(() => me(TA, `update trainer_checkins set client_id = $1`, [clientB]), /row-level security/);
});

await t('deleting a client removes their check-ins', async () => {
  const c = await addClient(TA, 'Temp');
  await me(TA, `insert into trainer_checkins (client_id, checkin_date) values ($1, '2026-10-30')`, [c]);
  await me(TA, 'delete from trainer_clients where id = $1', [c]);
  assert.equal((await db.query(`select count(*)::int c from trainer_checkins where client_id = $1`, [c])).rows[0].c, 0);
});

await t('finance entries are private to the trainer and amounts must be positive and sane', async () => {
  await me(TA, `insert into trainer_finance_entries (entry_date, kind, category, description, amount_cents) values ('2026-10-01', 'income', 'Coaching', 'Package', 25000)`);
  assert.equal((await me(TA, 'select * from trainer_finance_entries')).length, 1);
  assert.equal((await me(TB, 'select * from trainer_finance_entries')).length, 0);
  for (const bad of [0, -5, 100000000]) {
    await assert.rejects(() => me(TA, `insert into trainer_finance_entries (entry_date, kind, amount_cents) values ('2026-10-01', 'expense', $1)`, [bad]), /check constraint/);
  }
  await assert.rejects(() => me(TA, `insert into trainer_finance_entries (entry_date, kind, amount_cents) values ('2026-10-01', 'gift', 100)`), /check constraint/);
});

await t('values are validated: names, statuses, check-in day, weights and text lengths', async () => {
  await assert.rejects(() => me(TA, `insert into trainer_clients (name) values ('')`), /check constraint/);
  await assert.rejects(() => me(TA, `insert into trainer_clients (name) values ($1)`, ['x'.repeat(81)]), /check constraint/);
  await assert.rejects(() => me(TA, `insert into trainer_clients (name, status) values ('A', 'gone')`), /check constraint/);
  await assert.rejects(() => me(TA, `insert into trainer_clients (name, check_in_day) values ('A', 7)`), /check constraint/);
  await assert.rejects(() => me(TA, `insert into trainer_clients (name, payment_status) values ('A', 'maybe')`), /check constraint/);
  await assert.rejects(() => me(TA, `insert into trainer_clients (name, notes) values ('A', $1)`, ['x'.repeat(1001)]), /check constraint/);
  for (const w of [0, -1, 500]) await assert.rejects(() => me(TA, `insert into trainer_checkins (client_id, checkin_date, weight_kg) values ($1, '2026-10-30', $2)`, [clientA, w]), /check constraint/);
});

await t('one account cannot create unlimited clients', async () => {
  await db.query(`insert into trainer_clients (trainer_id, name) select $1, 'bulk' || g from generate_series(1, 298) g`, [TB]); // Dana already has 1
  await me(TB, `insert into trainer_clients (name) values ('last allowed')`); // the 300th
  await assert.rejects(() => me(TB, `insert into trainer_clients (name) values ('one too many')`), /trainer_tools_limit/);
  assert.equal((await me(TA, 'select count(*)::int c from trainer_clients'))[0].c >= 1, true, 'the other trainer is unaffected');
});

await t('editing a client updates the changed time and keeps the owner', async () => {
  const before = (await db.query('select updated_at from trainer_clients where id = $1', [clientA])).rows[0].updated_at;
  await new Promise((r) => setTimeout(r, 15));
  await me(TA, `update trainer_clients set notes = 'going well', payment_status = 'due', payment_due_date = '2026-11-01' where id = $1`, [clientA]);
  const row = (await db.query('select updated_at, trainer_id, payment_status from trainer_clients where id = $1', [clientA])).rows[0];
  assert.ok(new Date(row.updated_at) > new Date(before));
  assert.deepEqual([row.trainer_id, row.payment_status], [TA, 'due']);
});

await t('deleting a trainer account removes everything they stored', async () => {
  await db.query('delete from auth.users where id = $1', [TA]);
  for (const table of ['trainer_clients', 'trainer_checkins', 'trainer_finance_entries']) {
    assert.equal((await db.query(`select count(*)::int c from ${table} where trainer_id = $1`, [TA])).rows[0].c, 0, table);
  }
});

console.log(n, 'passed');
