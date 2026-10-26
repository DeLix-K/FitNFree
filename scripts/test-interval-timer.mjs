// Checks lib/intervalTimer.ts (the interval clock's timing). Node 22.6+ runs the TypeScript directly.
//   node scripts/test-interval-timer.mjs
import assert from 'node:assert/strict';
import { PRESETS, REST_PRESETS, buildSchedule, cuesBetween, describeCue, formatClock, sanitizeConfig, stateAt, totalSeconds, wholeSeconds } from '../lib/intervalTimer.ts';

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
const tabata = PRESETS.find((p) => p.id === 'tabata').config;

t('Tabata is 8 rounds of 20 s work and 10 s rest, with no rest after the last, plus a 10 s lead-in', () => {
  const s = buildSchedule(tabata);
  assert.equal(s.filter((x) => x.phase === 'work').length, 8);
  assert.equal(s.filter((x) => x.phase === 'rest').length, 7);
  assert.equal(s[0].phase, 'prepare');
  assert.equal(s[s.length - 1].phase, 'work');
  assert.equal(totalSeconds(tabata), 10 + 8 * 20 + 7 * 10); // 240 s
});

t('boxing presets: 3 x 3:00 with 1:00 rests is 11 minutes plus lead-in, and 12 rounds is 47 minutes plus lead-in', () => {
  assert.equal(totalSeconds(PRESETS.find((p) => p.id === 'boxing-3').config), 10 + 3 * 180 + 2 * 60);
  assert.equal(totalSeconds(PRESETS.find((p) => p.id === 'boxing-12').config), 10 + 12 * 180 + 11 * 60);
});

t('segments are back to back with no gaps or overlaps', () => {
  for (const p of [...PRESETS, ...REST_PRESETS]) {
    const s = buildSchedule(p.config);
    let at = 0;
    for (const seg of s) {
      assert.equal(seg.startSec, at, p.id);
      assert.ok(seg.durationSec > 0);
      at += seg.durationSec;
    }
  }
});

t('the clock reads the right phase and time at known moments', () => {
  const s = buildSchedule(tabata);
  const at = (sec) => stateAt(s, sec * 1000, 8);
  assert.deepEqual([at(0).phase, at(0).round, wholeSeconds(at(0).remainingSec)], ['prepare', 0, 10]);
  assert.deepEqual([at(9.5).phase, wholeSeconds(at(9.5).remainingSec)], ['prepare', 1]);
  assert.deepEqual([at(10).phase, at(10).round, wholeSeconds(at(10).remainingSec)], ['work', 1, 20]);
  assert.deepEqual([at(29.9).phase, wholeSeconds(at(29.9).remainingSec)], ['work', 1]);
  assert.deepEqual([at(30).phase, at(30).round, wholeSeconds(at(30).remainingSec)], ['rest', 1, 10]);
  assert.deepEqual([at(40).phase, at(40).round], ['work', 2]);
  assert.equal(at(239.9).done, false);
  assert.equal(at(240).done, true);
  assert.equal(at(100000).done, true);
});

t('a late reading (the app was busy or paused) catches up to the true time instead of drifting', () => {
  const s = buildSchedule(tabata);
  const a = stateAt(s, 12_000, 8);
  const b = stateAt(s, 95_500, 8); // round 3's rest runs from 90 s to 100 s
  const c = stateAt(s, 100_500, 8); // round 4's work starts at 100 s
  assert.equal(a.phase, 'work');
  assert.deepEqual([b.phase, b.round, wholeSeconds(b.remainingSec)], ['rest', 3, 5]);
  assert.deepEqual([c.phase, c.round], ['work', 4]);
});

t('time remaining and progress behave', () => {
  const s = buildSchedule(tabata);
  const x = stateAt(s, 120_000, 8);
  assert.ok(Math.abs(x.totalRemainingSec - 120) < 1e-6);
  assert.ok(Math.abs(x.progress - 0.5) < 1e-6);
  assert.equal(stateAt(s, -5000, 8).phase, 'prepare');
});

t('the big number never shows 0 while time is left, and formats as minutes and seconds', () => {
  assert.equal(wholeSeconds(0.2), 1);
  assert.equal(wholeSeconds(20), 20);
  assert.equal(wholeSeconds(0), 0);
  assert.equal(formatClock(0), '0:00');
  assert.equal(formatClock(59.2), '1:00');
  assert.equal(formatClock(180), '3:00');
  assert.equal(formatClock(2820), '47:00');
  assert.equal(formatClock(3725), '1:02:05');
});

t('cues: a phase change signals once, 3-2-1 fire once each, and the finish fires once', () => {
  const s = buildSchedule({ prepareSec: 0, workSec: 10, restSec: 5, rounds: 2 });
  let prev = null;
  const heard = [];
  for (let ms = 0; ms <= 40_000; ms += 100) {
    const cur = stateAt(s, ms, 2);
    for (const c of cuesBetween(prev, cur)) heard.push(describeCue(c));
    prev = cur;
  }
  assert.deepEqual(heard, ['Round 1. Go', '3', '2', '1', 'Rest', '3', '2', '1', 'Round 2. Go', '3', '2', '1', 'Finished. Great work.']);
});

t('a coarse reading (1 s apart) still gives each countdown cue at most once and never repeats the phase cue', () => {
  const s = buildSchedule(tabata);
  let prev = null;
  const heard = [];
  for (let ms = 0; ms <= 245_000; ms += 1000) {
    const cur = stateAt(s, ms, 8);
    for (const c of cuesBetween(prev, cur)) heard.push(c.kind === 'phase' ? `${c.phase}${c.round}` : c.kind === 'countdown' ? `c${c.second}` : 'finish');
    prev = cur;
  }
  assert.equal(heard.filter((x) => x === 'finish').length, 1);
  assert.equal(heard.filter((x) => x === 'work1').length, 1);
  assert.equal(heard.filter((x) => x === 'work8').length, 1);
  assert.equal(heard.filter((x) => x.startsWith('rest')).length, 7);
});

t('a 2-second interval does not shout 3', () => {
  const s = buildSchedule({ prepareSec: 0, workSec: 2, restSec: 0, rounds: 1 });
  let prev = null;
  const heard = [];
  for (let ms = 0; ms <= 3000; ms += 100) {
    const cur = stateAt(s, ms, 1);
    for (const c of cuesBetween(prev, cur)) heard.push(describeCue(c));
    prev = cur;
  }
  assert.ok(!heard.includes('3'));
});

t('settings are kept inside limits, and junk becomes safe values', () => {
  assert.deepEqual(sanitizeConfig({ prepareSec: -5, workSec: 99999, restSec: 1e9, rounds: 500 }), { prepareSec: 0, workSec: 3600, restSec: 3600, rounds: 99 });
  assert.deepEqual(sanitizeConfig({ workSec: NaN, rounds: 0 }), { prepareSec: 0, workSec: 1, restSec: 0, rounds: 1 });
  assert.deepEqual(sanitizeConfig(null), { prepareSec: 0, workSec: 20, restSec: 0, rounds: 1 });
  assert.equal(sanitizeConfig({ workSec: 20.6 }).workSec, 21);
});

t('rest timers are a single countdown', () => {
  for (const p of REST_PRESETS) {
    const s = buildSchedule(p.config);
    assert.equal(s.length, 1);
    assert.equal(s[0].phase, 'work');
  }
});

console.log(n, 'passed');
