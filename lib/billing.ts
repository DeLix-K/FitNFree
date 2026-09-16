import { Platform } from 'react-native';
import { getCheckoutRedirectUrl, openCheckoutUrl } from './checkout';
import { purchasePremiumIOS } from './iap';
import { supabase } from './supabase';

export async function startCheckout(): Promise<void> {
  // Apple requires digital subscriptions to be sold through its own In-App
  // Purchase system on iOS -- Android and web keep using Stripe Checkout.
  if (Platform.OS === 'ios') {
    await purchasePremiumIOS();
    return;
  }

  const returnUrl = getCheckoutRedirectUrl();

  const { data, error } = await supabase.functions.invoke<{ url?: string; error?: string }>(
    'create-checkout-session',
    { body: { successUrl: returnUrl, cancelUrl: returnUrl } }
  );

  if (error) {
    const context = (error as { context?: Response }).context;
    let detailedMessage: string | undefined;
    if (context) {
      try {
        const body = await context.clone().json();
        if (body?.error) detailedMessage = body.error;
      } catch {
        // fall through
      }
    }
    throw new Error(detailedMessage ?? error.message);
  }

  if (data?.error) throw new Error(data.error);
  if (!data?.url) throw new Error('Stripe did not return a checkout URL.');

  await openCheckoutUrl(data.url);
}
