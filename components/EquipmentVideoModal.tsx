import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { EquipmentVideo } from '../lib/equipmentVideos';
import { dark } from '../lib/theme';
import YouTubeEmbed from './YouTubeEmbed';

export default function EquipmentVideoModal({
  video,
  visible,
  onClose,
}: {
  video: EquipmentVideo | null;
  visible: boolean;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>How To Use This</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.close}>Close</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body}>
            {video ? (
              <>
                <YouTubeEmbed videoId={video.videoId} />
                <Text style={styles.credit}>
                  {video.title} — {video.channel}
                </Text>
              </>
            ) : (
              <Text style={styles.empty}>
                No tutorial video yet for this equipment — try the written instructions above.
              </Text>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: dark.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: dark.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    gap: 10,
  },
  title: {
    color: dark.text,
    fontSize: 17,
    fontWeight: '700',
    flex: 1,
  },
  close: {
    color: dark.accent,
    fontWeight: '600',
  },
  body: {
    paddingBottom: 20,
  },
  credit: {
    color: dark.textFaint,
    fontSize: 12,
    marginTop: 10,
  },
  empty: {
    color: dark.textMuted,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 30,
  },
});
