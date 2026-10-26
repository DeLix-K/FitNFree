// Checks lib/trainerTools.ts (the trainer bookkeeping rules). Node 22.6+ runs the TypeScript directly.
//   node scripts/test-trainer-tools.mjs
import assert from 'node:assert/strict';
import * as T from '../lib/trainerTools.ts';

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

const client = (over = {}) => ({ id: 'c' + Math.random(), name: 'Chris', status: 'active', package_name: null, start_date: null, check_in_day: null, payment_due_date: null, payment_status: 'paid', notes: null, ...over });
const TODAY = '2026-10-28'; // a Wednesday

t('dates: only real calendar days are accepted', () => {
  for (const ok of ['2026-10-28', '2024-02-29', '2000-01-01']) assert.equal(T.isValidIsoDate(ok), true, ok);
  for (const bad of ['2026-02-30', '2026-13-01', '2026-00-10', '26-10-28', '2026/10/28', '', null, undefined, '1999-12-31', '2026-10-28T10:00']) assert.equal(T.isValidIsoDate(bad), false, String(bad));
  assert.equal(T.isValidIsoDate('2023-02-29'), false);
});

t('adding days crosses month and year ends correctly', () => {
  assert.equal(T.addDays('2026-10-28', 4), '2026-11-01');
  assert.equal(T.addDays('2026-12-30', 3), '2027-01-02');
  assert.equal(T.addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(T.addDays('2026-03-01', -1), '2026-02-28');
});

t('the next check-in is the next time that weekday comes round, and today counts', () => {
  assert.equal(new Date(2026, 9, 28).getDay(), 3); // Wednesday
  assert.equal(T.nextCheckInDate(3, TODAY), '2026-10-28');
  assert.equal(T.nextCheckInDate(5, TODAY), '2026-10-30');
  assert.equal(T.nextCheckInDate(1, TODAY), '2026-11-02');
  assert.equal(T.nextCheckInDate(0, TODAY), '2026-11-01');
  assert.equal(T.nextCheckInDate(null, TODAY), null);
  assert.equal(T.nextCheckInDate(7, TODAY), null);
  assert.equal(T.nextCheckInDate(2, 'nonsense'), null);
});

t('a payment marked due whose date has passed counts as overdue; paid stays paid', () => {
  assert.equal(T.effectivePayment({ payment_status: 'paid', payment_due_date: '2020-01-01' }, TODAY), 'paid');
  assert.equal(T.effectivePayment({ payment_status: 'due', payment_due_date: '2026-10-29' }, TODAY), 'due');
  assert.equal(T.effectivePayment({ payment_status: 'due', payment_due_date: TODAY }, TODAY), 'due');
  assert.equal(T.effectivePayment({ payment_status: 'due', payment_due_date: '2026-10-27' }, TODAY), 'overdue');
  assert.equal(T.effectivePayment({ payment_status: 'due', payment_due_date: null }, TODAY), 'due');
  assert.equal(T.effectivePayment({ payment_status: 'overdue', payment_due_date: null }, TODAY), 'overdue');
});

t('the client summary counts active clients and payments owed, ignoring paused and ended clients', () => {
  const s = T.clientSummary(
    [client(), client({ payment_status: 'due', payment_due_date: '2026-11-05' }), client({ payment_status: 'due', payment_due_date: '2026-10-01' }), client({ status: 'ended', payment_status: 'due' }), client({ status: 'paused' })],
    TODAY
  );
  assert.deepEqual(s, { active: 3, paymentsDue: 2, overdue: 1 });
  assert.deepEqual(T.clientSummary([], TODAY), { active: 0, paymentsDue: 0, overdue: 0 });
});

t('clients sort active first, then who owes money, then by name', () => {
  const list = [client({ name: 'Zed' }), client({ name: 'Amy', status: 'ended' }), client({ name: 'Bea', payment_status: 'overdue' }), client({ name: 'Cal', payment_status: 'due', payment_due_date: '2026-12-01' }), client({ name: 'Abe' })];
  assert.deepEqual(T.sortClients(list, TODAY).map((c) => c.name), ['Bea', 'Cal', 'Abe', 'Zed', 'Amy']);
});

t('check-in counts: total and left to do', () => {
  const k = (status, date = '2026-10-20') => ({ id: Math.random() + '', client_id: 'c1', checkin_date: date, status, photos_submitted: false, weight_kg: null, coach_feedback: null, notes: null });
  assert.deepEqual(T.checkInSummary([k('done'), k('to_do'), k('to_do')]), { total: 3, left: 2 });
  assert.deepEqual(T.checkInSummary([]), { total: 0, left: 0 });
  const sorted = T.sortCheckIns([k('done', '2026-10-01'), k('done', '2026-10-20'), k('to_do', '2026-10-20')]);
  assert.deepEqual(sorted.map((x) => [x.checkin_date, x.status]), [['2026-10-20', 'to_do'], ['2026-10-20', 'done'], ['2026-10-01', 'done']]);
});

t('upcoming check-ins list active clients with a check-in day, skip ones already booked, and sort by date', () => {
  const a = client({ id: 'a', name: 'Ann', check_in_day: 5 });
  const b = client({ id: 'b', name: 'Bo', check_in_day: 3 });
  const c = client({ id: 'c', name: 'Cy', check_in_day: null });
  const d = client({ id: 'd', name: 'Di', check_in_day: 1, status: 'paused' });
  const booked = [{ id: 'k', client_id: 'a', checkin_date: '2026-10-30', status: 'to_do', photos_submitted: false, weight_kg: null, coach_feedback: null, notes: null }];
  assert.deepEqual(T.upcomingCheckIns([a, b, c, d], [], TODAY).map((x) => [x.client.name, x.date]), [['Bo', '2026-10-28'], ['Ann', '2026-10-30']]);
  assert.deepEqual(T.upcomingCheckIns([a, b, c, d], booked, TODAY).map((x) => x.client.name), ['Bo']);
});

t('money: parsing accepts normal amounts and refuses nonsense', () => {
  assert.equal(T.parseMoney('12.5'), 1250);
  assert.equal(T.parseMoney('12.50'), 1250);
  assert.equal(T.parseMoney('£1,200'), 120000);
  assert.equal(T.parseMoney('$0.99'), 99);
  assert.equal(T.parseMoney(' 40 '), 4000);
  for (const bad of ['', '0', '0.00', '-5', 'abc', '12.345', '1e5', '99999999', '12.', '.5']) assert.equal(T.parseMoney(bad), null, bad);
});

t('money: formatting uses the chosen symbol, thousands separators and two decimals', () => {
  assert.equal(T.formatMoney(1250), '£12.50');
  assert.equal(T.formatMoney(120000, 'USD'), '$1,200.00');
  assert.equal(T.formatMoney(100000000, 'EUR'), '€1,000,000.00');
  assert.equal(T.formatMoney(5), '£0.05');
  assert.equal(T.formatMoney(-2500), '-£25.00');
  assert.equal(T.formatMoney(0), '£0.00');
});

t('weights: one decimal, sensible range', () => {
  assert.equal(T.parseWeightKg('82.4'), 82.4);
  assert.equal(T.parseWeightKg('82,4'), 82.4);
  assert.equal(T.parseWeightKg(' 75 '), 75);
  for (const bad of ['', '5', '19.9', '500', '82.45', 'abc', '-80']) assert.equal(T.parseWeightKg(bad), null, bad);
});

const E = (date, kind, cents, over = {}) => ({ id: Math.random() + '', entry_date: date, kind, category: null, description: null, amount_cents: cents, ...over });

t('monthly sheet: income, expenses, profit and margin per month, only for the chosen year', () => {
  const rows = T.monthlyBreakdown([E('2026-01-05', 'income', 100000), E('2026-01-20', 'expense', 25000), E('2026-01-21', 'income', 50000), E('2026-03-01', 'expense', 4000), E('2025-01-05', 'income', 999999), E('bad-date', 'income', 5)], 2026);
  assert.equal(rows.length, 12);
  assert.deepEqual([rows[0].income, rows[0].expenses, rows[0].profit, rows[0].margin], [150000, 25000, 125000, 83.3]);
  assert.deepEqual([rows[1].income, rows[1].profit, rows[1].margin], [0, 0, null]);
  assert.deepEqual([rows[2].income, rows[2].expenses, rows[2].profit, rows[2].margin], [0, 4000, -4000, null]);
});

t('year totals add up the months and give the year margin', () => {
  const rows = T.monthlyBreakdown([E('2026-01-05', 'income', 100000), E('2026-06-05', 'income', 100000), E('2026-06-10', 'expense', 50000)], 2026);
  const y = T.yearTotals(rows);
  assert.deepEqual([y.income, y.expenses, y.profit, y.margin], [200000, 50000, 150000, 75]);
});

t('entries for a month are filtered and listed newest first', () => {
  const list = [E('2026-10-02', 'income', 1), E('2026-10-20', 'expense', 2), E('2026-09-30', 'income', 3), E('2025-10-05', 'income', 4)];
  assert.deepEqual(T.entriesForMonth(list, 2026, 9).map((e) => e.amount_cents), [2, 1]);
});

t('CSV: quotes, commas and line breaks are escaped', () => {
  assert.equal(T.csvCell('plain'), 'plain');
  assert.equal(T.csvCell('a,b'), '"a,b"');
  assert.equal(T.csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(T.csvCell('two\nlines'), '"two\nlines"');
  assert.equal(T.csvCell(null), '');
  assert.equal(T.csvCell(12.5), '12.5');
});

t('CSV: a cell that could run as a spreadsheet formula is defused, but plain negative numbers are left alone', () => {
  for (const evil of ['=HYPERLINK("http://x")', '+1+1', '-2+3', '@SUM(A1)', '\tcmd']) assert.ok(T.csvCell(evil).replace(/^"/, '').startsWith("'"), evil);
  assert.equal(T.csvCell(-5), '-5');
  assert.equal(T.csvCell('-12.50'), '-12.50');
});

t('the three exports have the right columns and rows', () => {
  const c = client({ id: 'c1', name: '=EVIL()', package_name: '12 week', check_in_day: 5, payment_status: 'due', payment_due_date: '2026-10-01', notes: 'likes, commas' });
  const csv = T.clientsCsv([c], TODAY).split('\n');
  assert.equal(csv[0], 'Client,Status,Package,Start date,Check-in day,Payment due date,Payment,Notes');
  assert.equal(csv[1], "'=EVIL(),active,12 week,,Friday,2026-10-01,overdue,\"likes, commas\"");
  const k = { id: 'k', client_id: 'c1', checkin_date: '2026-10-20', status: 'done', photos_submitted: true, weight_kg: 82.4, coach_feedback: 'Great week', notes: null };
  assert.equal(T.checkInsCsv([k], [c]).split('\n')[1], "2026-10-20,'=EVIL(),Done,Yes,82.4,Great week,");
  const f = T.financeCsv([E('2026-02-01', 'income', 12345, { category: 'Coaching' }), E('2026-01-01', 'expense', 500), E('2025-12-31', 'income', 1)], 2026).split('\n');
  assert.deepEqual(f, ['Date,Type,Category,Description,Amount', '2026-01-01,Expense,,,5.00', '2026-02-01,Income,Coaching,,123.45']);
});

console.log(n, 'passed');
