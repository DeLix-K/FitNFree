import { supabase } from './supabase';
import type { FinanceEntry, TrainerCheckIn, TrainerClient } from './trainerTools';

// Database calls for Trainer Tools. Every table is private to the signed-in trainer (see supabase/trainer_tools.sql), so there is
// no filtering by trainer here: the database only ever returns the caller's own rows, and refuses writes to anyone else's.

const CLIENT_COLUMNS = 'id, name, status, package_name, start_date, check_in_day, payment_due_date, payment_status, notes';
const CHECKIN_COLUMNS = 'id, client_id, checkin_date, status, photos_submitted, weight_kg, coach_feedback, notes';
const FINANCE_COLUMNS = 'id, entry_date, kind, category, description, amount_cents';

function fail(error: { message: string }): never {
  // The one limit message is meant to be read; anything else is shown plainly.
  if (error.message.includes('trainer_tools_limit')) throw new Error('You have reached the limit for this list. Delete some old entries first.');
  throw new Error(error.message);
}

export type ClientInput = Omit<TrainerClient, 'id'>;
export type CheckInInput = Omit<TrainerCheckIn, 'id'>;
export type FinanceInput = Omit<FinanceEntry, 'id'>;

export async function fetchClients(): Promise<TrainerClient[]> {
  const { data, error } = await supabase.from('trainer_clients').select(CLIENT_COLUMNS).order('created_at', { ascending: true }).limit(300);
  if (error) fail(error);
  return (data ?? []) as TrainerClient[];
}

export async function saveClient(id: string | null, input: ClientInput): Promise<void> {
  const { error } = id ? await supabase.from('trainer_clients').update(input).eq('id', id) : await supabase.from('trainer_clients').insert(input);
  if (error) fail(error);
}

export async function deleteClient(id: string): Promise<void> {
  const { error } = await supabase.from('trainer_clients').delete().eq('id', id);
  if (error) fail(error);
}

export async function fetchCheckIns(): Promise<TrainerCheckIn[]> {
  const { data, error } = await supabase.from('trainer_checkins').select(CHECKIN_COLUMNS).order('checkin_date', { ascending: false }).limit(1000);
  if (error) fail(error);
  return ((data ?? []) as (Omit<TrainerCheckIn, 'weight_kg'> & { weight_kg: number | string | null })[]).map((r) => ({ ...r, weight_kg: r.weight_kg === null ? null : Number(r.weight_kg) }));
}

export async function saveCheckIn(id: string | null, input: CheckInInput): Promise<void> {
  const { error } = id ? await supabase.from('trainer_checkins').update(input).eq('id', id) : await supabase.from('trainer_checkins').insert(input);
  if (error) fail(error);
}

export async function deleteCheckIn(id: string): Promise<void> {
  const { error } = await supabase.from('trainer_checkins').delete().eq('id', id);
  if (error) fail(error);
}

export async function fetchFinance(year: number): Promise<FinanceEntry[]> {
  const { data, error } = await supabase
    .from('trainer_finance_entries')
    .select(FINANCE_COLUMNS)
    .gte('entry_date', `${year}-01-01`)
    .lte('entry_date', `${year}-12-31`)
    .order('entry_date', { ascending: false })
    .limit(5000);
  if (error) fail(error);
  return ((data ?? []) as (Omit<FinanceEntry, 'amount_cents'> & { amount_cents: number | string })[]).map((r) => ({ ...r, amount_cents: Number(r.amount_cents) }));
}

export async function saveFinance(id: string | null, input: FinanceInput): Promise<void> {
  const { error } = id ? await supabase.from('trainer_finance_entries').update(input).eq('id', id) : await supabase.from('trainer_finance_entries').insert(input);
  if (error) fail(error);
}

export async function deleteFinance(id: string): Promise<void> {
  const { error } = await supabase.from('trainer_finance_entries').delete().eq('id', id);
  if (error) fail(error);
}

// The set of calls the screens use. The screens take this as a prop (defaulting to the real database), so they can be shown with
// in-memory data without a sign-in.
export type ToolsApi = {
  fetchClients: () => Promise<TrainerClient[]>;
  saveClient: (id: string | null, input: ClientInput) => Promise<void>;
  deleteClient: (id: string) => Promise<void>;
  fetchCheckIns: () => Promise<TrainerCheckIn[]>;
  saveCheckIn: (id: string | null, input: CheckInInput) => Promise<void>;
  deleteCheckIn: (id: string) => Promise<void>;
  fetchFinance: (year: number) => Promise<FinanceEntry[]>;
  saveFinance: (id: string | null, input: FinanceInput) => Promise<void>;
  deleteFinance: (id: string) => Promise<void>;
};

export const realApi: ToolsApi = { fetchClients, saveClient, deleteClient, fetchCheckIns, saveCheckIn, deleteCheckIn, fetchFinance, saveFinance, deleteFinance };
