// Checks supabase/client_checkins.sql in an in-process Postgres (PGlite): who can read a check-in, how invite codes work and are protected, how forms and answers
// are validated, and what happens when a link ends or an account is deleted.
//   node supabase/tests/client-checkins.test.mjs      (needs: npm install --no-save @electric-sql/pglite, or PGLITE_DIR)
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
  create table trainer_profiles (id uuid primary key default gen_random_uuid(), user_id uuid not null unique references auth.users(id) on delete cascade, display_name text not null default 'Coach');
  grant select on trainer_profiles to authenticated;
`);
await db.exec(readFileSync(ROOT + 'supabase/trainer_tools.sql', 'utf8'));
await db.exec(readFileSync(ROOT + 'supabase/client_checkins.sql', 'utf8'));
await db.exec(readFileSync(ROOT + 'supabase/client_checkins.sql', 'utf8')); // repeatable

const ID = (i) => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`;
const [T1, T2, C1, C2, X] = [ID(1), ID(2), ID(3), ID(4), ID(5)]; // two trainers, two clients, one stranger
for (const id of [T1, T2, C1, C2, X]) await db.query('insert into auth.users (id) values ($1)', [id]);
await db.query(`insert into trainer_profiles (user_id, display_name) values ($1, 'Coach Ann'), ($2, 'Coach Bo')`, [T1, T2]);

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
const root = async (sql, params = []) => (await db.query(sql, params)).rows; // the project owner, for checking what is really stored
const call = async (uid, fn, args = []) => (await me(uid, `select ${fn}(${args.map((_, i) => '$' + (i + 1)).join(', ')}) as r`, args))[0].r;
const j = (v) => JSON.stringify(v);

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

const saveForm = (uid, standard, custom, title = 'Weekly check-in') =>
  me(uid, `insert into checkin_forms (title, standard, custom) values ($1, $2::jsonb, $3::jsonb)
           on conflict (trainer_id) do update set title = excluded.title, standard = excluded.standard, custom = excluded.custom returning trainer_id`, [title, j(standard), j(custom)]);

// ── Forms ─────────────────────────────────────────────────────────────────────
await t('only a trainer can create a form, and a client cannot read it', async () => {
  await assert.rejects(() => saveForm(C1, ['weight'], []), /row-level security/);
  await saveForm(T1, ['weight', 'energy', 'sleep', 'training', 'wins'], [
    { id: 'water', label: 'Did you drink 2L a day?', type: 'yesno' },
    { id: 'steps', label: 'Average daily steps', type: 'number', unit: 'steps' },
    { id: 'mood10', label: 'Mood', type: 'scale', max: 10 },
    { id: 'cravings', label: 'Cravings', type: 'choice', options: ['None', 'Some', 'Lots'] },
    { id: 'notes', label: 'Anything else?', type: 'text' },
  ]);
  assert.equal((await me(T1, 'select * from checkin_forms')).length, 1);
  assert.equal((await me(T2, 'select * from checkin_forms')).length, 0);
  assert.equal((await me(C1, 'select * from checkin_forms')).length, 0);
  assert.equal((await me(T2, `update checkin_forms set title = 'hacked' where trainer_id = $1 returning 1`, [T1])).length, 0);
  assert.equal((await me(T2, `delete from checkin_forms where trainer_id = $1 returning 1`, [T1])).length, 0);
  await assert.rejects(() => as('anon', null, 'select * from checkin_forms'), /permission denied/);
});

const bad = async (label, standard, custom, re = /checkin_form_invalid/) => assert.rejects(() => saveForm(T2, standard, custom), re, label);
await t('malformed forms are refused', async () => {
  await bad('unknown standard question', ['nope'], []);
  await bad('duplicate standard question', ['weight', 'weight'], []);
  await bad('empty form', [], []);
  await bad('standard not a list', 'weight', []);
  await bad('too many custom questions', [], Array.from({ length: 11 }, (_, i) => ({ id: `q${i}`, label: 'x', type: 'text' })));
  await bad('duplicate id', [], [{ id: 'a', label: 'x', type: 'text' }, { id: 'a', label: 'y', type: 'text' }]);
  await bad('id collides with a standard question', [], [{ id: 'weight', label: 'x', type: 'text' }]);
  await bad('bad id', [], [{ id: 'Bad Id', label: 'x', type: 'text' }]);
  await bad('missing label', [], [{ id: 'a', label: '  ', type: 'text' }]);
  await bad('label too long', [], [{ id: 'a', label: 'x'.repeat(121), type: 'text' }]);
  await bad('unknown type', [], [{ id: 'a', label: 'x', type: 'file' }]);
  await bad('unknown field', [], [{ id: 'a', label: 'x', type: 'text', required: true }]);
  await bad('choice with one option', [], [{ id: 'a', label: 'x', type: 'choice', options: ['only'] }]);
  await bad('choice with nine options', [], [{ id: 'a', label: 'x', type: 'choice', options: ['1', '2', '3', '4', '5', '6', '7', '8', '9'] }]);
  await bad('choice with repeated options', [], [{ id: 'a', label: 'x', type: 'choice', options: ['a', 'a'] }]);
  await bad('scale to 7', [], [{ id: 'a', label: 'x', type: 'scale', max: 7 }]);
  await bad('text with options', [], [{ id: 'a', label: 'x', type: 'text', options: ['a', 'b'] }]);
  await assert.rejects(() => saveForm(T2, ['weight'], [], ''), /check constraint|violates/);
  assert.equal((await root('select count(*)::int as c from checkin_forms'))[0].c, 1);
});

// ── Invites ───────────────────────────────────────────────────────────────────
let code1;
let link1;
await t('a trainer makes an invite code; only a hash is stored; the trainer cannot see the hash or who joined', async () => {
  await assert.rejects(() => call(C1, 'create_checkin_invite', ['Sam']), /not_a_trainer/);
  await assert.rejects(() => as('anon', null, `select create_checkin_invite('x')`), /permission denied/);
  await assert.rejects(() => call(T1, 'create_checkin_invite', ['   ']), /invalid_label/);
  code1 = await call(T1, 'create_checkin_invite', ['Sam J']);
  assert.match(code1, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
  const stored = (await root('select * from trainer_client_links'))[0];
  assert.equal(stored.status, 'invited');
  assert.equal(stored.code_hash, (await root(`select encode(sha256(convert_to($1, 'UTF8')), 'hex') as h`, [code1]))[0].h);
  assert.ok(!JSON.stringify(stored).includes(code1), 'the code itself is not stored anywhere');
  const rows = await me(T1, 'select id, label, status, code_expires_at from trainer_client_links');
  assert.equal(rows.length, 1);
  link1 = rows[0].id;
  assert.equal(rows[0].label, 'Sam J');
  await assert.rejects(() => me(T1, 'select code_hash from trainer_client_links'), /permission denied/);
  await assert.rejects(() => me(T1, 'select client_user_id from trainer_client_links'), /permission denied/);
  assert.equal((await me(T2, 'select id from trainer_client_links')).length, 0);
  assert.equal((await me(C1, 'select id from trainer_client_links')).length, 0);
  const days = (await root(`select extract(epoch from (code_expires_at - now()))/86400 as d from trainer_client_links`))[0].d;
  assert.ok(days > 6.9 && days <= 7, `expires in ${days} days`);
});

await t('nobody writes links directly', async () => {
  await assert.rejects(() => me(T1, `insert into trainer_client_links (trainer_id, label, status, code_hash) values ($1, 'x', 'invited', 'abc')`, [T1]), /permission denied/);
  await assert.rejects(() => me(T1, `update trainer_client_links set status = 'active'`), /permission denied/);
  await assert.rejects(() => me(C1, `update trainer_client_links set client_user_id = $1`, [C1]), /permission denied/);
  await assert.rejects(() => me(T1, `delete from trainer_client_links`), /permission denied/);
});

await t('a tracked client must be one of the trainer\'s own', async () => {
  const mine = (await me(T1, `insert into trainer_clients (name) values ('Sam J') returning id`))[0].id;
  const theirs = (await me(T2, `insert into trainer_clients (name) values ('Other') returning id`))[0].id;
  await assert.rejects(() => call(T1, 'create_checkin_invite', ['x', theirs]), /invalid_client/);
  const c = await call(T1, 'create_checkin_invite', ['Tracked', mine]);
  assert.match(c, /^[A-Z2-9]{8}$/);
  const row = (await root(`select tracked_client_id from trainer_client_links where label = 'Tracked'`))[0];
  assert.equal(row.tracked_client_id, mine);
  await root(`delete from trainer_client_links where label = 'Tracked'`);
});

await t('wrong codes are answered, not accepted, and counted; 8 an hour then stops even a right code', async () => {
  const r = await call(X, 'redeem_checkin_invite', ['ZZZZZZZZ']);
  assert.deepEqual(r, { ok: false, error: 'invalid_code' });
  assert.deepEqual(await call(X, 'redeem_checkin_invite', ['']), { ok: false, error: 'invalid_code' });
  assert.deepEqual(await call(X, 'redeem_checkin_invite', ['short']), { ok: false, error: 'invalid_code' });
  assert.equal((await root('select count(*)::int as c from checkin_invite_attempts where user_id = $1', [X]))[0].c, 3);
  for (let i = 0; i < 5; i++) await call(X, 'redeem_checkin_invite', ['AAAAAAA' + i]);
  assert.deepEqual(await call(X, 'redeem_checkin_invite', [code1]), { ok: false, error: 'too_many_attempts' });
  assert.equal((await root(`select status from trainer_client_links where id = $1`, [link1]))[0].status, 'invited', 'the invite was not used up');
});
await t('nobody can read the attempts table', async () => {
  await assert.rejects(() => me(X, 'select * from checkin_invite_attempts'), /permission denied/);
});

await t('a trainer cannot use their own code', async () => {
  assert.deepEqual(await call(T1, 'redeem_checkin_invite', [code1]), { ok: false, error: 'own_invite' });
  assert.equal((await root(`select status from trainer_client_links where id = $1`, [link1]))[0].status, 'invited');
});

await t('a client uses the code (any case, with spaces or dashes) and becomes linked; it works once', async () => {
  const typed = code1.slice(0, 4).toLowerCase() + ' - ' + code1.slice(4).toLowerCase();
  const r = await call(C1, 'redeem_checkin_invite', [typed]);
  assert.deepEqual(r, { ok: true, link_id: link1, trainer_name: 'Coach Ann' });
  const row = (await root('select status, client_user_id, code_hash, code_expires_at from trainer_client_links where id = $1', [link1]))[0];
  assert.equal(row.status, 'active');
  assert.equal(row.client_user_id, C1);
  assert.equal(row.code_hash, null);
  assert.deepEqual(await call(C2, 'redeem_checkin_invite', [code1]), { ok: false, error: 'invalid_code' });
  const trainerView = await me(T1, 'select id, label, status, accepted_at from trainer_client_links');
  assert.equal(trainerView[0].status, 'active');
  assert.equal(trainerView[0].label, 'Sam J');
});

await t('the same person cannot link to the same trainer twice, and the spare code is kept', async () => {
  const c = await call(T1, 'create_checkin_invite', ['Sam again']);
  assert.deepEqual(await call(C1, 'redeem_checkin_invite', [c]), { ok: false, error: 'already_linked' });
  assert.equal((await root(`select status from trainer_client_links where label = 'Sam again'`))[0].status, 'invited');
  await root(`delete from trainer_client_links where label = 'Sam again'`);
});

await t('an expired code does not work', async () => {
  const c = await call(T1, 'create_checkin_invite', ['Late']);
  await root(`update trainer_client_links set code_expires_at = now() - interval '1 minute' where label = 'Late'`);
  assert.deepEqual(await call(C2, 'redeem_checkin_invite', [c]), { ok: false, error: 'invalid_code' });
  await root(`delete from trainer_client_links where label = 'Late'`);
});

await t('a trainer can withdraw an unused invite; a stranger cannot', async () => {
  const c = await call(T1, 'create_checkin_invite', ['Withdrawn']);
  const id = (await root(`select id from trainer_client_links where label = 'Withdrawn'`))[0].id;
  await assert.rejects(() => call(X, 'end_checkin_link', [id]), /link_not_found/);
  await assert.rejects(() => call(T2, 'end_checkin_link', [id]), /link_not_found/);
  await call(T1, 'end_checkin_link', [id]);
  assert.deepEqual(await call(C2, 'redeem_checkin_invite', [c]), { ok: false, error: 'invalid_code' });
  const row = (await root('select status, code_hash, ended_by_role from trainer_client_links where id = $1', [id]))[0];
  assert.deepEqual([row.status, row.code_hash, row.ended_by_role], ['ended', null, 'trainer']);
});

await t('limits: open invites and total links per trainer', async () => {
  for (let i = 0; i < 49; i++) await root(`insert into trainer_client_links (trainer_id, label, status, code_hash, code_expires_at) values ($1, 'bulk', 'invited', $2, now() + interval '1 day')`, [T2, 'h' + i]);
  await call(T2, 'create_checkin_invite', ['fiftieth']);
  await assert.rejects(() => call(T2, 'create_checkin_invite', ['fifty-first']), /too_many_invites/);
  await root(`delete from trainer_client_links where trainer_id = $1`, [T2]);
});

// ── What a client sees ────────────────────────────────────────────────────────
await t('a client sees only their own links, with the trainer\'s name; the form comes through a function', async () => {
  const mine = await me(C1, 'select * from my_checkin_links()');
  assert.equal(mine.length, 1);
  assert.equal(mine[0].link_id, link1);
  assert.equal(mine[0].trainer_name, 'Coach Ann');
  assert.equal(mine[0].form_ready, true);
  assert.equal(mine[0].last_submitted_at, null);
  assert.equal((await me(X, 'select * from my_checkin_links()')).length, 0);
  assert.equal((await me(C2, 'select * from my_checkin_links()')).length, 0);
  const form = await call(C1, 'checkin_form_for_link', [link1]);
  assert.equal(form.title, 'Weekly check-in');
  assert.deepEqual(form.questions.map((q) => q.id), ['weight', 'energy', 'sleep', 'training', 'wins', 'water', 'steps', 'mood10', 'cravings', 'notes']);
  assert.equal(form.questions[0].type, 'number');
  assert.deepEqual(form.questions[3].options, ['All of it', 'Most of it', 'Some of it', 'Hardly any']);
  assert.equal(await call(X, 'checkin_form_for_link', [link1]), null);
  assert.equal(await call(T1, 'checkin_form_for_link', [link1]), null);
  await assert.rejects(() => as('anon', null, 'select * from my_checkin_links()'), /permission denied/);
});

// ── Submitting ────────────────────────────────────────────────────────────────
const submit = (uid, link, answers) => call(uid, 'submit_checkin', [link, j(answers)]);
let sub1;
await t('a client sends a check-in; the question list is copied in', async () => {
  sub1 = await submit(C1, link1, { weight: 82.4, energy: 4, sleep: 3, training: 'Most of it', wins: '  New squat PB  ', water: true, steps: 9000, mood10: 8, cravings: 'Some', notes: '   ' });
  const row = (await root('select * from checkin_submissions where id = $1', [sub1]))[0];
  assert.deepEqual(row.answers, { weight: 82.4, energy: 4, sleep: 3, training: 'Most of it', wins: 'New squat PB', water: true, steps: 9000, mood10: 8, cravings: 'Some' });
  assert.equal(row.form.title, 'Weekly check-in');
  assert.equal(row.form.questions.length, 10);
  assert.equal(row.trainer_id, T1);
  assert.equal(row.client_user_id, C1);
});

const refuse = (label, answers, re) => t(`refused: ${label}`, () => assert.rejects(() => submit(C1, link1, answers), re));
await refuse('nothing answered', {}, /checkin_empty/);
await refuse('only blank text', { wins: '   ' }, /checkin_empty/);
await refuse('a question that is not on the form', { weight: 80, hacked: 'x' }, /not on the form/);
await refuse('a standard question the trainer switched off', { stress: 3 }, /not on the form/);
await refuse('scale above its maximum', { energy: 6 }, /out of range/);
await refuse('scale of zero', { energy: 0 }, /out of range/);
await refuse('scale with a decimal', { energy: 3.5 }, /out of range/);
await refuse('custom scale above 10', { mood10: 11 }, /out of range/);
await refuse('weight below the limit', { weight: 10 }, /out of range/);
await refuse('weight above the limit', { weight: 501 }, /out of range/);
await refuse('a number sent as text', { weight: '80' }, /needs a number/);
await refuse('a choice that is not an option', { training: 'Maybe' }, /not one of the options/);
await refuse('yes/no sent as text', { water: 'yes' }, /yes or no/);
await refuse('text sent as a number', { wins: 5 }, /needs text/);
await refuse('text over 1000 characters', { wins: 'x'.repeat(1001) }, /too long/);
await refuse('answers that are not an object', [1, 2], /must be an object/);
await refuse('answers over the size limit', { wins: 'x'.repeat(900), notes: 'y'.repeat(900), steps: 1, ...Object.fromEntries(Array.from({ length: 2000 }, (_, i) => ['k' + i, 1])) }, /not on the form|too long/);

await t('only the client on a link can use it, and only while it is active', async () => {
  await assert.rejects(() => submit(X, link1, { weight: 80 }), /link_not_active/);
  await assert.rejects(() => submit(C2, link1, { weight: 80 }), /link_not_active/);
  await assert.rejects(() => submit(T1, link1, { weight: 80 }), /link_not_active/);
  await assert.rejects(() => as('anon', null, `select submit_checkin($1, '{}')`, [link1]), /permission denied/);
  await assert.rejects(() => submit(C1, ID(999), { weight: 80 }), /link_not_active/);
});

await t('nobody inserts or edits check-ins directly', async () => {
  await assert.rejects(() => me(C1, `insert into checkin_submissions (link_id, trainer_id, client_user_id, form, answers) values ($1, $2, $3, '{}', '{}')`, [link1, T1, C1]), /permission denied/);
  await assert.rejects(() => me(C1, `update checkin_submissions set answers = '{}'`), /permission denied/);
  await assert.rejects(() => me(T1, `update checkin_submissions set answers = '{}'`), /permission denied/);
  await assert.rejects(() => me(T1, `update checkin_submissions set trainer_feedback = 'x'`), /permission denied/);
});

await t('later edits to the form do not change an old check-in', async () => {
  await saveForm(T1, ['energy'], [{ id: 'extra', label: 'New question', type: 'text' }], 'Renamed');
  const old = (await me(T1, 'select form, answers from checkin_submissions where id = $1', [sub1]))[0];
  assert.equal(old.form.title, 'Weekly check-in');
  assert.equal(old.form.questions.length, 10);
  assert.equal(old.answers.weight, 82.4);
  await assert.rejects(() => submit(C1, link1, { weight: 80 }), /not on the form/);
  const s2 = await submit(C1, link1, { energy: 2, extra: 'tired' });
  assert.ok(s2);
  await saveForm(T1, ['weight', 'energy', 'sleep', 'training', 'wins'], [
    { id: 'water', label: 'Did you drink 2L a day?', type: 'yesno' },
    { id: 'steps', label: 'Average daily steps', type: 'number', unit: 'steps' },
    { id: 'mood10', label: 'Mood', type: 'scale', max: 10 },
    { id: 'cravings', label: 'Cravings', type: 'choice', options: ['None', 'Some', 'Lots'] },
    { id: 'notes', label: 'Anything else?', type: 'text' },
  ]);
});

await t('a client cannot send a check-in when the trainer has no form', async () => {
  const code = await call(T2, 'create_checkin_invite', ['No form']);
  const r = await call(C2, 'redeem_checkin_invite', [code]);
  assert.equal(r.ok, true);
  assert.equal((await me(C2, 'select * from my_checkin_links()'))[0].form_ready, false);
  assert.equal(await call(C2, 'checkin_form_for_link', [r.link_id]), null);
  await assert.rejects(() => submit(C2, r.link_id, { weight: 80 }), /no_form/);
  await call(C2, 'end_checkin_link', [r.link_id]);
});

await t('at most 20 check-ins a day on one link', async () => {
  const before = (await root('select count(*)::int as c from checkin_submissions where link_id = $1', [link1]))[0].c;
  for (let i = before; i < 20; i++) await submit(C1, link1, { energy: 3 });
  await assert.rejects(() => submit(C1, link1, { energy: 3 }), /checkin_rate_limit/);
  await root(`delete from checkin_submissions where link_id = $1 and id <> $2`, [link1, sub1]);
});

// ── Who reads a check-in ──────────────────────────────────────────────────────
await t('the trainer and the client read it; no one else does; the trainer never sees the client\'s account id', async () => {
  assert.equal((await me(T1, 'select id from checkin_submissions')).length, 1);
  assert.equal((await me(C1, 'select id from my_checkin_submissions()')).length, 1);
  assert.equal((await me(T2, 'select id from checkin_submissions')).length, 0);
  assert.equal((await me(C2, 'select id from my_checkin_submissions()')).length, 0);
  assert.equal((await me(X, 'select id from my_checkin_submissions()')).length, 0);
  await assert.rejects(() => as('anon', null, 'select id from checkin_submissions'), /permission denied/);
  await assert.rejects(() => me(T1, 'select client_user_id from checkin_submissions'), /permission denied/);
  assert.equal((await me(C1, 'select id from checkin_submissions')).length, 0, 'a client does not read the table directly');
  await assert.rejects(() => me(C1, 'select client_user_id from checkin_submissions'), /permission denied/);
  const mineRow = (await me(C1, 'select * from my_checkin_submissions()'))[0];
  assert.equal(mineRow.trainer_name, 'Coach Ann');
  assert.equal(mineRow.answers.weight, 82.4);
  assert.ok(!('client_user_id' in mineRow));
  await assert.rejects(() => as('anon', null, 'select * from my_checkin_submissions()'), /permission denied/);
});

await t('the trainer writes feedback; others cannot; it marks the check-in read', async () => {
  assert.equal((await me(T1, 'select read_at from checkin_submissions'))[0].read_at, null);
  await assert.rejects(() => call(T2, 'review_checkin', [sub1, 'hi']), /submission_not_found/);
  await assert.rejects(() => call(C1, 'review_checkin', [sub1, 'hi']), /submission_not_found/);
  await assert.rejects(() => call(X, 'review_checkin', [sub1, 'hi']), /submission_not_found/);
  await assert.rejects(() => call(T1, 'review_checkin', [sub1, 'x'.repeat(1001)]), /feedback_too_long/);
  await call(T1, 'review_checkin', [sub1, '  Great week, keep going  ']);
  const row = (await me(C1, 'select trainer_feedback, feedback_at from my_checkin_submissions() where id = $1', [sub1]))[0];
  assert.equal(row.trainer_feedback, 'Great week, keep going');
  assert.ok(row.feedback_at);
  assert.ok((await me(T1, 'select read_at from checkin_submissions where id = $1', [sub1]))[0].read_at);
  await call(T1, 'review_checkin', [sub1, '']);
  assert.equal((await me(T1, 'select trainer_feedback, feedback_at from checkin_submissions'))[0].trainer_feedback, null);
  await call(T1, 'review_checkin', [sub1, 'Great week']);
});

await t('marking read: only the trainer on the link', async () => {
  const s = await submit(C1, link1, { energy: 5 });
  await call(X, 'mark_checkin_read', [s]);
  await call(T2, 'mark_checkin_read', [s]);
  assert.equal((await me(T1, 'select read_at from checkin_submissions where id = $1', [s]))[0].read_at, null);
  await call(T1, 'mark_checkin_read', [s]);
  assert.ok((await me(T1, 'select read_at from checkin_submissions where id = $1', [s]))[0].read_at);
  await call(C1, 'delete_my_checkin', [s]);
});

// ── Ending a link ─────────────────────────────────────────────────────────────
await t('a trainer cannot delete check-ins; a client can delete their own and nobody else\'s', async () => {
  for (const u of [T1, C1, C2, X]) await assert.rejects(() => me(u, 'delete from checkin_submissions'), /permission denied/);
  await assert.rejects(() => call(T1, 'delete_my_checkin', [sub1]), /submission_not_found/);
  await assert.rejects(() => call(C2, 'delete_my_checkin', [sub1]), /submission_not_found/);
  await assert.rejects(() => call(X, 'delete_my_checkin', [sub1]), /submission_not_found/);
  await assert.rejects(() => as('anon', null, 'select delete_my_checkin($1)', [sub1]), /permission denied/);
  assert.equal((await root('select count(*)::int as c from checkin_submissions'))[0].c, 1);
});

await t('when the client ends the link the trainer loses access, the client keeps their copy, and nothing more can be sent', async () => {
  await call(C1, 'end_checkin_link', [link1]);
  const link = (await root('select status, ended_by_role from trainer_client_links where id = $1', [link1]))[0];
  assert.deepEqual([link.status, link.ended_by_role], ['ended', 'client']);
  assert.equal((await me(T1, 'select id from checkin_submissions')).length, 0);
  assert.equal((await me(C1, 'select id from my_checkin_submissions()')).length, 1);
  await assert.rejects(() => call(T1, 'review_checkin', [sub1, 'still here?']), /submission_not_found/);
  await assert.rejects(() => submit(C1, link1, { energy: 3 }), /link_not_active/);
  assert.equal((await me(C1, 'select * from my_checkin_links()')).length, 0);
  await assert.rejects(() => call(C1, 'end_checkin_link', [link1]), /link_not_found/);
  assert.equal((await me(T1, 'select status from trainer_client_links where id = $1', [link1]))[0].status, 'ended');
});

await t('after a link ends the same person can be invited and linked again, and starts fresh for the trainer', async () => {
  const c = await call(T1, 'create_checkin_invite', ['Sam J (again)']);
  const r = await call(C1, 'redeem_checkin_invite', [c]);
  assert.equal(r.ok, true);
  assert.notEqual(r.link_id, link1);
  assert.equal((await me(T1, 'select id from checkin_submissions')).length, 0, 'the old check-ins stay hidden from the trainer');
  await submit(C1, r.link_id, { energy: 4 });
  assert.equal((await me(T1, 'select id from checkin_submissions')).length, 1);
  assert.equal((await me(C1, 'select id from my_checkin_submissions()')).length, 2);
  await call(C1, 'delete_my_checkin', [sub1]);
  assert.equal((await me(C1, 'select id from my_checkin_submissions()')).length, 1);
});

await t('a trainer ending a link also stops their own access', async () => {
  const link = (await me(T1, `select id from trainer_client_links where status = 'active'`))[0].id;
  await call(T1, 'end_checkin_link', [link]);
  assert.equal((await me(T1, 'select id from checkin_submissions')).length, 0);
  assert.equal((await me(C1, 'select id from my_checkin_submissions()')).length, 1);
  assert.equal((await root(`select ended_by_role from trainer_client_links where id = $1`, [link]))[0].ended_by_role, 'trainer');
});

// ── Deleting accounts ─────────────────────────────────────────────────────────
await t('deleting a client\'s account deletes their links and check-ins', async () => {
  const c = await call(T1, 'create_checkin_invite', ['Temp']);
  const r = await call(C2, 'redeem_checkin_invite', [c]);
  await submit(C2, r.link_id, { energy: 2 });
  assert.equal((await root('select count(*)::int as c from checkin_submissions where client_user_id = $1', [C2]))[0].c, 1);
  await root('delete from auth.users where id = $1', [C2]);
  assert.equal((await root('select count(*)::int as c from checkin_submissions where client_user_id = $1', [C2]))[0].c, 0);
  assert.equal((await root('select count(*)::int as c from trainer_client_links where client_user_id = $1', [C2]))[0].c, 0);
});

await t('deleting a trainer\'s account deletes their form, links and the check-ins they received', async () => {
  await root('delete from auth.users where id = $1', [T1]);
  for (const table of ['checkin_forms', 'trainer_client_links', 'checkin_submissions']) {
    assert.equal((await root(`select count(*)::int as c from ${table}`))[0].c, 0, table);
  }
});

await t('the standard question list is readable by signed-in users and is the one the functions use', async () => {
  const cat = (await me(C1, 'select checkin_standard_catalog() as c'))[0].c;
  assert.deepEqual(Object.keys(cat).sort(), ['energy', 'nutrition', 'questions', 'sleep', 'soreness', 'stress', 'struggles', 'training', 'weight', 'wins']);
  await assert.rejects(() => as('anon', null, 'select checkin_standard_catalog()'), /permission denied/);
});

console.log(`\n${n} checks passed${process.exitCode ? ' (some FAILED)' : ''}`);
