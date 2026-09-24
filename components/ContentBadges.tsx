import { StyleSheet, Text, View } from 'react-native';
import { isNewRelease } from '../lib/library';
import { dark } from '../lib/theme';

// Small status pills on a library card: NEW for two weeks after release, then
// FREE for starter content or PREMIUM for content included with the subscription.
export default function ContentBadges({
  isFree,
  publishedAt,
  unlocked,
}: {
  isFree: boolean;
  publishedAt: string;
  unlocked: boolean;
}) {
  return (
    <View style={styles.row}>
      {isNewRelease(publishedAt) && (
        <View style={[styles.pill, styles.newPill]}>
          <Text style={[styles.text, styles.newText]}>NEW</Text>
        </View>
      )}
      {isFree ? (
        <View style={[styles.pill, styles.freePill]}>
          <Text style={[styles.text, styles.freeText]}>FREE</Text>
        </View>
      ) : (
        <View style={[styles.pill, styles.premiumPill]}>
          <Text style={[styles.text, styles.premiumText]}>{unlocked ? '✨ PREMIUM' : '🔒 PREMIUM'}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  pill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  text: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  newPill: { backgroundColor: dark.accent, borderColor: dark.accent },
  newText: { color: '#0a0a0a' },
  freePill: { borderColor: dark.accent },
  freeText: { color: dark.accent },
  premiumPill: { borderColor: dark.border, backgroundColor: dark.surfaceElevated },
  premiumText: { color: dark.textMuted },
});
