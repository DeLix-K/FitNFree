// Supabase Edge Function: receives Google Play Real-time Developer
// Notifications (delivered by a Cloud Pub/Sub push subscription) and keeps
// profiles.is_premium in sync with renewals/expirations/refunds for
// subscriptions purchased via Google Play -- the Google-side equivalent of
// stripe-webhook and apple-notifications.
// IMPORTANT: deploy with "Enforce JWT Verification" OFF -- Pub/Sub can't send
// a Supabase JWT. Instead the push endpoint URL carries a secret
// (?token=...) that must match GOOGLE_RTDN_SECRET.
//
// The notification itself is never trusted for entitlement: it's only a
// hint that a token changed. We re-read the token's real state from the
// Play Developer API, so a forged or replayed message can't grant anything.
//
// Requires the same GOOGLE_PLAY_SERVICE_ACCOUNT_B64 / GOOGLE_PLAY_PACKAGE_NAME
// secrets as verify-google-purchase, plus GOOGLE_RTDN_SECRET.

import { createClient } from 'npm:@supabase/supabase-js@2';

const PREMIUM_PRODUCT_ID = 'com.teamk.fitnfree.premium.monthly';

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
  lineItems?: { productId?: string; expiryTime?: string }[];
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
  const ack = () => new Response(JSON.stringify({ received: true }), { status: 200 });

  const secret = Deno.env.get('GOOGLE_RTDN_SECRET');
  if (!secret || new URL(req.url).searchParams.get('token') !== secret) {
    return new Response('Unauthorized.', { status: 401 });
  }

  try {
    const envelope = await req.json();
    const dataB64 = envelope?.message?.data as string | undefined;
    if (!dataB64) return ack();

    const notification = JSON.parse(atob(dataB64));
    const subNotification = notification.subscriptionNotification as
      | { notificationType?: number; purchaseToken?: string }
      | undefined;
    // Test pings and non-subscription events (one-time products, voided
    // purchases of other kinds) carry nothing for us to act on.
    if (!subNotification?.purchaseToken) return ack();

    const purchaseToken = subNotification.purchaseToken;
    const accessToken = await getGoogleAccessToken();
    const sub = await fetchSubscription(purchaseToken, accessToken);
    const lineItem = sub.lineItems?.find((l) => l.productId === PREMIUM_PRODUCT_ID);
    if (!lineItem) return ack();

    const expiresAtMs = lineItem.expiryTime ? Date.parse(lineItem.expiryTime) : 0;
    const entitled = ENTITLED_STATES.has(sub.subscriptionState ?? '') && expiresAtMs > Date.now();

    const adminClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // A resubscribe or plan change issues a new token that points back to
    // the old one, so match either.
    const tokens = [purchaseToken, sub.linkedPurchaseToken].filter(Boolean) as string[];
    const { data: profile } = await adminClient
      .from('profiles')
      .select('id, premium_source')
      .in('google_purchase_token', tokens)
      .maybeSingle();

    if (!profile) {
      // Not verified by the app yet (verify-google-purchase will set it up
      // when the client finishes its own flow) -- nothing to sync.
      console.log('google-notifications: no profile for token', JSON.stringify({ type: subNotification.notificationType }));
      return ack();
    }

    if (entitled) {
      await adminClient
        .from('profiles')
        .update({
          is_premium: true,
          premium_source: 'google',
          google_purchase_token: purchaseToken,
          premium_expires_at: new Date(expiresAtMs).toISOString(),
        })
        .eq('id', profile.id);
    } else if (profile.premium_source === 'google') {
      await adminClient
        .from('profiles')
        .update({ is_premium: false, premium_expires_at: expiresAtMs ? new Date(expiresAtMs).toISOString() : null })
        .eq('id', profile.id);
    }

    console.log(
      'google-notifications',
      JSON.stringify({ type: subNotification.notificationType, state: sub.subscriptionState, entitled })
    );
    return ack();
  } catch (err) {
    // A 5xx makes Pub/Sub redeliver, which is what we want for transient
    // failures (Google API hiccup, DB blip).
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
