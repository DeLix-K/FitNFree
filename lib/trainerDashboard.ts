import { assertCleanText } from './contentFilter';
import { getCheckoutRedirectUrl, openCheckoutUrl } from './checkout';
import { supabase } from './supabase';
import type {
  CoachingStyle,
  SlotType,
  TrainerFormReview,
  TrainerOrderView,
  TrainerProfile,
  TrainerSessionPackage,
  TrainerTimeSlot,
  TrainingFormat,
} from './types';

async function invoke<T>(name: string, body?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T & { error?: string }>(name, {
    body: body ?? {},
  });

  if (error) {
    const context = (error as { context?: Response }).context;
    let detailedMessage: string | undefined;
    if (context) {
      try {
        const errorBody = await context.clone().json();
        if (errorBody?.error) detailedMessage = errorBody.error;
      } catch {
        // fall through
      }
    }
    throw new Error(detailedMessage ?? error.message);
  }

  if (data?.error) throw new Error(data.error);
  return data as T;
}

export async function fetchMyTrainerProfile(): Promise<TrainerProfile | null> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return null;

  // Via a function, because the private columns (Stripe account, default call
  // link) are not readable straight from the table -- only by their owner.
  const { data, error } = await supabase.rpc('my_trainer_profile').maybeSingle();

  if (error) throw new Error(error.message);
  return data as TrainerProfile | null;
}

export async function fetchMyOrdersAsTrainer(): Promise<TrainerOrderView[]> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return [];

  const { data, error } = await supabase
    .from('trainer_order_view')
    .select('*')
    .eq('trainer_user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function startTrainerOnboarding(): Promise<{ payoutsEnabled: boolean }> {
  const returnUrl = getCheckoutRedirectUrl();

  const { url, payoutsEnabled } = await invoke<{ url?: string; payoutsEnabled: boolean }>(
    'trainer-connect-onboarding',
    { returnUrl }
  );

  if (!url) throw new Error('Stripe did not return an onboarding URL.');

  if (!payoutsEnabled) {
    await openCheckoutUrl(url);
  }

  return { payoutsEnabled };
}

export async function submitTrainerProfile(params: {
  displayName: string;
  bio: string;
  specialty: string;
  priceCents: number;
  introVideoUrl?: string | null;
  trainingFormat?: TrainingFormat[];
  locationText?: string;
  defaultVideoCallLink?: string | null;
  coachingStyle?: CoachingStyle | null;
}): Promise<void> {
  assertCleanText('Your display name', params.displayName);
  assertCleanText('Your bio', params.bio);
  assertCleanText('Your specialty', params.specialty);
  await invoke('trainer-signup', params);
}

export async function deliverPlan(params: {
  orderId: string;
  planName: string;
  planDescription: string;
  items: { exerciseId: string; sets: number | null; reps: number | null; notes: string }[];
}): Promise<void> {
  await invoke('trainer-deliver-plan', params);
}

// ─────────────────────────────────────────────
// Trainer-side availability management. Direct table writes work here
// (unlike trainer_profiles) because trainer_time_slots' RLS already lets a
// trainer manage rows where trainer_user_id = auth.uid() -- no admin-only
// lockdown, no Edge Function needed.
// ─────────────────────────────────────────────
export async function createTimeSlot(params: { startsAt: string; durationMinutes: number; slotType: SlotType }): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error('Not signed in.');

  // Snapshot the trainer's current default call link onto the slot, so a
  // later profile edit never silently changes a client's already-booked
  // meeting link.
  const { data: profile } = await supabase.rpc('my_trainer_profile').maybeSingle();

  const { error } = await supabase.from('trainer_time_slots').insert({
    trainer_user_id: userId,
    starts_at: params.startsAt,
    duration_minutes: params.durationMinutes,
    slot_type: params.slotType,
    video_call_link: (profile as { default_video_call_link: string | null } | null)?.default_video_call_link ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function fetchMySlots(): Promise<{ slots: TrainerTimeSlot[]; bookedNames: Map<string, string> }> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return { slots: [], bookedNames: new Map() };

  const { data, error } = await supabase
    .from('trainer_time_slots')
    .select('*')
    .eq('trainer_user_id', userId)
    .order('starts_at', { ascending: true });
  if (error) throw new Error(error.message);

  const slots = (data ?? []) as TrainerTimeSlot[];
  const bookedIds = [...new Set(slots.map((s) => s.booked_by_user_id).filter((id): id is string => !!id))];
  const bookedNames = new Map<string, string>();
  if (bookedIds.length > 0) {
    const { data: profiles } = await supabase.from('profiles').select('id, display_name').in('id', bookedIds);
    for (const p of (profiles ?? []) as { id: string; display_name: string | null }[]) {
      bookedNames.set(p.id, p.display_name || 'Client');
    }
  }
  return { slots, bookedNames };
}

export async function deleteSlot(slotId: string): Promise<void> {
  const { error } = await supabase.from('trainer_time_slots').delete().eq('id', slotId);
  if (error) throw new Error(error.message);
}

// ─────────────────────────────────────────────
// Trainer-side session package management. Direct table writes work here
// (unlike trainer_profiles) -- trainer_session_packages' RLS already lets a
// trainer manage rows where trainer_user_id = auth.uid(), no admin-only
// lockdown, no Edge Function needed.
// ─────────────────────────────────────────────
export async function fetchMyPackages(): Promise<TrainerSessionPackage[]> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return [];

  const { data, error } = await supabase
    .from('trainer_session_packages')
    .select('*')
    .eq('trainer_user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createPackage(params: { name: string; sessionCount: number; priceCents: number }): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error('Not signed in.');

  const profile = await fetchMyTrainerProfile();
  if (!profile) throw new Error('Create your trainer profile first.');

  const { error } = await supabase.from('trainer_session_packages').insert({
    trainer_user_id: userId,
    trainer_profile_id: profile.id,
    name: params.name,
    session_count: params.sessionCount,
    price_cents: params.priceCents,
  });
  if (error) throw new Error(error.message);
}

export async function togglePackageActive(packageId: string, active: boolean): Promise<void> {
  const { error } = await supabase.from('trainer_session_packages').update({ active }).eq('id', packageId);
  if (error) throw new Error(error.message);
}

// ─────────────────────────────────────────────
// Trainer-side async form reviews.
// ─────────────────────────────────────────────
export async function fetchMyFormReviewRequests(): Promise<TrainerFormReview[]> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return [];

  const { data, error } = await supabase
    .from('trainer_form_reviews')
    .select('*')
    .eq('trainer_user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function respondToFormReview(id: string, params: { voiceNoteUrl: string | null; comment: string }): Promise<void> {
  const { error } = await supabase
    .from('trainer_form_reviews')
    .update({
      voice_note_url: params.voiceNoteUrl,
      comment: params.comment,
      status: 'reviewed',
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw new Error(error.message);
}
