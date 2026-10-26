// Checks the report digest: the email logic (supabase/functions/report-digest/digest.ts) and the database functions
// (supabase/report_digest.sql, run against the real content_reports.sql in an in-process Postgres).
//   node scripts/test-report-digest.mjs        (Node 22.6+ runs the TypeScript directly)
// The database part needs PGlite, which is not an app dependency:  npm install --no-save @electric-sql/pglite
// (or set PGLITE_DIR to a folder whose node_modules has it). Without it that part is skipped and says so.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildDigest, escapeHtml, runDigest, secretOk } from '../supabase/functions/report-digest/digest.ts';

const ROOT = fileURLToPath(new URL('../', import.meta.url)).replace(/\\/g, '/');
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

const ID = (i) => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`;
const content = (i, over = {}) => ({ id: ID(i), kind: 'user', target_id: ID(100 + i), reported_user_id: ID(200 + i), label: 'SomeName', reason: 'rude name', created_at: `2026-10-2${i}T10:00:00Z`, ...over });
const message = (i, over = {}) => ({ id: ID(50 + i), trainer_user_id: ID(300 + i), client_user_id: ID(400 + i), reported_user_id: ID(400 + i), reason: 'abusive message', created_at: `2026-10-2${i}T11:00:00Z`, ...over });
const env = { RESEND_API_KEY: 're_test_key', REPORT_ALERT_EMAIL: 'owner@example.com', DIGEST_SECRET: 'long-random-secret-value' };

function harness(unsent, { failSend = false, failMark = false, failRead = false } = {}) {
  const log = { sent: [], marked: [] };
  const db = {
    unsent: async () => { if (failRead) throw new Error('boom'); return unsent; },
    markSent: async (c, m) => { if (failMark) throw new Error('boom'); log.marked.push([c, m]); },
  };
  const fetchImpl = async (url, init) => {
    log.sent.push({ url, init, body: JSON.parse(init.body) });
    return { ok: !failSend, status: failSend ? 500 : 200 };
  };
  return { db, fetchImpl, log };
}

await t('with nothing to report, no email is sent and nothing is marked', async () => {
  const h = harness({ content: [], messages: [] });
  const r = await runDigest({ db: h.db, env, fetchImpl: h.fetchImpl });
  assert.deepEqual([r.status, r.body.sent, r.body.count], [200, false, 0]);
  assert.equal(h.log.sent.length, 0);
});

await t('one email lists every unsent report, then exactly those reports are marked', async () => {
  const h = harness({ content: [content(1), content(2, { kind: 'trainer', label: null })], messages: [message(3)] });
  const r = await runDigest({ db: h.db, env, fetchImpl: h.fetchImpl });
  assert.deepEqual([r.status, r.body.sent, r.body.count], [200, true, 3]);
  assert.equal(h.log.sent.length, 1);
  const mail = h.log.sent[0];
  assert.equal(mail.url, 'https://api.resend.com/emails');
  assert.equal(mail.init.headers.Authorization, 'Bearer re_test_key');
  assert.deepEqual(mail.body.to, ['owner@example.com']);
  assert.match(mail.body.subject, /3 new reports/);
  assert.match(mail.body.text, /user report: SomeName/);
  assert.match(mail.body.text, /Trainer chat message report/);
  assert.deepEqual(h.log.marked, [[[ID(1), ID(2)], [ID(53)]]]);
});

await t('what a reporter wrote is escaped in the HTML, so it cannot inject markup', async () => {
  const evil = '<script>alert(1)</script> & "quotes" <img src=x onerror=1>';
  const m = buildDigest({ content: [content(1, { reason: evil, label: '<b>bold</b>' })], messages: [] }, 'https://example.com/?a=1&b=2"x');
  assert.ok(!m.html.includes('<script>') && !m.html.includes('<img') && !m.html.includes('<b>bold'));
  assert.match(m.html, /&lt;script&gt;/);
  assert.match(m.html, /href="https:\/\/example\.com\/\?a=1&amp;b=2&quot;x"/);
  assert.equal(escapeHtml(`'`), '&#39;');
});

await t('the email never contains an email address of a reported person, and long reasons are cut', async () => {
  const m = buildDigest({ content: [content(1, { reason: 'x'.repeat(2000) })], messages: [] }, 'https://example.com');
  assert.ok(m.text.length < 1500);
  assert.ok(!/@/.test(m.text.replace('owner@', '')), 'no addresses in the report text');
});

await t('a big backlog is capped at 50 per email and says how many are left', async () => {
  const many = Array.from({ length: 60 }, (_, i) => content(1, { id: ID(1000 + i), created_at: `2026-10-01T10:${String(i % 60).padStart(2, '0')}:00Z` }));
  const m = buildDigest({ content: many, messages: [] }, 'https://example.com');
  assert.equal(m.count, 60);
  assert.equal((m.text.match(/^\d+\. /gm) || []).length, 50);
  assert.match(m.text, /10 more are not listed/);
});

await t('if the email fails, nothing is marked, so the next run tries again', async () => {
  const h = harness({ content: [content(1)], messages: [] }, { failSend: true });
  const r = await runDigest({ db: h.db, env, fetchImpl: h.fetchImpl });
  assert.equal(r.status, 502);
  assert.equal(h.log.marked.length, 0);
});

await t('the same reports always send with the same idempotency key (a retry cannot send a second copy)', async () => {
  const a = harness({ content: [content(1), content(2)], messages: [] });
  const b = harness({ content: [content(2), content(1)], messages: [] });
  await runDigest({ db: a.db, env, fetchImpl: a.fetchImpl });
  await runDigest({ db: b.db, env, fetchImpl: b.fetchImpl });
  const key = (h) => h.log.sent[0].init.headers['Idempotency-Key'];
  assert.equal(key(a), key(b));
  const c = harness({ content: [content(3)], messages: [] });
  await runDigest({ db: c.db, env, fetchImpl: c.fetchImpl });
  assert.notEqual(key(a), key(c));
});

await t('missing settings or a database error are reported without sending anything', async () => {
  for (const missing of ['RESEND_API_KEY', 'REPORT_ALERT_EMAIL']) {
    const h = harness({ content: [content(1)], messages: [] });
    const r = await runDigest({ db: h.db, env: { ...env, [missing]: '' }, fetchImpl: h.fetchImpl });
    assert.deepEqual([r.status, r.body.error, h.log.sent.length], [503, 'not_configured', 0], missing);
  }
  const h = harness({ content: [], messages: [] }, { failRead: true });
  assert.equal((await runDigest({ db: h.db, env, fetchImpl: h.fetchImpl })).status, 500);
  const m = harness({ content: [content(1)], messages: [] }, { failMark: true });
  const r = await runDigest({ db: m.db, env, fetchImpl: m.fetchImpl });
  assert.deepEqual([r.status, r.body.error], [500, 'sent_but_not_marked']);
});

await t('the response body never contains report text or addresses', async () => {
  const h = harness({ content: [content(1, { reason: 'secret words' })], messages: [] });
  const r = await runDigest({ db: h.db, env, fetchImpl: h.fetchImpl });
  assert.ok(!JSON.stringify(r).includes('secret words') && !JSON.stringify(r).includes('owner@'));
});

await t('the shared secret check accepts only the exact value', () => {
  assert.equal(secretOk('long-random-secret-value', 'long-random-secret-value'), true);
  for (const bad of ['', null, undefined, 'long-random-secret-valuE', 'short', 'long-random-secret-value ']) assert.equal(secretOk(bad, 'long-random-secret-value'), false, String(bad));
  assert.equal(secretOk('x', ''), false);
  assert.equal(secretOk('x', undefined), false);
});

await t('the function file is thin, uses no secrets in source, and checks the shared secret before anything else', () => {
  const src = readFileSync(ROOT + 'supabase/functions/report-digest/index.ts', 'utf8');
  assert.ok(!/re_[A-Za-z0-9]{10,}|eyJ[A-Za-z0-9_-]{20,}/.test(src));
  assert.ok(src.indexOf('secretOk(') < src.indexOf('createClient('), 'the secret is checked before a database client is made');
  assert.ok(src.split('\n').length < 50);
});

// ── The database part ───────────────────────────────────────────
let PGlite = null;
for (const base of [ROOT, process.env.PGLITE_DIR ? process.env.PGLITE_DIR.replace(/\\/g, '/').replace(/\/?$/, '/') : null]) {
  if (!base) continue;
  try {
    const req = createRequire(pathToFileURL(base + 'x.js'));
    ({ PGlite } = await import(pathToFileURL(req.resolve('@electric-sql/pglite')).href));
    break;
  } catch {
    /* try next */
  }
}
if (!PGlite) {
  console.log('  skipped: database checks (PGlite is not installed)');
} else {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public to anon, authenticated, service_role;
  `);
  await db.exec(readFileSync(ROOT + 'supabase/content_reports.sql', 'utf8'));
  // message_reports as in supabase/trainer_moderation.sql (only the columns the digest reads), with its real grants.
  await db.exec(`
    create table message_reports (
      id uuid primary key default gen_random_uuid(),
      trainer_user_id uuid not null references auth.users(id) on delete cascade,
      client_user_id uuid not null references auth.users(id) on delete cascade,
      reporter_user_id uuid not null references auth.users(id) on delete cascade,
      reported_user_id uuid not null references auth.users(id) on delete cascade,
      reason text not null check (char_length(reason) between 1 and 1000),
      created_at timestamptz not null default now()
    );
    alter table message_reports enable row level security;
    grant select, insert on message_reports to authenticated;
    grant select, insert on message_reports to service_role;
  `);
  await db.exec(readFileSync(ROOT + 'supabase/report_digest.sql', 'utf8'));
  await db.exec(readFileSync(ROOT + 'supabase/report_digest.sql', 'utf8')); // repeatable

  const U = [1, 2, 3].map((i) => ID(900 + i));
  for (const id of U) await db.query('insert into auth.users (id) values ($1)', [id]);
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
  await as('authenticated', U[0], `insert into content_reports (reporter_user_id, kind, target_id, reason) values ($1, 'user', 'abc', 'rude')`, [U[0]]);
  await db.query(`insert into message_reports (trainer_user_id, client_user_id, reporter_user_id, reported_user_id, reason) values ($1, $2, $2, $1, 'abuse')`, [U[1], U[2]]);

  await t('database: only the service role can read unsent reports or mark them', async () => {
    for (const role of ['anon', 'authenticated']) {
      await assert.rejects(() => as(role, U[0], 'select public.unsent_reports(10)'), /permission denied/);
      await assert.rejects(() => as(role, U[0], 'select public.mark_reports_sent(null, null)'), /permission denied/);
    }
    const r = (await as('service_role', null, 'select public.unsent_reports(10) as v'))[0].v;
    assert.equal(r.content.length, 1);
    assert.equal(r.messages.length, 1);
  });

  await t('database: the report rows come back without any email address, and a reporter cannot read the table', async () => {
    const r = (await as('service_role', null, 'select public.unsent_reports(10) as v'))[0].v;
    assert.ok(!JSON.stringify(r).includes('@'));
    assert.ok(!('reporter_user_id' in r.content[0]), 'who reported is not included');
    await assert.rejects(() => as('authenticated', U[0], 'select * from content_reports'), /permission denied/);
  });

  await t('database: marking sent removes exactly those reports from the next run, and a new report appears', async () => {
    const first = (await as('service_role', null, 'select public.unsent_reports(10) as v'))[0].v;
    await as('service_role', null, 'select public.mark_reports_sent($1::uuid[], $2::uuid[])', [first.content.map((x) => x.id), first.messages.map((x) => x.id)]);
    const again = (await as('service_role', null, 'select public.unsent_reports(10) as v'))[0].v;
    assert.deepEqual([again.content.length, again.messages.length], [0, 0]);
    await as('authenticated', U[0], `insert into content_reports (reporter_user_id, kind, target_id, reason) values ($1, 'squad', 'xyz', 'bad')`, [U[0]]);
    const next = (await as('service_role', null, 'select public.unsent_reports(10) as v'))[0].v;
    assert.equal(next.content.length, 1);
    assert.equal(next.content[0].kind, 'squad');
  });

  await t('database: the action column only accepts the listed values', async () => {
    await assert.rejects(() => db.query(`update content_reports set action = 'banned forever'`), /content_reports_action_check/);
    await db.query(`update content_reports set action = 'removed', reviewed_at = now() where kind = 'user'`);
  });
}

console.log(n, 'passed');
