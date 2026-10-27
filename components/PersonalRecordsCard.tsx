import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { KIND_LABEL, formatSet, prHistory, type PrKind } from '../lib/prBadges';
import { dark } from '../lib/theme';
import type { ExerciseSetLog } from '../lib/types';

const KIND_ICON: Record<PrKind, string> = { weight: '🏆', e1rm: '📈', reps: '🔁' };
const RECENT = 5;
const NEW_WITHIN_DAYS = 7;

const isoDaysAgo = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// The personal-record badges earned on this exercise: every set that beat everything logged before it, newest first. Worked out from the whole
// history (not just recent weeks), so it is the same list you would get if you read the logbook from the start.
export default function PersonalRecordsCard({ history }: { history: ExerciseSetLog[] }) {
  const events = useMemo(() => prHistory(history).reverse(), [history]);
  if (history.length === 0) return null;
  const since = isoDaysAgo(NEW_WITHIN_DAYS);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>🏅 Personal records</Text>
        <Text style={styles.count}>{events.length === 0 ? 'None yet' : `${events.length} set${events.length === 1 ? '' : 's'} earned a PR`}</Text>
      </View>
      {events.length === 0 ? (
        <Text style={styles.empty}>Beat an earlier set, with more weight, a better estimated 1RM or a rep record, and it earns a badge here.</Text>
      ) : (
        events.slice(0, RECENT).map((e) => (
          <View key={`${e.set.logged_date}-${e.set.created_at}-${e.set.weight}-${e.set.reps}`} style={styles.row} accessible accessibilityLabel={`${e.set.logged_date}. ${formatSet(e.set)}. ${e.prs.map((p) => KIND_LABEL[p.kind]).join(', ')}`}>
            <View style={styles.rowTop}>
              <Text style={styles.set}>{formatSet(e.set)}</Text>
              <Text style={styles.date}>
                {e.set.logged_date >= since ? 'NEW · ' : ''}
                {e.set.logged_date}
              </Text>
            </View>
            <View style={styles.badges}>
              {e.prs.map((p) => (
                <Text key={p.kind} style={styles.badge}>
                  {KIND_ICON[p.kind]} {KIND_LABEL[p.kind]}
                </Text>
              ))}
            </View>
            <Text style={styles.detail}>{e.prs[0].text}</Text>
          </View>
        ))
      )}
      {events.length > RECENT ? <Text style={styles.more}>Showing the latest {RECENT} of {events.length}.</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: dark.border, backgroundColor: dark.surface, borderRadius: 16, padding: 16, marginBottom: 14 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 },
  title: { color: dark.text, fontSize: 15, fontWeight: '700' },
  count: { color: dark.textFaint, fontSize: 11 },
  empty: { color: dark.textMuted, fontSize: 13, lineHeight: 19 },
  row: { borderTopWidth: 1, borderTopColor: dark.border, paddingTop: 10, marginTop: 10 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  set: { color: dark.text, fontSize: 15, fontWeight: '800' },
  date: { color: dark.textFaint, fontSize: 11, fontWeight: '600' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  badge: { color: dark.accent, borderWidth: 1, borderColor: dark.accentDark, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, fontSize: 11, fontWeight: '700', overflow: 'hidden' },
  detail: { color: dark.textMuted, fontSize: 12, marginTop: 6 },
  more: { color: dark.textFaint, fontSize: 11, marginTop: 10 },
});
