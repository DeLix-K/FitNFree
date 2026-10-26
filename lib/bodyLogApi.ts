import { supabase } from './supabase';
import { fetchBodyStats, updateBodyStats } from './profile';
import type { BodyEntry } from './bodyLog';

// Database calls for the body log. The table is private to each person (see supabase/body_log.sql): the database only ever returns the
// caller's own rows and refuses writes to anyone else's, so nothing here filters by user. Progress photos are NOT here; they stay on the phone.

const COLUMNS = 'id, logged_date, weight_kg, waist_cm, chest_cm, hips_cm, thigh_cm, arm_cm, body_fat_pct, notes';

export type BodyEntryInput = Omit<BodyEntry, 'id'>;

function fail(error: { message: string; code?: string }): never {
  if (error.message.includes('body_log_limit')) throw new Error('You have reached the limit of 5000 entries. Delete some old ones first.');
  if (error.code === '23505' || /duplicate key/i.test(error.message)) throw new Error('You already have an entry for that day. Open it from the list to change it.');
  throw new Error(error.message);
}

const num = (v: number | string | null): number | null => (v === null || v === undefined ? null : Number(v));

export async function fetchEntries(): Promise<BodyEntry[]> {
  const { data, error } = await supabase.from('body_log').select(COLUMNS).order('logged_date', { ascending: false }).limit(5000);
  if (error) fail(error);
  type Row = { [K in keyof BodyEntry]: BodyEntry[K] | string };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id as string,
    logged_date: r.logged_date as string,
    weight_kg: num(r.weight_kg as number | string | null),
    waist_cm: num(r.waist_cm as number | string | null),
    chest_cm: num(r.chest_cm as number | string | null),
    hips_cm: num(r.hips_cm as number | string | null),
    thigh_cm: num(r.thigh_cm as number | string | null),
    arm_cm: num(r.arm_cm as number | string | null),
    body_fat_pct: num(r.body_fat_pct as number | string | null),
    notes: (r.notes as string | null) ?? null,
  }));
}

// A new entry for a day replaces any entry already there (one row per day). Editing an existing row changes that row, and refuses a date that
// another row already has. Every column is always sent, so a value that was cleared really is cleared.
export async function saveEntry(id: string | null, input: BodyEntryInput): Promise<void> {
  const { error } = id
    ? await supabase.from('body_log').update(input).eq('id', id)
    : await supabase.from('body_log').upsert(input, { onConflict: 'user_id,logged_date' });
  if (error) fail(error);
}

export async function deleteEntry(id: string): Promise<void> {
  const { error } = await supabase.from('body_log').delete().eq('id', id);
  if (error) fail(error);
}

// Optional: copy a weight into the profile, which the calorie targets are worked out from. Never done unless the person asks for it on the form.
export async function syncProfileWeight(kg: number): Promise<void> {
  const stats = await fetchBodyStats();
  if (!stats) return;
  await updateBodyStats({ ...stats, weight_kg: kg });
}

// The set of calls the screen uses. The screen takes this as a prop (defaulting to the real database), so it can be shown with in-memory data.
export type BodyApi = {
  fetchEntries: () => Promise<BodyEntry[]>;
  saveEntry: (id: string | null, input: BodyEntryInput) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
  syncProfileWeight: (kg: number) => Promise<void>;
};

export const realBodyApi: BodyApi = { fetchEntries, saveEntry, deleteEntry, syncProfileWeight };
