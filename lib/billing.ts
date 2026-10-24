import { Platform } from 'react-native';
import { getCheckoutRedirectUrl, openCheckoutUrl } from './checkout';
import { isPurchaseCancelled, purchasePremiumAndroid, purchasePremiumIOS } from './iap';
import { confirmSubscription } from './paywall';
import { supabase } from './supabase';

let checkoutInFlight: Promise<void> | null = null;

// Screens that show Premium status (useAiGate) subscribe here so they refresh
// as soon as a purchase or restore succeeds, instead of staying on the free
// view until the app is reopened.
const premiumChangedListeners = new Set<() => void>();

export function onPremiumChanged(listener: () => void): () => void {
  premiumChangedListeners.add(listener);
  return () => {
    premiumChangedListeners.delete(listener);
  };
}

export function notifyPremiumChanged(): void {
  premiumChangedListeners.forEach((listener) => listener());
}

// One checkout at a time: several Upgrade buttons can be on screen at once,
// and a second tap mid-purchase must join the first rather than start a
// competing store purchase.
export function startCheckout(): Promise<void> {
  if (!checkoutInFlight) {
    checkoutInFlight = runCheckout()
      .then(() => {
        if (Platform.OS !== 'web') notifyPremiumChanged();
      })
      .finally(() => {
        checkoutInFlight = null;
      });
  }
  return checkoutInFlight;
}

async function runCheckout(): Promise<void> {
  // Apple and Google both require digital subscriptions to be sold through
  // their own billing systems inside their apps -- only web uses Stripe.
  if (Platform.OS === 'ios' || Platform.OS === 'android') {
    // Guideline 3.1.2(c): show the subscription title, length, price and legal
    // links before the store purchase starts. See lib/paywall.ts.
    const confirmed = await confirmSubscription();
    if (!confirmed) return;
    try {
      if (Platform.OS === 'ios') await purchasePremiumIOS();
      else await purchasePremiumAndroid();
    } catch (err) {
      // Closing the store's purchase sheet is a normal choice, not an error.
      if (isPurchaseCancelled(err)) return;
      throw err;
    }
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
