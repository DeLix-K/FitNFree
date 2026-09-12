import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { searchUsers, sendChallengeInvite, type UserSearchResult } from '../lib/challenges';
import { dark } from '../lib/theme';

export default function InviteFriendsModal({
  visible,
  onClose,
  challengeId,
  challengeTitle,
}: {
  visible: boolean;
  onClose: () => void;
  challengeId: string;
  challengeTitle: string;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (text: string) => {
    setQuery(text);
    setError(null);
    if (text.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      setResults(await searchUsers(text));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSearching(false);
    }
  };

  const handleInvite = async (userId: string) => {
    setInvitingId(userId);
    setError(null);
    try {
      await sendChallengeInvite(challengeId, userId);
      setInvitedIds((prev) => new Set(prev).add(userId));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setInvitingId(null);
    }
  };

  const handleClose = () => {
    setQuery('');
    setResults([]);
    setInvitedIds(new Set());
    setError(null);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>Invite Friends — {challengeTitle}</Text>
            <Pressable onPress={handleClose}>
              <Text style={styles.close}>Close</Text>
            </Pressable>
          </View>

          <TextInput
            style={styles.input}
            value={query}
            onChangeText={handleSearch}
            placeholder="Search by name..."
            placeholderTextColor={dark.textFaint}
          />

          {error && <Text style={styles.error}>{error}</Text>}
          {searching && <ActivityIndicator style={{ marginTop: 12 }} color={dark.accent} />}

          {!searching && query.trim().length >= 2 && results.length === 0 && (
            <Text style={styles.empty}>No FitNFree users found matching "{query}".</Text>
          )}

          {results.map((r) => {
            const invited = invitedIds.has(r.userId);
            return (
              <View key={r.userId} style={styles.row}>
                <Text style={styles.rowName}>{r.displayName}</Text>
                <Pressable
                  style={[styles.inviteButton, invited && styles.inviteButtonDone]}
                  onPress={() => handleInvite(r.userId)}
                  disabled={invited || invitingId === r.userId}
                >
                  {invitingId === r.userId ? (
                    <ActivityIndicator size="small" color="#0a0a0a" />
                  ) : (
                    <Text style={[styles.inviteButtonText, invited && styles.inviteButtonTextDone]}>
                      {invited ? '✓ Invited' : 'Invite'}
                    </Text>
                  )}
                </Pressable>
              </View>
            );
          })}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: dark.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '75%',
    borderWidth: 1,
    borderColor: dark.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  title: {
    flex: 1,
    color: dark.text,
    fontSize: 16,
    fontWeight: '700',
  },
  close: {
    color: dark.accent,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.surface,
    color: dark.text,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  error: {
    color: dark.danger,
    marginTop: 10,
    fontSize: 12,
  },
  empty: {
    color: dark.textFaint,
    marginTop: 14,
    fontSize: 13,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
  },
  rowName: {
    fontSize: 14,
    fontWeight: '600',
    color: dark.text,
  },
  inviteButton: {
    backgroundColor: dark.accent,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    minWidth: 80,
    alignItems: 'center',
  },
  inviteButtonDone: {
    backgroundColor: dark.surfaceElevated,
    borderWidth: 1,
    borderColor: dark.accent,
  },
  inviteButtonText: {
    color: '#0a0a0a',
    fontWeight: '700',
    fontSize: 12,
  },
  inviteButtonTextDone: {
    color: dark.accent,
  },
});
