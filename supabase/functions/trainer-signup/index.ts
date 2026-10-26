// Supabase Edge Function: lets any signed-in user become a trainer and
// create/edit their own trainer_profiles listing. This is the one trusted,
// audited path that flips profiles.is_trainer (normally an immutable,
// admin-only flag, same pattern as is_admin/is_premium) -- the client can
// never set that column directly. payouts_enabled and stripe_account_id
// stay untouched here; those are only ever set by trainer-connect-onboarding
// after real Stripe verification, so a new trainer's listing does not show
// up as bookable (fetchTrainers filters payouts_enabled = true) until they
// actually complete payout setup.
// Deploy via the Supabase dashboard: Edge Functions > Create a new function.
// Keep "Enforce JWT Verification" ON.

import { createClient } from 'npm:@supabase/supabase-js@2';

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function buildCorsHeaders(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': isAllowedOrigin(origin) ? origin! : 'null',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    Vary: 'Origin',
  };
}

// Only well-formed https:// links with no embedded credentials are stored;
// these are later shown to (and opened by) other users.
function cleanHttpsUrl(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== 'https:' || u.username || u.password) return null;
    return u.toString();
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req.headers.get('Origin'));
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const {
      displayName,
      bio,
      specialty,
      priceCents,
      introVideoUrl,
      trainingFormat,
      locationText,
      defaultVideoCallLink,
      coachingStyle,
    } = await req.json().catch(() => ({}));

    const trimmedName = typeof displayName === 'string' ? displayName.trim() : '';
    const trimmedBio = typeof bio === 'string' ? bio.trim() : '';
    const trimmedSpecialty = typeof specialty === 'string' ? specialty.trim().slice(0, 120) : '';
    const price = Number(priceCents);

    const ALLOWED_FORMATS = ['in_person', 'virtual', 'online'];
    const trimmedFormat = Array.isArray(trainingFormat)
      ? trainingFormat.filter((f) => ALLOWED_FORMATS.includes(f)).slice(0, 3)
      : [];
    const trimmedLocation = typeof locationText === 'string' ? locationText.trim().slice(0, 120) : '';
    const trimmedVideoUrl = cleanHttpsUrl(introVideoUrl, 300);
    const trimmedCallLink = cleanHttpsUrl(defaultVideoCallLink, 300);
    const ALLOWED_STYLES = ['high_energy', 'technical', 'empathetic'];
    const trimmedStyle = ALLOWED_STYLES.includes(coachingStyle) ? coachingStyle : null;

    if (!trimmedName || trimmedName.length > 80) {
      return new Response(JSON.stringify({ error: 'Enter a display name (up to 80 characters).' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (trimmedBio.length > 2000) {
      return new Response(JSON.stringify({ error: 'Bio is too long (max 2000 characters).' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!Number.isInteger(price) || price < 100 || price > 100000) {
      return new Response(
        JSON.stringify({ error: 'Price must be between $1 and $1,000.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired session.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { error: profileError } = await adminClient
      .from('profiles')
      .update({ is_trainer: true })
      .eq('id', user.id);

    if (profileError) {
      return new Response(JSON.stringify({ error: 'Could not enable trainer access. Please try again.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { error: upsertError } = await adminClient
      .from('trainer_profiles')
      .upsert(
        {
          user_id: user.id,
          display_name: trimmedName,
          bio: trimmedBio,
          specialty: trimmedSpecialty,
          price_cents: price,
          intro_video_url: trimmedVideoUrl,
          training_format: trimmedFormat,
          location_text: trimmedLocation,
          default_video_call_link: trimmedCallLink,
          coaching_style: trimmedStyle,
        },
        { onConflict: 'user_id' }
      );

    if (upsertError) {
      return new Response(JSON.stringify({ error: 'Could not save trainer profile. Please try again.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: 'Something went wrong. Please try again.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
