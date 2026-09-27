import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import EquipmentVideoModal from '../components/EquipmentVideoModal';
import PhotoScanScreen from '../components/PhotoScanScreen';
import { EQUIPMENT_SCAN_PROMPT } from '../lib/claude';
import { getEquipmentVideo } from '../lib/equipmentVideos';
import { dark } from '../lib/theme';

// Shown under the scan result when the identified equipment matches a
// hand-verified tutorial (see lib/equipmentVideos.ts) -- silently shows
// nothing for equipment that isn't in that catalog yet, rather than a dead
// or misleading button.
function WatchTutorialButton({ scanResult }: { scanResult: string }) {
  const [open, setOpen] = useState(false);
  const video = getEquipmentVideo(scanResult);
  if (!video) return null;

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
});
