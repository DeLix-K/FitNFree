import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import FormEditor from '../checkins/FormEditor';
import InboxPanel from '../checkins/InboxPanel';
import LinksPanel from '../checkins/LinksPanel';
import { unreadCount, type Link, type Submission } from '../../lib/checkinForms';
import { realCheckinApi, type CheckinApi } from '../../lib/checkinFormsApi';
import type { ToolsApi } from '../../lib/trainerToolsApi';
import { dark } from '../../lib/theme';

type Part = 'inbox' | 'clients' | 'form';

// The trainer's side of check-in forms: the inbox of check-ins clients sent, the clients linked by invite code, and the form itself.
export default function ClientFormsTab({ tools, checkin = realCheckinApi }: { tools: ToolsApi; checkin?: CheckinApi }) {
  const [part, setPart] = useState<Part>('inbox');
  const [links, setLinks] = useState<Link[] | null>(null);
  const [inbox, setInbox] = useState<Submission[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [l, i] = await Promise.all([checkin.listLinks(), checkin.listInbox()]);
      setLinks(l);
      setInbox(i);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLinks((l) => l ?? []);
    }
  }, [checkin]);
  useEffect(() => {
    load();
  }, [load]);

  if (links === null) return <ActivityIndicator style={{ marginTop: 40 }} color={dark.accent} />;
  const unread = unreadCount(inbox);

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.parts}>
        {(
          [
            ['inbox', unread > 0 ? `Inbox (${unread})` : 'Inbox'],
            ['clients', 'Clients'],
            ['form', 'Form'],
          ] as [Part, string][]
        ).map(([value, label]) => (
          <Pressable key={value} style={[styles.part, part === value && styles.partOn]} onPress={() => setPart(value)} accessibilityRole="button" accessibilityState={{ selected: part === value }}>
            <Text style={[styles.partText, part === value && styles.partTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {part === 'inbox' && <InboxPanel api={checkin} links={links} inbox={inbox} reload={load} />}
      {part === 'clients' && <LinksPanel api={checkin} tools={tools} links={links} reload={load} />}
      {part === 'form' && <FormEditor api={checkin} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 48 },
  parts: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  part: { flex: 1, borderWidth: 1, borderColor: dark.border, backgroundColor: dark.surface, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  partOn: { borderColor: dark.accent, backgroundColor: dark.surfaceElevated },
  partText: { color: dark.textMuted, fontSize: 13, fontWeight: '700' },
  partTextOn: { color: dark.accent },
  error: { color: dark.danger, fontSize: 13, marginBottom: 10 },
});
