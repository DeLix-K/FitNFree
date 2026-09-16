import {
  finishTransaction,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  type Purchase,
} from 'expo-iap';
import { supabase } from './supabase';

export const PREMIUM_SKU_IOS = 'com.teamk.fitnfree.premium.monthly';

let connectionReady: Promise<boolean> | null = null;

function ensureConnection(): Promise<boolean> {
  if (!connectionReady) connectionReady = initConnection();
  return connectionReady;
}

// Buys the Premium subscription via Apple's native In-App Purchase sheet,
// then has our server verify the transaction directly against Apple (not
// the client-submitted receipt) before granting is_premium. Apple requires
// digital subscriptions to go through IAP on iOS -- this is the iOS-only
// counterpart to the Stripe checkout used on Android/web (see billing.ts).
//
// Uses expo-iap rather than react-native-iap: the latter's classic API
// depends on the CocoaPods "RCT-Folly" pod, which this project's React
// Native version no longer vendors as a standalone pod (it now ships a
// prebuilt ReactNativeCore/ReactNativeDependencies bundle instead), so pod
// install fails outright. react-native-iap's newer Nitro-based major avoids
// that, but its own docs say it doesn't support Expo Dev Client builds and
// point to expo-iap for Expo projects -- which is what this app uses.
export async function purchasePremiumIOS(): Promise<void> {
  await ensureConnection();

  const purchase = await new Promise<Purchase>((resolve, reject) => {
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

    requestPurchase({
      request: { apple: { sku: PREMIUM_SKU_IOS } },
      type: 'subs',
    }).catch((err) => {
      updateSub.remove();
      errorSub.remove();
      reject(err instanceof Error ? err : new Error(String(err)));
    });
  });

  const transactionId = purchase.transactionId;
  if (!transactionId) throw new Error('No transaction ID returned from the purchase.');

  const { data, error } = await supabase.functions.invoke<{ success?: boolean; error?: string }>(
    'verify-apple-purchase',
    { body: { transactionId } }
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

  // Only finish the transaction with Apple once our own server has
  // confirmed and recorded the entitlement -- otherwise a network blip
  // between purchase and verification could finish the transaction (making
  // the store stop redelivering it) while the user never actually got
  // Premium.
  await finishTransaction({ purchase, isConsumable: false });
}
