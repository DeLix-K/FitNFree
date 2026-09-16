// Supabase Edge Function: verifies an iOS In-App Purchase transaction
// directly against Apple's App Store Server API (server-to-server, not the
// client-submitted receipt), then grants Premium the same way the Stripe
// webhook does. Keep "Enforce JWT Verification" ON -- the caller must be a
// signed-in FitNFree user.
//
// Requires these secrets (Supabase dashboard > Edge Functions > Secrets):
//   APPLE_IAP_KEY_ID        -- Key ID of an "In-App Purchase" key from
//                              App Store Connect > Users and Access >
//                              Integrations > In-App Purchase
//   APPLE_IAP_ISSUER_ID     -- Issuer ID shown on the same page
//   APPLE_IAP_PRIVATE_KEY   -- the full contents of the downloaded .p8 file
//   APPLE_BUNDLE_ID         -- com.teamk.fitnfree

import { createClient } from 'npm:@supabase/supabase-js@2';

const PREMIUM_PRODUCT_ID = 'com.teamk.fitnfree.premium.monthly';

function base64UrlEncode(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlDecodeToJson(segment: string): Record<string, unknown> {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/').padEnd(segment.length + ((4 - (segment.length % 4)) % 4), '=');
  return JSON.parse(atob(padded));
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

async function makeAppStoreServerJwt(): Promise<string> {
  const keyId = Deno.env.get('APPLE_IAP_KEY_ID')!;
  const issuerId = Deno.env.get('APPLE_IAP_ISSUER_ID')!;
  const bundleId = Deno.env.get('APPLE_BUNDLE_ID')!;
  const privateKeyPem = Deno.env.get('APPLE_IAP_PRIVATE_KEY')!;

  const header = { alg: 'ES256', kid: keyId, typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: issuerId,
    iat: now,
    exp: now + 1200, // 20 min, under Apple's max
    aud: 'appstoreconnect-v1',
    bid: bundleId,
  };

  const headerB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(privateKeyPem),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signingInput)
  );

  return `${signingInput}.${base64UrlEncode(signature)}`;
}

// Apple's transaction JWS payload arrives via a channel we ourselves
// authenticated (a direct HTTPS call to Apple's API using our own signed
// JWT), so we trust the response body without re-verifying its own
// signature here -- unlike apple-notifications, which receives unsolicited
// POSTs from Apple and does need to verify the embedded x5c signature.
function decodeSignedTransactionInfo(jws: string): Record<string, unknown> {
  const parts = jws.split('.');
  if (parts.length !== 3) throw new Error('Malformed signed transaction.');
  return base64UrlDecodeToJson(parts[1]);
}

async function fetchTransactionInfo(transactionId: string, asJwt: string) {
  for (const base of ['https://api.storekit.itunes.apple.com', 'https://api.storekit-sandbox.itunes.apple.com']) {
    const res = await fetch(`${base}/inApps/v1/transactions/${transactionId}`, {
      headers: { Authorization: `Bearer ${asJwt}` },
    });
    if (res.ok) {
      const body = await res.json();
      return decodeSignedTransactionInfo(body.signedTransactionInfo as string);
    }
    if (res.status !== 404) {
      const text = await res.text();
      throw new Error(`Apple transaction lookup failed (${res.status}): ${text}`);
    }
    // 404 on production just means it's a sandbox transaction; try the next base.
  }
  throw new Error('Transaction not found in production or sandbox.');
}

Deno.serve(async (req) => {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { transactionId } = await req.json();
    if (!transactionId || typeof transactionId !== 'string') {
      return new Response(JSON.stringify({ error: 'transactionId is required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Not signed in.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const asJwt = await makeAppStoreServerJwt();
    const info = await fetchTransactionInfo(transactionId, asJwt);

    if (info.productId !== PREMIUM_PRODUCT_ID) {
      return new Response(JSON.stringify({ error: 'Transaction is not for the Premium subscription.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (info.revocationDate) {
      return new Response(JSON.stringify({ error: 'This purchase was refunded.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const expiresAtMs = info.expiresDate as number | undefined;
    if (!expiresAtMs || expiresAtMs <= Date.now()) {
      return new Response(JSON.stringify({ error: 'Subscription is not currently active.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const adminClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { error: updateError } = await adminClient
      .from('profiles')
      .update({
        is_premium: true,
        premium_source: 'apple',
        apple_original_transaction_id: String(info.originalTransactionId),
        premium_expires_at: new Date(expiresAtMs).toISOString(),
      })
      .eq('id', user.id);

    if (updateError) throw new Error(updateError.message);

    return new Response(JSON.stringify({ success: true, expiresAt: new Date(expiresAtMs).toISOString() }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
