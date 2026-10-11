// Supabase Edge Function: receives Apple's App Store Server Notifications V2
// and keeps profiles.is_premium in sync with renewals/expirations/refunds
// for subscriptions purchased via Apple IAP -- the Apple-side equivalent of
// stripe-webhook.
// Deploy via the Supabase dashboard: Edge Functions > Create a new function.
// IMPORTANT: turn "Enforce JWT Verification" OFF -- Apple can't send a
// Supabase JWT. Security instead comes from verifying Apple's JWS signature
// below: the x5c certificate chain in each JWS must lead to Apple Root CA - G3,
// which is pinned in this file. A JWS signed by any other certificate -- for
// example one an attacker generated and put in the header themselves -- is
// rejected.
//
// Register this function's URL in App Store Connect > FitNFree >
// App Information > App Store Server Notifications (Production and Sandbox
// URLs, Version 2).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { importX509, jwtVerify, decodeProtectedHeader } from 'npm:jose@5';
import { X509Certificate, createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';

const APP_BUNDLE_ID = Deno.env.get('APPLE_BUNDLE_ID') ?? 'com.teamk.fitnfree';

// BEGIN verifier (extracted and tested by scripts/security/apple-jws.test.mjs -- keep the markers)
// Apple Root CA - G3, from https://www.apple.com/certificateauthority/ (DER, base64).
const APPLE_ROOT_CA_G3_B64 =
  'MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwSQXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9uIEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcNMTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBSb290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9yaXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtfTjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySrMA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gAMGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM6BgD56KyKA==';
const APPLE_ROOT_CA_G3_SHA256 = '63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179';

// Apple marks its signing leaf with 1.2.840.113635.100.6.11.1 and its
// intermediate with 1.2.840.113635.100.6.2.1 (DER-encoded OID bytes).
const APPLE_LEAF_OID = Buffer.from('2a864886f76364060b01', 'hex');
const APPLE_INTERMEDIATE_OID = Buffer.from('2a864886f763640602' + '01', 'hex');

function pinnedAppleRoot(rootB64 = APPLE_ROOT_CA_G3_B64, expectedSha256 = APPLE_ROOT_CA_G3_SHA256): X509Certificate {
  const der = Buffer.from(rootB64, 'base64');
  if (createHash('sha256').update(der).digest('hex') !== expectedSha256) {
    throw new Error('Pinned Apple root certificate is corrupt.');
  }
  return new X509Certificate(der);
}

function validNow(cert: X509Certificate, now: Date): boolean {
  return now >= new Date(cert.validFrom) && now <= new Date(cert.validTo);
}

// Walks leaf -> intermediate(s) -> the pinned Apple root. Returns the leaf.
function verifyAppleChain(
  x5c: string[],
  now: Date,
  root: X509Certificate,
  requireAppleOids: boolean,
): X509Certificate {
  if (!Array.isArray(x5c) || x5c.length < 2 || x5c.length > 4) {
    throw new Error('Unexpected certificate chain length.');
  }
  const certs = x5c.map((c) => new X509Certificate(Buffer.from(c, 'base64')));
  const chain = [...certs];
  // A sender-supplied root is never trusted; if present it must be the pinned one.
  const last = chain[chain.length - 1];
  if (last.fingerprint256 === root.fingerprint256) chain.pop();
  else if (last.checkIssued(last)) throw new Error('Chain ends in an untrusted root.');

  for (let i = 0; i < chain.length; i++) {
    const issuer = i + 1 < chain.length ? chain[i + 1] : root;
    if (!validNow(chain[i], now)) throw new Error('Certificate outside its validity period.');
    if (!chain[i].checkIssued(issuer) || !chain[i].verify(issuer.publicKey)) {
      throw new Error('Certificate chain does not lead to the Apple root.');
    }
  }
  if (!validNow(root, now)) throw new Error('Apple root outside its validity period.');

  if (requireAppleOids) {
    const leaf = chain[0];
    const intermediate = chain[chain.length - 1];
    if (!leaf.raw.includes(APPLE_LEAF_OID) || !intermediate.raw.includes(APPLE_INTERMEDIATE_OID)) {
      throw new Error('Certificate is not an Apple App Store signing certificate.');
    }
  }
  return certs[0];
}

async function verifyAndDecode(
  jws: string,
  opts: { now?: Date; root?: X509Certificate; requireAppleOids?: boolean } = {},
): Promise<Record<string, unknown>> {
  if (typeof jws !== 'string' || jws.length > 20000) throw new Error('Bad JWS.');
  const header = decodeProtectedHeader(jws);
  if (header.alg !== 'ES256') throw new Error('Unexpected JWS algorithm.');
  const x5c = header.x5c as string[] | undefined;
  if (!x5c) throw new Error('No certificate chain in JWS header.');

  const leaf = verifyAppleChain(
    x5c,
    opts.now ?? new Date(),
    opts.root ?? pinnedAppleRoot(),
    opts.requireAppleOids ?? true,
  );
  const publicKey = await importX509(leaf.toString(), 'ES256');
  const { payload } = await jwtVerify(jws, publicKey, { algorithms: ['ES256'] });
  return payload as Record<string, unknown>;
}
// END verifier

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
    if (data.bundleId !== APP_BUNDLE_ID) {
      console.log('apple-notifications ignored: wrong bundle', JSON.stringify({ bundleId: data.bundleId }));
      return new Response(JSON.stringify({ received: true }), { status: 200 });
    }

    const transactionInfo = await verifyAndDecode(data.signedTransactionInfo as string);
    if (transactionInfo.bundleId !== APP_BUNDLE_ID) {
      return new Response(JSON.stringify({ received: true }), { status: 200 });
    }
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
    // Log the detail server-side; don't echo internals (or attacker input) back.
    console.error(err);
    return new Response(JSON.stringify({ error: 'Invalid notification.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
