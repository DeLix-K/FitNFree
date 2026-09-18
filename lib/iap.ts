import {
  fetchProducts,
  finishTransaction,
  getAvailablePurchases,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  restorePurchases,
  type Purchase,
} from 'expo-iap';
import { Platform } from 'react-native';
import { supabase } from './supabase';

// One product id for both stores -- Apple's and Google's ids allow the same
// reverse-DNS form, and the server functions check for exactly this value.
export const PREMIUM_SKU = 'com.teamk.fitnfree.premium.monthly';

let connectionReady: Promise<boolean> | null = null;

function ensureConnection(): Promise<boolean> {
  if (!connectionReady) connectionReady = initConnection();
  return connectionReady;
}

// Starts a purchase and resolves with whatever the store reports back --
// requestPurchase's own return value isn't the outcome, the result arrives
// through the listeners.
async function runPurchase(start: () => Promise<unknown>): Promise<Purchase> {
  await ensureConnection();

  return new Promise<Purchase>((resolve, reject) => {
    const updateSub = purchaseUpdatedListener((p) => {
      updateSub.remove();
      errorSub.remove();
      resolve(p);
    });
    const errorSub = purchaseErrorListener((e) => {
      updateSub.remove();
      errorSub.remove();
      reject(new Error(e.message || 'Purchase failed.'));
    });

    start().catch((err) => {
      updateSub.remove();
      errorSub.remove();
      reject(err instanceof Error ? err : new Error(String(err)));
    });
  });
}

// Has our server confirm the purchase with the store itself before granting
// anything -- the client only ever hands over an opaque id/token.
async function verifyOnServer(functionName: string, body: Record<string, string>): Promise<void> {
  const { data, error } = await supabase.functions.invoke<{ success?: boolean; error?: string }>(
    functionName,
    { body }
  );

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
}

async function verifyPurchase(purchase: Purchase): Promise<void> {
  if (Platform.OS === 'ios') {
    if (!purchase.transactionId) throw new Error('No transaction ID returned from the purchase.');
    await verifyOnServer('verify-apple-purchase', { transactionId: purchase.transactionId });
  } else {
    if (!purchase.purchaseToken) throw new Error('No purchase token returned from the purchase.');
    await verifyOnServer('verify-google-purchase', { purchaseToken: purchase.purchaseToken });
  }
}

// Only finish the transaction with the store once our own server has
// confirmed and recorded the entitlement -- otherwise a network blip between
// purchase and verification could finish it (so the store stops redelivering
// it; Google also auto-refunds purchases left unacknowledged for 3 days)
// while the user never actually got Premium.
async function finish(purchase: Purchase): Promise<void> {
  await finishTransaction({ purchase, isConsumable: false });
}

// Apple requires digital subscriptions on iOS to go through its In-App
// Purchase system; Google requires the same through Play Billing. Stripe
// stays for web (see billing.ts).
//
// Uses expo-iap rather than react-native-iap: the latter's classic API
// depends on the CocoaPods "RCT-Folly" pod, which this project's React
// Native version no longer vendors as a standalone pod (it now ships a
// prebuilt ReactNativeCore/ReactNativeDependencies bundle instead), so pod
// install fails outright. react-native-iap's newer Nitro-based major avoids
// that, but its own docs say it doesn't support Expo Dev Client builds and
// point to expo-iap for Expo projects -- which is what this app uses.
export async function purchasePremiumIOS(): Promise<void> {
  const purchase = await runPurchase(() =>
    requestPurchase({ request: { apple: { sku: PREMIUM_SKU } }, type: 'subs' })
  );
  await verifyPurchase(purchase);
  await finish(purchase);
}

export async function purchasePremiumAndroid(): Promise<void> {
  await ensureConnection();

  // Play Billing subscriptions are bought against a specific offer, so we
  // need the offer token for the base plan first.
  const products = (await fetchProducts({ skus: [PREMIUM_SKU], type: 'subs' })) as unknown as
    | { subscriptionOffers?: { offerTokenAndroid?: string | null }[] }[]
    | null;
  const offerToken = products?.[0]?.subscriptionOffers?.find((o) => o.offerTokenAndroid)?.offerTokenAndroid;
  if (!offerToken) {
    throw new Error('Premium is not available from Google Play right now. Please try again later.');
  }

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error('Not signed in.');

  const purchase = await runPurchase(() =>
    requestPurchase({
      request: {
        google: {
          skus: [PREMIUM_SKU],
          subscriptionOffers: [{ sku: PREMIUM_SKU, offerToken }],
          // Echoed back by Google so the server can confirm this purchase
          // was made by the signed-in user (see verify-google-purchase).
          obfuscatedAccountId: userId,
        },
      },
      type: 'subs',
    })
  );
  await verifyPurchase(purchase);
  await finish(purchase);
}

// Apple requires a way for users to restore an existing subscription (new
// device, reinstall), and it also rescues any purchase that was paid for but
// never verified -- e.g. the app was closed mid-purchase. Returns whether a
// Premium purchase was found and re-verified.
export async function restorePremiumPurchases(): Promise<boolean> {
  await ensureConnection();
  if (Platform.OS === 'ios') await restorePurchases();

  const purchases = await getAvailablePurchases();
  const premium = purchases.find((p) => p.productId === PREMIUM_SKU);
  if (!premium) return false;

  await verifyPurchase(premium);
  try {
    await finish(premium);
  } catch {
    // Already acknowledged/finished on a previous run -- nothing left to do.
  }
  return true;
}
