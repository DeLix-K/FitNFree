import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import EquipmentVideoModal from '../components/EquipmentVideoModal';
import PhotoScanScreen from '../components/PhotoScanScreen';
import { useAiGate } from '../hooks/useAiGate';
import { startCheckout } from '../lib/billing';
import { EQUIPMENT_SCAN_PROMPT } from '../lib/claude';
import { getEquipmentVideo } from '../lib/equipmentVideos';
import { dark } from '../lib/theme';

// Shown under the scan result when the identified equipment matches a
// hand-verified tutorial (see lib/equipmentVideos.ts) -- silently shows
// nothing for equipment that isn't in that catalog yet, rather than a dead
// or misleading button. The scan itself stays free (counts toward the daily
// free AI actions, like every other scan); only the tutorial video is
// Premium, same "free core feature, Premium unlocks the extra" pattern as
// the outdoor live map view.
function WatchTutorialButton({ scanResult }: { scanResult: string }) {
  const [open, setOpen] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const aiGate = useAiGate();
  const video = getEquipmentVideo(scanResult);
  if (!video) return null;

  const handleUpgrade = async () => {
    setUpgrading(true);
    setError(null);
    try {
      await startCheckout();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUpgrading(false);
    }
  };

  if (aiGate.isPremium !== true) {
    return (
      <View style={styles.lockedBox}>
        <Text style={styles.lockedTitle}>🔒 Tutorial video is a Premium feature</Text>
        <Text style={styles.lockedText}>
          A real "how to use it" video is available for this equipment — upgrade to watch it.
        </Text>
        <Pressable style={styles.lockedButton} onPress={handleUpgrade} disabled={upgrading}>
          {upgrading ? (
            <ActivityIndicator color="#0a0a0a" />
          ) : (
            <Text style={styles.lockedButtonText}>Upgrade to Premium</Text>
          )}
        </Pressable>
        {error && <Text style={styles.error}>{error}</Text>}
      </View>
    );
  }

  return (
    <>
      <Pressable style={styles.watchButton} onPress={() => setOpen(true)}>
        <Text style={styles.watchButtonText}>▶ Watch How To Use This</Text>
      </Pressable>
      <EquipmentVideoModal video={video} visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

export default function EquipmentScanScreen({ onBack }: { onBack?: () => void }) {
  return (
    <PhotoScanScreen
      title="Scan Equipment"
      subtitle="Take or choose a photo of gym equipment to find out what it is and how to use it."
      prompt={EQUIPMENT_SCAN_PROMPT}
      loadingLabel="Identifying equipment..."
      historyKind="equipment_scan"
      backLabel="Exercises"
      onBack={onBack}
      renderAfterResult={(result) => <WatchTutorialButton scanResult={result} />}
    />
  );
}

const styles = StyleSheet.create({
  watchButton: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: dark.accent,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  watchButtonText: {
    color: dark.accent,
    fontWeight: '700',
  },
  lockedBox: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.surface,
    borderRadius: 12,
    padding: 14,
  },
  lockedTitle: {
    color: dark.text,
    fontWeight: '700',
    fontSize: 14,
    marginBottom: 4,
  },
  lockedText: {
    color: dark.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  lockedButton: {
    backgroundColor: dark.accent,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  lockedButtonText: {
    color: '#0a0a0a',
    fontWeight: '700',
  },
  error: {
    color: dark.danger,
    fontSize: 12,
    marginTop: 8,
  },
});
