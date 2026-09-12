import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioPlayer, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { respondToFormReview } from '../lib/trainerDashboard';
import { uploadTrainerMedia } from '../lib/trainers';
import { dark } from '../lib/theme';
import type { TrainerFormReview } from '../lib/types';
import TrainerVideoPlayer from './TrainerVideoPlayer';

export default function RespondToFormReviewModal({
  visible,
  request,
  onClose,
  onResponded,
}: {
  visible: boolean;
  request: TrainerFormReview | null;
  onClose: () => void;
  onResponded: () => void;
}) {
  const [comment, setComment] = useState('');
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const previewPlayer = useAudioPlayer(recordedUri ?? undefined);

  const reset = () => {
    setComment('');
    setRecordedUri(null);
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const startRecording = async () => {
    setError(null);
    try {
      const status = await AudioModule.requestRecordingPermissionsAsync();
      if (!status.granted) {
        setError('Microphone access is needed to record a voice note.');
        return;
      }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const stopRecording = async () => {
    try {
      await recorder.stop();
      setRecordedUri(recorder.uri);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSubmit = async () => {
    if (!request) return;
    if (!comment.trim() && !recordedUri) {
      setError('Add a text comment or record a voice note.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      let voiceNoteUrl: string | null = null;
      if (recordedUri) voiceNoteUrl = await uploadTrainerMedia(recordedUri, 'audio/m4a');
      await respondToFormReview(request.id, { voiceNoteUrl, comment: comment.trim() });
      onResponded();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (!request) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>{request.exercise_name}</Text>
            <Pressable onPress={handleClose}>
              <Text style={styles.close}>Close</Text>
            </Pressable>
          </View>

          <ScrollView>
            <TrainerVideoPlayer uri={request.video_url} aspectRatio={9 / 16} autoplay={false} />

            <Text style={styles.label}>Voice note</Text>
            {!recordedUri ? (
              <Pressable style={[styles.recordButton, recorderState.isRecording && styles.recordButtonActive]} onPress={recorderState.isRecording ? stopRecording : startRecording}>
                <Text style={styles.recordButtonText}>{recorderState.isRecording ? '⏹️ Stop Recording' : '🎙️ Record Voice Note'}</Text>
              </Pressable>
            ) : (
              <View style={styles.recordedRow}>
                <Pressable style={styles.playButton} onPress={() => previewPlayer.play()}>
                  <Text style={styles.playButtonText}>▶ Play</Text>
                </Pressable>
                <Pressable onPress={() => setRecordedUri(null)}>
                  <Text style={styles.rerecordText}>Re-record</Text>
                </Pressable>
              </View>
            )}

            <Text style={styles.label}>Text comment</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Great lift overall, but watch your hips rising too fast on rep 3..."
              placeholderTextColor={dark.textFaint}
              value={comment}
              onChangeText={setComment}
              multiline
            />

            {error && <Text style={styles.error}>{error}</Text>}

            <Pressable style={styles.submitButton} onPress={handleSubmit} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#0a0a0a" /> : <Text style={styles.submitButtonText}>Send Feedback</Text>}
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  card: { backgroundColor: dark.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '92%', borderWidth: 1, borderColor: dark.border },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 10 },
  title: { color: dark.text, fontSize: 16, fontWeight: '700', flex: 1 },
  close: { color: dark.accent, fontWeight: '600' },
  label: { color: dark.textMuted, fontSize: 12, fontWeight: '700', marginTop: 16, marginBottom: 8 },
  recordButton: { borderWidth: 1, borderColor: dark.accent, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  recordButtonActive: { backgroundColor: dark.danger, borderColor: dark.danger },
  recordButtonText: { color: dark.accent, fontWeight: '700', fontSize: 13 },
  recordedRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  playButton: { backgroundColor: dark.accent, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 18 },
  playButtonText: { color: '#0a0a0a', fontWeight: '700', fontSize: 12 },
  rerecordText: { color: dark.textMuted, fontSize: 12, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: dark.border, backgroundColor: dark.surfaceElevated, color: dark.text, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, minHeight: 90, textAlignVertical: 'top' },
  error: { color: dark.danger, marginTop: 12, fontSize: 12 },
  submitButton: { backgroundColor: dark.accent, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 18, marginBottom: 20 },
  submitButtonText: { color: '#0a0a0a', fontWeight: '700' },
});
