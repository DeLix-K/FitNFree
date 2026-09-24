import { byNewest } from './library';
import { getIsPremium } from './subscription';
import { supabase } from './supabase';
import type { DigitalProduct, DigitalProductContent, DigitalProductWithStatus } from './types';

export async function fetchDigitalProducts(): Promise<DigitalProductWithStatus[]> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;

  const [productsResult, purchasesResult, isPremium] = await Promise.all([
    supabase.from('digital_products').select('*'),
    userId
      ? supabase.from('digital_product_purchases').select('product_id, status').eq('user_id', userId)
      : Promise.resolve({ data: [], error: null }),
    getIsPremium(),
  ]);

  if (productsResult.error) throw new Error(productsResult.error.message);

  // Bought before content moved into Premium -- those buyers keep access.
  const boughtIds = new Set(
    (purchasesResult.data ?? [])
      .filter((p: { status: string }) => p.status === 'paid')
      .map((p: { product_id: string }) => p.product_id)
  );

  return ((productsResult.data ?? []) as DigitalProduct[]).sort(byNewest).map((p) => ({
    ...p,
    unlocked: p.is_free || isPremium || boughtIds.has(p.id),
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
