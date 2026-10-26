// The bookkeeping behind Trainer Tools (client tracker, check-in tracker, monthly finance sheets). Pure functions with no imports, so the
// rules can be tested on their own (scripts/test-trainer-tools.mjs). The screens only show what these return. Nothing here moves money:
// it is a trainer's own record of who has paid and what came in and went out.

export type PaymentStatus = 'paid' | 'due' | 'overdue';
export type ClientStatus = 'active' | 'paused' | 'ended';

export type TrainerClient = {
  id: string;
  name: string;
  status: ClientStatus;
  package_name: string | null;
  start_date: string | null; // YYYY-MM-DD
  check_in_day: number | null; // 0 = Sunday ... 6 = Saturday
  payment_due_date: string | null;
  payment_status: PaymentStatus;
  notes: string | null;
};

export type TrainerCheckIn = {
  id: string;
  client_id: string;
  checkin_date: string;
  status: 'to_do' | 'done';
  photos_submitted: boolean;
  weight_kg: number | null;
  coach_feedback: string | null;
  notes: string | null;
};

export type FinanceEntry = {
  id: string;
  entry_date: string;
  kind: 'income' | 'expense';
  category: string | null;
  description: string | null;
  amount_cents: number;
};

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
export const CURRENCIES = { GBP: '£', USD: '$', EUR: '€' } as const;
export type CurrencyCode = keyof typeof CURRENCIES;

// ── Dates (always whole calendar days, written YYYY-MM-DD, with no time zone surprises) ───────────
const pad = (n: number) => String(n).padStart(2, '0');

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Accepts only a real calendar date: 2026-02-30 and 2026-13-01 are refused.
export function isValidIsoDate(s: string | null | undefined): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d && y >= 2000 && y <= 2100;
}

const fromIso = (s: string): Date => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export function addDays(iso: string, days: number): string {
  const d = fromIso(iso);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

// The next day on or after `fromIso` that falls on the client's check-in weekday. Today counts.
export function nextCheckInDate(checkInDay: number | null, from: string): string | null {
  if (checkInDay === null || checkInDay < 0 || checkInDay > 6 || !isValidIsoDate(from)) return null;
  const today = fromIso(from).getDay();
  return addDays(from, (checkInDay - today + 7) % 7);
}

// ── Clients and payments ────────────────────────────────────────────────────────────────────
// What a payment really is today: the trainer's own mark, corrected by the due date. A payment marked due whose date has passed is overdue.
export function effectivePayment(c: Pick<TrainerClient, 'payment_status' | 'payment_due_date'>, today: string): PaymentStatus {
  if (c.payment_status === 'paid') return 'paid';
  if (c.payment_status === 'overdue') return 'overdue';
  return c.payment_due_date && c.payment_due_date < today ? 'overdue' : 'due';
}

export function clientSummary(clients: TrainerClient[], today: string) {
  const active = clients.filter((c) => c.status === 'active');
  const unpaid = active.filter((c) => effectivePayment(c, today) !== 'paid');
  return {
    active: active.length,
    paymentsDue: unpaid.length,
    overdue: active.filter((c) => effectivePayment(c, today) === 'overdue').length,
  };
}

const PAY_ORDER: Record<PaymentStatus, number> = { overdue: 0, due: 1, paid: 2 };
const STATUS_ORDER: Record<ClientStatus, number> = { active: 0, paused: 1, ended: 2 };

// Active clients first, then those who owe money, then by name.
export function sortClients(clients: TrainerClient[], today: string): TrainerClient[] {
  return [...clients].sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      PAY_ORDER[effectivePayment(a, today)] - PAY_ORDER[effectivePayment(b, today)] ||
      a.name.localeCompare(b.name)
  );
}

// ── Check-ins ────────────────────────────────────────────────────────────────────────────────
export function checkInSummary(checkIns: TrainerCheckIn[]) {
  return { total: checkIns.length, left: checkIns.filter((c) => c.status === 'to_do').length };
}

// Newest first, with open ones above done ones on the same day.
export function sortCheckIns(items: TrainerCheckIn[]): TrainerCheckIn[] {
  return [...items].sort((a, b) => (a.checkin_date < b.checkin_date ? 1 : a.checkin_date > b.checkin_date ? -1 : a.status === b.status ? 0 : a.status === 'to_do' ? -1 : 1));
}

// Active clients whose check-in day falls in the next 7 days and who have no open or done check-in booked for that date yet.
export function upcomingCheckIns(clients: TrainerClient[], checkIns: TrainerCheckIn[], today: string): { client: TrainerClient; date: string }[] {
  const out: { client: TrainerClient; date: string }[] = [];
  for (const c of clients) {
    if (c.status !== 'active') continue;
    const date = nextCheckInDate(c.check_in_day, today);
    if (!date) continue;
    if (checkIns.some((k) => k.client_id === c.id && k.checkin_date === date)) continue;
    out.push({ client: c, date });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.client.name.localeCompare(b.client.name)));
}

// ── Money ───────────────────────────────────────────────────────────────────────────────────
// "12.5", "12.50", "£1,200" → 1250, 1250, 120000 (cents). Anything else, zero, negative, or absurd → null.
export function parseMoney(input: string): number | null {
  const cleaned = input.replace(/[£$€\s,]/g, '');
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(cleaned)) return null;
  const cents = Math.round(Number(cleaned) * 100);
  return cents > 0 && cents < 100_000_000 ? cents : null;
}

export function formatMoney(cents: number, currency: CurrencyCode = 'GBP'): string {
  const neg = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const whole = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}${CURRENCIES[currency]}${whole}.${pad(abs % 100)}`;
}

// A weight in kilograms with at most one decimal place, between 20 and 500.
export function parseWeightKg(input: string): number | null {
  const t = input.trim().replace(',', '.');
  if (!/^\d{2,3}(\.\d)?$/.test(t)) return null;
  const v = Number(t);
  return v >= 20 && v < 500 ? v : null;
}

// ── Monthly sheets ───────────────────────────────────────────────────────────────────────────
export type MonthRow = { month: number; income: number; expenses: number; profit: number; margin: number | null };

export function monthlyBreakdown(entries: FinanceEntry[], year: number): MonthRow[] {
  const rows: MonthRow[] = Array.from({ length: 12 }, (_, i) => ({ month: i, income: 0, expenses: 0, profit: 0, margin: null }));
  for (const e of entries) {
    if (!isValidIsoDate(e.entry_date) || Number(e.entry_date.slice(0, 4)) !== year) continue;
    const m = Number(e.entry_date.slice(5, 7)) - 1;
    if (e.kind === 'income') rows[m].income += e.amount_cents;
    else rows[m].expenses += e.amount_cents;
  }
  for (const r of rows) {
    r.profit = r.income - r.expenses;
    r.margin = r.income > 0 ? Math.round((r.profit / r.income) * 1000) / 10 : null; // profit as a share of income, to one decimal place
  }
  return rows;
}

export function yearTotals(rows: MonthRow[]): MonthRow & { label: string } {
  const income = rows.reduce((a, r) => a + r.income, 0);
  const expenses = rows.reduce((a, r) => a + r.expenses, 0);
  const profit = income - expenses;
  return { label: 'Year', month: -1, income, expenses, profit, margin: income > 0 ? Math.round((profit / income) * 1000) / 10 : null };
}

export function entriesForMonth(entries: FinanceEntry[], year: number, month: number): FinanceEntry[] {
  const prefix = `${year}-${pad(month + 1)}-`;
  return entries.filter((e) => e.entry_date.startsWith(prefix)).sort((a, b) => (a.entry_date < b.entry_date ? 1 : a.entry_date > b.entry_date ? -1 : 0));
}

// ── Export (CSV that opens safely in Excel, Numbers and Google Sheets) ──────────────────────────
// A cell that starts with = + - @ could be run as a formula when the file is opened, so it is prefixed with an apostrophe.
export function csvCell(v: string | number | boolean | null | undefined): string {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: (string | number | boolean | null | undefined)[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
}

export function clientsCsv(clients: TrainerClient[], today: string): string {
  return toCsv(
    ['Client', 'Status', 'Package', 'Start date', 'Check-in day', 'Payment due date', 'Payment', 'Notes'],
    clients.map((c) => [c.name, c.status, c.package_name, c.start_date, c.check_in_day === null ? '' : WEEKDAYS[c.check_in_day], c.payment_due_date, effectivePayment(c, today), c.notes])
  );
}

export function checkInsCsv(items: TrainerCheckIn[], clients: TrainerClient[]): string {
  const name = new Map(clients.map((c) => [c.id, c.name]));
  return toCsv(
    ['Date', 'Client', 'Status', 'Photos submitted', 'Weight (kg)', 'Coach feedback', 'Notes'],
    sortCheckIns(items).map((k) => [k.checkin_date, name.get(k.client_id) ?? '', k.status === 'done' ? 'Done' : 'To do', k.photos_submitted ? 'Yes' : 'No', k.weight_kg, k.coach_feedback, k.notes])
  );
}

export function financeCsv(entries: FinanceEntry[], year: number): string {
  const rows = entries.filter((e) => e.entry_date.startsWith(`${year}-`)).sort((a, b) => (a.entry_date < b.entry_date ? -1 : a.entry_date > b.entry_date ? 1 : 0));
  return toCsv(['Date', 'Type', 'Category', 'Description', 'Amount'], rows.map((e) => [e.entry_date, e.kind === 'income' ? 'Income' : 'Expense', e.category, e.description, (e.amount_cents / 100).toFixed(2)]));
}
