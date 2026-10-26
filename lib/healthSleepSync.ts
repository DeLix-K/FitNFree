import AsyncStorage from '@react-native-async-storage/async-storage';
import { localDate, planSleepWrites, sleepNights } from './healthSummary';
import type { HealthSource } from './healthTypes';
import { supabase } from './supabase';

// Two switches, both off until the person turns them on, both kept only on this device:
//  - "connected": they have used the Connect button, so the card reads Health when it opens.
//  - "sleep import": copy their sleep nights from Apple Health into their FitNFree sleep log (a database row per night, theirs alone).
// Everything else read from Health (steps, workouts, heart rate, weight) is shown on the phone and never uploaded.

const CONNECTED_KEY = 'fitnfree.health.connected.v1';
const SLEEP_IMPORT_KEY = 'fitnfree.health.sleepImport.v1';

export async function getHealthPrefs(): Promise<{ connected: boolean; sleepImport: boolean }> {
  try {
    const [c, s] = await Promise.all([AsyncStorage.getItem(CONNECTED_KEY), AsyncStorage.getItem(SLEEP_IMPORT_KEY)]);
    return { connected: c === '1', sleepImport: s === '1' };
  } catch {
    return { connected: false, sleepImport: false };
  }
}

export async function setHealthConnected(on: boolean): Promise<void> {
  try {
    if (on) await AsyncStorage.setItem(CONNECTED_KEY, '1');
    else await AsyncStorage.multiRemove([CONNECTED_KEY, SLEEP_IMPORT_KEY]);
  } catch {
    /* the choice just is not remembered */
  }
}

export async function setSleepImport(on: boolean): Promise<void> {
  try {
    if (on) await AsyncStorage.setItem(SLEEP_IMPORT_KEY, '1');
    else await AsyncStorage.removeItem(SLEEP_IMPORT_KEY);
  } catch {
    /* the choice just is not remembered */
  }
}

export type SleepImportResult = { nights: number; imported: number; skipped: number };

// Reads the last `days` nights from Health and adds the ones that are missing from the sleep log. Never overwrites a night the person logged by hand
// or that came from Oura. Safe to run again: nights already imported from Health are simply refreshed.
export async function importSleepFromHealth(source: HealthSource, days = 14): Promise<SleepImportResult> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error('Not signed in.');

  const samples = await source.sleepSamples(days + 1);
  const since = localDate(new Date(Date.now() - days * 86_400_000));
  const nights = sleepNights(samples).filter((n) => n.sleepDate >= since);
  if (nights.length === 0) return { nights: 0, imported: 0, skipped: 0 };

  const { data: existing, error: readError } = await supabase.from('sleep_logs').select('sleep_date, source').gte('sleep_date', since);
  if (readError) throw new Error(readError.message);

  const { write, skipped } = planSleepWrites(nights, existing ?? []);
  if (write.length > 0) {
    const { error } = await supabase.from('sleep_logs').upsert(
      write.map((r) => ({ ...r, user_id: userId })),
      { onConflict: 'user_id,sleep_date' }
    );
    if (error) throw new Error(error.message);
  }
  return { nights: nights.length, imported: write.length, skipped };
}

// Removes only the nights that came from Apple Health. Nights logged by hand or from Oura are untouched.
export async function deleteImportedSleep(): Promise<number> {
  const { data, error } = await supabase.from('sleep_logs').delete().eq('source', 'apple_health').select('id');
  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}
