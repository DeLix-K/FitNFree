import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { reportContent, SUPPORT_EMAIL, type ReportKind } from '../lib/contentReports';
import { dark } from '../lib/theme';

// A small "Report" link for content written by other people. Opens a short form;
// the report goes to the team (Guideline 1.2: a way to report offensive content).
export default function ReportContentButton({
  kind,
  targetId,
  reportedUserId,
  label,
}: {
  kind: ReportKind;
  targetId: string;
  reportedUserId?: string | null;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [sending, setSending] = useState(false);

  const close = () => {
    setOpen(false);
    setReason('');
  };

  const send = async () => {
    if (!reason.trim()) return;
    setSending(true);
    try {
      await reportContent({ kind, targetId, reportedUserId, label, reason });
      close();
      Alert.alert('Report sent', 'Thanks for letting us know. Our team reviews reports and aims to act within 24 hours.');
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      Alert.alert('Could not send the report', `${detail}\n\nYou can also email us at ${SUPPORT_EMAIL}.`, [
        { text: 'Close', style: 'cancel' },
        {
          text: 'Email us',
          onPress: () =>
            Linking.openURL(
              `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`Report: ${kind}`)}&body=${encodeURIComponent(
                `${label}\n(${kind} ${targetId})\n\n${reason}`
              )}`
            ).catch(() => {})
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Pressable onPress={() => setOpen(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Report ${label}`}>
        <Text style={styles.link}>Report</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <View style={styles.backdrop}>
          <View style={styles.card}>
            <Text style={styles.title}>Report {label}</Text>
            <Text style={styles.hint}>
              Tell us what is wrong, for example abusive, hateful, sexual or misleading content. We review every report.
            </Text>
            <TextInput
              style={styles.input}
              value={reason}
              onChangeText={setReason}
              placeholder="What is the problem?"
              placeholderTextColor={dark.textFaint}
              multiline
              maxLength={1000}
            />
            <View style={styles.actions}>
              <Pressable onPress={close} disabled={sending}>
                <Text style={styles.cancel}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.send, !reason.trim() && styles.sendDisabled]} onPress={send} disabled={sending || !reason.trim()}>
                {sending ? <ActivityIndicator color="#0a0a0a" /> : <Text style={styles.sendText}>Send report</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  link: { color: dark.textFaint, fontSize: 12, fontWeight: '600', textDecorationLine: 'underline' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: dark.surface, borderWidth: 1, borderColor: dark.border, borderRadius: 16, padding: 16 },
  title: { color: dark.text, fontSize: 16, fontWeight: '700', marginBottom: 8 },
  hint: { color: dark.textMuted, fontSize: 13, lineHeight: 18, marginBottom: 12 },
  input: {
    minHeight: 90,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: 10,
    padding: 12,
    color: dark.text,
    backgroundColor: dark.background,
    textAlignVertical: 'top',
  },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 },
  cancel: { color: dark.textMuted, fontWeight: '600', fontSize: 14 },
  send: { backgroundColor: dark.accent, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 18 },
  sendDisabled: { opacity: 0.4 },
  sendText: { color: '#0a0a0a', fontWeight: '800' },
});
