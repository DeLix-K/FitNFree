import { supabase } from './supabase';

export type ReportKind = 'user' | 'challenge' | 'squad' | 'trainer';

export const SUPPORT_EMAIL = 'teamlix6@gmail.com';

// Files a report about something another person published (see
// supabase/content_reports.sql). Reviewed by the team, who aim to act within 24
// hours; content that breaks the Terms is removed and the account can be
// suspended.
export async function reportContent(params: {
  kind: ReportKind;
  targetId: string;
  reportedUserId?: string | null;
  label?: string | null;
  reason: string;
}): Promise<void> {
  const reason = params.reason.trim();
  if (!reason) throw new Error('Please tell us what is wrong.');

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error('Not signed in.');

  const { error } = await supabase.from('content_reports').insert({
    reporter_user_id: userId,
    kind: params.kind,
    target_id: params.targetId,
    reported_user_id: params.reportedUserId ?? null,
    label: params.label ? params.label.slice(0, 200) : null,
    reason: reason.slice(0, 1000),
  });

  if (error) throw new Error(error.message);
}
