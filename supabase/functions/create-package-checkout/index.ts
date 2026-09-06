// Supabase Edge Function: creates a Stripe Checkout session for a client to
// buy a session package from a trainer. Mirrors create-trainer-checkout
// exactly (same destination charge, same 15% platform fee) -- session
// packages are a second product type on the same Stripe Connect setup, not
// new payment infrastructure.
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

const PLATFORM_FEE_RATE = 0.15;

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

    const { packageId, successUrl, cancelUrl } = await req.json().catch(() => ({}));
    if (!packageId) {
      return new Response(JSON.stringify({ error: 'Missing packageId.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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

    const { data: pkg, error: pkgError } = await adminClient
      .from('trainer_session_packages')
      .select('id, trainer_user_id, name, session_count, price_cents, active, trainer_profiles!inner(display_name, stripe_account_id, payouts_enabled)')
      .eq('id', packageId)
      .single();

    if (pkgError || !pkg || !pkg.active) {
      return new Response(JSON.stringify({ error: 'Package not found.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (pkg.trainer_user_id === user.id) {
      return new Response(JSON.stringify({ error: 'You cannot buy your own package.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const trainer = pkg.trainer_profiles as unknown as {
      display_name: string;
      stripe_account_id: string | null;
      payouts_enabled: boolean;
    };

    if (!trainer.payouts_enabled || !trainer.stripe_account_id) {
      return new Response(
        JSON.stringify({ error: 'This trainer is not accepting orders yet.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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

    const amountCents = pkg.price_cents;
    const platformFeeCents = Math.round(amountCents * PLATFORM_FEE_RATE);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: user.email,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: amountCents,
            product_data: { name: `${pkg.name} (${pkg.session_count} sessions) — ${trainer.display_name}` },
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        application_fee_amount: platformFeeCents,
        transfer_data: { destination: trainer.stripe_account_id },
      },
      success_url: safeRedirect(successUrl, req.headers.get('Origin')),
      cancel_url: safeRedirect(cancelUrl ?? successUrl, req.headers.get('Origin')),
      metadata: {
        fitnfree_order_type: 'session_package',
        supabase_user_id: user.id,
        package_id: pkg.id,
        trainer_user_id: pkg.trainer_user_id,
      },
    });

    const { error: insertError } = await adminClient.from('trainer_session_credits').insert({
      client_user_id: user.id,
      trainer_user_id: pkg.trainer_user_id,
      package_id: pkg.id,
      sessions_purchased: pkg.session_count,
      stripe_checkout_session_id: session.id,
      status: 'pending',
    });

    if (insertError) {
      return new Response(
        JSON.stringify({ error: `Could not record purchase: ${insertError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify({ url: session.url }), {
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
