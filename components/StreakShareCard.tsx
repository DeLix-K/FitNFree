import { forwardRef, type ElementRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import ViewShot from 'react-native-view-shot';
import { dark } from '../lib/theme';

const MILESTONE_ICON: Record<number, string> = {
  7: '🔥',
  30: '🥉',
  50: '🥈',
  100: '🥇',
  365: '👑',
};

function highestBadge(longestStreak: number): { icon: string; label: string } | null {
  const milestones = [365, 100, 50, 30, 7];
  const hit = milestones.find((m) => longestStreak >= m);
  return hit ? { icon: MILESTONE_ICON[hit], label: `${hit}-Day Badge` } : null;
}

// Rendered off-screen (not scrollable/visible in the normal layout) purely
// so react-native-view-shot has a real view to rasterize into a shareable
// image. All numbers shown are the same real streak data as the rest of
// the Streaks tab -- nothing here is invented for the sake of the card.
const StreakShareCard = forwardRef<ElementRef<typeof ViewShot>, { streak: number; longestStreak: number; displayName: string }>(
  ({ streak, longestStreak, displayName }, ref) => {
    const badge = highestBadge(longestStreak);

    return (
      <ViewShot ref={ref} options={{ format: 'png', quality: 0.95 }}>
        <View style={styles.card}>
          <Text style={styles.brand}>FitNFree</Text>
          <Text style={styles.flame}>🔥</Text>
          <Text style={styles.streakNumber}>{streak}</Text>
          <Text style={styles.streakLabel}>{streak === 1 ? 'DAY STREAK' : 'DAY STREAK'}</Text>
          <Text style={styles.name}>{displayName}</Text>
          {badge && (
            <View style={styles.badgeRow}>
              <Text style={styles.badgeIcon}>{badge.icon}</Text>
              <Text style={styles.badgeLabel}>{badge.label}</Text>
            </View>
          )}
          <Text style={styles.tagline}>Building the habit, one day at a time.</Text>
        </View>
      </ViewShot>
    );
  }
);

StreakShareCard.displayName = 'StreakShareCard';
export default StreakShareCard;

const styles = StyleSheet.create({
  card: {
    width: 360,
    height: 480,
    backgroundColor: dark.background,
    borderWidth: 2,
    borderColor: dark.accent,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 30,
  },
  brand: {
    position: 'absolute',
    top: 28,
    color: dark.textFaint,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 2,
  },
  flame: {
    fontSize: 64,
    marginBottom: 4,
  },
  streakNumber: {
    color: dark.text,
    fontSize: 88,
    fontWeight: '900',
    lineHeight: 92,
  },
  streakLabel: {
    color: dark.accent,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 3,
    marginTop: 4,
  },
  name: {
    color: dark.textMuted,
    fontSize: 15,
    fontWeight: '600',
    marginTop: 18,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 20,
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.surface,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  badgeIcon: {
    fontSize: 20,
  },
  badgeLabel: {
    color: dark.text,
    fontSize: 13,
    fontWeight: '700',
  },
  tagline: {
    position: 'absolute',
    bottom: 26,
    color: dark.textFaint,
    fontSize: 12,
    fontWeight: '600',
  },
});
