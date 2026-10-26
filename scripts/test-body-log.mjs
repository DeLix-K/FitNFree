// Checks lib/bodyLog.ts (weight and measurements rules) and lib/photoIndex.ts (the on-phone photo list). Node 22.6+ runs the TypeScript directly.
//   node scripts/test-body-log.mjs
import assert from 'node:assert/strict';
import * as B from '../lib/bodyLog.ts';
import * as P from '../lib/photoIndex.ts';

let n = 0;
const t = (name, fn) => {
  try {
    fn();
    console.log('  ok  ', name);
    n++;
  } catch (e) {
    console.log('  FAIL', name, '\n      ', e.message);
    process.exitCode = 1;
  }
};
const near = (a, b, eps = 0.051) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);

// ── Weight ────────────────────────────────────────────────────────────────────
t('kilograms: normal entries parse, nonsense does not', () => {
  assert.equal(B.parseWeight('82.4', 'kg'), 82.4);
  assert.equal(B.parseWeight(' 82,4 ', 'kg'), 82.4);
  assert.equal(B.parseWeight('82.4 kg', 'kg'), 82.4);
  assert.equal(B.parseWeight('82.45', 'kg'), 82.5);
  for (const bad of ['', 'abc', '5', '19.9', '500', '1000', '-80', '82.4.1', '82 4', 'NaN']) assert.equal(B.parseWeight(bad, 'kg'), null, bad);
});

t('pounds convert to kilograms', () => {
  near(B.parseWeight('180', 'lb'), 81.6);
  near(B.parseWeight('180.5 lb', 'lb'), 81.9);
  near(B.parseWeight('180lbs', 'lb'), 81.6);
  assert.equal(B.parseWeight('30', 'lb'), null);
  assert.equal(B.parseWeight('abc', 'lb'), null);
});

t('stone and pounds in the ways people write them', () => {
  for (const s of ['12 st 4', '12st4', '12 4', '12:4', '12 st 4 lb', '12 stone 4']) near(B.parseWeight(s, 'st'), 78.0, 0.1);
  near(B.parseWeight('12.5 st', 'st'), 79.4, 0.1);
  near(B.parseWeight('12 st', 'st'), 76.2, 0.1);
  assert.equal(B.parseWeight('12 st 15', 'st'), null, 'pounds must be under 14');
  assert.equal(B.parseWeight('2 st', 'st'), null);
  assert.equal(B.parseWeight('abc', 'st'), null);
});

t('weights display in each unit, and round-trip within rounding', () => {
  assert.equal(B.formatWeight(82.4, 'kg'), '82.4 kg');
  assert.equal(B.formatWeight(81.6, 'lb'), '179.9 lb');
  assert.equal(B.formatWeight(77.1, 'st'), '12 st 2 lb');
  for (const kg of [45.2, 82.4, 103.9, 150]) for (const u of ['kg', 'lb', 'st']) near(B.parseWeight(B.weightToInput(kg, u), u), kg, 0.1);
  assert.equal(B.formatWeight(88.45, 'st').includes('14 lb'), false, 'never shows 14 lb');
});

t('changes show a sign and use the chosen unit', () => {
  assert.equal(B.formatWeightChange(-1.5, 'kg'), '-1.5 kg');
  assert.equal(B.formatWeightChange(0.8, 'kg'), '+0.8 kg');
  assert.equal(B.formatWeightChange(0, 'kg'), '0 kg');
  assert.equal(B.formatWeightChange(-1, 'lb'), '-2.2 lb');
  assert.equal(B.formatWeightChange(-9.6, 'st'), '-1 st 7.2 lb');
});

// ── Lengths and body fat ─────────────────────────────────────────────────────────
t('lengths: centimetres and inches', () => {
  assert.equal(B.parseLength('84.5', 'cm'), 84.5);
  assert.equal(B.parseLength('84,5 cm', 'cm'), 84.5);
  near(B.parseLength('33.5', 'in'), 85.1);
  near(B.parseLength('33.5 in', 'in'), 85.1);
  for (const bad of ['', 'abc', '5', '400', '-30']) assert.equal(B.parseLength(bad, 'cm'), null, bad);
  assert.equal(B.formatLength(85.1, 'in'), '33.5 in');
  assert.equal(B.formatLength(85.1, 'cm'), '85.1 cm');
});

t('body fat: 2 to 70 percent', () => {
  assert.equal(B.parseBodyFat('18.5'), 18.5);
  assert.equal(B.parseBodyFat('18.5%'), 18.5);
  for (const bad of ['', '1', '71', '18.55', 'x']) assert.equal(B.parseBodyFat(bad), null, bad);
});

// ── Entries, trend and rate ──────────────────────────────────────────────────────
const E = (date, kg, over = {}) => ({ id: date, logged_date: date, weight_kg: kg, waist_cm: null, chest_cm: null, hips_cm: null, thigh_cm: null, arm_cm: null, body_fat_pct: null, notes: null, ...over });
const day = (n) => B.addDays('2026-10-01', n);

t('an entry needs at least one value', () => {
  assert.equal(B.hasAnyValue({ weight_kg: 80 }), true);
  assert.equal(B.hasAnyValue({ waist_cm: 80 }), true);
  assert.equal(B.hasAnyValue({ weight_kg: null, waist_cm: null }), false);
  assert.equal(B.hasAnyValue({}), false);
});

t('series skips entries with no weight and sorts by date', () => {
  const s = B.series([E('2026-10-05', 80), E('2026-10-01', 81), E('2026-10-03', null, { waist_cm: 90 })], 'weight_kg');
  assert.deepEqual(s.map((p) => p.date), ['2026-10-01', '2026-10-05']);
  assert.deepEqual(B.series([E('2026-10-03', null, { waist_cm: 90 })], 'waist_cm').map((p) => p.value), [90]);
});

t('the 7-day average smooths the wobble', () => {
  const pts = [80, 81, 79.5, 80.5].map((v, i) => ({ date: day(i), value: v }));
  const avg = B.trailingAverage(pts);
  assert.deepEqual(avg.map((p) => p.value), [80, 80.5, 80.2, 80.3]);
  const far = B.trailingAverage([{ date: day(0), value: 90 }, { date: day(20), value: 80 }]);
  assert.deepEqual(far.map((p) => p.value), [90, 80], 'an old reading outside the window does not count');
});

t('change over a period uses the reading nearest that day, and says nothing when there is none', () => {
  const pts = [90, 89, 88.5, 88, 87.6].map((v, i) => ({ date: day(i * 7), value: v })); // weekly for 4 weeks
  assert.equal(B.changeOver(pts, 28), -2.4);
  assert.equal(B.changeOver(pts, 7), -0.4);
  assert.equal(B.changeOver(pts, 100), null);
  assert.equal(B.changeOver([pts[0]], 7), null);
  assert.equal(B.changeOver([], 7), null);
});

t('weekly rate: a steady loss, a steady gain, flat, and too little data', () => {
  const loss = Array.from({ length: 5 }, (_, i) => ({ date: day(i * 7), value: 90 - i * 0.5 }));
  assert.equal(B.weeklyRate(loss), -0.5);
  const gain = Array.from({ length: 5 }, (_, i) => ({ date: day(i * 7), value: 70 + i * 0.25 }));
  assert.equal(B.weeklyRate(gain), 0.25);
  assert.equal(B.weeklyRate(Array.from({ length: 5 }, (_, i) => ({ date: day(i * 7), value: 80 }))), 0);
  assert.equal(B.weeklyRate(loss.slice(0, 2)), null, 'two points are not a trend');
  assert.equal(B.weeklyRate([0, 1, 2].map((i) => ({ date: day(i), value: 80 - i }))), null, 'three days is too short to call a trend');
});

t('goal progress: how far from the start towards the goal', () => {
  assert.equal(B.goalProgress(90, 85, 80), 50);
  assert.equal(B.goalProgress(90, 80, 80), 100);
  assert.equal(B.goalProgress(90, 75, 80), 100);
  assert.equal(B.goalProgress(90, 92, 80), 0);
  assert.equal(B.goalProgress(60, 63, 70), 30);
  assert.equal(B.goalProgress(80, 80, 80), null);
  assert.equal(B.goalProgress(null, 80, 70), null);
});

t('the summary pulls it together', () => {
  const entries = [E(day(0), 90), E(day(14), 89), E(day(28), 88.2), E(day(35), 87.5)];
  const s = B.summarize(entries);
  assert.equal(s.latestKg, 87.5);
  assert.equal(s.latestDate, day(35));
  assert.equal(s.firstKg, 90);
  assert.equal(s.changeAll, -2.5);
  assert.equal(s.entries, 4);
  assert.ok(s.weekly < 0);
  assert.deepEqual(B.summarize([]), { latestKg: null, latestDate: null, firstKg: null, change30: null, changeAll: null, weekly: null, entries: 0 });
});

t('chart geometry: points stay inside the box, time runs left to right by real date, and one point is centred', () => {
  const pts = [{ date: day(0), value: 90 }, { date: day(10), value: 88 }, { date: day(40), value: 85 }];
  const c = B.chartPoints(pts, 300, 120, 10);
  assert.equal(c.points.length, 3);
  for (const p of c.points) assert.ok(p.x >= 10 && p.x <= 290 && p.y >= 10 && p.y <= 110, JSON.stringify(p));
  assert.ok(c.points[0].x < c.points[1].x && c.points[1].x < c.points[2].x);
  assert.ok(c.points[1].x - c.points[0].x < c.points[2].x - c.points[1].x, 'a 30-day gap is wider than a 10-day gap');
  assert.ok(c.points[0].y < c.points[2].y, 'heavier is higher');
  const one = B.chartPoints([pts[0]], 300, 120);
  assert.equal(one.points[0].x, 150);
  const flat = B.chartPoints([{ date: day(0), value: 80 }, { date: day(7), value: 80 }], 300, 120);
  assert.ok(flat.points.every((p) => Number.isFinite(p.y)));
  assert.deepEqual(B.chartPoints([], 300, 120), { points: [], min: 0, max: 0 });
  assert.match(B.pathOf(c.points), /^M[\d.]+,[\d.]+ L/);
});

t('last N days filters the readings', () => {
  const pts = [0, 20, 50, 80].map((d, i) => ({ date: day(d), value: 80 + i }));
  assert.equal(B.lastDays(pts, 30).length, 2);
  assert.equal(B.lastDays(pts, null).length, 4);
  assert.deepEqual(B.lastDays([], 30), []);
});

t('CSV export has every column, is sorted by date, and neutralises spreadsheet formulas in notes', () => {
  const csv = B.bodyLogCsv([E('2026-10-05', 80.5, { notes: '=EVIL()' }), E('2026-10-01', 81, { waist_cm: 90.5, notes: 'felt "good", tired' })]).split('\n');
  assert.equal(csv[0], 'Date,Weight (kg),Body fat (%),Waist (cm),Chest (cm),Hips (cm),Thigh (cm),Arm (cm),Notes');
  assert.equal(csv[1], '2026-10-01,81,,90.5,,,,,"felt ""good"", tired"');
  assert.equal(csv[2], "2026-10-05,80.5,,,,,,,'=EVIL()");
});

t('dates: only real calendar days', () => {
  assert.equal(B.isValidIsoDate('2026-10-28'), true);
  for (const bad of ['2026-02-30', '2026-13-01', '', null, '28/10/2026']) assert.equal(B.isValidIsoDate(bad), false, String(bad));
  assert.equal(B.daysBetween('2026-10-01', '2026-11-01'), 31);
});

// ── Photos on the phone ──────────────────────────────────────────────────────────
const M = (id, taken, pose, over = {}) => ({ id, taken, pose, file: P.newFileName(pose, taken, () => 0.3), addedAt: `${taken}T10:00:00.000Z`, ...over });

t('file names are safe and the shape is checked before use', () => {
  const f = P.newFileName('front', '2026-10-28', () => 0.5);
  assert.match(f, /^front-20261028-[0-9a-f]{8}\.jpg$/);
  assert.equal(P.isSafeFileName(f), true);
  for (const bad of ['../secret.jpg', 'front-20261028-12345678.png', '/etc/passwd', 'front/20261028-12345678.jpg', 'front-20261028-1234567g.jpg', '', null, 5, 'front-20261028-12345678.jpg/..']) assert.equal(P.isSafeFileName(bad), false, String(bad));
});

t('a damaged saved list is read safely: junk, duplicates, bad dates, unsafe names and unknown poses are dropped', () => {
  assert.deepEqual(P.parseIndex(null), []);
  assert.deepEqual(P.parseIndex('not json'), []);
  assert.deepEqual(P.parseIndex('{"a":1}'), []);
  const good = M('abc1', '2026-10-01', 'front');
  const raw = JSON.stringify([good, good, { ...good, id: 'abc2', file: '../x.jpg' }, { ...good, id: 'abc3', taken: '2026-02-30' }, { ...good, id: 'abc4', pose: 'sideways' }, { ...good, id: 'a b' }, null, 'x', { ...good, id: 'abc5', file: P.newFileName('side', '2026-10-02', () => 0.1), pose: 'side', taken: '2026-10-02' }]);
  assert.deepEqual(P.parseIndex(raw).map((x) => x.id), ['abc5', 'abc1']);
});

t('adding and removing; duplicates and the size limit are refused', () => {
  let list = [];
  list = P.addPhoto(list, M('a1', '2026-10-01', 'front'));
  list = P.addPhoto(list, M('a2', '2026-10-10', 'front'));
  assert.deepEqual(list.map((x) => x.id), ['a2', 'a1']);
  assert.throws(() => P.addPhoto(list, M('a1', '2026-10-02', 'side')), /already/);
  assert.deepEqual(P.removePhoto(list, 'a1').map((x) => x.id), ['a2']);
  assert.deepEqual(P.removePhoto(list, 'nope').length, 2);
  const full = Array.from({ length: P.MAX_PHOTOS }, (_, i) => M('p' + i, '2026-10-01', 'front', { file: `front-20261001-${i.toString(16).padStart(8, '0')}.jpg` }));
  assert.throws(() => P.addPhoto(full, M('zz', '2026-10-02', 'side')), /up to 300/);
});

t('photos sort newest day first and group by day', () => {
  const list = [M('a', '2026-10-01', 'back'), M('b', '2026-10-10', 'side'), M('c', '2026-10-10', 'front'), M('d', '2026-10-01', 'front')];
  const g = P.groupByDate(list);
  assert.deepEqual(g.map((x) => x.date), ['2026-10-10', '2026-10-01']);
  assert.deepEqual(g[0].photos.map((x) => x.pose), ['front', 'side']);
  assert.deepEqual(g[1].photos.map((x) => x.pose), ['front', 'back']);
});

t('before and after: earliest and latest of the same pose, only across different days', () => {
  const list = [M('a', '2026-08-01', 'front'), M('b', '2026-10-01', 'front'), M('c', '2026-09-01', 'front'), M('d', '2026-09-15', 'side'), M('e', '2026-09-15', 'back'), M('f', '2026-09-16', 'back')];
  const pair = P.comparisonPair(list, 'front');
  assert.deepEqual([pair.before.id, pair.after.id], ['a', 'b']);
  assert.equal(P.comparisonPair(list, 'side'), null, 'one photo is not a comparison');
  assert.equal(P.comparisonPair([M('x', '2026-09-01', 'front'), M('y', '2026-09-01', 'front', { id: 'y', file: P.newFileName('front', '2026-09-01', () => 0.9) })], 'front'), null, 'two photos on the same day are not a comparison');
  assert.deepEqual(P.comparablePoses(list), ['front', 'back']);
});

t('the list survives being saved and read back', () => {
  const list = [M('a1', '2026-10-01', 'front'), M('a2', '2026-10-10', 'side')];
  assert.deepEqual(P.parseIndex(P.serializeIndex(list)), P.sortPhotos(list));
});

console.log(n, 'passed');
