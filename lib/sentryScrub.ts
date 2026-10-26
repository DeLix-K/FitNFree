// What is removed from crash reports before they leave the phone. Pure functions with no imports, so they can be tested on their own
// (scripts/test-sentry-scrub.mjs). Used by lib/sentry.ts.

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const JWT = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;

export const scrubText = (text: string): string => text.replace(EMAIL, '[email]').replace(JWT, '[token]');

type LooseBreadcrumb = { category?: string; message?: string; data?: Record<string, unknown> };
type LooseEvent = {
  user?: unknown;
  message?: string;
  request?: { data?: unknown; cookies?: unknown; headers?: unknown; query_string?: unknown };
  exception?: { values?: { value?: string }[] };
  breadcrumbs?: LooseBreadcrumb[];
};

// Removes who the user is, what they sent, and anything that looks like an email address or a sign-in token.
export function scrubEvent<E extends LooseEvent>(event: E): E {
  delete event.user;
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.query_string;
  }
  if (event.message) event.message = scrubText(event.message);
  for (const ex of event.exception?.values ?? []) {
    if (ex.value) ex.value = scrubText(ex.value);
  }
  for (const b of event.breadcrumbs ?? []) {
    if (b.message) b.message = scrubText(b.message);
  }
  return event;
}

// Console output could contain what someone typed to the AI coach or meal and health details, so it is dropped entirely.
// Web addresses lose their query string, which can carry tokens or search text.
export function scrubBreadcrumb<B extends LooseBreadcrumb>(b: B): B | null {
  if (b.category === 'console') return null;
  if (b.data && typeof b.data.url === 'string') b.data.url = b.data.url.split('?')[0];
  return b;
}
