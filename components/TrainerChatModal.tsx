import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  blockUser,
  fetchThread,
  getThreadBlockStatus,
  reportThread,
  sendMessage,
  unblockUser,
  type ThreadBlockStatus,
} from '../lib/trainerMessages';
import { supabase } from '../lib/supabase';
import { dark } from '../lib/theme';
import type { TrainerMessage } from '../lib/types';

export default function TrainerChatModal({
  visible,
  onClose,
  trainerUserId,
  clientUserId,
  otherPartyLabel,
}: {
  visible: boolean;
  onClose: () => void;
  trainerUserId: string;
  clientUserId: string;
  otherPartyLabel: string;
}) {
  const [messages, setMessages] = useState<TrainerMessage[]>([]);
  const [myId, setMyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blockStatus, setBlockStatus] = useState<ThreadBlockStatus>({
    blockedByMe: false,
    blockedByThem: false,
  });
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);

  const otherPartyUserId = useMemo(
    () => (myId === trainerUserId ? clientUserId : trainerUserId),
    [myId, trainerUserId, clientUserId]
  );

  const load = useCallback(async () => {
    setError(null);
    try {
      const [{ data }, thread] = await Promise.all([
        supabase.auth.getUser(),
        fetchThread(trainerUserId, clientUserId),
      ]);
      const uid = data.user?.id ?? null;
      setMyId(uid);
      setMessages(thread);
      if (uid) {
        const otherId = uid === trainerUserId ? clientUserId : trainerUserId;
        setBlockStatus(await getThreadBlockStatus(otherId));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [trainerUserId, clientUserId]);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setReportOpen(false);
    setReportReason('');
    load().finally(() => setLoading(false));
  }, [visible, load]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSending(true);
    setError(null);
    try {
      await sendMessage(trainerUserId, clientUserId, trimmed);
      setText('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  const handleBlockToggle = () => {
    if (blockStatus.blockedByMe) {
      Alert.alert('Unblock', `Unblock ${otherPartyLabel}? They'll be able to message you again.`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unblock',
          onPress: async () => {
            try {
              await unblockUser(otherPartyUserId);
              await load();
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            }
          },
        },
      ]);
      return;
    }
    Alert.alert(
      'Block this person?',
      `${otherPartyLabel} won't be able to send you messages anymore. You can unblock them later.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            try {
              await blockUser(otherPartyUserId);
              await load();
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            }
          },
        },
      ]
    );
  };

  const handleMenu = () => {
    Alert.alert(otherPartyLabel, undefined, [
      { text: 'Report', onPress: () => setReportOpen(true) },
      {
        text: blockStatus.blockedByMe ? 'Unblock' : 'Block',
        style: 'destructive',
        onPress: handleBlockToggle,
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleSubmitReport = async () => {
    if (!reportReason.trim()) return;
    setReportSubmitting(true);
    setError(null);
    try {
      await reportThread(trainerUserId, clientUserId, otherPartyUserId, reportReason);
      setReportOpen(false);
      setReportReason('');
      Alert.alert('Report sent', 'Thanks for letting us know — our team will review this.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setReportSubmitting(false);
    }
  };

  const canSend = !blockStatus.blockedByMe && !blockStatus.blockedByThem;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.header}>
          <Text style={styles.title}>{otherPartyLabel}</Text>
          <Pressable onPress={handleMenu} hitSlop={8} style={styles.menuButton}>
            <Text style={styles.menuButtonText}>•••</Text>
          </Pressable>
          <Pressable onPress={onClose}>
            <Text style={styles.close}>Close</Text>
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator style={styles.loading} color={dark.accent} />
        ) : (
          <FlatList
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <View
                style={[
                  styles.bubble,
                  item.sender_id === myId ? styles.bubbleMine : styles.bubbleTheirs,
                ]}
              >
                <Text style={item.sender_id === myId ? styles.bubbleTextMine : styles.bubbleText}>
                  {item.body}
                </Text>
              </View>
            )}
            ListEmptyComponent={<Text style={styles.empty}>No messages yet — say hello.</Text>}
          />
        )}

        {error && <Text style={styles.error}>{error}</Text>}

        {reportOpen ? (
          <View style={styles.reportRow}>
            <TextInput
              style={styles.input}
              value={reportReason}
              onChangeText={setReportReason}
              placeholder="What's the issue? Describe it here..."
              placeholderTextColor={dark.textFaint}
              multiline
              autoFocus
            />
            <View style={styles.reportActions}>
              <Pressable
                style={styles.reportCancelButton}
                onPress={() => {
                  setReportOpen(false);
                  setReportReason('');
                }}
              >
                <Text style={styles.reportCancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.sendButton}
                onPress={handleSubmitReport}
                disabled={reportSubmitting || !reportReason.trim()}
              >
                {reportSubmitting ? (
                  <ActivityIndicator size="small" color="#0a0a0a" />
                ) : (
                  <Text style={styles.sendButtonText}>Submit Report</Text>
                )}
              </Pressable>
            </View>
          </View>
        ) : !canSend ? (
          <View style={styles.blockedRow}>
            <Text style={styles.blockedText}>
              {blockStatus.blockedByMe
                ? "You've blocked this person. Unblock them from the ••• menu to send messages again."
                : 'This person is unavailable.'}
            </Text>
          </View>
        ) : (
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={setText}
              placeholder="Type a message..."
              placeholderTextColor={dark.textFaint}
              multiline
            />
            <Pressable style={styles.sendButton} onPress={handleSend} disabled={sending || !text.trim()}>
              {sending ? (
                <ActivityIndicator size="small" color="#0a0a0a" />
              ) : (
                <Text style={styles.sendButtonText}>Send</Text>
              )}
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: dark.background,
    paddingTop: 60,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: dark.text,
    flex: 1,
    marginRight: 10,
  },
  close: {
    color: dark.accent,
    fontWeight: '600',
    fontSize: 14,
  },
  menuButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  menuButtonText: {
    color: dark.textFaint,
    fontSize: 18,
    fontWeight: '700',
  },
  loading: {
    marginTop: 20,
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexGrow: 1,
  },
  bubble: {
    maxWidth: '80%',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  bubbleMine: {
    alignSelf: 'flex-end',
    backgroundColor: dark.accent,
    borderBottomRightRadius: 4,
  },
  bubbleTheirs: {
    alignSelf: 'flex-start',
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.border,
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    color: dark.text,
    fontSize: 14,
    lineHeight: 19,
  },
  bubbleTextMine: {
    color: '#0a0a0a',
    fontSize: 14,
    lineHeight: 19,
  },
  empty: {
    color: dark.textFaint,
    textAlign: 'center',
    marginTop: 20,
  },
  error: {
    color: dark.danger,
    fontSize: 12,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: dark.border,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.surface,
    color: dark.text,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    maxHeight: 100,
  },
  sendButton: {
    backgroundColor: dark.accent,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  sendButtonText: {
    color: '#0a0a0a',
    fontWeight: '700',
    fontSize: 13,
  },
  reportRow: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: dark.border,
    gap: 10,
  },
  reportActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  reportCancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  reportCancelButtonText: {
    color: dark.textFaint,
    fontWeight: '600',
    fontSize: 13,
  },
  blockedRow: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: dark.border,
  },
  blockedText: {
    color: dark.textFaint,
    fontSize: 13,
    textAlign: 'center',
  },
});
