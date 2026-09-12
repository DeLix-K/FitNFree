import * as ImagePicker from 'expo-image-picker';
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
import { requestFormReview, uploadTrainerVideo } from '../lib/trainers';
import { dark } from '../lib/theme';

export default function FormReviewRequestModal({
  visible,
  onClose,
  trainerUserId,
  trainerName,
}: {
  visible: boolean;
  onClose: () => void;
  trainerUserId: string;
  trainerName: string;
}) {
  const [exerciseName, setExerciseName] = useState('');
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setExerciseName('');
    setVideoUri(null);
    setDone(false);
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const pickVideo = async (source: 'camera' | 'library') => {
    setError(null);
    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setError('Camera access is needed to record a video. Enable it in Settings, or choose from your library instead.');
          return;
        }
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['videos'], videoMaxDuration: 60, quality: 0.6 };
      const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled || result.assets.length === 0) return;
      setVideoUri(result.assets[0].uri);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSubmit = async () => {
    if (!videoUri) {
      setError('Add a video of your lift first.');
      return;
    }
    setSubmitting(true);
    setUploading(true);
    setError(null);
    try {
      const url = await uploadTrainerVideo(videoUri, 'video/mp4');
      setUploading(false);
      await requestFormReview({ trainerUserId, exerciseName: exerciseName.trim() || 'Exercise form check', videoUrl: url });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
      setUploading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>🎥 Form Check with {trainerName}</Text>
            <Pressable onPress={handleClose}>
              <Text style={styles.close}>Close</Text>
            </Pressable>
          </View>

          {done ? (
            <View style={styles.doneWrap}>
              <Text style={styles.doneText}>✓ Video sent. {trainerName} will respond with voice/text feedback.</Text>
              <Pressable style={styles.submitButton} onPress={handleClose}>
                <Text style={styles.submitButtonText}>Done</Text>
              </Pressable>
            </View>
          ) : (
            <ScrollView>
              <Text style={styles.subtitle}>
                Upload a video of a lift and get real feedback — a text comment and voice note from the trainer, not an
                automated 3D-form comparison.
              </Text>

              <TextInput
                style={styles.input}
                placeholder="Exercise (e.g. Barbell Deadlift)"
                placeholderTextColor={dark.textFaint}
                value={exerciseName}
                onChangeText={setExerciseName}
              />

              <View style={styles.captureRow}>
                <Pressable style={styles.captureButton} onPress={() => pickVideo('camera')}>
                  <Text style={styles.captureButtonText}>Record Video</Text>
                </Pressable>
                <Pressable style={styles.captureButton} onPress={() => pickVideo('library')}>
                  <Text style={styles.captureButtonText}>Choose Video</Text>
                </Pressable>
              </View>
              {videoUri && <Text style={styles.videoSelected}>✓ Video selected</Text>}

              {error && <Text style={styles.error}>{error}</Text>}

              <Pressable style={styles.submitButton} onPress={handleSubmit} disabled={submitting || !videoUri}>
                {submitting ? (
                  <ActivityIndicator color="#0a0a0a" />
                ) : (
                  <Text style={styles.submitButtonText}>{uploading ? 'Uploading...' : 'Send for Review'}</Text>
                )}
              </Pressable>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  card: { backgroundColor: dark.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '85%', borderWidth: 1, borderColor: dark.border },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { color: dark.text, fontSize: 16, fontWeight: '700', flex: 1, marginRight: 10 },
  close: { color: dark.accent, fontWeight: '600' },
  subtitle: { color: dark.textFaint, fontSize: 12, lineHeight: 17, marginBottom: 14 },
  input: { borderWidth: 1, borderColor: dark.border, backgroundColor: dark.surfaceElevated, color: dark.text, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 12 },
  captureRow: { flexDirection: 'row', gap: 10 },
  captureButton: { flex: 1, backgroundColor: dark.accent, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  captureButtonText: { color: '#0a0a0a', fontWeight: '700', fontSize: 13 },
  videoSelected: { color: dark.accent, fontSize: 12, fontWeight: '600', marginTop: 10 },
  error: { color: dark.danger, marginTop: 12, fontSize: 12 },
  submitButton: { backgroundColor: dark.accent, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 16, marginBottom: 20 },
  submitButtonText: { color: '#0a0a0a', fontWeight: '700' },
  doneWrap: { alignItems: 'center', paddingVertical: 20 },
  doneText: { color: dark.accent, fontWeight: '600', fontSize: 14, textAlign: 'center', marginBottom: 16, lineHeight: 20 },
});
