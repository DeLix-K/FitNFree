// Checks supabase/claim_free_digital_product.sql against the real digital_products.sql in an in-process Postgres (PGlite).
// PGlite is deliberately not a dependency of the app. Run:  npm install --no-save @electric-sql/pglite
//   node supabase/tests/claim-free-digital-product.test.mjs      (or set PGLITE_DIR to a folder whose node_modules has it)
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
  create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
  grant usage on schema public to anon, authenticated, service_role;
  grant usage on schema auth to anon, authenticated;
`);
await db.exec(readFileSync(ROOT + 'supabase/digital_products.sql', 'utf8'));
await db.exec(readFileSync(ROOT + 'supabase/claim_free_digital_product.sql', 'utf8'));
await db.exec(readFileSync(ROOT + 'supabase/claim_free_digital_product.sql', 'utf8')); // repeatable

const ANN = '00000000-0000-0000-0000-00000000000a';
const BEN = '00000000-0000-0000-0000-00000000000b';
for (const id of [ANN, BEN]) await db.query('insert into auth.users (id) values ($1)', [id]);
const free = (await db.query(`insert into digital_products (title, price_cents) values ('Free 10K plan', 0) returning id`)).rows[0].id;
const paid = (await db.query(`insert into digital_products (title, price_cents) values ('Paid plan', 2999) returning id`)).rows[0].id;
for (const id of [free, paid]) await db.query(`insert into digital_product_content (product_id, body) values ($1, 'secret body')`, [id]);

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
const claim = (uid, id) => as('authenticated', uid, 'select public.claim_free_digital_product($1)', [id]);
const rows = async (q, p) => (await db.query(q, p)).rows;
const content = (uid, id) => as('authenticated', uid, 'select body from digital_product_content where product_id = $1', [id]);

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

await t('a signed-out caller cannot claim anything', async () => {
  await assert.rejects(() => as('anon', null, 'select public.claim_free_digital_product($1)', [free]), /permission denied/);
});
await t('before claiming, a free guide has no readable content', async () => {
  assert.equal((await content(ANN, free)).length, 0);
});
await t('a free guide can be claimed, and then its content is readable', async () => {
  await claim(ANN, free);
  const r = await rows(`select status from digital_product_purchases where user_id = $1 and product_id = $2`, [ANN, free]);
  assert.deepEqual(r.map((x) => x.status), ['paid']);
  assert.equal((await content(ANN, free))[0].body, 'secret body');
});
await t('claiming twice changes nothing', async () => {
  await claim(ANN, free);
  assert.equal((await rows(`select count(*)::int c from digital_product_purchases where user_id = $1`, [ANN]))[0].c, 1);
});
await t('another player is unaffected', async () => {
  assert.equal((await content(BEN, free)).length, 0);
});
await t('a PAID guide cannot be claimed, and its content stays locked', async () => {
  await assert.rejects(() => claim(ANN, paid), /not_free/);
  assert.equal((await rows(`select count(*)::int c from digital_product_purchases where product_id = $1`, [paid]))[0].c, 0);
  assert.equal((await content(ANN, paid)).length, 0);
});
await t('an unknown product cannot be claimed', async () => {
  await assert.rejects(() => claim(ANN, '00000000-0000-0000-0000-0000000000ff'), /not_free/);
});
await t('a leftover pending row on a free guide becomes paid; on a paid guide it stays pending', async () => {
  await db.query(`insert into digital_product_purchases (user_id, product_id, status) values ($1, $2, 'pending'), ($1, $3, 'pending')`, [BEN, free, paid]);
  await claim(BEN, free);
  await assert.rejects(() => claim(BEN, paid), /not_free/);
  const r = Object.fromEntries((await rows(`select product_id, status from digital_product_purchases where user_id = $1`, [BEN])).map((x) => [x.product_id, x.status]));
  assert.equal(r[free], 'paid');
  assert.equal(r[paid], 'pending');
  assert.equal((await content(BEN, paid)).length, 0);
});
await t('a player cannot write purchases directly, and a later price change keeps owned guides but blocks new claims', async () => {
  await assert.rejects(() => as('authenticated', ANN, `insert into digital_product_purchases (user_id, product_id, status) values ($1, $2, 'paid')`, [ANN, paid]), /permission denied/);
  await assert.rejects(() => as('authenticated', ANN, `update digital_product_purchases set status = 'paid' where user_id = $1`, [ANN]), /permission denied/);
  await db.query(`update digital_products set price_cents = 500 where id = $1`, [free]);
  assert.equal((await content(ANN, free))[0].body, 'secret body', 'the library entry stays');
  await assert.rejects(() => claim(BEN, free), /not_free/, 'but once it is no longer free nobody new can claim it');
});

console.log(n, 'passed');
