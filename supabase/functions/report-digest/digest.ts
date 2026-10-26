// The logic of the report digest, kept free of Deno and Supabase imports so it can be tested in Node
// (scripts/test-report-digest.mjs). index.ts only connects it to the database and the request.
//
// What it does: finds reports nobody has been emailed about yet, sends ONE email through Resend listing them, and only then marks
// them as sent. If the email fails nothing is marked, so the next scheduled run tries again. The email contains ids and what the reporter
// wrote, never email addresses, and everything that came from a user is escaped before it goes into the HTML.

export type ContentReport = { id: string; kind: string; target_id: string; reported_user_id: string | null; label: string | null; reason: string; created_at: string };
export type MessageReport = { id: string; trainer_user_id: string; client_user_id: string; reported_user_id: string; reason: string; created_at: string };
export type Unsent = { content: ContentReport[]; messages: MessageReport[] };

export type Env = {
  RESEND_API_KEY?: string;
  REPORT_ALERT_EMAIL?: string;
  REPORT_FROM_EMAIL?: string;
  DIGEST_SECRET?: string;
  DASHBOARD_URL?: string;
};

export type Db = {
  unsent: () => Promise<Unsent>;
  markSent: (contentIds: string[], messageIds: string[]) => Promise<void>;
};

const MAX_PER_EMAIL = 50;
const MAX_REASON = 300;

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}...` : s);
const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

// Compares two strings without stopping at the first difference.
export function secretOk(provided: string | null | undefined, expected: string | null | undefined): boolean {
  if (!provided || !expected || provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

type Line = { heading: string; detail: string[]; when: string };

function lines(u: Unsent): { shown: Line[]; total: number } {
  const all: Line[] = [
    ...u.content.map((r) => ({
      heading: `${r.kind} report${r.label ? `: ${oneLine(r.label)}` : ''}`,
      detail: [`Reason: ${clip(oneLine(r.reason), MAX_REASON)}`, `Reported item id: ${r.target_id}`, ...(r.reported_user_id ? [`Reported user id: ${r.reported_user_id}`] : []), `Report id: ${r.id} (table content_reports)`],
      when: r.created_at,
    })),
    ...u.messages.map((r) => ({
      heading: 'Trainer chat message report',
      detail: [`Reason: ${clip(oneLine(r.reason), MAX_REASON)}`, `Reported user id: ${r.reported_user_id}`, `Trainer id: ${r.trainer_user_id}`, `Client id: ${r.client_user_id}`, `Report id: ${r.id} (table message_reports)`],
      when: r.created_at,
    })),
  ].sort((a, b) => a.when.localeCompare(b.when));
  return { shown: all.slice(0, MAX_PER_EMAIL), total: all.length };
}

export function buildDigest(u: Unsent, dashboardUrl: string): { subject: string; text: string; html: string; count: number } {
  const { shown, total } = lines(u);
  const subject = `FitNFree: ${total} new report${total === 1 ? '' : 's'} to review`;
  const intro = 'Apple expects reports of offensive or harmful content to be handled quickly (aim for within 24 hours). Review each report, act if needed, then record what you did in the table (reviewed_at and action).';
  const more = total > shown.length ? `${total - shown.length} more are not listed here. They will be in the next email once these are marked.` : '';
  const text = [
    subject,
    '',
    intro,
    '',
    ...shown.flatMap((l, i) => [`${i + 1}. ${l.heading} (${l.when})`, ...l.detail.map((d) => `   ${d}`), '']),
    more,
    `Open the reports: ${dashboardUrl}`,
  ].join('\n').trim();
  const html = [
    `<h2>${escapeHtml(subject)}</h2>`,
    `<p>${escapeHtml(intro)}</p>`,
    '<ol>',
    ...shown.map((l) => `<li><strong>${escapeHtml(l.heading)}</strong> <small>(${escapeHtml(l.when)})</small><br>${l.detail.map(escapeHtml).join('<br>')}</li>`),
    '</ol>',
    more ? `<p>${escapeHtml(more)}</p>` : '',
    `<p><a href="${escapeHtml(dashboardUrl)}">Open the reports in Supabase</a></p>`,
  ].join('\n');
  return { subject, text, html, count: total };
}

async function sha256Hex(s: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  return [...d].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sendViaResend(
  opts: { apiKey: string; from: string; to: string; subject: string; text: string; html: string; idempotencyKey: string },
  fetchImpl: typeof fetch
): Promise<void> {
  const res = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': opts.idempotencyKey },
    body: JSON.stringify({ from: opts.from, to: [opts.to], subject: opts.subject, text: opts.text, html: opts.html }),
  });
  if (!res.ok) throw new Error(`resend_${res.status}`);
}

// Returns the HTTP status and body for the function's response. Nothing here ever returns report text or an email address.
export async function runDigest(args: { db: Db; env: Env; fetchImpl: typeof fetch }): Promise<{ status: number; body: Record<string, unknown> }> {
  const { db, env, fetchImpl } = args;
  if (!env.RESEND_API_KEY || !env.REPORT_ALERT_EMAIL) return { status: 503, body: { error: 'not_configured' } };

  let unsent: Unsent;
  try {
    unsent = await db.unsent();
  } catch {
    return { status: 500, body: { error: 'database_error' } };
  }
  const total = unsent.content.length + unsent.messages.length;
  if (total === 0) return { status: 200, body: { sent: false, count: 0 } };

  const dashboardUrl = env.DASHBOARD_URL || 'https://supabase.com/dashboard/project/fuhvcclwsbltqvribpsq/editor';
  const email = buildDigest(unsent, dashboardUrl);
  const contentIds = unsent.content.map((r) => r.id);
  const messageIds = unsent.messages.map((r) => r.id);
  // The same set of reports always has the same key, so a retry after a half-finished run cannot send a second copy.
  const idempotencyKey = `report-digest-${await sha256Hex([...contentIds, ...messageIds].sort().join(','))}`;

  try {
    await sendViaResend({ apiKey: env.RESEND_API_KEY, from: env.REPORT_FROM_EMAIL || 'FitNFree Alerts <onboarding@resend.dev>', to: env.REPORT_ALERT_EMAIL, subject: email.subject, text: email.text, html: email.html, idempotencyKey }, fetchImpl);
  } catch {
    return { status: 502, body: { error: 'send_failed' } };
  }

  try {
    await db.markSent(contentIds, messageIds);
  } catch {
    // The email went out. Marking failed, so the next run may mention them again (the idempotency key prevents an exact duplicate for a day).
    return { status: 500, body: { error: 'sent_but_not_marked', count: total } };
  }
  return { status: 200, body: { sent: true, count: total } };
}
