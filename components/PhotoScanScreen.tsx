import * as ImagePicker from 'expo-image-picker';
import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AiUsageIndicator from './AiUsageIndicator';
import { useAiGate } from '../hooks/useAiGate';
import { saveHistoryEntry } from '../lib/aiHistory';
import { askClaude } from '../lib/claude';
import { dark } from '../lib/theme';
import type { AiHistoryKind } from '../lib/types';

const MEDIA_TYPE_TO_MIME: Record<string, string> = {
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
  heif: 'image/heif',
};

function guessMediaType(uri: string): string {
  const ext = uri.split('.').pop()?.toLowerCase().split('?')[0] ?? '';
  return MEDIA_TYPE_TO_MIME[ext] ?? 'image/jpeg';
}

export default function PhotoScanScreen({
  title,
  subtitle,
  prompt,
  loadingLabel,
  historyKind,
  renderAfterResult,
  backLabel,
  onBack,
}: {
  title: string;
  subtitle: string;
  prompt: string;
  loadingLabel: string;
  historyKind: AiHistoryKind;
  renderAfterResult?: (result: string) => ReactNode;
  backLabel?: string;
  onBack?: () => void;
}) {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const aiGate = useAiGate();

  const handlePicked = async (asset: ImagePicker.ImagePickerAsset) => {
    setImageUri(asset.uri);
    setResult(null);
    setError(null);

    if (!asset.base64) {
      setError("Couldn't read the selected image. Please try a different photo.");
      return;
    }

    if (!aiGate.canUse) {
      setError("You've used today's free AI actions. Upgrade to Premium for unlimited access.");
      return;
    }

    setLoading(true);
    try {
      // Photo identification (equipment/food) is a routine lookup, not a
      // personalized one -- eligible for the cheaper model / shared cache.
      const reply = await askClaude(
        prompt,
        { data: asset.base64, mediaType: asset.mimeType ?? guessMediaType(asset.uri) },
        { routine: true }
      );
      setResult(reply);
      saveHistoryEntry(historyKind, reply);
      aiGate.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const pickFrom = async (source: 'camera' | 'library') => {
    setError(null);
    try {
      // The camera (unlike the photo library) never prompts on its own —
      // launchCameraAsync throws MissingCameraPermissionException on iOS if
      // permission hasn't been explicitly requested first.
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setError('Camera access is needed to take a photo. Enable it in Settings, or choose from your library instead.');
          return;
        }
      }

      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        base64: true,
        quality: 0.6,
        allowsEditing: false,
      };

      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);

      if (result.canceled || result.assets.length === 0) return;
      await handlePicked(result.assets[0]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {onBack && (
        <Pressable onPress={onBack}>
          <Text style={styles.back}>{'< '}{backLabel ?? 'Back'}</Text>
        </Pressable>
      )}
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>

      <AiUsageIndicator
        isPremium={aiGate.isPremium}
        remaining={aiGate.remaining}
        loaded={aiGate.loaded}
      />

      <View style={styles.buttonRow}>
        <Pressable style={styles.button} onPress={() => pickFrom('camera')}>
          <Text style={styles.buttonText}>Take Photo</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={() => pickFrom('library')}>
          <Text style={styles.buttonText}>Choose from Library</Text>
        </Pressable>
      </View>

      {imageUri && (
        <Image source={{ uri: imageUri }} style={styles.preview} resizeMode="cover" />
      )}

      {loading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={dark.accent} />
          <Text style={styles.loadingText}>{loadingLabel}</Text>
        </View>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      {result && (
        <View style={styles.resultBox}>
          <Text style={styles.resultText}>{result}</Text>
        </View>
      )}

      {result && renderAfterResult?.(result)}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: dark.background,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  back: {
    color: dark.accent,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: dark.text,
  },
  subtitle: {
    fontSize: 13,
    color: dark.textFaint,
    marginTop: 4,
    marginBottom: 16,
    lineHeight: 18,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    backgroundColor: dark.accent,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: {
    color: '#0a0a0a',
    fontWeight: '700',
    fontSize: 13,
    textAlign: 'center',
  },
  preview: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 12,
    marginTop: 16,
    backgroundColor: dark.surfaceElevated,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
  },
  loadingText: {
    fontSize: 13,
    color: dark.textMuted,
  },
  error: {
    color: dark.danger,
    marginTop: 16,
  },
  resultBox: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.surface,
    borderRadius: 12,
    padding: 16,
  },
  resultText: {
    fontSize: 14,
    color: dark.text,
    lineHeight: 21,
  },
});
