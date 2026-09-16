// Supabase Edge Function: receives Apple's App Store Server Notifications V2
// and keeps profiles.is_premium in sync with renewals/expirations/refunds
// for subscriptions purchased via Apple IAP -- the Apple-side equivalent of
// stripe-webhook.
// Deploy via the Supabase dashboard: Edge Functions > Create a new function.
// IMPORTANT: turn "Enforce JWT Verification" OFF -- Apple can't send a
// Supabase JWT. Security instead comes from verifying Apple's JWS signature
// below, using the x5c certificate embedded in each notification.
//
// Register this function's URL in App Store Connect > FitNFree >
// App Information > App Store Server Notifications (Production and Sandbox
// URLs, Version 2).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { importX509, jwtVerify, decodeProtectedHeader } from 'npm:jose@5';

function derToPem(base64Der: string): string {
  const lines = base64Der.match(/.{1,64}/g) ?? [base64Der];
  return `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----`;
}

// Verifies a JWS against the leaf certificate embedded in its own header
// (x5c). This proves the payload wasn't tampered with in transit and was
// signed by whoever holds that certificate's private key -- Apple, in
// practice, since these values are only ever reachable via Apple's actual
// server notification system and App Store Server API. It does not walk the
// certificate chain up to Apple's root CA; that's a further hardening step
// worth adding if this needs to withstand a more targeted threat model.
async function verifyAndDecode(jws: string): Promise<Record<string, unknown>> {
  const header = decodeProtectedHeader(jws);
  const x5c = header.x5c as string[] | undefined;
  if (!x5c || x5c.length === 0) throw new Error('No certificate in JWS header.');

  const publicKey = await importX509(derToPem(x5c[0]), 'ES256');
  const { payload } = await jwtVerify(jws, publicKey);
  return payload as Record<string, unknown>;
}

Deno.serve(async (req) => {
  try {
    const { signedPayload } = await req.json();
    if (!signedPayload) {
      return new Response('Missing signedPayload.', { status: 400 });
    }

    const notification = await verifyAndDecode(signedPayload);
    const notificationType = notification.notificationType as string;
    const data = notification.data as Record<string, unknown> | undefined;
    if (!data?.signedTransactionInfo) {
      // Notification types like TEST or CONSUMPTION_REQUEST carry no
      // transaction to act on -- acknowledge and move on.
      return new Response(JSON.stringify({ received: true }), { status: 200 });
    }

    const transactionInfo = await verifyAndDecode(data.signedTransactionInfo as string);
    const originalTransactionId = String(transactionInfo.originalTransactionId);
    const expiresAtMs = transactionInfo.expiresDate as number | undefined;
    const revoked = Boolean(transactionInfo.revocationDate);

    const adminClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const grantTypes = new Set(['SUBSCRIBED', 'DID_RENEW']);
    const revokeTypes = new Set(['EXPIRED', 'GRACE_PERIOD_EXPIRED', 'REFUND', 'REVOKE']);

    if (revoked || revokeTypes.has(notificationType)) {
      const { data: rows, error } = await adminClient
        .from('profiles')
        .update({ is_premium: false })
        .eq('apple_original_transaction_id', originalTransactionId)
        .eq('premium_source', 'apple')
        .select();
      console.log('apple-notifications revoke', JSON.stringify({ notificationType, originalTransactionId, error, rows: rows?.length }));
    } else if (grantTypes.has(notificationType) && expiresAtMs) {
      const { data: rows, error } = await adminClient
        .from('profiles')
        .update({
          is_premium: true,
          premium_source: 'apple',
          premium_expires_at: new Date(expiresAtMs).toISOString(),
        })
        .eq('apple_original_transaction_id', originalTransactionId)
        .select();
      console.log('apple-notifications grant', JSON.stringify({ notificationType, originalTransactionId, error, rows: rows?.length }));
    } else {
      console.log('apple-notifications ignored', JSON.stringify({ notificationType }));
    }

    return new Response(JSON.stringify({ received: true }), {
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
