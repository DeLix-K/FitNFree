import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { LIMITS, answerRows, newestFirst, unreadCount, type Link, type Submission } from '../../lib/checkinForms';
import type { CheckinApi } from '../../lib/checkinFormsApi';
import { dark } from '../../lib/theme';

const when = (iso: string): string => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ' ' + new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

// The check-ins clients have sent. Opening one marks it read; you can write feedback the client sees. Only check-ins from clients who are still linked appear.
export default function InboxPanel({ api, links, inbox, reload }: { api: CheckinApi; links: Link[]; inbox: Submission[]; reload: () => Promise<void> }) {
  const [open, setOpen] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [readNow, setReadNow] = useState<Set<string>>(new Set());

  const label = (id: string): string => links.find((l) => l.id === id)?.label ?? 'Client';
  const isUnread = (s: Submission): boolean => s.read_at === null && !readNow.has(s.id);
  const shown = newestFirst(inbox).filter((s) => !unreadOnly || isUnread(s));
  const unread = unreadCount(inbox.filter((s) => !readNow.has(s.id)));

  const toggle = async (s: Submission) => {
    const next = open === s.id ? null : s.id;
    setOpen(next);
    setNotice(null);
    if (next && isUnread(s)) {
      setReadNow((r) => new Set(r).add(s.id));
      try {
        await api.markRead(s.id);
      } catch {
        /* it stays unread; opening it again retries */
        setReadNow((r) => {
          const n = new Set(r);
          n.delete(s.id);
          return n;
        });
      }
    }
  };

  const saveFeedback = async (s: Submission) => {
    setBusy(s.id);
    setError(null);
    setNotice(null);
    try {
      await api.review(s.id, drafts[s.id] ?? s.trainer_feedback ?? '');
      setNotice('Feedback saved. The client sees it in their check-ins.');
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View>
      <View style={styles.head}>
        <Text style={styles.count}>{unread > 0 ? `${unread} unread` : 'All read'}</Text>
        <Pressable onPress={() => setUnreadOnly(!unreadOnly)} accessibilityRole="button" accessibilityState={{ selected: unreadOnly }}>
          <Text style={styles.filter}>{unreadOnly ? 'Show all' : 'Unread only'}</Text>
        </Pressable>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {notice ? <Text style={styles.ok}>{notice}</Text> : null}

      {shown.length === 0 ? (
        <Text style={styles.empty}>{inbox.length === 0 ? 'No check-ins yet. When a linked client sends one, it appears here.' : 'Nothing unread.'}</Text>
      ) : (
        shown.map((s) => {
          const rows = answerRows(s);
          return (
            <View key={s.id} style={styles.card}>
              <Pressable onPress={() => toggle(s)} accessibilityRole="button" accessibilityLabel={`${label(s.link_id)}, ${when(s.submitted_at)}${isUnread(s) ? ', unread' : ''}`}>
                <View style={styles.top}>
                  <View style={styles.nameRow}>
                    {isUnread(s) ? <View style={styles.dot} /> : null}
                    <Text style={styles.name}>{label(s.link_id)}</Text>
                  </View>
                  <Text style={styles.meta}>{when(s.submitted_at)}</Text>
                </View>
                <Text style={styles.meta}>
                  {s.form.title} · {rows.length} answer{rows.length === 1 ? '' : 's'}
                  {s.trainer_feedback ? ' · you replied' : ''}
                </Text>
              </Pressable>

              {open === s.id && (
                <View style={{ marginTop: 10 }}>
                  {rows.map((r) => (
                    <View key={r.id} style={styles.answer}>
                      <Text style={styles.answerLabel}>{r.label}</Text>
                      <Text style={styles.answerValue}>{r.value}</Text>
                    </View>
                  ))}
                  <Text style={styles.answerLabel}>Your feedback to the client</Text>
                  <TextInput
                    style={styles.input}
                    value={drafts[s.id] ?? s.trainer_feedback ?? ''}
                    onChangeText={(v) => setDrafts((d) => ({ ...d, [s.id]: v }))}
                    multiline
                    maxLength={LIMITS.feedback}
                    placeholder="Optional"
                    placeholderTextColor={dark.textFaint}
                    accessibilityLabel="Feedback"
                  />
                  <Pressable style={[styles.save, busy === s.id && styles.off]} onPress={() => saveFeedback(s)} disabled={busy === s.id} accessibilityRole="button">
                    {busy === s.id ? <ActivityIndicator color="#0a0a0a" size="small" /> : <Text style={styles.saveText}>Save feedback</Text>}
                  </Pressable>
                </View>
              )}
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  count: { color: dark.text, fontSize: 15, fontWeight: '700' },
  filter: { color: dark.accent, fontSize: 13, fontWeight: '700' },
  error: { color: dark.danger, fontSize: 13, marginBottom: 8 },
  ok: { color: dark.accent, fontSize: 13, marginBottom: 8 },
  empty: { color: dark.textMuted, fontSize: 13, lineHeight: 19 },
  card: { borderWidth: 1, borderColor: dark.border, backgroundColor: dark.surface, borderRadius: 14, padding: 14, marginBottom: 12 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: dark.accent },
  name: { color: dark.text, fontSize: 16, fontWeight: '700' },
  meta: { color: dark.textFaint, fontSize: 12 },
  answer: { borderTopWidth: 1, borderTopColor: dark.border, paddingVertical: 8 },
  answerLabel: { color: dark.textFaint, fontSize: 12, marginBottom: 2, marginTop: 4 },
  answerValue: { color: dark.text, fontSize: 14, lineHeight: 20 },
  input: { backgroundColor: dark.background, borderWidth: 1, borderColor: dark.border, borderRadius: 10, color: dark.text, padding: 12, fontSize: 14, minHeight: 80, textAlignVertical: 'top', marginTop: 4 },
  save: { backgroundColor: dark.accent, borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 10 },
  saveText: { color: '#0a0a0a', fontSize: 14, fontWeight: '800' },
  off: { opacity: 0.5 },
});
