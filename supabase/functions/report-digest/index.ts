// Supabase Edge Function: emails you a digest of content and chat reports that have not been mentioned yet.
// Called on a schedule (see supabase/report_digest_cron.sql), not by the app. It has no Supabase sign-in token, so deploy it with
//   supabase functions deploy report-digest --no-verify-jwt
// and it protects itself: the caller must send the header  x-digest-secret  matching the DIGEST_SECRET secret.
// Secrets to set in Supabase (Edge Functions > Secrets): RESEND_API_KEY, REPORT_ALERT_EMAIL, DIGEST_SECRET,
// and optionally REPORT_FROM_EMAIL. Logic and tests: digest.ts, scripts/test-report-digest.mjs.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { runDigest, secretOk, type Db, type Env, type Unsent } from './digest.ts';

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const env = Deno.env.toObject() as Env;
  if (!secretOk(req.headers.get('x-digest-secret'), env.DIGEST_SECRET)) return json(401, { error: 'unauthorized' });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const db: Db = {
    unsent: async () => {
      const { data, error } = await admin.rpc('unsent_reports', { p_limit: 100 });
      if (error) throw new Error(error.message);
      return data as Unsent;
    },
    markSent: async (content, messages) => {
      const { error } = await admin.rpc('mark_reports_sent', { p_content: content, p_messages: messages });
      if (error) throw new Error(error.message);
    },
  };

  const r = await runDigest({ db, env, fetchImpl: fetch });
  return json(r.status, r.body);
});
