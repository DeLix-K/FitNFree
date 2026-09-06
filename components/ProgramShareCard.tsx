import { forwardRef, type ElementRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import ViewShot from 'react-native-view-shot';
import { PLAN_THEMES } from '../lib/plans';
import { dark } from '../lib/theme';
import type { PlanThemeKey } from '../lib/types';

// Rendered off-screen purely so react-native-view-shot has a real view to
// rasterize, same pattern as StreakShareCard.tsx. All numbers shown are the
// same real program data shown elsewhere on the tab -- nothing invented for
// the sake of the graphic.
const ProgramShareCard = forwardRef<
  ElementRef<typeof ViewShot>,
  {
    emoji: string | null;
    title: string;
    themeKey: PlanThemeKey;
    progressLine: string;
    statLines: string[];
  }
>(({ emoji, title, themeKey, progressLine, statLines }, ref) => {
  const theme = PLAN_THEMES[themeKey];

  return (
    <ViewShot ref={ref} options={{ format: 'png', quality: 0.95 }}>
      <View style={[styles.card, { borderColor: theme.accent, backgroundColor: theme.surface }]}>
        <Text style={[styles.brand, { color: theme.accent }]}>FITNFREE PROGRAM</Text>
        <Text style={styles.emoji}>{emoji ?? '💪'}</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={[styles.progress, { color: theme.accent }]}>{progressLine}</Text>

        <View style={styles.statsBlock}>
          {statLines.map((line) => (
            <Text key={line} style={styles.statLine}>
              {line}
            </Text>
          ))}
        </View>

        <Text style={styles.tagline}>Built with FitNFree</Text>
      </View>
    </ViewShot>
  );
});

ProgramShareCard.displayName = 'ProgramShareCard';
export default ProgramShareCard;

const styles = StyleSheet.create({
  card: {
    width: 360,
    height: 480,
    borderWidth: 2,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 30,
    paddingHorizontal: 24,
  },
  brand: {
    position: 'absolute',
    top: 28,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 2,
  },
  emoji: {
    fontSize: 56,
    marginBottom: 8,
  },
  title: {
    color: dark.text,
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 8,
  },
  progress: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 20,
  },
  statsBlock: {
    alignItems: 'center',
    gap: 6,
  },
  statLine: {
    color: dark.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  tagline: {
    position: 'absolute',
    bottom: 26,
    color: dark.textFaint,
    fontSize: 12,
    fontWeight: '600',
  },
});
