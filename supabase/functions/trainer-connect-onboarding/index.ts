// Supabase Edge Function: creates (or resumes) a Stripe Connect Express
// account for the calling trainer and returns a Stripe-hosted onboarding
// link (identity + bank verification happens on Stripe's side, not ours).
// Deploy via the Supabase dashboard: Edge Functions > Create a new function.
// Keep "Enforce JWT Verification" ON.

import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@17';

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

// The native app opens checkout in an in-app browser and needs Stripe to
// redirect back to its own fitnfree:// deep link (not a normal http(s)
// origin) to close that browser and return control to the app.
function safeRedirect(url: string | undefined, origin: string | null): string {
  if (url) {
    if (url.startsWith('fitnfree://')) return url;
    try {
      if (isAllowedOrigin(new URL(url).origin)) return url;
    } catch {
      // fall through to the default below
    }
  }
  return origin ?? 'https://example.com';
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

    const { returnUrl } = await req.json().catch(() => ({}));

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

    const { data: profile } = await adminClient
      .from('profiles')
      .select('is_trainer')
      .eq('id', user.id)
      .single();

    if (!profile?.is_trainer) {
      return new Response(JSON.stringify({ error: 'This account is not a trainer account.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: trainerProfile, error: trainerError } = await adminClient
      .from('trainer_profiles')
      .select('id, stripe_account_id')
      .eq('user_id', user.id)
      .single();

    if (trainerError || !trainerProfile) {
      return new Response(
        JSON.stringify({ error: 'No trainer profile found for this account yet.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      return new Response(JSON.stringify({ error: 'Stripe is not configured.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' });

    let accountId = trainerProfile.stripe_account_id;
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        email: user.email,
        capabilities: {
          transfers: { requested: true },
          card_payments: { requested: true },
        },
        metadata: { supabase_user_id: user.id },
      });
      accountId = account.id;

      const { error: updateError } = await adminClient
        .from('trainer_profiles')
        .update({ stripe_account_id: accountId })
        .eq('id', trainerProfile.id);

      if (updateError) {
        return new Response(
          JSON.stringify({ error: `Could not save Stripe account id: ${updateError.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Re-check status every time we're called (not just via webhook) so the
    // dashboard reflects reality even if a webhook delivery was missed.
    const account = await stripe.accounts.retrieve(accountId);
    const payoutsEnabled = !!account.payouts_enabled;
    await adminClient
      .from('trainer_profiles')
      .update({ payouts_enabled: payoutsEnabled })
      .eq('id', trainerProfile.id);

    const fallbackUrl = safeRedirect(returnUrl, req.headers.get('Origin'));
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: fallbackUrl,
      return_url: fallbackUrl,
      type: 'account_onboarding',
    });

    return new Response(JSON.stringify({ url: accountLink.url, payoutsEnabled }), {
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
