import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import QuestionInput from '../components/checkins/QuestionInput';
import { confirmAction } from '../components/checkins/confirm';
import ReportContentButton from '../components/ReportContentButton';
import { answerRows, cleanAnswers, formatCode, isCompleteCode, normalizeCode, redeemMessage, type Draft, type MyLink } from '../lib/checkinForms';
import { realCheckinApi, type CheckinApi, type ClientForm, type MySubmission } from '../lib/checkinFormsApi';
import { dark } from '../lib/theme';

const day = (iso: string): string => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

// The client's side of coaching check-ins: join a trainer with an invite code, fill in the trainer's form, read their feedback, and stop whenever you like.
// What you send goes to that one trainer only (see supabase/client_checkins.sql).
export default function CoachingScreen({ onBack, api = realCheckinApi }: { onBack?: () => void; api?: CheckinApi }) {
  const [links, setLinks] = useState<MyLink[] | null>(null);
  const [subs, setSubs] = useState<MySubmission[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [filling, setFilling] = useState<MyLink | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const [l, s] = await Promise.all([api.myLinks(), api.mySubmissions()]);
      if (!mounted.current) return;
      setLinks(l);
      setSubs(s);
    } catch (e) {
      if (!mounted.current) return;
      setError(e instanceof Error ? e.message : String(e));
      setLinks((l) => l ?? []);
    }
  }, [api]);
  useEffect(() => {
    load();
  }, [load]);

  const join = async () => {
    if (joining) return;
    setError(null);
    setNotice(null);
    if (!isCompleteCode(code)) {
      setError('Enter the 8-character code from your trainer.');
      return;
    }
    setJoining(true);
    try {
      const r = await api.redeem(normalizeCode(code));
      if (!mounted.current) return;
      if (r.ok) {
        setCode('');
        setNotice(`You are now linked to ${r.trainer_name}.`);
        await load();
      } else setError(redeemMessage(r.error));
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current) setJoining(false);
    }
  };

  const endLink = async (l: MyLink) => {
    if (!(await confirmAction(`Stop sharing with ${l.trainer_name}?`, 'They will no longer be able to see your check-ins, including past ones. You keep your own copy and can delete it. You can be linked again later with a new code.', 'Stop sharing'))) return;
    setError(null);
    setNotice(null);
    try {
      await api.endLink(l.link_id);
      if (mounted.current) setNotice(`You are no longer linked to ${l.trainer_name}.`);
      await load();
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : String(e));
    }
  };

  const removeSub = async (s: MySubmission) => {
    if (!(await confirmAction('Delete this check-in?', 'It is deleted for good. If your trainer can still see it, they will not be able to after this.', 'Delete'))) return;
    setError(null);
    try {
      await api.deleteSubmission(s.id);
      await load();
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (filling) {
    return (
      <FillIn
        api={api}
        link={filling}
        onCancel={() => setFilling(null)}
        onSent={async () => {
          setFilling(null);
          setNotice(`Sent to ${filling.trainer_name}.`);
          await load();
        }}
      />
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {onBack && (
        <Pressable onPress={onBack}>
          <Text style={styles.back}>{'< Profile'}</Text>
        </Pressable>
      )}
      <Text style={styles.title}>My coaching check-ins</Text>
      <Text style={styles.intro}>If your trainer uses check-in forms, you can send them your weekly update here. Only the trainer you are linked to sees what you send, and you can stop at any time.</Text>

      {notice ? <Text style={styles.ok}>{notice}</Text> : null}
      {error ? <Text style={styles.err}>{error}</Text> : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Join a trainer</Text>
        <Text style={styles.cardText}>Your trainer gives you an 8-character code. It works once and expires after 7 days.</Text>
        <TextInput
          style={styles.codeInput}
          value={code}
          onChangeText={(v) => setCode(formatCode(v.length > 9 ? v.slice(0, 9) : v))}
          placeholder="ABCD-EFGH"
          placeholderTextColor={dark.textFaint}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={9}
          accessibilityLabel="Invite code"
        />
        <Pressable style={[styles.primary, (joining || !isCompleteCode(code)) && styles.disabled]} onPress={join} disabled={joining || !isCompleteCode(code)} accessibilityRole="button">
          {joining ? <ActivityIndicator color="#0a0a0a" size="small" /> : <Text style={styles.primaryText}>Join</Text>}
        </Pressable>
      </View>

      <Text style={styles.section}>My trainers</Text>
      {links === null ? (
        <ActivityIndicator color={dark.accent} style={{ marginTop: 12 }} />
      ) : links.length === 0 ? (
        <Text style={styles.empty}>You are not linked to a trainer yet.</Text>
      ) : (
        links.map((l) => (
          <View key={l.link_id} style={styles.card}>
            <Text style={styles.cardTitle}>{l.trainer_name}</Text>
            <Text style={styles.cardText}>
              Linked {day(l.accepted_at)}. {l.last_submitted_at ? `Last check-in ${day(l.last_submitted_at)}.` : 'No check-ins sent yet.'}
            </Text>
            {l.form_ready ? (
              <Pressable style={styles.primary} onPress={() => setFilling(l)} accessibilityRole="button" accessibilityLabel={`Fill in check-in for ${l.trainer_name}`}>
                <Text style={styles.primaryText}>Fill in check-in</Text>
              </Pressable>
            ) : (
              <Text style={styles.cardText}>{l.trainer_name} has not set up a check-in form yet.</Text>
            )}
            <View style={styles.linkActions}>
              <Pressable onPress={() => endLink(l)} accessibilityRole="button" accessibilityLabel={`Stop sharing with ${l.trainer_name}`}>
                <Text style={styles.danger}>Stop sharing</Text>
              </Pressable>
              <ReportContentButton kind="trainer" targetId={l.trainer_user_id} reportedUserId={l.trainer_user_id} label={l.trainer_name} />
            </View>
          </View>
        ))
      )}

      <Text style={styles.section}>My past check-ins</Text>
      {subs.length === 0 ? (
        <Text style={styles.empty}>Check-ins you send appear here, with your trainer's feedback.</Text>
      ) : (
        subs.map((s) => (
          <View key={s.id} style={styles.card}>
            <Pressable onPress={() => setOpen(open === s.id ? null : s.id)} accessibilityRole="button" accessibilityLabel={`${s.form.title} to ${s.trainer_name}, ${day(s.submitted_at)}`}>
              <View style={styles.rowTop}>
                <Text style={styles.cardTitle}>{day(s.submitted_at)}</Text>
                <Text style={styles.meta}>{s.trainer_name}</Text>
              </View>
              {s.trainer_feedback ? <Text style={styles.feedbackTag}>Feedback received</Text> : null}
            </Pressable>
            {open === s.id && (
              <View style={{ marginTop: 8 }}>
                {answerRows(s).map((r) => (
                  <View key={r.id} style={styles.answerRow}>
                    <Text style={styles.answerLabel}>{r.label}</Text>
                    <Text style={styles.answerValue}>{r.value}</Text>
                  </View>
                ))}
                {s.trainer_feedback ? (
                  <View style={styles.feedback}>
                    <Text style={styles.feedbackTitle}>Feedback from {s.trainer_name}</Text>
                    <Text style={styles.answerValue}>{s.trainer_feedback}</Text>
                  </View>
                ) : null}
                <Pressable onPress={() => removeSub(s)} accessibilityRole="button" accessibilityLabel="Delete this check-in" style={{ marginTop: 10 }}>
                  <Text style={styles.danger}>Delete this check-in</Text>
                </Pressable>
              </View>
            )}
          </View>
        ))
      )}
    </ScrollView>
  );
}

// The form itself.
function FillIn({ api, link, onCancel, onSent }: { api: CheckinApi; link: MyLink; onCancel: () => void; onSent: () => void | Promise<void> }) {
  const [form, setForm] = useState<ClientForm | null | undefined>(undefined);
  const [draft, setDraft] = useState<Draft>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    api
      .formForLink(link.link_id)
      .then((f) => mounted.current && setForm(f))
      .catch((e) => {
        if (!mounted.current) return;
        setMessage(e instanceof Error ? e.message : String(e));
        setForm(null);
      });
    return () => {
      mounted.current = false;
    };
  }, [api, link.link_id]);

  const send = async () => {
    if (!form || sending) return;
    const r = cleanAnswers(form.questions, draft);
    if (!r.ok) {
      setErrors(r.errors);
      setMessage(r.message);
      return;
    }
    setErrors({});
    setMessage(null);
    setSending(true);
    try {
      await api.submit(link.link_id, r.answers);
      if (mounted.current) await onSent();
    } catch (e) {
      if (mounted.current) setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current) setSending(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Pressable onPress={onCancel}>
        <Text style={styles.back}>{'< My coaching'}</Text>
      </Pressable>
      {form === undefined ? (
        <ActivityIndicator color={dark.accent} style={{ marginTop: 40 }} />
      ) : form === null ? (
        <>
          <Text style={styles.title}>Check-in</Text>
          <Text style={styles.err}>{message ?? `${link.trainer_name} has not set up a check-in form yet.`}</Text>
        </>
      ) : (
        <>
          <Text style={styles.title}>{form.title}</Text>
          {form.intro ? <Text style={styles.intro}>{form.intro}</Text> : null}
          <Text style={styles.consent}>This goes to {link.trainer_name} only. Every question is optional: skip anything you would rather not share.</Text>
          <View style={{ paddingHorizontal: 20, marginTop: 8 }}>
            {form.questions.map((q) => (
              <QuestionInput key={q.id} q={q} value={draft[q.id]} onChange={(v) => setDraft((d) => ({ ...d, [q.id]: v }))} error={errors[q.id]} />
            ))}
          </View>
          {message ? <Text style={styles.err}>{message}</Text> : null}
          <Pressable style={[styles.primary, styles.sendButton, sending && styles.disabled]} onPress={send} disabled={sending} accessibilityRole="button" accessibilityLabel={`Send check-in to ${link.trainer_name}`}>
            {sending ? <ActivityIndicator color="#0a0a0a" size="small" /> : <Text style={styles.primaryText}>Send to {link.trainer_name}</Text>}
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: dark.background },
  content: { paddingBottom: 48 },
  back: { color: dark.accent, fontSize: 14, fontWeight: '600', marginTop: 16, marginHorizontal: 20 },
  title: { fontSize: 22, fontWeight: '700', color: dark.text, paddingHorizontal: 20, paddingTop: 16, marginBottom: 8 },
  intro: { color: dark.textMuted, fontSize: 14, lineHeight: 20, paddingHorizontal: 20, marginBottom: 12 },
  consent: { color: dark.textFaint, fontSize: 12, lineHeight: 18, paddingHorizontal: 20, marginBottom: 6 },
  ok: { color: dark.accent, fontSize: 13, paddingHorizontal: 20, marginBottom: 10 },
  err: { color: dark.danger, fontSize: 13, paddingHorizontal: 20, marginBottom: 10 },
  section: { color: dark.text, fontSize: 15, fontWeight: '700', paddingHorizontal: 20, marginTop: 18, marginBottom: 8 },
  empty: { color: dark.textMuted, fontSize: 13, lineHeight: 19, paddingHorizontal: 20 },
  card: { borderWidth: 1, borderColor: dark.border, backgroundColor: dark.surface, borderRadius: 16, padding: 16, marginHorizontal: 20, marginBottom: 12 },
  cardTitle: { color: dark.text, fontSize: 16, fontWeight: '700', marginBottom: 4 },
  cardText: { color: dark.textMuted, fontSize: 13, lineHeight: 19, marginBottom: 8, paddingHorizontal: 0 },
  codeInput: { backgroundColor: dark.background, borderWidth: 1, borderColor: dark.border, borderRadius: 10, color: dark.text, paddingHorizontal: 12, paddingVertical: 12, fontSize: 20, fontWeight: '800', letterSpacing: 3, textAlign: 'center', minHeight: 50 },
  primary: { backgroundColor: dark.accent, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 10 },
  primaryText: { color: '#0a0a0a', fontSize: 15, fontWeight: '800' },
  sendButton: { marginHorizontal: 20, marginTop: 4 },
  disabled: { opacity: 0.5 },
  linkActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 },
  danger: { color: dark.danger, fontSize: 13, fontWeight: '700' },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  meta: { color: dark.textFaint, fontSize: 12 },
  feedbackTag: { color: dark.accent, fontSize: 12, fontWeight: '700' },
  answerRow: { borderTopWidth: 1, borderTopColor: dark.border, paddingVertical: 8 },
  answerLabel: { color: dark.textFaint, fontSize: 12, marginBottom: 2 },
  answerValue: { color: dark.text, fontSize: 14, lineHeight: 20 },
  feedback: { borderWidth: 1, borderColor: dark.accentDark, borderRadius: 12, padding: 12, marginTop: 10 },
  feedbackTitle: { color: dark.accent, fontSize: 12, fontWeight: '700', marginBottom: 4 },
});
