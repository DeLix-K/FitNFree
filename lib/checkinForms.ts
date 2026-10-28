// The rules behind client check-in forms. Pure functions with no imports, so they can be tested on their own (scripts/test-checkin-forms.mjs).
// The database enforces the same limits (supabase/client_checkins.sql); checking here as well lets the screens give a plain message before anything is sent.

export type QuestionType = 'number' | 'scale' | 'yesno' | 'choice' | 'text';

export type Question = {
  id: string;
  label: string;
  type: QuestionType;
  unit?: string;
  min?: number; // numbers
  max?: number; // numbers and scales
  options?: string[]; // choices
  hint?: string; // shown under the question; not stored
};

export type CustomQuestion = { id: string; label: string; type: QuestionType; options?: string[]; unit?: string; max?: number };
export type FormDef = { title: string; intro: string | null; standard: string[]; custom: CustomQuestion[] };

export const LIMITS = { title: 60, intro: 300, custom: 10, label: 120, optionsMin: 2, optionsMax: 8, option: 40, unit: 12, text: 1000, feedback: 1000, labelClient: 80, invitesOpen: 50 } as const;
export const SCALE_MAXES = [5, 10] as const;

const ADHERENCE = ['All of it', 'Most of it', 'Some of it', 'Hardly any'];

// The standard questions, in the order they appear. A copy of checkin_standard_catalog() in the SQL file (a test compares the two).
export const STANDARD_QUESTIONS: Question[] = [
  { id: 'weight', label: 'Body weight', type: 'number', unit: 'kg', min: 20, max: 500, hint: 'In kilograms.' },
  { id: 'energy', label: 'Energy levels', type: 'scale', max: 5, hint: '1 = very low, 5 = very high' },
  { id: 'sleep', label: 'Sleep quality', type: 'scale', max: 5, hint: '1 = very poor, 5 = very good' },
  { id: 'stress', label: 'Stress levels', type: 'scale', max: 5, hint: '1 = very low, 5 = very high' },
  { id: 'soreness', label: 'Muscle soreness', type: 'scale', max: 5, hint: '1 = none, 5 = very sore' },
  { id: 'training', label: 'How much of your training plan did you do?', type: 'choice', options: ADHERENCE },
  { id: 'nutrition', label: 'How closely did you follow your nutrition plan?', type: 'choice', options: ADHERENCE },
  { id: 'wins', label: 'Wins this week', type: 'text' },
  { id: 'struggles', label: 'What was hard this week?', type: 'text' },
  { id: 'questions', label: 'Questions for your coach', type: 'text' },
];
export const STANDARD_IDS = STANDARD_QUESTIONS.map((q) => q.id);
const STANDARD_SET = new Set(STANDARD_IDS);

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = { text: 'Written answer', number: 'Number', scale: 'Scale', yesno: 'Yes / No', choice: 'Pick one' };
export const CUSTOM_TYPES: QuestionType[] = ['text', 'number', 'scale', 'yesno', 'choice'];

export const DEFAULT_FORM: FormDef = { title: 'Weekly check-in', intro: null, standard: ['weight', 'energy', 'sleep', 'stress', 'training', 'nutrition', 'wins', 'struggles', 'questions'], custom: [] };

// ── A trainer's form ──────────────────────────────────────────────────────────────────────────────────
const ID_RE = /^[a-z][a-z0-9_]{0,19}$/;
const len = (s: string): number => Array.from(s).length; // counts characters the way the database does, not UTF-16 units

// Trims the text fields, drops an empty intro, and removes fields a type does not use, so what is saved is what the database accepts.
export function normalizeForm(def: FormDef): FormDef {
  return {
    title: def.title.trim(),
    intro: def.intro && def.intro.trim() ? def.intro.trim() : null,
    standard: STANDARD_IDS.filter((id) => def.standard.includes(id)),
    custom: def.custom.map((q) => {
      const out: CustomQuestion = { id: q.id, label: q.label.trim(), type: q.type };
      if (q.type === 'choice') out.options = (q.options ?? []).map((o) => o.trim()).filter((o) => o !== '');
      if (q.type === 'number' && q.unit && q.unit.trim()) out.unit = q.unit.trim();
      if (q.type === 'scale') out.max = q.max === 10 ? 10 : 5;
      return out;
    }),
  };
}

// Plain-language problems with a form (empty list = fine). Mirrors checkin_form_validate() in the SQL.
export function validateForm(raw: FormDef): string[] {
  const def = normalizeForm(raw);
  const errors: string[] = [];
  if (len(def.title) < 1 || len(def.title) > LIMITS.title) errors.push(`Give the form a title of up to ${LIMITS.title} characters.`);
  if (def.intro !== null && len(def.intro) > LIMITS.intro) errors.push(`The introduction can be up to ${LIMITS.intro} characters.`);
  if (raw.standard.some((id) => !STANDARD_SET.has(id))) errors.push('A standard question is not recognised.');
  if (def.custom.length > LIMITS.custom) errors.push(`You can add up to ${LIMITS.custom} questions of your own.`);
  if (def.standard.length + def.custom.length < 1) errors.push('Add at least one question.');
  const seen = new Set<string>(def.standard);
  def.custom.forEach((q, i) => {
    const name = `Question ${i + 1}`;
    if (!ID_RE.test(q.id) || STANDARD_SET.has(q.id) || seen.has(q.id)) errors.push(`${name} has a clashing id.`);
    seen.add(q.id);
    if (len(q.label) < 1) errors.push(`${name} needs some text.`);
    else if (len(q.label) > LIMITS.label) errors.push(`${name} can be up to ${LIMITS.label} characters.`);
    if (!CUSTOM_TYPES.includes(q.type)) errors.push(`${name} has an unknown type.`);
    if (q.type === 'choice') {
      const o = q.options ?? [];
      if (o.length < LIMITS.optionsMin || o.length > LIMITS.optionsMax) errors.push(`${name} needs ${LIMITS.optionsMin} to ${LIMITS.optionsMax} options.`);
      else if (new Set(o).size !== o.length) errors.push(`${name} has the same option twice.`);
      else if (o.some((x) => len(x) > LIMITS.option)) errors.push(`An option in ${name} can be up to ${LIMITS.option} characters.`);
    }
    if (q.type === 'number' && q.unit && len(q.unit) > LIMITS.unit) errors.push(`The unit in ${name} can be up to ${LIMITS.unit} characters.`);
  });
  return errors;
}

// An unused id for a new question of the trainer's own ("q1", "q2", ...).
export function newCustomId(used: string[]): string {
  const taken = new Set([...used, ...STANDARD_IDS]);
  for (let i = 1; i < 100; i++) if (!taken.has(`q${i}`)) return `q${i}`;
  return `q${Date.now() % 1000000}`;
}

// The full ordered question list of a form: standard questions in their fixed order, then the trainer's own. Mirrors checkin_form_questions().
export function questionsOf(def: Pick<FormDef, 'standard' | 'custom'>): Question[] {
  const standard = STANDARD_QUESTIONS.filter((q) => def.standard.includes(q.id));
  const custom: Question[] = def.custom.map((q) => ({ ...q }));
  return [...standard, ...custom];
}

// ── A client's answers ────────────────────────────────────────────────────────────────────────────────
export type Answer = number | string | boolean;
export type Answers = Record<string, Answer>;
// What the form holds while it is being filled in: text boxes hold text, the rest hold their value or nothing.
export type Draft = Record<string, string | number | boolean | null | undefined>;

// "82,4", " 82.4 " and "82.4 kg" are all fine; anything else that is not a plain number is not.
export function parseNumber(input: string): number | null {
  const s = input.trim().replace(/\s*(kg|kgs)$/i, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export type CleanResult = { ok: true; answers: Answers } | { ok: false; errors: Record<string, string>; message: string };

// Turns what was typed into what is sent, and says what is wrong in plain words. Unanswered questions are left out: nothing is required.
export function cleanAnswers(questions: Question[], draft: Draft): CleanResult {
  const answers: Answers = {};
  const errors: Record<string, string> = {};
  for (const q of questions) {
    const v = draft[q.id];
    if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) continue;
    switch (q.type) {
      case 'number': {
        const n = typeof v === 'number' ? v : typeof v === 'string' ? parseNumber(v) : null;
        const lo = q.min ?? -1_000_000;
        const hi = q.max ?? 1_000_000;
        if (n === null) errors[q.id] = 'Enter a number.';
        else if (n < lo || n > hi) errors[q.id] = q.min !== undefined ? `Enter a number between ${lo} and ${hi}.` : 'That number is too large.';
        else answers[q.id] = Math.round(n * 100) / 100;
        break;
      }
      case 'scale':
        if (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= (q.max ?? 5)) answers[q.id] = v;
        else errors[q.id] = `Pick a number from 1 to ${q.max ?? 5}.`;
        break;
      case 'yesno':
        if (typeof v === 'boolean') answers[q.id] = v;
        else errors[q.id] = 'Pick yes or no.';
        break;
      case 'choice':
        if (typeof v === 'string' && (q.options ?? []).includes(v)) answers[q.id] = v;
        else errors[q.id] = 'Pick one of the options.';
        break;
      case 'text': {
        const s = typeof v === 'string' ? v.trim() : null;
        if (s === null) errors[q.id] = 'Enter some text.';
        else if (len(s) > LIMITS.text) errors[q.id] = `Please keep this under ${LIMITS.text} characters.`;
        else answers[q.id] = s;
        break;
      }
    }
  }
  if (Object.keys(errors).length) return { ok: false, errors, message: 'Please fix the highlighted answers.' };
  if (Object.keys(answers).length === 0) return { ok: false, errors: {}, message: 'Answer at least one question before sending.' };
  return { ok: true, answers };
}

export function formatAnswer(q: Pick<Question, 'type' | 'unit' | 'max'>, value: unknown): string {
  if (value === null || value === undefined) return '';
  switch (q.type) {
    case 'scale':
      return `${value} / ${q.max ?? 5}`;
    case 'yesno':
      return value === true ? 'Yes' : value === false ? 'No' : '';
    case 'number':
      return q.unit ? `${value} ${q.unit}` : String(value);
    default:
      return String(value);
  }
}

export type SubmissionForm = { title: string; questions: Question[] };
export type Submission = {
  id: string;
  link_id: string;
  form: SubmissionForm;
  answers: Record<string, unknown>;
  submitted_at: string;
  read_at: string | null;
  trainer_feedback: string | null;
  feedback_at: string | null;
};

// The questions that were answered, in form order, with the answers written out. Uses the copy of the questions saved with the check-in,
// so a later edit to the form never changes how an old check-in reads.
export function answerRows(s: Pick<Submission, 'form' | 'answers'>): { id: string; label: string; value: string; type: QuestionType }[] {
  const out: { id: string; label: string; value: string; type: QuestionType }[] = [];
  for (const q of s.form?.questions ?? []) {
    if (!(q.id in (s.answers ?? {}))) continue;
    const value = formatAnswer(q, s.answers[q.id]);
    if (value !== '') out.push({ id: q.id, label: q.label, value, type: q.type });
  }
  return out;
}

export const unreadCount = (subs: Pick<Submission, 'read_at'>[]): number => subs.filter((s) => s.read_at === null).length;

// Newest first.
export const newestFirst = <T extends { submitted_at: string }>(subs: T[]): T[] => [...subs].sort((a, b) => (a.submitted_at < b.submitted_at ? 1 : a.submitted_at > b.submitted_at ? -1 : 0));

// ── Links and invite codes ────────────────────────────────────────────────────────────────────────────
export type LinkStatus = 'invited' | 'active' | 'ended';
export type Link = {
  id: string;
  label: string;
  status: LinkStatus;
  tracked_client_id: string | null;
  code_expires_at: string | null;
  created_at: string;
  accepted_at: string | null;
  ended_at: string | null;
  ended_by_role: 'trainer' | 'client' | null;
};
export type MyLink = { link_id: string; trainer_user_id: string; trainer_name: string; accepted_at: string; last_submitted_at: string | null; form_ready: boolean };

export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// "abcd-efgh", " ABCD EFGH " -> "ABCDEFGH"
export const normalizeCode = (input: string): string => input.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
export const isCompleteCode = (input: string): boolean => {
  const c = normalizeCode(input);
  return c.length === 8 && [...c].every((ch) => CODE_ALPHABET.includes(ch));
};
// "ABCDEFGH" -> "ABCD-EFGH", for reading out and typing in.
export const formatCode = (code: string): string => {
  const c = normalizeCode(code);
  return c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
};

export type InviteState = { kind: 'waiting'; daysLeft: number } | { kind: 'expired' } | { kind: 'active' } | { kind: 'ended' };
export function inviteState(link: Pick<Link, 'status' | 'code_expires_at'>, nowMs: number): InviteState {
  if (link.status === 'active') return { kind: 'active' };
  if (link.status === 'ended') return { kind: 'ended' };
  const exp = link.code_expires_at ? Date.parse(link.code_expires_at) : NaN;
  if (!Number.isFinite(exp) || exp <= nowMs) return { kind: 'expired' };
  return { kind: 'waiting', daysLeft: Math.max(1, Math.ceil((exp - nowMs) / 86_400_000)) };
}

// ── Messages ──────────────────────────────────────────────────────────────────────────────────────────
const KNOWN: [RegExp, string][] = [
  [/not_a_trainer/, 'Only trainers can do this.'],
  [/invalid_label/, 'Enter a name for the client (1 to 80 characters).'],
  [/invalid_client/, 'That client could not be found.'],
  [/link_limit/, 'You have reached the limit of clients linked to check-ins. End some links you no longer need.'],
  [/too_many_invites/, 'You have too many unused invites. Withdraw some, or wait for them to expire.'],
  [/link_not_found/, 'That link has already ended.'],
  [/link_not_active/, 'You are no longer linked to this trainer.'],
  [/no_form/, 'Your trainer has not set up a check-in form yet.'],
  [/checkin_rate_limit/, 'You have sent a lot of check-ins today. Please try again tomorrow.'],
  [/checkin_limit/, 'You have reached the limit of check-ins for this trainer.'],
  [/checkin_empty/, 'Answer at least one question before sending.'],
  [/submission_not_found/, 'That check-in is no longer available.'],
  [/feedback_too_long/, `Feedback can be up to ${LIMITS.feedback} characters.`],
  [/not_signed_in/, 'Please sign in again.'],
];

export function friendlyError(message: string): string {
  const detail = message.match(/checkin_(?:form_)?invalid: (.*)$/);
  if (detail) return detail[1].charAt(0).toUpperCase() + detail[1].slice(1) + (/[.!?]$/.test(detail[1]) ? '' : '.');
  for (const [re, text] of KNOWN) if (re.test(message)) return text;
  return message;
}

export function redeemMessage(error: string): string {
  switch (error) {
    case 'invalid_code':
      return 'That code did not work. Check it with your trainer: codes are used once and last 7 days.';
    case 'too_many_attempts':
      return 'Too many tries. Please wait an hour and try again.';
    case 'own_invite':
      return 'That is your own invite code. Send it to your client instead.';
    case 'already_linked':
      return 'You are already linked to this trainer.';
    default:
      return 'That code could not be used.';
  }
}
