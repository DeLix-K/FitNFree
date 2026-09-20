import { getCheckoutRedirectUrl, openCheckoutUrl } from './checkout';
import { supabase } from './supabase';
import type {
  OpenTrainerSlot,
  TrainerFormReview,
  TrainerOrderView,
  TrainerProfile,
  TrainerRating,
  TrainerReview,
  TrainerSessionCreditBalance,
  TrainerSessionPackage,
  TrainerTimeSlot,
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

export async function fetchTrainers(): Promise<TrainerProfile[]> {
  const { data, error } = await supabase
    .from('trainer_profiles')
    .select('*')
    .or('payouts_enabled.eq.true,listed_for_chat.eq.true')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchTrainerRatings(): Promise<Map<string, TrainerRating>> {
  const { data, error } = await supabase.from('trainer_rating_view').select('*');
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((r: TrainerRating) => [r.trainer_user_id, r]));
}

export async function fetchTrainerReviews(trainerUserId: string): Promise<TrainerReview[]> {
  const { data, error } = await supabase
    .from('trainer_reviews')
    .select('*')
    .eq('trainer_user_id', trainerUserId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchMyOrdersAsClient(): Promise<TrainerOrderView[]> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return [];

  const { data, error } = await supabase
    .from('trainer_order_view')
    .select('*')
    .eq('client_user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function buyTrainerPlan(trainerProfileId: string): Promise<void> {
  const returnUrl = getCheckoutRedirectUrl();

  const { url } = await invoke<{ url?: string }>('create-trainer-checkout', {
    trainerProfileId,
    successUrl: returnUrl,
    cancelUrl: returnUrl,
  });

  if (!url) throw new Error('Stripe did not return a checkout URL.');

  await openCheckoutUrl(url);
}

export async function fetchMyReviewedOrderIds(): Promise<Set<string>> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return new Set();

  const { data, error } = await supabase.from('trainer_reviews').select('order_id').eq('client_user_id', userId);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((r: { order_id: string }) => r.order_id));
}

// ─────────────────────────────────────────────
// Session Packages: real bundle pricing on the same Stripe Connect setup
// as the custom-plan purchase above -- see trainer_session_packages.sql.
// ─────────────────────────────────────────────
export async function fetchTrainerPackages(trainerUserId: string): Promise<TrainerSessionPackage[]> {
  const { data, error } = await supabase
    .from('trainer_session_packages')
    .select('*')
    .eq('trainer_user_id', trainerUserId)
    .eq('active', true)
    .order('price_cents', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function buyPackage(packageId: string): Promise<void> {
  const returnUrl = getCheckoutRedirectUrl();

  const { url } = await invoke<{ url?: string }>('create-package-checkout', {
    packageId,
    successUrl: returnUrl,
    cancelUrl: returnUrl,
  });

  if (!url) throw new Error('Stripe did not return a checkout URL.');

  await openCheckoutUrl(url);
}

export async function fetchMySessionCredits(): Promise<TrainerSessionCreditBalance[]> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return [];

  const { data, error } = await supabase
    .from('trainer_session_credit_balance')
    .select('*')
    .eq('client_user_id', userId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function submitTrainerReview(orderId: string, rating: number, comment: string): Promise<void> {
  const { error } = await supabase.rpc('submit_trainer_review', {
    p_order_id: orderId,
    p_rating: rating,
    p_comment: comment,
  });
  if (error) throw new Error(error.message);
}

// ─────────────────────────────────────────────
// Real in-app availability booking -- see trainer_overhaul.sql. No
// external calendar sync; slots are explicit instances the trainer creates.
// ─────────────────────────────────────────────
export async function fetchOpenSlots(trainerUserId: string): Promise<OpenTrainerSlot[]> {
  const { data, error } = await supabase
    .from('trainer_open_slots_view')
    .select('*')
    .eq('trainer_user_id', trainerUserId)
    .order('starts_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function bookSlot(slotId: string): Promise<TrainerTimeSlot> {
  const { data, error } = await supabase.rpc('book_trainer_slot', { p_slot_id: slotId });
  if (error) throw new Error(error.message);
  return data;
}

export async function cancelMyBooking(slotId: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_trainer_booking', { p_slot_id: slotId });
  if (error) throw new Error(error.message);
}

export async function fetchMyBookings(): Promise<TrainerTimeSlot[]> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return [];

  const { data, error } = await supabase
    .from('trainer_time_slots')
    .select('*')
    .eq('booked_by_user_id', userId)
    .order('starts_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

// ─────────────────────────────────────────────
// Media uploads: intro reels, form-check videos, voice notes. Video/audio
// pickers and the audio recorder all give a local file URI, never base64
// (only images do) -- upload via fetch(uri) -> blob -> Storage. Works for
// any media type; the mimeType/extension just tag it correctly.
// ─────────────────────────────────────────────
export async function uploadTrainerMedia(uri: string, mimeType: string): Promise<string> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error('Not signed in.');

  const ext = mimeType.split('/')[1] ?? 'mp4';
  const path = `${userId}/${Date.now()}.${ext}`;
  const blob = await (await fetch(uri)).blob();

  const { error } = await supabase.storage.from('trainer-media').upload(path, blob, { contentType: mimeType });
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from('trainer-media').getPublicUrl(path);
  return data.publicUrl;
}

export const uploadTrainerVideo = uploadTrainerMedia;

// ─────────────────────────────────────────────
// Async Form Review (honest version): a real uploaded video + a real
// trainer voice note/text response. No 3D reference model, no automated
// joint-angle detection.
// ─────────────────────────────────────────────
export async function requestFormReview(params: {
  trainerUserId: string;
  exerciseName: string;
  videoUrl: string;
}): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error('Not signed in.');

  const { error } = await supabase.from('trainer_form_reviews').insert({
    trainer_user_id: params.trainerUserId,
    client_user_id: userId,
    exercise_name: params.exerciseName,
    video_url: params.videoUrl,
  });
  if (error) throw new Error(error.message);
}

export async function fetchMyFormReviews(): Promise<TrainerFormReview[]> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return [];

  const { data, error } = await supabase
    .from('trainer_form_reviews')
    .select('*')
    .eq('client_user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}
