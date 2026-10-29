// Checks supabase/friends_feed.sql in an in-process Postgres (PGlite): who can be found, how friend requests work, what friends can and cannot see, blocking,
// cheers, the automatic updates, limits, and what leaving Friends removes.
//   node supabase/tests/friends-feed.test.mjs      (needs: npm install --no-save @electric-sql/pglite, or PGLITE_DIR)
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
  -- the existing tables this feature reads (same columns that matter)
  create table profiles (id uuid primary key references auth.users(id) on delete cascade, display_name text);
  create table workout_logs (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, logged_date date not null default current_date, unique (user_id, logged_date));
  create table user_streaks (user_id uuid primary key, current_streak int not null default 0);
  create table exercises (id uuid primary key default gen_random_uuid(), name text not null, created_by uuid references auth.users(id) on delete cascade);
  create table exercise_set_logs (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, exercise_id uuid not null references exercises(id) on delete cascade,
    logged_date date not null default current_date, weight numeric not null, weight_unit text not null default 'kg', reps int not null, created_at timestamptz not null default now());
  create table blocked_users (id uuid primary key default gen_random_uuid(), blocker_user_id uuid not null references auth.users(id) on delete cascade, blocked_user_id uuid not null references auth.users(id) on delete cascade,
    created_at timestamptz not null default now(), unique (blocker_user_id, blocked_user_id), check (blocker_user_id <> blocked_user_id));
  grant select, insert, delete on blocked_users to authenticated;
  grant insert on workout_logs to authenticated;
`);
const sql = readFileSync(ROOT + 'supabase/friends_feed.sql', 'utf8');
await db.exec(sql);
await db.exec(sql); // repeatable

const ID = (i) => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`;
const [A, B, C, D, E] = [ID(1), ID(2), ID(3), ID(4), ID(5)];
const names = { [A]: 'Ann Lifter', [B]: 'Bo Runner', [C]: 'Cy Quiet', [D]: 'Di Blocked', [E]: '' };
for (const id of [A, B, C, D, E]) {
  await db.query('insert into auth.users (id) values ($1)', [id]);
  await db.query('insert into profiles (id, display_name) values ($1, $2)', [id, names[id]]);
}
const BENCH = (await db.query(`insert into exercises (name) values ('Bench Press') returning id`)).rows[0].id;
const CUSTOM = (await db.query(`insert into exercises (name, created_by) values ('Sam''s secret move', $1) returning id`, [A])).rows[0].id;

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
const root = async (sql, params = []) => (params.length ? (await db.query(sql, params)).rows : ((await db.exec(sql)).at(-1)?.rows ?? []));
const call = async (uid, fn, args = []) => (await me(uid, `select ${fn}(${args.map((_, i) => '$' + (i + 1)).join(', ')}) as r`, args))[0].r;
const rows = (uid, fn, args = []) => me(uid, `select * from ${fn}(${args.map((_, i) => '$' + (i + 1)).join(', ')})`, args);
const settings = (uid, over = {}) =>
  me(uid, `insert into friend_settings (enabled, share_workouts, share_records, share_streaks) values ($1, $2, $3, $4)
           on conflict (user_id) do update set enabled = excluded.enabled, share_workouts = excluded.share_workouts, share_records = excluded.share_records, share_streaks = excluded.share_streaks`,
    [over.enabled ?? true, over.workouts ?? false, over.records ?? false, over.streaks ?? false]);
const logWorkout = async (uid, date = null) => root(`insert into workout_logs (user_id, logged_date) values ($1, coalesce($2::date, current_date)) on conflict do nothing`, [uid, date]);
const logSet = (uid, exercise, weight, unit, reps) => root(`insert into exercise_set_logs (user_id, exercise_id, weight, weight_unit, reps) values ($1, $2, $3, $4, $5)`, [uid, exercise, weight, unit, reps]);

const incomingId = (r) => r.find((x) => x.direction === 'incoming').id;

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

// ── Opt-in ────────────────────────────────────────────────────────────────────
await t('nobody is in Friends, and nobody can be found, until they switch it on', async () => {
  assert.equal((await root('select count(*)::int as c from friend_settings'))[0].c, 0);
  await assert.rejects(() => rows(A, 'friend_search', ['bo']), /friends_not_enabled/);
  await assert.rejects(() => call(A, 'friend_request', [B]), /friends_not_enabled/);
  await assert.rejects(() => rows(A, 'friend_feed'), /friends_not_enabled/);
  await settings(A, { enabled: true });
  const s = (await me(A, 'select * from friend_settings'))[0];
  assert.deepEqual([s.enabled, s.share_workouts, s.share_records, s.share_streaks], [true, false, false, false], 'every kind of update starts off');
});

await t('your switches are yours alone, and Friends off turns every kind of update off with it', async () => {
  assert.equal((await me(B, 'select * from friend_settings')).length, 0);
  assert.equal((await me(B, `update friend_settings set enabled = false where user_id = $1 returning 1`, [A])).length, 0);
  await assert.rejects(() => me(B, `insert into friend_settings (user_id, enabled) values ($1, true)`, [A]), /row-level security/);
  await assert.rejects(() => as('anon', null, 'select * from friend_settings'), /permission denied/);
  await settings(C, { enabled: true, workouts: true, records: true, streaks: true });
  await me(C, `update friend_settings set enabled = false`);
  const s = (await me(C, 'select * from friend_settings'))[0];
  assert.deepEqual([s.enabled, s.share_workouts, s.share_records, s.share_streaks], [false, false, false, false]);
  for (const table of ['friendships', 'feed_events', 'feed_cheers']) await assert.rejects(() => me(A, `select * from ${table}`), /permission denied/);
});

// ── Finding people ────────────────────────────────────────────────────────────
await t('search finds only people who switched Friends on, by name, never yourself, with wildcards taken literally', async () => {
  await settings(B, { enabled: true });
  await settings(D, { enabled: true });
  await settings(E, { enabled: true });
  const r = await rows(A, 'friend_search', ['bo']);
  assert.deepEqual(r.map((x) => x.display_name), ['Bo Runner']);
  assert.equal(r[0].user_id, B);
  assert.equal((await rows(A, 'friend_search', ['cy'])).length, 0, 'Cy has Friends off');
  assert.equal((await rows(A, 'friend_search', ['ann'])).length, 0, 'not yourself');
  assert.deepEqual((await rows(A, 'friend_search', ['RUNNER'])).map((x) => x.display_name), ['Bo Runner'], 'any case');
  assert.equal((await rows(A, 'friend_search', ['%'])).length, 0);
  assert.equal((await rows(A, 'friend_search', ['_o'])).length, 0, 'an underscore is not a wildcard');
  assert.equal((await rows(A, 'friend_search', ['b'])).length, 0, 'one letter is too short');
  assert.equal((await rows(A, 'friend_search', ['x'.repeat(41)])).length, 0);
  assert.deepEqual((await rows(A, 'friend_search', ['fitness'])).map((x) => x.display_name), ['Fitness Fan'], 'someone with no name set shows as Fitness Fan');
  await assert.rejects(() => as('anon', null, `select * from friend_search('bo')`), /permission denied/);
});

// ── Requests ──────────────────────────────────────────────────────────────────
await t('a request must be accepted; until then there are no friends and nothing is shared', async () => {
  assert.equal(await call(A, 'friend_request', [B]), 'sent');
  assert.equal(await call(A, 'friend_request', [B]), 'sent', 'asking again changes nothing');
  assert.equal((await rows(A, 'friend_list')).length, 0);
  assert.equal((await rows(B, 'friend_list')).length, 0);
  const incoming = await rows(B, 'friend_requests');
  assert.equal(incoming.length, 1);
  assert.deepEqual([incoming[0].direction, incoming[0].user_id, incoming[0].display_name], ['incoming', A, 'Ann Lifter']);
  const outgoing = await rows(A, 'friend_requests');
  assert.deepEqual([outgoing[0].direction, outgoing[0].user_id], ['outgoing', B]);
  assert.equal((await rows(A, 'friend_search', ['bo'])).length, 0, 'a person you have asked no longer shows up in search');
  assert.equal((await rows(B, 'friend_search', ['ann'])).length, 0);
});

await t('only the person asked can answer, and only once', async () => {
  const id = incomingId(await rows(B, 'friend_requests'));
  await assert.rejects(() => call(A, 'friend_respond', [id, true]), /request_not_found/);
  await assert.rejects(() => call(C, 'friend_respond', [id, true]), /request_not_found/);
  await call(B, 'friend_respond', [id, true]);
  await assert.rejects(() => call(B, 'friend_respond', [id, false]), /request_not_found/);
  assert.deepEqual((await rows(A, 'friend_list')).map((x) => [x.friend_id, x.display_name]), [[B, 'Bo Runner']]);
  assert.deepEqual((await rows(B, 'friend_list')).map((x) => [x.friend_id, x.display_name]), [[A, 'Ann Lifter']]);
  assert.equal((await rows(A, 'friend_requests')).length, 0);
  await assert.rejects(() => call(A, 'friend_request', [B]), /already_friends/);
});

await t('declining shows the other person nothing but "waiting", and they cannot ask again', async () => {
  assert.equal(await call(D, 'friend_request', [A]), 'sent');
  await settings(A, { enabled: true, workouts: true, records: true, streaks: true });
  await call(A, 'friend_respond', [incomingId(await rows(A, 'friend_requests')), false]);
  const asDi = await rows(D, 'friend_requests');
  assert.deepEqual([asDi[0].direction, asDi[0].user_id], ['outgoing', A], 'still reads as waiting');
  assert.equal(await call(D, 'friend_request', [A]), 'sent', 'asking again does nothing and does not tell them');
  assert.equal((await rows(A, 'friend_requests')).length, 0, 'Ann sees nothing new');
  assert.equal((await rows(A, 'friend_list')).filter((x) => x.friend_id === D).length, 0);
});

await t('if you asked someone and they ask you, you become friends; after a decline, the decliner can ask instead', async () => {
  assert.equal(await call(A, 'friend_request', [D]), 'sent', 'Ann declined Di, now Ann asks Di');
  const di = await rows(D, 'friend_requests');
  assert.deepEqual([di[0].direction, di[0].user_id], ['incoming', A]);
  assert.equal(await call(D, 'friend_request', [A]), 'accepted', 'Di asking back accepts it');
  assert.equal((await rows(A, 'friend_list')).length, 2);
  await call(A, 'friend_remove', [D]);
  assert.equal((await rows(A, 'friend_list')).length, 1);
  assert.equal((await rows(D, 'friend_list')).length, 0);
});

await t('requests cannot reach yourself, someone who is not in Friends, or an unknown person, and the answer does not say which', async () => {
  for (const target of [A, C, ID(999), null]) {
    await assert.rejects(() => call(A, 'friend_request', [target]), /friend_unavailable/);
  }
  await assert.rejects(() => as('anon', null, `select friend_request($1)`, [B]), /permission denied/);
});

// ── Blocking ──────────────────────────────────────────────────────────────────
await t('blocking someone ends the friendship and hides both people from each other; they cannot ask again', async () => {
  await call(E, 'friend_request', [A]);
  await call(A, 'friend_respond', [incomingId(await rows(A, 'friend_requests')), true]);
  assert.equal((await rows(A, 'friend_list')).length, 2);
  await me(A, `insert into blocked_users (blocker_user_id, blocked_user_id) values ($1, $2)`, [A, E]);
  assert.equal((await rows(A, 'friend_list')).filter((x) => x.friend_id === E).length, 0);
  assert.equal((await rows(E, 'friend_list')).length, 0);
  assert.equal((await root(`select count(*)::int as c from friendships where requester_id = $1 or addressee_id = $1`, [E]))[0].c, 0, 'the friendship row is gone');
  assert.equal((await rows(E, 'friend_search', ['ann'])).length, 0);
  assert.equal((await rows(A, 'friend_search', ['fitness'])).length, 0);
  await assert.rejects(() => call(E, 'friend_request', [A]), /friend_unavailable/);
  await assert.rejects(() => call(A, 'friend_request', [E]), /friend_unavailable/);
  await me(A, `delete from blocked_users where blocker_user_id = $1`, [A]);
});

await t('a request that arrives after a block is dropped when answered', async () => {
  await call(E, 'friend_request', [A]);
  const id = incomingId(await rows(A, 'friend_requests'));
  await root(`insert into blocked_users (blocker_user_id, blocked_user_id) values ($1, $2)`, [A, E]);
  assert.equal((await rows(A, 'friend_requests')).length, 0, 'not shown');
  await assert.rejects(() => call(A, 'friend_respond', [id, true]), /request_not_found/);
  await root(`delete from blocked_users`);
  await root(`delete from friendships where requester_id = $1 or addressee_id = $1`, [E]);
});

// ── Automatic updates ─────────────────────────────────────────────────────────
const kinds = async (uid) => (await rows(uid, 'friend_feed')).map((x) => x.kind).sort();

await t('a workout makes an update only if Friends and the workout switch are on', async () => {
  await root(`delete from feed_events`);
  await logWorkout(B); // Bo: Friends on, workouts off
  assert.equal((await root('select count(*)::int as c from feed_events'))[0].c, 0);
  await logWorkout(C); // Cy: Friends off
  assert.equal((await root('select count(*)::int as c from feed_events'))[0].c, 0);
  await root(`delete from workout_logs`);
  await logWorkout(A);
  const ev = await root(`select kind, payload from feed_events`);
  assert.deepEqual(ev.map((x) => x.kind), ['workout']);
  assert.ok(ev[0].payload.date);
  assert.deepEqual(Object.keys(ev[0].payload), ['date'], 'nothing else about the workout is shared');
});

await t('a workout is shared once a day, and logging can never be stopped by this feature', async () => {
  await logWorkout(A);
  await root(`delete from workout_logs where user_id = $1`, [A]);
  await logWorkout(A);
  assert.equal((await root(`select count(*)::int as c from feed_events where kind = 'workout'`))[0].c, 1);
  await root(`alter table feed_events rename to feed_events_hidden`);
  try {
    await root(`delete from workout_logs where user_id = $1`, [A]);
    await logWorkout(A); // the update cannot be written, the workout still is
    assert.equal((await root(`select count(*)::int as c from workout_logs where user_id = $1`, [A]))[0].c, 1);
  } finally {
    await root(`alter table feed_events_hidden rename to feed_events`);
  }
});

await t('a streak update appears only at milestones, only with the streak switch on', async () => {
  await root(`delete from feed_events; delete from workout_logs;`);
  for (const [streak, expected] of [[1, 0], [2, 0], [3, 1], [6, 0], [7, 1], [13, 0], [14, 1], [100, 1], [365, 1], [366, 0], [400, 1], [450, 0]]) {
    await root(`delete from feed_events; delete from workout_logs;`);
    await root(`insert into user_streaks (user_id, current_streak) values ($1, $2) on conflict (user_id) do update set current_streak = excluded.current_streak`, [A, streak]);
    await logWorkout(A);
    assert.equal((await root(`select count(*)::int as c from feed_events where kind = 'streak'`))[0].c, expected, `streak ${streak}`);
  }
  const p = (await root(`select payload from feed_events where kind = 'streak'`))[0];
  assert.equal(p, undefined, 'last case (450) had none');
  await root(`delete from feed_events; delete from workout_logs;`);
  await settings(A, { enabled: true, workouts: true, records: true, streaks: false });
  await root(`update user_streaks set current_streak = 7 where user_id = $1`, [A]);
  await logWorkout(A);
  assert.equal((await root(`select count(*)::int as c from feed_events where kind = 'streak'`))[0].c, 0, 'streak switch off');
  await settings(A, { enabled: true, workouts: true, records: true, streaks: true });
  await root(`delete from feed_events; delete from workout_logs;`);
  await logWorkout(A);
  assert.deepEqual((await root(`select payload from feed_events where kind = 'streak'`))[0].payload, { days: 7 });
});

// ── Records ───────────────────────────────────────────────────────────────────
await t('a record is shared only if it is real: switch on, library exercise, a matching set logged, sane numbers', async () => {
  await root(`delete from feed_events`);
  await logSet(A, BENCH, 65, 'kg', 5);
  const id = await call(A, 'post_record_event', [BENCH, 65, 'kg', 5, ['weight', 'e1rm']]);
  assert.ok(id);
  const p = (await root(`select payload from feed_events where id = $1`, [id]))[0].payload;
  assert.deepEqual(p, { exercise_id: BENCH, exercise: 'Bench Press', weight: 65, unit: 'kg', reps: 5, kinds: ['weight', 'e1rm'] });
  assert.equal(await call(A, 'post_record_event', [BENCH, 65, 'kg', 5, ['weight', 'e1rm']]), id, 'the same record is not shared twice');
  const bad = (label, args, re = /record_invalid/) => assert.rejects(() => call(A, 'post_record_event', args), re, label);
  await bad('no such set was logged', [BENCH, 80, 'kg', 5, ['weight']]);
  await bad('wrong unit', [BENCH, 65, 'lb', 5, ['weight']]);
  await bad('wrong reps', [BENCH, 65, 'kg', 6, ['weight']]);
  await bad('unknown kind', [BENCH, 65, 'kg', 5, ['weight', 'hax']]);
  await bad('no kinds', [BENCH, 65, 'kg', 5, []]);
  await bad('bad unit', [BENCH, 65, 'stone', 5, ['weight']]);
  await bad('reps out of range', [BENCH, 65, 'kg', 0, ['weight']]);
  await bad('weight out of range', [BENCH, 5000, 'kg', 5, ['weight']]);
  await bad('not a real exercise', [ID(777), 65, 'kg', 5, ['weight']]);
  await logSet(A, CUSTOM, 50, 'kg', 5);
  await bad('a custom exercise (its name is written by the person)', [CUSTOM, 50, 'kg', 5, ['weight']]);
  await root(`update exercise_set_logs set created_at = now() - interval '3 days' where weight = 65`);
  await bad('the set is too old', [BENCH, 65, 'kg', 5, ['weight']]);
  await assert.rejects(() => call(B, 'post_record_event', [BENCH, 65, 'kg', 5, ['weight']]), /sharing_off/);
  await assert.rejects(() => call(C, 'post_record_event', [BENCH, 65, 'kg', 5, ['weight']]), /sharing_off/);
  await settings(A, { enabled: true, workouts: true, records: false, streaks: true });
  await assert.rejects(() => call(A, 'post_record_event', [BENCH, 65, 'kg', 5, ['weight']]), /sharing_off/);
  await settings(A, { enabled: true, workouts: true, records: true, streaks: true });
  await assert.rejects(() => as('anon', null, `select post_record_event($1, 65, 'kg', 5, array['weight'])`, [BENCH]), /permission denied/);
});

// ── Reading the feed ──────────────────────────────────────────────────────────
// Ann is friends with Bo (and not with anyone else at this point).
await t('friends see exactly the kinds of update the person switched on; others see nothing', async () => {
  await root(`delete from feed_events; delete from workout_logs; delete from exercise_set_logs;`);
  await root(`insert into user_streaks (user_id, current_streak) values ($1, 7) on conflict (user_id) do update set current_streak = 7`, [A]);
  await settings(B, { enabled: true });
  await settings(A, { enabled: true, workouts: true, records: true, streaks: true });
  await logWorkout(A);
  await logSet(A, BENCH, 70, 'kg', 5);
  await call(A, 'post_record_event', [BENCH, 70, 'kg', 5, ['weight']]);
  assert.deepEqual(await kinds(B), ['record', 'streak', 'workout']);
  assert.deepEqual(await kinds(A), ['record', 'streak', 'workout'], 'you see your own');
  assert.deepEqual(await kinds(D), [], 'not a friend');
  const feed = await rows(B, 'friend_feed');
  assert.ok(feed.every((x) => x.user_id === A && x.display_name === 'Ann Lifter'));
  assert.equal(feed.find((x) => x.kind === 'record').is_mine, false);
  assert.equal((await rows(A, 'friend_feed')).find((x) => x.kind === 'record').is_mine, true);
  // switching one kind off hides that kind from friends straight away, including old ones
  await settings(A, { enabled: true, workouts: false, records: true, streaks: true });
  assert.deepEqual(await kinds(B), ['record', 'streak']);
  await settings(A, { enabled: true, workouts: true, records: false, streaks: false });
  assert.deepEqual(await kinds(B), ['workout']);
  // Friends off for the author, or for the reader, hides everything
  await settings(A, { enabled: false });
  assert.deepEqual(await kinds(B), []);
  await settings(A, { enabled: true, workouts: true, records: true, streaks: true });
  await settings(B, { enabled: false });
  await assert.rejects(() => rows(B, 'friend_feed'), /friends_not_enabled/);
  await settings(B, { enabled: true });
  assert.deepEqual(await kinds(B), ['record', 'streak', 'workout']);
});

await t('the feed is newest first, can be paged, and old updates disappear', async () => {
  await root(`delete from feed_events`);
  for (let i = 0; i < 5; i++) await root(`insert into feed_events (user_id, kind, payload, created_at) values ($1, 'record', '{}', now() - ($2 || ' hours')::interval)`, [A, String(i)]);
  const all = await rows(B, 'friend_feed', [3]);
  assert.equal(all.length, 3);
  assert.ok(all[0].created_at > all[1].created_at && all[1].created_at > all[2].created_at);
  const next = await rows(B, 'friend_feed', [3, all[2].created_at]);
  assert.equal(next.length, 2);
  assert.equal((await rows(B, 'friend_feed', [500])).length, 5);
  assert.equal((await rows(B, 'friend_feed', [0])).length, 1, 'a limit below 1 is raised to 1');
  await root(`insert into feed_events (user_id, kind, payload, created_at) values ($1, 'record', '{}', now() - interval '61 days')`, [A]);
  assert.equal((await rows(B, 'friend_feed', [50])).length, 5);
  assert.equal((await root(`select count(*)::int as c from feed_events where created_at < now() - interval '60 days'`))[0].c, 0, 'old ones are deleted');
});

await t('blocking hides the updates both ways', async () => {
  assert.ok((await rows(B, 'friend_feed')).length > 0);
  await me(B, `insert into blocked_users (blocker_user_id, blocked_user_id) values ($1, $2)`, [B, A]);
  assert.equal((await rows(B, 'friend_feed')).filter((x) => x.user_id === A).length, 0);
  assert.equal((await rows(A, 'friend_feed')).filter((x) => x.user_id === B).length, 0);
  await me(B, `delete from blocked_users`);
  await call(A, 'friend_request', [B]);
  await call(B, 'friend_respond', [incomingId(await rows(B, 'friend_requests')), true]);
});

// ── Cheers ────────────────────────────────────────────────────────────────────
await t('friends can cheer an update; one cheer each; the same one again takes it back; a different one changes it', async () => {
  await root(`delete from feed_events`);
  const ev = (await root(`insert into feed_events (user_id, kind, payload) values ($1, 'record', '{}') returning id`, [A]))[0].id;
  assert.equal(await call(B, 'cheer_event', [ev, '💪']), '💪');
  let item = (await rows(A, 'friend_feed'))[0];
  assert.deepEqual(item.cheers, { '💪': 1 });
  assert.equal(item.my_cheer, null);
  item = (await rows(B, 'friend_feed'))[0];
  assert.equal(item.my_cheer, '💪');
  assert.equal(await call(B, 'cheer_event', [ev, '🔥']), '🔥', 'changed');
  assert.deepEqual((await rows(A, 'friend_feed'))[0].cheers, { '🔥': 1 });
  assert.equal(await call(B, 'cheer_event', [ev, '🔥']), '', 'taken back');
  assert.deepEqual((await rows(A, 'friend_feed'))[0].cheers, {});
  assert.equal((await root('select count(*)::int as c from feed_cheers'))[0].c, 0);
});

await t('cheers are refused for yourself, strangers, blocked people, switched-off updates, made-up emoji, and unknown updates', async () => {
  const ev = (await root(`insert into feed_events (user_id, kind, payload) values ($1, 'workout', '{}') returning id`, [A]))[0].id;
  await assert.rejects(() => call(A, 'cheer_event', [ev, '💪']), /event_not_found/);
  await assert.rejects(() => call(D, 'cheer_event', [ev, '💪']), /event_not_found/);
  await assert.rejects(() => call(B, 'cheer_event', [ev, '😈']), /cheer_invalid/);
  await assert.rejects(() => call(B, 'cheer_event', [ev, 'x']), /cheer_invalid/);
  await assert.rejects(() => call(B, 'cheer_event', [ID(555), '💪']), /event_not_found/);
  await settings(A, { enabled: true, workouts: false, records: true, streaks: true });
  await assert.rejects(() => call(B, 'cheer_event', [ev, '💪']), /event_not_found/);
  await settings(A, { enabled: true, workouts: true, records: true, streaks: true });
  await root(`insert into blocked_users (blocker_user_id, blocked_user_id) values ($1, $2)`, [A, B]);
  await assert.rejects(() => call(B, 'cheer_event', [ev, '💪']), /event_not_found/);
  await root(`delete from blocked_users`);
  await call(A, 'friend_request', [B]).catch(() => {});
  await assert.rejects(() => as('anon', null, `select cheer_event($1, '💪')`, [ev]), /permission denied/);
});

await t('blocking removes the cheers the two people gave each other', async () => {
  await root(`delete from feed_events; delete from friendships;`);
  await root(`insert into friendships (requester_id, addressee_id, status) values ($1, $2, 'accepted')`, [A, B]);
  await settings(B, { enabled: true, workouts: true });
  const ea = (await root(`insert into feed_events (user_id, kind, payload) values ($1, 'workout', '{}') returning id`, [A]))[0].id;
  const eb = (await root(`insert into feed_events (user_id, kind, payload) values ($1, 'workout', '{}') returning id`, [B]))[0].id;
  await call(B, 'cheer_event', [ea, '💪']);
  await call(A, 'cheer_event', [eb, '🔥']);
  assert.equal((await root('select count(*)::int as c from feed_cheers'))[0].c, 2);
  await me(A, `insert into blocked_users (blocker_user_id, blocked_user_id) values ($1, $2)`, [A, B]);
  assert.equal((await root('select count(*)::int as c from feed_cheers'))[0].c, 0);
  await root(`delete from blocked_users`);
  await root(`insert into friendships (requester_id, addressee_id, status) values ($1, $2, 'accepted')`, [A, B]);
});

// ── Control over what you shared ──────────────────────────────────────────────
await t('you can see everything you shared and delete any of it, and only your own', async () => {
  await root(`delete from feed_events`);
  const mine = (await root(`insert into feed_events (user_id, kind, payload) values ($1, 'record', '{"x":1}') returning id`, [A]))[0].id;
  const theirs = (await root(`insert into feed_events (user_id, kind, payload) values ($1, 'workout', '{}') returning id`, [B]))[0].id;
  await call(B, 'cheer_event', [mine, '👏']);
  const list = await rows(A, 'my_shared_events');
  assert.deepEqual(list.map((x) => [x.id, x.cheer_count]), [[mine, 1]]);
  await assert.rejects(() => call(A, 'delete_feed_event', [theirs]), /event_not_found/);
  await assert.rejects(() => call(C, 'delete_feed_event', [mine]), /event_not_found/);
  await call(A, 'delete_feed_event', [mine]);
  assert.equal((await rows(A, 'my_shared_events')).length, 0);
  assert.equal((await root('select count(*)::int as c from feed_cheers'))[0].c, 0, 'its cheers went with it');
  assert.equal((await rows(B, 'my_shared_events')).length, 1);
});

await t('leaving Friends switches everything off and deletes your friendships, updates and cheers (and only yours)', async () => {
  await root(`delete from feed_events; delete from friendships;`);
  await root(`insert into friendships (requester_id, addressee_id, status) values ($1, $2, 'accepted'), ($3, $1, 'pending')`, [A, B, D]);
  const ea = (await root(`insert into feed_events (user_id, kind, payload) values ($1, 'workout', '{}') returning id`, [A]))[0].id;
  const eb = (await root(`insert into feed_events (user_id, kind, payload) values ($1, 'workout', '{}') returning id`, [B]))[0].id;
  await root(`insert into feed_cheers (event_id, user_id, emoji) values ($1, $2, '💪'), ($3, $4, '🔥')`, [ea, B, eb, A]);
  await me(A, 'select friends_leave()');
  const s = (await me(A, 'select * from friend_settings'))[0];
  assert.deepEqual([s.enabled, s.share_workouts, s.share_records, s.share_streaks], [false, false, false, false]);
  assert.equal((await root(`select count(*)::int as c from friendships where requester_id = $1 or addressee_id = $1`, [A]))[0].c, 0);
  assert.equal((await root(`select count(*)::int as c from feed_events where user_id = $1`, [A]))[0].c, 0);
  assert.equal((await root(`select count(*)::int as c from feed_cheers where user_id = $1`, [A]))[0].c, 0);
  assert.equal((await root(`select count(*)::int as c from feed_events where user_id = $1`, [B]))[0].c, 1, 'Bo kept their own update');
  assert.equal((await root(`select count(*)::int as c from feed_cheers`))[0].c, 0, 'the cheer Bo gave Ann went with Ann\'s update');
  await assert.rejects(() => rows(A, 'friend_list').then((r) => assert.equal(r.length, 0)), /x/).catch(() => {});
  await settings(A, { enabled: true, workouts: true, records: true, streaks: true });
});

// ── Limits ────────────────────────────────────────────────────────────────────
await t('limits: friends, waiting requests, requests a day, cheers a day, records a day', async () => {
  await root(`delete from feed_events; delete from friendships;`);
  // 200 friends is the most
  const many = [];
  for (let i = 0; i < 200; i++) {
    const u = ID(1000 + i);
    many.push(u);
    await root(`insert into auth.users (id) values ($1)`, [u]);
  }
  for (const u of many) await root(`insert into friendships (requester_id, addressee_id, status) values ($1, $2, 'accepted')`, [A, u]);
  await assert.rejects(() => call(A, 'friend_request', [B]), /friend_limit/);
  await root(`delete from friendships`);
  await root(`delete from auth.users where id = any($1::uuid[])`, [many]);

  // 20 requests in a day
  const targets = [];
  for (let i = 0; i < 21; i++) {
    const u = ID(2000 + i);
    targets.push(u);
    await root(`insert into auth.users (id) values ($1)`, [u]);
    await root(`insert into profiles (id, display_name) values ($1, 'T')`, [u]);
    await root(`insert into friend_settings (user_id, enabled) values ($1, true)`, [u]);
  }
  for (let i = 0; i < 20; i++) await call(A, 'friend_request', [targets[i]]);
  await assert.rejects(() => call(A, 'friend_request', [targets[20]]), /request_limit/);
  await root(`delete from friendships`);

  // 50 waiting requests (older than a day, so the daily limit does not apply)
  const waiting = [];
  for (let i = 0; i < 50; i++) {
    const u = ID(3000 + i);
    waiting.push(u);
    await root(`insert into auth.users (id) values ($1)`, [u]);
    await root(`insert into friendships (requester_id, addressee_id, status, created_at) values ($1, $2, 'pending', now() - interval '2 days')`, [A, u]);
  }
  await assert.rejects(() => call(A, 'friend_request', [targets[20]]), /request_limit/);
  await root(`delete from friendships`);
  await root(`delete from auth.users where id = any($1::uuid[])`, [waiting]);

  // 200 cheers a day, 30 records a day
  await root(`insert into friendships (requester_id, addressee_id, status) values ($1, $2, 'accepted')`, [A, B]);
  const evs = [];
  for (let i = 0; i < 201; i++) evs.push((await root(`insert into feed_events (user_id, kind, payload, created_at) values ($1, 'record', $2::jsonb, now() - ($3 || ' seconds')::interval) returning id`, [A, JSON.stringify({ i }), String(i)]))[0].id);
  for (let i = 0; i < 200; i++) await call(B, 'cheer_event', [evs[i], '💪']);
  await assert.rejects(() => call(B, 'cheer_event', [evs[200], '💪']), /cheer_limit/);
  await root(`delete from feed_cheers; delete from feed_events;`);
  await logSet(A, BENCH, 10, 'kg', 1);
  for (let i = 0; i < 30; i++) await root(`insert into feed_events (user_id, kind, payload) values ($1, 'record', $2::jsonb)`, [A, JSON.stringify({ n: i })]);
  await assert.rejects(() => call(A, 'post_record_event', [BENCH, 10, 'kg', 1, ['weight']]), /record_limit/);
  await root(`delete from feed_events`);
  await root(`delete from auth.users where id = any($1::uuid[])`, [targets]);
});

// ── Accounts ──────────────────────────────────────────────────────────────────
await t('deleting an account deletes their settings, friendships, updates and cheers', async () => {
  await root(`delete from friendships; delete from feed_events;`);
  await root(`insert into friendships (requester_id, addressee_id, status) values ($1, $2, 'accepted')`, [A, B]);
  const ea = (await root(`insert into feed_events (user_id, kind, payload) values ($1, 'workout', '{}') returning id`, [A]))[0].id;
  await root(`insert into feed_cheers (event_id, user_id, emoji) values ($1, $2, '💪')`, [ea, B]);
  await root(`delete from auth.users where id = $1`, [A]);
  for (const table of ['friend_settings', 'friendships', 'feed_events', 'feed_cheers']) assert.equal((await root(`select count(*)::int as c from ${table} where ${table === 'friendships' ? 'requester_id' : 'user_id'} = $1`, [A]))[0].c, 0, table);
  assert.equal((await root('select count(*)::int as c from feed_cheers'))[0].c, 0);
  assert.equal((await rows(B, 'friend_list')).length, 0);
});

console.log(`\n${n} checks passed${process.exitCode ? ' (some FAILED)' : ''}`);
