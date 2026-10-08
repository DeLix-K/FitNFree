import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

// App Review Guideline 5.1.2(i): before personal data is shared with a
// third-party AI, the app has to say so clearly and get explicit permission.
// Every AI feature goes through askClaude() (lib/claude.ts), which calls
// ensureAiConsent() first, so one gate covers all of them. The permission is
// stored per signed-in person on this device, and can be withdrawn in
// Profile.

const KEY_PREFIX = 'fitnfree.aiConsent.v1.';

export const AI_DECLINED_MESSAGE =
  'AI features are turned off. Switch on "AI data sharing" in Profile to use them.';

type Presenter = (decide: (granted: boolean) => void) => void;

let presenter: Presenter | null = null;
let inFlight: Promise<boolean> | null = null;
// Remembered for this app session even if device storage fails, so a person who
// said yes isn't asked again on every card, and one who said "Not now" isn't
// pestered by every AI card that loads. They can still switch it on in Profile.
const grantedThisSession = new Set<string>();
const declinedThisSession = new Set<string>();

export function registerAiConsentPresenter(next: Presenter): () => void {
  presenter = next;
  return () => {
    if (presenter === next) presenter = null;
  };
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

export async function hasAiConsent(): Promise<boolean> {
  const id = await currentUserId();
  if (!id) return false;
  if (grantedThisSession.has(id)) return true;
  try {
    return (await AsyncStorage.getItem(KEY_PREFIX + id)) === 'granted';
  } catch {
    return false;
  }
}

export async function setAiConsent(granted: boolean): Promise<void> {
  const id = await currentUserId();
  if (!id) return;
  if (granted) {
    grantedThisSession.add(id);
    declinedThisSession.delete(id);
  } else {
    grantedThisSession.delete(id);
    declinedThisSession.add(id);
  }
  try {
    if (granted) await AsyncStorage.setItem(KEY_PREFIX + id, 'granted');
    else await AsyncStorage.removeItem(KEY_PREFIX + id);
  } catch {
    // Storage unavailable: the in-memory choice above still applies this session.
  }
}

async function askForConsent(): Promise<boolean> {
  if (!presenter) {
    // Fail closed: never send personal data to the AI without the permission screen.
    throw new Error('The permission screen is not available. Please restart the app and try again.');
  }
  const show = presenter;
  const granted = await new Promise<boolean>((resolve) => show(resolve));
  await setAiConsent(granted);
  return granted;
}

// Resolves if the person has allowed AI data sharing (asking them first if they
// haven't decided). Throws AI_DECLINED_MESSAGE if they haven't allowed it.
export async function ensureAiConsent(): Promise<void> {
  const id = await currentUserId();
  if (!id) return; // Not signed in: the backend call rejects on its own.
  if (await hasAiConsent()) return;
  if (declinedThisSession.has(id)) throw new Error(AI_DECLINED_MESSAGE);

  // Several AI cards can load at once; they must share one question.
  if (!inFlight) {
    inFlight = askForConsent().finally(() => {
      inFlight = null;
    });
  }
  const granted = await inFlight;
  if (!granted) throw new Error(AI_DECLINED_MESSAGE);
}
