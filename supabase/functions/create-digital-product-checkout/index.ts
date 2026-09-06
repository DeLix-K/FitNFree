// Supabase Edge Function: creates a Stripe Checkout session for a one-time
// digital product purchase, paid directly to the platform (no Stripe
// Connect — there's no third-party seller, same pattern as courses).
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

    const { productId, successUrl, cancelUrl } = await req.json().catch(() => ({}));
    if (!productId) {
      return new Response(JSON.stringify({ error: 'Missing productId.' }), {
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

    const { data: product, error: productError } = await adminClient
      .from('digital_products')
      .select('id, title, price_cents')
      .eq('id', productId)
      .single();

    if (productError || !product) {
      return new Response(JSON.stringify({ error: 'Product not found.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: existing } = await adminClient
      .from('digital_product_purchases')
      .select('status')
      .eq('user_id', user.id)
      .eq('product_id', productId)
      .maybeSingle();

    if (existing?.status === 'paid') {
      return new Response(JSON.stringify({ error: 'You already own this.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      return new Response(JSON.stringify({ error: 'Stripe is not configured.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' });

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: user.email,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: product.price_cents,
            product_data: { name: product.title },
          },
          quantity: 1,
        },
      ],
      success_url: safeRedirect(successUrl, req.headers.get('Origin')),
      cancel_url: safeRedirect(cancelUrl ?? successUrl, req.headers.get('Origin')),
      metadata: {
        fitnfree_order_type: 'digital_product',
        supabase_user_id: user.id,
        product_id: product.id,
      },
    });

    const { error: upsertError } = await adminClient.from('digital_product_purchases').upsert(
      { user_id: user.id, product_id: product.id, status: 'pending', stripe_checkout_session_id: session.id },
      { onConflict: 'user_id,product_id' }
    );

    if (upsertError) {
      return new Response(
        JSON.stringify({ error: `Could not record purchase: ${upsertError.message}` }),
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
