// Supabase Edge Function: creates a Stripe Checkout session for a merch
// purchase, with Stripe's native shipping-address collection. Paid directly
// to the platform (no Stripe Connect). Re-fetches the real price from
// Printful server-side rather than trusting anything the client sends.
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

const ALLOWED_SHIPPING_COUNTRIES = ['US', 'GB', 'CA', 'AU'] as const;

function printfulHeaders(): Record<string, string> {
  const token = Deno.env.get('PRINTFUL_API_TOKEN')!;
  const storeId = Deno.env.get('PRINTFUL_STORE_ID');
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (storeId) headers['X-PF-Store-Id'] = storeId;
  return headers;
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

    const { items: cartItems, successUrl, cancelUrl } = await req.json().catch(() => ({}));

    const MAX_LINE_QUANTITY = 20;
    const MAX_CART_LINES = 30;

    const itemsValid =
      Array.isArray(cartItems) &&
      cartItems.length > 0 &&
      cartItems.length <= MAX_CART_LINES &&
      cartItems.every(
        (item: unknown) =>
          typeof item === 'object' &&
          item !== null &&
          Number.isFinite((item as { productId?: unknown }).productId) &&
          Number.isFinite((item as { syncVariantId?: unknown }).syncVariantId) &&
          Number.isInteger((item as { quantity?: unknown }).quantity) &&
          (item as { quantity: number }).quantity > 0 &&
          (item as { quantity: number }).quantity <= MAX_LINE_QUANTITY
      );

    if (!itemsValid) {
      return new Response(
        JSON.stringify({ error: 'Provide a non-empty "items" array of { productId, syncVariantId, quantity }.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const requestedItems = cartItems as { productId: number; syncVariantId: number; quantity: number }[];

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

    const printfulToken = Deno.env.get('PRINTFUL_API_TOKEN');
    if (!printfulToken) {
      return new Response(JSON.stringify({ error: 'Printful is not configured.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch each distinct product's detail once (cart items can share a product
    // across different variants), then re-validate every requested variant's
    // price/availability server-side rather than trusting the client's cart.
    const uniqueProductIds = [...new Set(requestedItems.map((i) => i.productId))];
    const productDetails = new Map<number, { result?: { sync_product?: { name?: string }; sync_variants?: unknown[] } }>();

    for (const pid of uniqueProductIds) {
      const detailResponse = await fetch(
        `https://api.printful.com/store/products/${encodeURIComponent(String(pid))}`,
        { headers: printfulHeaders() }
      );
      if (!detailResponse.ok) {
        return new Response(JSON.stringify({ error: `Product ${pid} not found.` }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      productDetails.set(pid, await detailResponse.json());
    }

    type ResolvedLine = {
      syncVariantId: number;
      name: string;
      size: string;
      color: string;
      quantity: number;
      priceCents: number;
      currency: string;
    };

    const resolvedLines: ResolvedLine[] = [];
    for (const item of requestedItems) {
      const detail = productDetails.get(item.productId);
      const productName = detail?.result?.sync_product?.name as string | undefined;
      const variant = (detail?.result?.sync_variants ?? []).find(
        (v: unknown) => (v as { id: number }).id === item.syncVariantId
      ) as
        | { id: number; name: string; size: string; color: string; retail_price: string; currency: string; availability_status: string }
        | undefined;

      if (!variant || variant.availability_status !== 'active') {
        return new Response(
          JSON.stringify({ error: `"${productName ?? 'An item'}" is not available right now.` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      resolvedLines.push({
        syncVariantId: variant.id,
        name: `${productName ?? 'FitNFree Merch'} — ${variant.name}`,
        size: variant.size,
        color: variant.color,
        quantity: item.quantity,
        priceCents: Math.round(parseFloat(variant.retail_price) * 100),
        currency: (variant.currency ?? 'usd').toLowerCase(),
      });
    }

    const amountCents = resolvedLines.reduce((sum, l) => sum + l.priceCents * l.quantity, 0);

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
      shipping_address_collection: { allowed_countries: [...ALLOWED_SHIPPING_COUNTRIES] },
      line_items: resolvedLines.map((line) => ({
        price_data: {
          currency: line.currency,
          unit_amount: line.priceCents,
          product_data: { name: line.name },
        },
        quantity: line.quantity,
      })),
      success_url: safeRedirect(successUrl, req.headers.get('Origin')),
      cancel_url: safeRedirect(cancelUrl ?? successUrl, req.headers.get('Origin')),
      metadata: {
        fitnfree_order_type: 'merch',
        supabase_user_id: user.id,
      },
    });

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { error: insertError } = await adminClient.from('merch_orders').insert({
      user_id: user.id,
      status: 'pending_payment',
      stripe_checkout_session_id: session.id,
      items: resolvedLines.map((line) => ({
        syncVariantId: line.syncVariantId,
        name: line.name,
        size: line.size,
        color: line.color,
        quantity: line.quantity,
        priceCents: line.priceCents,
      })),
      amount_cents: amountCents,
    });

    if (insertError) {
      return new Response(
        JSON.stringify({ error: `Could not record order: ${insertError.message}` }),
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
