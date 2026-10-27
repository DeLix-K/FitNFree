// Checks lib/prBadges.ts (personal records). Node 22.6+ runs the TypeScript directly.
//   node scripts/test-pr-badges.mjs
import assert from 'node:assert/strict';
import { KG_PER_LB, bestRecords, e1rmKg, evaluateSet, formatSet, prHistory, prSummary, readAllPages } from '../lib/prBadges.ts';

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
let seq = 0;
const S = (weight, reps, date = '2026-10-01', unit = 'kg') => ({ weight, reps, weight_unit: unit, logged_date: date, created_at: `${date}T10:00:${String(seq++).padStart(2, '0')}Z` });
const kinds = (r) => r.prs.map((p) => p.kind);

t('the first set ever is a baseline, never a PR', () => {
  const r = evaluateSet([], S(100, 5));
  assert.equal(r.baseline, true);
  assert.deepEqual(r.prs, []);
});

t('a heavier weight is a weight PR (and an est. 1RM PR), with what it beat', () => {
  const r = evaluateSet([S(100, 5)], S(102.5, 5));
  assert.equal(r.baseline, false);
  assert.deepEqual(kinds(r), ['weight', 'e1rm']);
  assert.equal(r.prs[0].value, 102.5);
  assert.equal(r.prs[0].previous, 100);
  assert.match(r.prs[0].text, /Heaviest weight: 102\.5 kg \(was 100 kg\)/);
});

t('equalling a record is not a new record', () => {
  const r = evaluateSet([S(100, 5)], S(100, 5));
  assert.deepEqual(r.prs, []);
  assert.equal(evaluateSet([S(100, 5), S(105, 3)], S(100, 5)).prs.length, 0);
});

t('more reps at the same weight beats the est. 1RM but is not a weight or rep-record PR (same weight)', () => {
  const r = evaluateSet([S(100, 5)], S(100, 8));
  assert.deepEqual(kinds(r), ['e1rm']);
});

t('est. 1RM is Epley, and one rep is just the weight', () => {
  assert.equal(Math.round(e1rmKg({ weight: 100, reps: 5, weight_unit: 'kg' }) * 100) / 100, 116.67);
  assert.equal(e1rmKg({ weight: 100, reps: 1, weight_unit: 'kg' }), 100);
});

t('sets of more than 12 reps and bodyweight sets do not count towards est. 1RM', () => {
  assert.equal(e1rmKg({ weight: 50, reps: 13, weight_unit: 'kg' }), null);
  assert.equal(e1rmKg({ weight: 0, reps: 10, weight_unit: 'kg' }), null);
  assert.equal(e1rmKg({ weight: 50, reps: 12, weight_unit: 'kg' }) > 0, true);
  // 40 kg x 30 reps would "estimate" 80 kg: it must not beat a real 70 kg x 5 (est 81.7)
  assert.deepEqual(kinds(evaluateSet([S(70, 5)], S(40, 30))), []);
});

t('a lighter set with enough extra reps can be an est. 1RM PR without being the heaviest', () => {
  const r = evaluateSet([S(100, 3)], S(90, 10)); // est 110 vs 110? 100x3 = 110.0 ; 90x10 = 120.0
  assert.deepEqual(kinds(r), ['e1rm']);
  assert.equal(r.prs[0].value, 120);
});

t('rep record: more weight than any earlier set with at least that many reps', () => {
  // earlier: 100 x 5 and 120 x 1. A 105 x 5 beats the best 5+ rep set (100), but is not heavier than 120, so only a rep record + 1RM
  const r = evaluateSet([S(100, 5), S(120, 1)], S(105, 5));
  assert.ok(kinds(r).includes('reps'));
  assert.ok(!kinds(r).includes('weight'));
  const rr = r.prs.find((p) => p.kind === 'reps');
  assert.equal(rr.previous, 100);
  assert.match(rr.text, /105 kg for 5 reps \(best for 5\+ reps was 100 kg\)/);
});

t('a rep record needs an earlier set of that many reps (the first set of a new rep range is not a PR), and is dropped when it is also a weight PR', () => {
  assert.ok(!kinds(evaluateSet([S(100, 5)], S(80, 12))).includes('reps'));
  assert.deepEqual(kinds(evaluateSet([S(100, 5)], S(110, 5))), ['weight', 'e1rm']); // no extra "reps" badge
});

t('a heavier set that had MORE reps than an earlier 100 x 8 also beats it for 5 reps', () => {
  assert.ok(kinds(evaluateSet([S(100, 8), S(110, 2)], S(105, 5))).includes('reps'));
});

t('bodyweight: more reps than any earlier bodyweight set, and only if there was an earlier one', () => {
  assert.deepEqual(kinds(evaluateSet([S(0, 10)], S(0, 12))), ['reps']);
  assert.equal(evaluateSet([S(0, 10)], S(0, 12)).prs[0].text, 'Most reps: 12 (was 10)');
  assert.deepEqual(evaluateSet([S(0, 10)], S(0, 10)).prs, []);
  assert.deepEqual(evaluateSet([S(0, 10)], S(0, 8)).prs, []);
  assert.deepEqual(evaluateSet([S(50, 10)], S(0, 15)).prs, []); // no earlier bodyweight set
});

t('kg and lb are compared properly, and shown in the unit of the new set', () => {
  const prior = [S(100, 5, '2026-10-01', 'kg')];
  assert.deepEqual(evaluateSet(prior, S(220, 5, '2026-10-08', 'lb')).prs.map((p) => p.kind), []); // 220 lb = 99.8 kg
  const r = evaluateSet(prior, S(225, 5, '2026-10-08', 'lb')); // 102.06 kg
  assert.ok(kinds(r).includes('weight'));
  const w = r.prs.find((p) => p.kind === 'weight');
  assert.equal(w.value, 225);
  assert.equal(w.previous, Math.round((100 / KG_PER_LB) * 10) / 10); // 220.5 lb
  assert.match(w.text, /225 lb \(was 220\.5 lb\)/);
});

t('rounding noise is not a PR: 100 kg logged as 220.462 lb is the same weight', () => {
  assert.deepEqual(evaluateSet([S(100, 5, '2026-10-01', 'kg')], S(220.462, 5, '2026-10-02', 'lb')).prs, []);
});

t('history: PR events in order, each beating only what came before it, ties and later lower sets are not PRs', () => {
  const h = [S(100, 5, '2026-10-01'), S(100, 5, '2026-10-02'), S(105, 5, '2026-10-08'), S(95, 5, '2026-10-09'), S(110, 3, '2026-10-15')];
  const ev = prHistory(h);
  assert.deepEqual(ev.map((e) => e.set.logged_date), ['2026-10-08', '2026-10-15']);
  assert.ok(ev[0].prs.some((p) => p.kind === 'weight'));
  assert.ok(ev[1].prs.some((p) => p.kind === 'weight'));
});

t('history is read in date order whatever order it arrives in, and same-day sets by creation time', () => {
  const h = [S(110, 3, '2026-10-15'), S(100, 5, '2026-10-01'), S(105, 5, '2026-10-08')];
  assert.deepEqual(prHistory(h).map((e) => e.set.weight), [105, 110]);
  const a = { weight: 100, reps: 5, weight_unit: 'kg', logged_date: '2026-10-01', created_at: '2026-10-01T09:00:00Z' };
  const b = { weight: 102.5, reps: 5, weight_unit: 'kg', logged_date: '2026-10-01', created_at: '2026-10-01T09:10:00Z' };
  assert.deepEqual(prHistory([b, a]).map((e) => e.set.weight), [102.5]);
});

t('current records: the heaviest and best est. 1RM, with the earlier set winning a tie', () => {
  const h = [S(100, 5, '2026-10-01'), S(100, 5, '2026-10-05'), S(120, 1, '2026-10-08'), S(90, 10, '2026-10-12')];
  const r = bestRecords(h);
  assert.equal(r.heaviest.weight, 120);
  assert.equal(r.bestE1rm.set.weight, 120); // 120 x 1 = 120 vs 90 x 10 = 120 -> tie, the earlier (120) holds it
  assert.equal(r.totalSets, 4);
  const tie = bestRecords([S(100, 5, '2026-10-01'), S(100, 5, '2026-10-05')]);
  assert.equal(tie.heaviest.logged_date, '2026-10-01');
  assert.deepEqual(bestRecords([]), { heaviest: null, bestE1rm: null, totalSets: 0 });
  assert.equal(bestRecords([S(0, 10)]).heaviest, null);
});

t('heaviest is the heaviest weight, not the set with the best est. 1RM', () => {
  const r = bestRecords([S(100, 1, '2026-10-01'), S(80, 12, '2026-10-02')]); // 80 x 12 = 112 est > 100
  assert.equal(r.heaviest.weight, 100);
  assert.equal(r.bestE1rm.set.weight, 80);
});

t('the one-pass history agrees with checking every set against everything before it, and a long history is quick', () => {
  const make = (len) => {
    const out = [];
    for (let i = 0; i < len; i++) out.push({ weight: (i * 7) % 5 === 0 ? 0 : 40 + ((i * 13) % 50), reps: 1 + ((i * 5) % 14), weight_unit: i % 4 === 0 ? 'lb' : 'kg', logged_date: `2026-${String(1 + (i % 9)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`, created_at: `2026-01-01T00:${String(Math.floor(i / 60) % 60).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}Z` });
    return out;
  };
  const small = make(400);
  const ordered = [...small].map((s, i) => ({ s, i })).sort((a, b) => (a.s.logged_date !== b.s.logged_date ? (a.s.logged_date < b.s.logged_date ? -1 : 1) : a.s.created_at !== b.s.created_at ? (a.s.created_at < b.s.created_at ? -1 : 1) : a.i - b.i)).map((x) => x.s);
  const slow = [];
  ordered.forEach((s, i) => {
    const r = evaluateSet(ordered.slice(0, i), s);
    if (r.prs.length) slow.push([s, r.prs.map((p) => p.kind + p.value)]);
  });
  const fast = prHistory(small).map((e) => [e.set, e.prs.map((p) => p.kind + p.value)]);
  assert.ok(fast.length > 3, 'the sample should contain some PRs');
  assert.deepEqual(fast, slow);
  const t0 = Date.now();
  prHistory(make(6000));
  assert.ok(Date.now() - t0 < 2000);
});

t('descriptions: names of the kinds and a set in words', () => {
  assert.equal(prSummary(evaluateSet([S(100, 5)], S(102.5, 5)).prs), 'Heaviest weight + Est. 1RM');
  assert.equal(formatSet({ weight: 102.5, reps: 5, weight_unit: 'kg' }), '102.5 kg × 5');
  assert.equal(formatSet({ weight: 0, reps: 12, weight_unit: 'kg' }), '12 reps (bodyweight)');
});

// the pages are async, so these run after the sync checks
const server = (total, cap) => async (from, to) => Array.from({ length: Math.max(0, Math.min(to - from + 1, cap, total - from)) }, (_, i) => from + i);
const ta = async (name, fn) => {
  try {
    await fn();
    console.log('  ok  ', name);
    n++;
  } catch (e) {
    console.log('  FAIL', name, String.fromCharCode(10) + '      ', e.message);
    process.exitCode = 1;
  }
};
await ta('paging reads everything even when the server returns fewer rows than asked for (a lower row limit than the page size)', async () => {
  for (const cap of [1000, 500, 137, 1]) {
    const total = cap === 1 ? 40 : 2300;
    const r = await readAllPages(server(total, cap), 1000, 10_000, 3000);
    assert.equal(r.complete, true, `cap ${cap}`);
    assert.deepEqual(r.rows, Array.from({ length: total }, (_, i) => i), `cap ${cap}`);
  }
});
await ta('paging: an empty list is complete, and exactly one full page still needs the empty page to be sure', async () => {
  assert.deepEqual(await readAllPages(server(0, 1000)), { rows: [], complete: true });
  assert.equal((await readAllPages(server(1000, 1000))).rows.length, 1000);
  assert.equal((await readAllPages(server(1000, 1000))).complete, true);
});
await ta('paging: hitting the row limit or the request limit is reported as incomplete, never as complete', async () => {
  const big = await readAllPages(server(25_000, 1000), 1000, 10_000, 60);
  assert.equal(big.complete, false);
  assert.ok(big.rows.length >= 10_000);
  const slow = await readAllPages(server(5000, 10), 1000, 10_000, 60);
  assert.equal(slow.complete, false);
});
await ta('paging: a failing request is passed on, not hidden', async () => {
  await assert.rejects(() => readAllPages(async () => { throw new Error('network down'); }), /network down/);
});

console.log(n, 'passed');
