import { getCheckoutRedirectUrl, openCheckoutUrl } from './checkout';
import { SHOW_ONLY_FREE_DIGITAL } from './storeRules';
import { supabase } from './supabase';
import type { DigitalProduct, DigitalProductContent, DigitalProductWithStatus } from './types';

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

export async function fetchDigitalProducts(): Promise<DigitalProductWithStatus[]> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;

  const [productsResult, purchasesResult] = await Promise.all([
    supabase.from('digital_products').select('*').order('created_at', { ascending: true }),
    userId
      ? supabase.from('digital_product_purchases').select('product_id, status').eq('user_id', userId)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (productsResult.error) throw new Error(productsResult.error.message);

  const ownedIds = new Set(
    (purchasesResult.data ?? [])
      .filter((p: { status: string }) => p.status === 'paid')
      .map((p: { product_id: string }) => p.product_id)
  );

  return ((productsResult.data ?? []) as DigitalProduct[])
    // The price filter here is for what the app shows. What a player may actually receive is decided by
    // the database (see supabase/claim_free_digital_product.sql), never by this screen.
    .filter((p) => !SHOW_ONLY_FREE_DIGITAL || p.price_cents === 0)
    .map((p) => ({
      ...p,
      owned: ownedIds.has(p.id),
    }));
}

export async function fetchDigitalProductContent(productId: string): Promise<DigitalProductContent | null> {
  const { data, error } = await supabase
    .from('digital_product_content')
    .select('*')
    .eq('product_id', productId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export async function buyDigitalProduct(productId: string): Promise<void> {
  const returnUrl = getCheckoutRedirectUrl();

  const { url } = await invoke<{ url?: string }>('create-digital-product-checkout', {
    productId,
    successUrl: returnUrl,
    cancelUrl: returnUrl,
  });

  if (!url) throw new Error('Stripe did not return a checkout URL.');

  await openCheckoutUrl(url);
}

// Adds a free guide to the player's library. The server only allows this for items that really cost
// nothing, so a paid guide cannot be taken this way.
export async function claimFreeDigitalProduct(productId: string): Promise<void> {
  const { error } = await supabase.rpc('claim_free_digital_product', { p_product_id: productId });
  if (error) throw new Error(error.message);
}
