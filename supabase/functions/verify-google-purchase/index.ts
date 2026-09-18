// Supabase Edge Function: verifies a Google Play Billing subscription
// purchase directly against the Google Play Developer API (server-to-server,
// not trusting anything the client says beyond the opaque purchase token),
// then grants Premium the same way the Stripe webhook does. Keep "Enforce
// JWT Verification" ON -- the caller must be a signed-in FitNFree user.
//
// Requires these secrets (Supabase dashboard > Edge Functions > Secrets):
//   GOOGLE_PLAY_SERVICE_ACCOUNT_B64 -- the Play API service account's JSON
//                                      key file, base64-encoded as one line
//   GOOGLE_PLAY_PACKAGE_NAME        -- com.teamk.fitnfree
// The service account needs "View financial data" and "Manage orders and
// subscriptions" in Play Console > Users and permissions.

import { createClient } from 'npm:@supabase/supabase-js@2';

const PREMIUM_PRODUCT_ID = 'com.teamk.fitnfree.premium.monthly';

// Subscription states that still entitle the user. CANCELED means the user
// turned off auto-renew but the paid period hasn't ended yet.
const ENTITLED_STATES = new Set([
  'SUBSCRIPTION_STATE_ACTIVE',
  'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
  'SUBSCRIPTION_STATE_CANCELED',
]);

function base64UrlEncode(bytes: ArrayBuffer | Uint8Array): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const clean = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function getGoogleAccessToken(): Promise<string> {
  const account = JSON.parse(atob(Deno.env.get('GOOGLE_PLAY_SERVICE_ACCOUNT_B64')!));
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3000,
  };
  const enc = new TextEncoder();
  const signingInput = `${base64UrlEncode(enc.encode(JSON.stringify(header)))}.${base64UrlEncode(enc.encode(JSON.stringify(claims)))}`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(account.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(signingInput));

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${signingInput}.${base64UrlEncode(signature)}`,
    }),
  });
  const body = await res.json();
  if (!res.ok || !body.access_token) {
    throw new Error(`Google auth failed (${res.status}): ${JSON.stringify(body)}`);
  }
  return body.access_token as string;
}

type SubscriptionV2 = {
  subscriptionState?: string;
  linkedPurchaseToken?: string;
  latestOrderId?: string;
  lineItems?: { productId?: string; expiryTime?: string }[];
  externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string };
};

async function fetchSubscription(purchaseToken: string, accessToken: string): Promise<SubscriptionV2> {
  const pkg = Deno.env.get('GOOGLE_PLAY_PACKAGE_NAME')!;
  const res = await fetch(
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${pkg}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`Google purchase lookup failed (${res.status}): ${text}`);
  return JSON.parse(text) as SubscriptionV2;
}

Deno.serve(async (req) => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing Authorization header.' }, 401);

    const { purchaseToken } = await req.json();
    if (!purchaseToken || typeof purchaseToken !== 'string') {
      return json({ error: 'purchaseToken is required.' }, 400);
    }

    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: 'Not signed in.' }, 401);

    const accessToken = await getGoogleAccessToken();
    const sub = await fetchSubscription(purchaseToken, accessToken);

    const lineItem = sub.lineItems?.find((l) => l.productId === PREMIUM_PRODUCT_ID);
    if (!lineItem) return json({ error: 'Purchase is not for the Premium subscription.' }, 400);

    // The client tags the purchase with the signed-in user's id when it
    // starts it; Google echoes that back. Without this check, any user
    // could submit someone else's purchase token and receive their Premium.
    if (sub.externalAccountIdentifiers?.obfuscatedExternalAccountId !== user.id) {
      return json({ error: 'This purchase belongs to a different account.' }, 403);
    }

    const expiresAtMs = lineItem.expiryTime ? Date.parse(lineItem.expiryTime) : 0;
    if (!ENTITLED_STATES.has(sub.subscriptionState ?? '') || expiresAtMs <= Date.now()) {
      return json({ error: `Subscription is not currently active (${sub.subscriptionState}).` }, 400);
    }

    const adminClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { error: updateError } = await adminClient
      .from('profiles')
      .update({
        is_premium: true,
        premium_source: 'google',
        google_purchase_token: purchaseToken,
        premium_expires_at: new Date(expiresAtMs).toISOString(),
      })
      .eq('id', user.id);
    if (updateError) throw new Error(updateError.message);

    return json({ success: true, expiresAt: new Date(expiresAtMs).toISOString() });
  } catch (err) {
    console.error(err);
    return json({ error: String(err) }, 500);
  }
});
