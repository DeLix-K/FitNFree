import { supabase } from './supabase';
import { friendlyError, type Answers, type CustomQuestion, type FormDef, type Link, type MyLink, type Question, type Submission } from './checkinForms';

// Database calls for client check-in forms (see supabase/client_checkins.sql). The database decides who may see what: a trainer reads only their own form,
// links and the check-ins on links that are still active; a client reads only their own check-ins, through a function. Nothing here filters by person
// except the trainer's inbox, which names the trainer so that someone who is both a trainer and a client never gets the two mixed up.

export type RedeemResult = { ok: true; link_id: string; trainer_name: string } | { ok: false; error: string };
export type ClientForm = { title: string; intro: string | null; questions: Question[] };
export type MySubmission = Submission & { trainer_name: string };

export type CheckinApi = {
  // trainer
  getForm: () => Promise<FormDef | null>;
  saveForm: (def: FormDef) => Promise<void>;
  listLinks: () => Promise<Link[]>;
  createInvite: (label: string, trackedClientId: string | null) => Promise<string>;
  endLink: (linkId: string) => Promise<void>;
  listInbox: () => Promise<Submission[]>;
  markRead: (submissionId: string) => Promise<void>;
  review: (submissionId: string, feedback: string) => Promise<void>;
  // client
  myLinks: () => Promise<MyLink[]>;
  redeem: (code: string) => Promise<RedeemResult>;
  formForLink: (linkId: string) => Promise<ClientForm | null>;
  submit: (linkId: string, answers: Answers) => Promise<void>;
  mySubmissions: () => Promise<MySubmission[]>;
  deleteSubmission: (submissionId: string) => Promise<void>;
};

function fail(error: { message: string }): never {
  throw new Error(friendlyError(error.message));
}

async function userId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const id = data.user?.id;
  if (!id) throw new Error('Please sign in again.');
  return id;
}

const SUBMISSION_COLUMNS = 'id, link_id, form, answers, submitted_at, read_at, trainer_feedback, feedback_at';
const LINK_COLUMNS = 'id, label, status, tracked_client_id, code_expires_at, created_at, accepted_at, ended_at, ended_by_role';

export const realCheckinApi: CheckinApi = {
  async getForm() {
    const { data, error } = await supabase.from('checkin_forms').select('title, intro, standard, custom').maybeSingle();
    if (error) fail(error);
    if (!data) return null;
    const row = data as { title: string; intro: string | null; standard: string[]; custom: CustomQuestion[] };
    return { title: row.title, intro: row.intro, standard: row.standard ?? [], custom: row.custom ?? [] };
  },

  async saveForm(def) {
    const id = await userId();
    const { error } = await supabase.from('checkin_forms').upsert({ trainer_id: id, title: def.title, intro: def.intro, standard: def.standard, custom: def.custom }, { onConflict: 'trainer_id' });
    if (error) fail(error);
  },

  async listLinks() {
    const { data, error } = await supabase.from('trainer_client_links').select(LINK_COLUMNS).order('created_at', { ascending: false }).limit(500);
    if (error) fail(error);
    return (data ?? []) as unknown as Link[];
  },

  async createInvite(label, trackedClientId) {
    const { data, error } = await supabase.rpc('create_checkin_invite', { p_label: label, p_tracked_client_id: trackedClientId });
    if (error) fail(error);
    return data as unknown as string;
  },

  async endLink(linkId) {
    const { error } = await supabase.rpc('end_checkin_link', { p_link_id: linkId });
    if (error) fail(error);
  },

  async listInbox() {
    const id = await userId();
    const { data, error } = await supabase.from('checkin_submissions').select(SUBMISSION_COLUMNS).eq('trainer_id', id).order('submitted_at', { ascending: false }).limit(500);
    if (error) fail(error);
    return (data ?? []) as unknown as Submission[];
  },

  async markRead(submissionId) {
    const { error } = await supabase.rpc('mark_checkin_read', { p_submission_id: submissionId });
    if (error) fail(error);
  },

  async review(submissionId, feedback) {
    const { error } = await supabase.rpc('review_checkin', { p_submission_id: submissionId, p_feedback: feedback });
    if (error) fail(error);
  },

  async myLinks() {
    const { data, error } = await supabase.rpc('my_checkin_links');
    if (error) fail(error);
    return (data ?? []) as unknown as MyLink[];
  },

  async redeem(code) {
    const { data, error } = await supabase.rpc('redeem_checkin_invite', { p_code: code });
    if (error) fail(error);
    return data as unknown as RedeemResult;
  },

  async formForLink(linkId) {
    const { data, error } = await supabase.rpc('checkin_form_for_link', { p_link_id: linkId });
    if (error) fail(error);
    return (data ?? null) as unknown as ClientForm | null;
  },

  async submit(linkId, answers) {
    const { error } = await supabase.rpc('submit_checkin', { p_link_id: linkId, p_answers: answers });
    if (error) fail(error);
  },

  async mySubmissions() {
    const { data, error } = await supabase.rpc('my_checkin_submissions');
    if (error) fail(error);
    return ((data ?? []) as unknown as Omit<MySubmission, 'read_at'>[]).map((r) => ({ ...r, read_at: null }));
  },

  async deleteSubmission(submissionId) {
    const { error } = await supabase.rpc('delete_my_checkin', { p_submission_id: submissionId });
    if (error) fail(error);
  },
};
