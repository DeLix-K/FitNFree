// Supabase Edge Function: returns the caller's Printful store catalog,
// flattened into products with their sellable variants. Printful stays the
// source of truth — nothing is cached in Supabase, this just proxies live.
// Deploy via the Supabase dashboard: Edge Functions > Create a new function.
// Keep "Enforce JWT Verification" ON.

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

type PrintfulVariant = {
  id: number;
  name: string;
  retail_price: string;
  currency: string;
  size: string;
  color: string;
  availability_status: string;
};

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

    const printfulToken = Deno.env.get('PRINTFUL_API_TOKEN');
    if (!printfulToken) {
      return new Response(JSON.stringify({ error: 'Printful is not configured.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const listResponse = await fetch('https://api.printful.com/store/products', {
      headers: printfulHeaders(),
    });

    if (!listResponse.ok) {
      const body = await listResponse.text();
      console.error('Printful API error', listResponse.status, body);
      return new Response(JSON.stringify({ error: 'Could not load the merch catalog. Please try again.' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const listData = await listResponse.json();
    const productSummaries = (listData.result ?? []) as { id: number; name: string; thumbnail_url: string }[];

    // Printful rate-limits the store endpoints, so fetch product details in
    // small batches instead of firing one request per product at once --
    // otherwise the later requests in a large catalog get 429'd and those
    // products silently vanish from the results.
    const DETAIL_FETCH_CONCURRENCY = 4;

    async function fetchProductDetail(summary: { id: number; name: string; thumbnail_url: string }) {
      const detailResponse = await fetch(`https://api.printful.com/store/products/${summary.id}`, {
        headers: printfulHeaders(),
      });
      if (!detailResponse.ok) {
        const body = await detailResponse.text();
        console.error('Printful product detail error', summary.id, detailResponse.status, body);
        return null;
      }

      const detailData = await detailResponse.json();
      const variants = (detailData.result?.sync_variants ?? []) as PrintfulVariant[];

      return {
        id: summary.id,
        name: summary.name,
        thumbnailUrl: summary.thumbnail_url,
        variants: variants.map((v) => ({
          syncVariantId: v.id,
          name: v.name,
          size: v.size,
          color: v.color,
          priceCents: Math.round(parseFloat(v.retail_price) * 100),
          currency: v.currency,
          available: v.availability_status === 'active',
        })),
      };
    }

    const products: Awaited<ReturnType<typeof fetchProductDetail>>[] = [];
    for (let i = 0; i < productSummaries.length; i += DETAIL_FETCH_CONCURRENCY) {
      const batch = productSummaries.slice(i, i + DETAIL_FETCH_CONCURRENCY);
      const batchResults = await Promise.all(batch.map(fetchProductDetail));
      products.push(...batchResults);
    }

    const catalog = products.filter((p) => p && p.variants.some((v) => v.available));

    return new Response(JSON.stringify({ products: catalog }), {
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
