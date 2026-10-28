// Checks lib/checkinForms.ts (the rules behind client check-in forms). Node 22.6+ runs the TypeScript directly.
//   node scripts/test-checkin-forms.mjs
// If @electric-sql/pglite is available (it is in the repo's test setup via PGLITE_DIR) the same rules are also compared with the real database functions in
// supabase/client_checkins.sql, so the app and the database cannot drift apart.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import * as F from '../lib/checkinForms.ts';

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

const form = (over = {}) => ({ title: 'Weekly check-in', intro: null, standard: ['weight', 'energy'], custom: [], ...over });
const q = (over = {}) => ({ id: 'a', label: 'A question', type: 'text', ...over });

// ── A trainer's form ──────────────────────────────────────────────────────────
await t('the default form is valid and has the standard questions in a fixed order', () => {
  assert.deepEqual(F.validateForm(F.DEFAULT_FORM), []);
  assert.deepEqual(F.STANDARD_IDS, ['weight', 'energy', 'sleep', 'stress', 'soreness', 'training', 'nutrition', 'wins', 'struggles', 'questions']);
  const qs = F.questionsOf({ standard: ['wins', 'weight'], custom: [q()] });
  assert.deepEqual(qs.map((x) => x.id), ['weight', 'wins', 'a']);
});

await t('forms: what is accepted and what is refused, in plain words', () => {
  const bad = (label, def, re) => {
    const e = F.validateForm(def);
    assert.ok(e.length > 0, `${label}: expected a problem`);
    if (re) assert.match(e.join(' '), re, label);
  };
  bad('no questions', form({ standard: [] }), /at least one/i);
  bad('empty title', form({ title: '   ' }), /title/i);
  bad('title too long', form({ title: 'x'.repeat(61) }), /title/i);
  bad('intro too long', form({ intro: 'x'.repeat(301) }), /introduction/i);
  bad('unknown standard question', form({ standard: ['nope'] }), /not recognised/i);
  bad('eleven custom', form({ custom: Array.from({ length: 11 }, (_, i) => q({ id: `q${i}` })) }), /up to 10/);
  bad('duplicate ids', form({ custom: [q(), q()] }), /clashing id/);
  bad('id clashes with a standard one', form({ custom: [q({ id: 'weight' })] }), /clashing id/);
  bad('bad id', form({ custom: [q({ id: 'Bad Id' })] }), /clashing id/);
  bad('no label', form({ custom: [q({ label: '  ' })] }), /needs some text/);
  bad('label too long', form({ custom: [q({ label: 'x'.repeat(121) })] }), /120/);
  bad('unknown type', form({ custom: [q({ type: 'file' })] }), /unknown type/);
  bad('choice with one option', form({ custom: [q({ type: 'choice', options: ['only'] })] }), /2 to 8/);
  bad('choice with nine', form({ custom: [q({ type: 'choice', options: 'abcdefghi'.split('') })] }), /2 to 8/);
  bad('choice with repeats', form({ custom: [q({ type: 'choice', options: ['a', 'a'] })] }), /twice/);
  bad('option too long', form({ custom: [q({ type: 'choice', options: ['a', 'x'.repeat(41)] })] }), /option/i);
  bad('unit too long', form({ custom: [q({ type: 'number', unit: 'x'.repeat(13) })] }), /unit/i);
  assert.deepEqual(F.validateForm(form({ standard: [], custom: [q({ type: 'scale', max: 10 })] })), []);
  assert.deepEqual(F.validateForm(form({ custom: [q({ type: 'choice', options: ['  Yes ', 'No'] })] })), []);
  assert.deepEqual(F.validateForm(form({ title: 'é'.repeat(60), custom: [q({ label: '🏋️'.repeat(60) })] })), [], 'characters, not UTF-16 units');
});

await t('normalising a form trims text, drops empty options and unused fields, and keeps the standard order', () => {
  const out = F.normalizeForm({ title: '  Weekly ', intro: '  ', standard: ['wins', 'weight', 'weight'].slice(0, 2), custom: [
    { id: 'a', label: ' Water? ', type: 'yesno', options: ['x'], unit: 'y', max: 9 },
    { id: 'b', label: 'Pick', type: 'choice', options: [' One ', '', 'Two '], unit: 'z' },
    { id: 'c', label: 'Steps', type: 'number', unit: ' steps ', max: 4 },
    { id: 'd', label: 'Mood', type: 'scale', max: 7 },
  ] });
  assert.equal(out.title, 'Weekly');
  assert.equal(out.intro, null);
  assert.deepEqual(out.standard, ['weight', 'wins']);
  assert.deepEqual(out.custom, [
    { id: 'a', label: 'Water?', type: 'yesno' },
    { id: 'b', label: 'Pick', type: 'choice', options: ['One', 'Two'] },
    { id: 'c', label: 'Steps', type: 'number', unit: 'steps' },
    { id: 'd', label: 'Mood', type: 'scale', max: 5 },
  ]);
});

await t('new question ids are unused', () => {
  assert.equal(F.newCustomId([]), 'q1');
  assert.equal(F.newCustomId(['q1', 'q2']), 'q3');
  assert.equal(F.newCustomId(['q2']), 'q1');
});

// ── Answers ───────────────────────────────────────────────────────────────────
const QS = F.questionsOf({
  standard: ['weight', 'energy', 'training', 'wins'],
  custom: [q({ id: 'water', type: 'yesno', label: 'Water?' }), q({ id: 'steps', type: 'number', unit: 'steps', label: 'Steps' }), q({ id: 'mood', type: 'scale', max: 10, label: 'Mood' }), q({ id: 'craving', type: 'choice', options: ['None', 'Some'], label: 'Cravings' })],
});

await t('answers: typed text becomes values; unanswered questions are left out', () => {
  const r = F.cleanAnswers(QS, { weight: ' 82,4 kg ', energy: 4, training: 'Most of it', wins: '  PB  ', water: false, steps: '9000', mood: 8, craving: null });
  assert.equal(r.ok, true);
  assert.deepEqual(r.answers, { weight: 82.4, energy: 4, training: 'Most of it', wins: 'PB', water: false, steps: 9000, mood: 8 });
  const only = F.cleanAnswers(QS, { energy: 3, wins: '   ', weight: '' });
  assert.deepEqual(only.answers, { energy: 3 });
});

await t('answers: false and zero-like values still count as answers', () => {
  assert.deepEqual(F.cleanAnswers(QS, { water: false }).answers, { water: false });
  assert.deepEqual(F.cleanAnswers(QS, { steps: 0 }).answers, { steps: 0 });
});

await t('answers: nothing answered is refused', () => {
  for (const d of [{}, { wins: '  ' }, { energy: null, weight: '' }]) {
    const r = F.cleanAnswers(QS, d);
    assert.equal(r.ok, false);
    assert.match(r.message, /at least one/i);
  }
});

await t('answers: each wrong answer is named', () => {
  const r = F.cleanAnswers(QS, { weight: 'heavy', energy: 6, training: 'Maybe', water: 'yes', steps: '9k', mood: 11, wins: 'x'.repeat(1001) });
  assert.equal(r.ok, false);
  assert.deepEqual(Object.keys(r.errors).sort(), ['energy', 'mood', 'steps', 'training', 'water', 'weight', 'wins']);
  assert.match(r.errors.weight, /number/i);
  assert.match(r.errors.energy, /1 to 5/);
  assert.match(r.errors.mood, /1 to 10/);
  assert.match(r.errors.wins, /1000/);
  assert.equal(F.cleanAnswers(QS, { weight: 10 }).errors.weight, 'Enter a number between 20 and 500.');
  assert.equal(F.cleanAnswers(QS, { weight: 501 }).ok, false);
  assert.equal(F.cleanAnswers(QS, { energy: 3.5 }).ok, false);
  assert.equal(F.cleanAnswers(QS, { energy: 0 }).ok, false);
});

await t('numbers: comma decimals, units and junk', () => {
  assert.equal(F.parseNumber('82.4'), 82.4);
  assert.equal(F.parseNumber(' 82,4 '), 82.4);
  assert.equal(F.parseNumber('82 kg'), 82);
  assert.equal(F.parseNumber('-3'), -3);
  for (const bad of ['', 'abc', '1e3', '1.2.3', '0x10', '80..5', '--3', 'NaN']) assert.equal(F.parseNumber(bad), null, bad);
});

await t('showing answers: scales, yes/no, units; uses the questions saved with the check-in', () => {
  const sub = {
    form: { title: 'Old', questions: QS },
    answers: { weight: 82.4, energy: 4, water: true, steps: 9000, mood: 8, wins: 'PB', gone: 'not on the form' },
  };
  const rows = F.answerRows(sub);
  assert.deepEqual(rows.map((r) => [r.id, r.value]), [['weight', '82.4 kg'], ['energy', '4 / 5'], ['wins', 'PB'], ['water', 'Yes'], ['steps', '9000 steps'], ['mood', '8 / 10']]);
  assert.deepEqual(F.answerRows({ form: { title: '', questions: [] }, answers: {} }), []);
  assert.deepEqual(F.answerRows({ form: undefined, answers: undefined }), []);
  assert.equal(F.formatAnswer({ type: 'yesno' }, false), 'No');
});

await t('inbox helpers: unread count and newest first', () => {
  assert.equal(F.unreadCount([{ read_at: null }, { read_at: 'x' }, { read_at: null }]), 2);
  assert.deepEqual(F.newestFirst([{ submitted_at: '2026-10-01' }, { submitted_at: '2026-10-03' }, { submitted_at: '2026-10-02' }]).map((s) => s.submitted_at), ['2026-10-03', '2026-10-02', '2026-10-01']);
});

// ── Invite codes ──────────────────────────────────────────────────────────────
await t('invite codes: typed any way, they normalise to 8 characters', () => {
  assert.equal(F.normalizeCode('abcd-efgh'), 'ABCDEFGH');
  assert.equal(F.normalizeCode(' ab cd\tef gh '), 'ABCDEFGH');
  assert.equal(F.formatCode('abcdefgh'), 'ABCD-EFGH');
  assert.equal(F.formatCode('abc'), 'ABC');
  assert.equal(F.isCompleteCode('abcd-efgh'), true);
  assert.equal(F.isCompleteCode('ABCD-EFG'), false);
  assert.equal(F.isCompleteCode('ABCD-EFG0'), false, '0 is not in the alphabet');
  assert.equal(F.isCompleteCode('ABCD-EFGHJ'), false);
  assert.equal(F.CODE_ALPHABET.length, 32);
  assert.ok(![...'IO01'].some((c) => F.CODE_ALPHABET.includes(c)));
});

await t('invites: waiting, expired, active, ended', () => {
  const now = Date.parse('2026-10-28T12:00:00Z');
  const day = 86_400_000;
  assert.deepEqual(F.inviteState({ status: 'invited', code_expires_at: new Date(now + 6.5 * day).toISOString() }, now), { kind: 'waiting', daysLeft: 7 });
  assert.deepEqual(F.inviteState({ status: 'invited', code_expires_at: new Date(now + 3600_000).toISOString() }, now), { kind: 'waiting', daysLeft: 1 });
  assert.deepEqual(F.inviteState({ status: 'invited', code_expires_at: new Date(now - 1).toISOString() }, now), { kind: 'expired' });
  assert.deepEqual(F.inviteState({ status: 'invited', code_expires_at: null }, now), { kind: 'expired' });
  assert.deepEqual(F.inviteState({ status: 'active', code_expires_at: null }, now), { kind: 'active' });
  assert.deepEqual(F.inviteState({ status: 'ended', code_expires_at: null }, now), { kind: 'ended' });
});

await t('messages: database codes become plain sentences', () => {
  assert.match(F.friendlyError('not_a_trainer'), /Only trainers/);
  assert.match(F.friendlyError('checkin_empty'), /at least one/);
  assert.match(F.friendlyError('checkin_form_invalid: a choice question needs 2 to 8 options'), /^A choice question needs 2 to 8 options\.$/);
  assert.match(F.friendlyError('checkin_invalid: energy is out of range'), /^Energy is out of range\.$/);
  assert.equal(F.friendlyError('something else'), 'something else');
  for (const code of ['invalid_code', 'too_many_attempts', 'own_invite', 'already_linked', 'zzz']) assert.ok(F.redeemMessage(code).length > 10);
});

// ── The app and the database agree ────────────────────────────────────────────
const ROOT = fileURLToPath(new URL('../', import.meta.url)).replace(/\\/g, '/');
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
  console.log('  skip  comparison with the database functions (@electric-sql/pglite is not installed)');
} else {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create schema auth; create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public to anon, authenticated, service_role;
    create table trainer_profiles (id uuid primary key default gen_random_uuid(), user_id uuid not null unique references auth.users(id) on delete cascade, display_name text not null default 'Coach');
    grant select on trainer_profiles to authenticated;
  `);
  await db.exec(readFileSync(ROOT + 'supabase/trainer_tools.sql', 'utf8'));
  await db.exec(readFileSync(ROOT + 'supabase/client_checkins.sql', 'utf8'));
  const U = '00000000-0000-0000-0000-0000000000aa';
  await db.query('insert into auth.users (id) values ($1)', [U]);

  await t('the standard questions in the app are exactly the ones in the database', async () => {
    const cat = (await db.query('select checkin_standard_catalog() as c')).rows[0].c;
    assert.equal(Object.keys(cat).length, F.STANDARD_QUESTIONS.length);
    for (const sq of F.STANDARD_QUESTIONS) {
      const { hint, id, ...rest } = sq;
      assert.deepEqual(cat[id], rest, id);
    }
    const qs = (await db.query(`select checkin_form_questions($1::jsonb, '[]') as q`, [JSON.stringify(F.STANDARD_IDS)])).rows[0].q;
    assert.deepEqual(qs.map((x) => x.id), F.STANDARD_IDS, 'same order');
  });

  const dbAcceptsForm = async (def) => {
    try {
      await db.query('begin');
      await db.query('delete from checkin_forms');
      await db.query(`insert into checkin_forms (trainer_id, title, standard, custom, intro) values ($1, $2, $3::jsonb, $4::jsonb, $5)`, [U, def.title, JSON.stringify(def.standard), JSON.stringify(def.custom), def.intro]);
      await db.query('rollback');
      return true;
    } catch {
      await db.query('rollback');
      return false;
    }
  };

  await t('forms: the app and the database accept and refuse the same forms', async () => {
    const many = (k, mk) => Array.from({ length: k }, (_, i) => mk(i));
    const cases = [
      form(),
      F.DEFAULT_FORM,
      form({ standard: [] }),
      form({ standard: [], custom: [q()] }),
      form({ title: '' }),
      form({ title: 'x'.repeat(60) }),
      form({ title: 'x'.repeat(61) }),
      form({ intro: 'x'.repeat(300) }),
      form({ intro: 'x'.repeat(301) }),
      form({ standard: ['nope'] }),
      form({ standard: ['weight', 'weight'] }),
      form({ custom: many(10, (i) => q({ id: `q${i}` })) }),
      form({ custom: many(11, (i) => q({ id: `q${i}` })) }),
      form({ custom: [q(), q()] }),
      form({ custom: [q({ id: 'weight' })] }),
      form({ custom: [q({ id: 'Bad' })] }),
      form({ custom: [q({ id: '1abc' })] }),
      form({ custom: [q({ id: 'a'.repeat(20) })] }),
      form({ custom: [q({ id: 'a'.repeat(21) })] }),
      form({ custom: [q({ label: 'x'.repeat(120) })] }),
      form({ custom: [q({ label: 'x'.repeat(121) })] }),
      form({ custom: [q({ label: '🏋️'.repeat(60) })] }),
      form({ custom: [q({ label: '🏋️'.repeat(61) })] }),
      form({ custom: [q({ label: '  ' })] }),
      form({ custom: [q({ type: 'file' })] }),
      form({ custom: [q({ type: 'yesno' })] }),
      form({ custom: [q({ type: 'number' })] }),
      form({ custom: [q({ type: 'number', unit: 'x'.repeat(12) })] }),
      form({ custom: [q({ type: 'number', unit: 'x'.repeat(13) })] }),
      form({ custom: [q({ type: 'scale', max: 5 })] }),
      form({ custom: [q({ type: 'scale', max: 10 })] }),
      form({ custom: [q({ type: 'scale', max: 7 })] }),
      form({ custom: [q({ type: 'scale' })] }),
      form({ custom: [q({ type: 'choice', options: ['a', 'b'] })] }),
      form({ custom: [q({ type: 'choice', options: ['a'] })] }),
      form({ custom: [q({ type: 'choice', options: 'abcdefgh'.split('') })] }),
      form({ custom: [q({ type: 'choice', options: 'abcdefghi'.split('') })] }),
      form({ custom: [q({ type: 'choice', options: ['a', 'a'] })] }),
      form({ custom: [q({ type: 'choice', options: ['a', 'x'.repeat(40)] })] }),
      form({ custom: [q({ type: 'choice', options: ['a', 'x'.repeat(41)] })] }),
      form({ custom: [q({ type: 'choice' })] }),
    ];
    for (const raw of cases) {
      const def = F.normalizeForm(raw);
      const app = F.validateForm(raw).length === 0;
      // an empty or blank title is stored as given by the database check, so compare on what would be saved
      const db_ = await dbAcceptsForm(def);
      assert.equal(app, db_, `app ${app ? 'accepts' : 'refuses'} but the database ${db_ ? 'accepts' : 'refuses'}: ${JSON.stringify(raw).slice(0, 160)}`);
    }
  });

  const dbClean = async (questions, answers) => {
    try {
      return { ok: true, answers: (await db.query(`select checkin_answers_clean($1::jsonb, $2::jsonb) as a`, [JSON.stringify(questions), JSON.stringify(answers)])).rows[0].a };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  };

  await t('answers: the app and the database accept and refuse the same answers, and clean them the same way', async () => {
    const cases = [
      { weight: 82.4 },
      { weight: 20 },
      { weight: 19.9 },
      { weight: 500 },
      { weight: 500.1 },
      { weight: 82.456 },
      { energy: 1 },
      { energy: 5 },
      { energy: 0 },
      { energy: 6 },
      { energy: 3.5 },
      { training: 'Most of it' },
      { training: 'Maybe' },
      { wins: 'PB' },
      { wins: '  PB  ' },
      { wins: '   ' },
      { wins: 'x'.repeat(1000) },
      { wins: 'x'.repeat(1001) },
      { water: true },
      { water: false },
      { steps: 0 },
      { steps: 9000 },
      { mood: 10 },
      { mood: 11 },
      { craving: 'Some' },
      { craving: 'Lots' },
      { weight: 80, energy: 4, training: 'All of it', wins: 'ok', water: true, steps: 5, mood: 3, craving: 'None' },
      { weight: 80, energy: 9 },
      {},
      { energy: null },
      { weight: 'heavy' },
      { energy: '4' },
      { water: 'yes' },
      { wins: 5 },
      { hacked: 1 },
      { stress: 3 },
    ];
    for (const raw of cases) {
      const app = F.cleanAnswers(QS, raw);
      const dbr = await dbClean(QS, raw);
      assert.equal(app.ok, dbr.ok, `app ${app.ok ? 'accepts' : 'refuses'} but the database ${dbr.ok ? 'accepts' : 'refuses'}: ${JSON.stringify(raw).slice(0, 120)}${dbr.error ? ' (' + dbr.error + ')' : ''}`);
      if (app.ok) {
        // the database keeps numbers as sent (no rounding), so compare through the app's own rounded numbers
        const sent = await dbClean(QS, app.answers);
        assert.equal(sent.ok, true);
        assert.deepEqual(sent.answers, app.answers);
      }
    }
  });
}

console.log(`\n${n} checks passed${process.exitCode ? ' (some FAILED)' : ''}`);
