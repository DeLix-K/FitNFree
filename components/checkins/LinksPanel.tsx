import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { LIMITS, formatCode, inviteState, type Link } from '../../lib/checkinForms';
import type { CheckinApi } from '../../lib/checkinFormsApi';
import { dark } from '../../lib/theme';
import type { ToolsApi } from '../../lib/trainerToolsApi';
import type { TrainerClient } from '../../lib/trainerTools';
import { Field } from '../trainerTools/Fields';
import { confirmAction } from './confirm';

const day = (iso: string): string => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

// Who is linked to the trainer's check-in form, and the one-time invite codes that link them. A person is linked only by typing a code you made for them, and
// either of you can end the link. You see the name you typed for them, never who they are in the app.
export default function LinksPanel({ api, tools, links, reload }: { api: CheckinApi; tools: ToolsApi; links: Link[]; reload: () => Promise<void> }) {
  const [label, setLabel] = useState('');
  const [tracked, setTracked] = useState<TrainerClient[]>([]);
  const [trackedId, setTrackedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<{ code: string; label: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const now = Date.now();

  useEffect(() => {
    let live = true;
    tools
      .fetchClients()
      .then((c) => live && setTracked(c.filter((x) => x.status === 'active')))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [tools]);

  const create = async () => {
    if (busy) return;
    const name = label.trim();
    if (!name) {
      setError('Enter a name for the client, so you know who the code is for.');
      return;
    }
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const code = await api.createInvite(name, trackedId);
      setFresh({ code, label: name });
      setLabel('');
      setTrackedId(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    if (!fresh) return;
    const text = `Your FitNFree check-in code is ${formatCode(fresh.code)}. In the app, open Profile, then "My coaching check-ins", and enter it. It works once and expires in 7 days.`;
    try {
      if (Platform.OS === 'web') {
        await navigator.clipboard?.writeText(text);
        setCopied(true);
      } else await Share.share({ message: text });
    } catch {
      /* the person closed the share sheet */
    }
  };

  const end = async (l: Link) => {
    const active = l.status === 'active';
    const ok = await confirmAction(
      active ? `Stop check-ins with ${l.label}?` : `Withdraw the invite for ${l.label}?`,
      active ? 'You will no longer be able to read their check-ins, including past ones, and they cannot send more. They keep their own copy.' : 'The code stops working.',
      active ? 'Stop' : 'Withdraw'
    );
    if (!ok) return;
    setError(null);
    try {
      await api.endLink(l.id);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const active = links.filter((l) => l.status === 'active');
  const waiting = links.filter((l) => l.status === 'invited');
  const ended = links.filter((l) => l.status === 'ended');

  return (
    <View>
      <Text style={styles.note}>A client is linked only when they type a code you make for them. They can stop sharing at any time, and so can you.</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Invite a client</Text>
        {tracked.length > 0 && (
          <View style={styles.chips}>
            {tracked.slice(0, 12).map((c) => (
              <Pressable
                key={c.id}
                style={[styles.chip, trackedId === c.id && styles.chipOn]}
                onPress={() => {
                  setTrackedId(trackedId === c.id ? null : c.id);
                  if (trackedId !== c.id) setLabel(c.name);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: trackedId === c.id }}
              >
                <Text style={[styles.chipText, trackedId === c.id && styles.chipTextOn]}>{c.name}</Text>
              </Pressable>
            ))}
          </View>
        )}
        <Field label="Name (first name or initials)" value={label} onChange={setLabel} maxLength={LIMITS.labelClient} placeholder="e.g. Sam J" />
        <Pressable style={[styles.primary, busy && styles.off]} onPress={create} disabled={busy} accessibilityRole="button">
          {busy ? <ActivityIndicator color="#0a0a0a" size="small" /> : <Text style={styles.primaryText}>Make an invite code</Text>}
        </Pressable>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      {fresh && (
        <View style={[styles.card, styles.fresh]}>
          <Text style={styles.cardTitle}>Code for {fresh.label}</Text>
          <Text style={styles.code} accessibilityLabel={`Invite code ${fresh.code.split('').join(' ')}`} selectable>
            {formatCode(fresh.code)}
          </Text>
          <Text style={styles.note}>Send it to your client now. It works once, expires in 7 days, and cannot be shown again after you leave this screen.</Text>
          <View style={styles.row}>
            <Pressable style={styles.secondary} onPress={send} accessibilityRole="button">
              <Text style={styles.secondaryText}>{Platform.OS === 'web' ? (copied ? 'Copied' : 'Copy message') : 'Send…'}</Text>
            </Pressable>
            <Pressable style={styles.secondary} onPress={() => setFresh(null)} accessibilityRole="button">
              <Text style={styles.secondaryText}>Done</Text>
            </Pressable>
          </View>
        </View>
      )}

      <Text style={styles.section}>Linked clients ({active.length})</Text>
      {active.length === 0 ? <Text style={styles.note}>No one is linked yet.</Text> : null}
      {active.map((l) => (
        <View key={l.id} style={styles.listRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowName}>{l.label}</Text>
            <Text style={styles.rowMeta}>Linked {l.accepted_at ? day(l.accepted_at) : ''}</Text>
          </View>
          <Pressable onPress={() => end(l)} accessibilityRole="button" accessibilityLabel={`Stop check-ins with ${l.label}`}>
            <Text style={styles.danger}>Stop</Text>
          </Pressable>
        </View>
      ))}

      {waiting.length > 0 && <Text style={styles.section}>Waiting for the client ({waiting.length})</Text>}
      {waiting.map((l) => {
        const s = inviteState(l, now);
        return (
          <View key={l.id} style={styles.listRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowName}>{l.label}</Text>
              <Text style={styles.rowMeta}>{s.kind === 'waiting' ? `Code expires in ${s.daysLeft} day${s.daysLeft === 1 ? '' : 's'}` : 'Code expired'}</Text>
            </View>
            <Pressable onPress={() => end(l)} accessibilityRole="button" accessibilityLabel={`Withdraw the invite for ${l.label}`}>
              <Text style={styles.danger}>Withdraw</Text>
            </Pressable>
          </View>
        );
      })}

      {ended.length > 0 && <Text style={styles.section}>Ended ({ended.length})</Text>}
      {ended.slice(0, 20).map((l) => (
        <View key={l.id} style={styles.listRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowName, { color: dark.textMuted }]}>{l.label}</Text>
            <Text style={styles.rowMeta}>
              {l.ended_by_role === 'client' ? 'Stopped by the client' : l.ended_by_role === 'trainer' ? 'Ended by you' : 'Ended'}
              {l.ended_at ? ` · ${day(l.ended_at)}` : ''}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  note: { color: dark.textFaint, fontSize: 12, lineHeight: 18, marginBottom: 12 },
  card: { borderWidth: 1, borderColor: dark.border, backgroundColor: dark.surface, borderRadius: 14, padding: 14, marginBottom: 14 },
  fresh: { borderColor: dark.accent },
  cardTitle: { color: dark.text, fontSize: 15, fontWeight: '700', marginBottom: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: { borderWidth: 1, borderColor: dark.border, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7 },
  chipOn: { borderColor: dark.accent, backgroundColor: dark.surfaceElevated },
  chipText: { color: dark.textMuted, fontSize: 13, fontWeight: '600' },
  chipTextOn: { color: dark.accent },
  primary: { backgroundColor: dark.accent, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  primaryText: { color: '#0a0a0a', fontSize: 15, fontWeight: '800' },
  off: { opacity: 0.5 },
  error: { color: dark.danger, fontSize: 13, marginTop: 8 },
  code: { color: dark.accent, fontSize: 32, fontWeight: '800', letterSpacing: 4, textAlign: 'center', marginVertical: 10 },
  row: { flexDirection: 'row', gap: 10 },
  secondary: { borderWidth: 1, borderColor: dark.border, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 16 },
  secondaryText: { color: dark.text, fontSize: 13, fontWeight: '700' },
  section: { color: dark.text, fontSize: 15, fontWeight: '700', marginTop: 8, marginBottom: 8 },
  listRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: dark.border, paddingVertical: 10 },
  rowName: { color: dark.text, fontSize: 15, fontWeight: '600' },
  rowMeta: { color: dark.textFaint, fontSize: 12, marginTop: 2 },
  danger: { color: dark.danger, fontSize: 13, fontWeight: '700', paddingLeft: 12 },
});
