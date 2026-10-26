// Checks lib/sentryScrub.ts. Needs Node 22.6+ (it runs the TypeScript file directly).
//   node scripts/test-sentry-scrub.mjs
import assert from 'node:assert/strict';
import { scrubBreadcrumb, scrubEvent, scrubText } from '../lib/sentryScrub.ts';

let n = 0;
const t = (name, fn) => {
  try {
    fn();
    console.log('  ok  ', name);
    n++;
  } catch (e) {
    console.log('  FAIL', name, '\n      ', e.message);
    process.exitCode = 1;
  }
};

const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.abc_DEF-123';

t('emails and sign-in tokens are blanked out of text', () => {
  assert.equal(scrubText('could not save for sam.smith+gym@example.co.uk now'), 'could not save for [email] now');
  assert.equal(scrubText(`Bearer ${JWT} rejected`), 'Bearer [token] rejected');
  assert.equal(scrubText('nothing private here'), 'nothing private here');
});

t('an event loses the user, request body, cookies and headers, and its messages are scrubbed', () => {
  const e = scrubEvent({
    user: { id: '1', email: 'a@b.co', ip_address: '1.2.3.4' },
    message: 'failed for a@b.co',
    request: { data: { prompt: 'my meal plan' }, cookies: 'x=1', headers: { Authorization: `Bearer ${JWT}` }, query_string: 'q=secret', url: 'https://x.test/a' },
    exception: { values: [{ value: `Invalid token ${JWT} for me@example.com` }] },
    breadcrumbs: [{ message: 'user me@example.com tapped' }],
  });
  assert.equal(e.user, undefined);
  assert.deepEqual(Object.keys(e.request).sort(), ['url']);
  assert.equal(e.message, 'failed for [email]');
  assert.equal(e.exception.values[0].value, 'Invalid token [token] for [email]');
  assert.equal(e.breadcrumbs[0].message, 'user [email] tapped');
});

t('an event with nothing sensitive passes through untouched', () => {
  const e = scrubEvent({ message: 'Network request failed' });
  assert.deepEqual(e, { message: 'Network request failed' });
});

t('console breadcrumbs are dropped, and web addresses lose their query string', () => {
  assert.equal(scrubBreadcrumb({ category: 'console', message: 'AI prompt: what should I eat' }), null);
  const b = scrubBreadcrumb({ category: 'fetch', data: { url: 'https://api.test/v1/items?token=abc&q=food', status_code: 200 } });
  assert.equal(b.data.url, 'https://api.test/v1/items');
  assert.equal(b.data.status_code, 200);
  assert.equal(scrubBreadcrumb({ category: 'ui.tap', message: 'Button' }).message, 'Button');
});

console.log(n, 'passed');
