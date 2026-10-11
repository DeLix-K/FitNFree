// Proves the old Apple notification verifier accepted forged JWS and the new one doesn't.
// Run: node scripts/security/apple-jws.test.mjs   (needs openssl on PATH, Node 22.18+)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { X509Certificate } from 'node:crypto';
import assert from 'node:assert/strict';
import { SignJWT, importPKCS8, importX509, jwtVerify, decodeProtectedHeader } from 'jose';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '../../supabase/functions/apple-notifications/index.ts'), 'utf8');
const block = src.slice(src.indexOf('// BEGIN verifier'), src.indexOf('// END verifier'));
const tmpTs = join(here, '.verifier.tmp.ts');
writeFileSync(
  tmpTs,
  [
    "import { importX509, jwtVerify, decodeProtectedHeader } from 'jose';",
    "import { X509Certificate, createHash } from 'node:crypto';",
    "import { Buffer } from 'node:buffer';",
    block,
    'export { verifyAndDecode, pinnedAppleRoot };',
  ].join('\n'),
);
const { verifyAndDecode, pinnedAppleRoot } = await import(pathToFileURL(tmpTs).href);
rmSync(tmpTs);

const dir = mkdtempSync(join(tmpdir(), 'jws-'));
const sh = (...a) => execFileSync('openssl', a, { cwd: dir, stdio: 'pipe' });
const OIDS = { leaf: '1.2.840.113635.100.6.11.1', inter: '1.2.840.113635.100.6.2.1' };

function makeChain(prefix, { oids = true, days = 365 } = {}) {
  const conf = (name) =>
    writeFileSync(
      join(dir, `${name}.cnf`),
      [
        '[req]',
        'distinguished_name=dn',
        'prompt=no',
        '[dn]',
        `CN=${prefix}-${name}`,
        '[ext_root]',
        'basicConstraints=critical,CA:true',
        'keyUsage=critical,keyCertSign',
        '[ext_inter]',
        'basicConstraints=critical,CA:true',
        'keyUsage=critical,keyCertSign',
        oids ? `${OIDS.inter}=ASN1:NULL` : '',
        '[ext_leaf]',
        'basicConstraints=CA:false',
        oids ? `${OIDS.leaf}=ASN1:NULL` : '',
        '',
      ].join('\n'),
    );
  for (const n of ['root', 'inter', 'leaf']) conf(n);
  const curve = (n) => (n === 'leaf' ? 'prime256v1' : 'secp384r1');
  for (const n of ['root', 'inter', 'leaf']) {
    sh('ecparam', '-name', curve(n), '-genkey', '-noout', '-out', `${prefix}-${n}.key`);
  }
  sh('req', '-new', '-x509', '-key', `${prefix}-root.key`, '-sha384', '-days', String(days), '-config', 'root.cnf', '-extensions', 'ext_root', '-out', `${prefix}-root.pem`);
  for (const [n, issuer, ext] of [['inter', 'root', 'ext_inter'], ['leaf', 'inter', 'ext_leaf']]) {
    sh('req', '-new', '-key', `${prefix}-${n}.key`, '-config', `${n}.cnf`, '-out', `${prefix}-${n}.csr`);
    sh('x509', '-req', '-in', `${prefix}-${n}.csr`, '-CA', `${prefix}-${issuer}.pem`, '-CAkey', `${prefix}-${issuer}.key`, '-CAcreateserial', '-days', String(days), '-sha384', '-extfile', `${n}.cnf`, '-extensions', ext, '-out', `${prefix}-${n}.pem`);
  }
  const cert = (n) => new X509Certificate(readFileSync(join(dir, `${prefix}-${n}.pem`)));
  const der = (n) => cert(n).raw.toString('base64');
  return {
    root: cert('root'),
    x5c: [der('leaf'), der('inter')],
    withRoot: [der('leaf'), der('inter'), der('root')],
    keyPem: execFileSync('openssl', ['pkcs8', '-topk8', '-nocrypt', '-in', join(dir, `${prefix}-leaf.key`)]).toString(),
  };
}

async function sign(chain, payload, alg = 'ES256') {
  const key = await importPKCS8(chain.keyPem, alg);
  return new SignJWT(payload).setProtectedHeader({ alg, x5c: chain.x5c }).sign(key);
}

// The verifier exactly as it was before this fix.
async function oldVerify(jws) {
  const x5c = decodeProtectedHeader(jws).x5c;
  const pem = `-----BEGIN CERTIFICATE-----\n${x5c[0].match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----`;
  return (await jwtVerify(jws, await importX509(pem, 'ES256'))).payload;
}

const forgedBody = { notificationType: 'DID_RENEW', data: { bundleId: 'com.teamk.fitnfree', signedTransactionInfo: 'x' } };
let passed = 0;
const t = async (name, fn) => {
  try {
    await fn();
    console.log(`  ok   ${name}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL ${name}\n       ${e.message}`);
    process.exitCode = 1;
  }
};
const rejects = (p) => assert.rejects(p);

const apple = makeChain('apple'); // stands in for Apple's real hierarchy
const attacker = makeChain('attacker'); // attacker-made hierarchy carrying the same OIDs
const noOids = makeChain('plain', { oids: false });
const expired = makeChain('old', { days: 1 });

console.log('Vulnerability (old verifier):');
await t('old code ACCEPTS a JWS signed by an attacker-made certificate', async () => {
  const jws = await sign(attacker, forgedBody);
  assert.equal((await oldVerify(jws)).notificationType, 'DID_RENEW');
});

console.log('Fixed verifier:');
await t('rejects the same forged JWS (real pinned Apple root)', async () => rejects(verifyAndDecode(await sign(attacker, forgedBody))));
await t('rejects an attacker chain that includes its own root', async () => {
  await rejects(verifyAndDecode(await sign({ ...attacker, x5c: attacker.withRoot }, forgedBody)));
});
await t('rejects a bare self-signed leaf', async () => {
  await rejects(verifyAndDecode(await sign({ ...attacker, x5c: [attacker.x5c[0]] }, forgedBody)));
});
await t('accepts a valid chain to the trusted root', async () => {
  const out = await verifyAndDecode(await sign(apple, forgedBody), { root: apple.root });
  assert.equal(out.notificationType, 'DID_RENEW');
});
await t('accepts the chain when the sender also appends the trusted root', async () => {
  const out = await verifyAndDecode(await sign({ ...apple, x5c: apple.withRoot }, forgedBody), { root: apple.root });
  assert.equal(out.notificationType, 'DID_RENEW');
});
await t('rejects a valid chain when the pinned root is a different one', async () =>
  rejects(verifyAndDecode(await sign(apple, forgedBody), { root: attacker.root })));
await t('rejects an expired chain', async () =>
  rejects(verifyAndDecode(await sign(expired, forgedBody), { root: expired.root, now: new Date(Date.now() + 5 * 864e5) })));
await t('rejects a chain without Apple signing-certificate OIDs', async () =>
  rejects(verifyAndDecode(await sign(noOids, forgedBody), { root: noOids.root })));
await t('accepts that same chain with the OID check off (so the OIDs were the cause)', async () =>
  assert.ok(await verifyAndDecode(await sign(noOids, forgedBody), { root: noOids.root, requireAppleOids: false })));
await t('rejects a tampered payload', async () => {
  const parts = (await sign(apple, forgedBody)).split('.');
  parts[1] = Buffer.from(JSON.stringify({ ...forgedBody, notificationType: 'SUBSCRIBED' })).toString('base64url');
  await rejects(verifyAndDecode(parts.join('.'), { root: apple.root }));
});
await t('rejects a non-ES256 algorithm', async () => {
  const jws = await new SignJWT(forgedBody).setProtectedHeader({ alg: 'HS256', x5c: apple.x5c }).sign(new Uint8Array(32));
  await rejects(verifyAndDecode(jws, { root: apple.root }));
});
await t('the pinned root in the source is Apple Root CA - G3', () => {
  assert.equal(
    pinnedAppleRoot().fingerprint256,
    '63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79',
  );
});
await t('a corrupted pin is refused', () => assert.throws(() => pinnedAppleRoot('AAAA')));

rmSync(dir, { recursive: true, force: true });
console.log(`${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
