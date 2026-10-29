import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Tile } from '../components/trainerTools/Fields';
import { fetchAllSetsWithNames } from '../lib/exercises';
import { KIND_LABEL, filterExercises, formatSet, fromKg, recordsOverview, sortExercises, type ExerciseSetRow, type ExerciseSort, type ExerciseSummary, type FeedEvent, type PrKind } from '../lib/prBadges';
import { dark } from '../lib/theme';

type Loaded = { rows: ExerciseSetRow[]; names: Record<string, string>; complete: boolean };
export type LoadSets = () => Promise<{ rows: Record<string, any>[]; complete: boolean }>;

const KIND_ICON: Record<PrKind, string> = { weight: '🏆', e1rm: '📈', reps: '🔁' };
const FEED_STEP = 10;
const LIST_STEP = 30;
const NEW_DAYS = 7;
const RECENT_DAYS = 30;

const isoDaysAgo = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const niceDate = (iso: string): string => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const round1 = (n: number): number => Math.round(n * 10) / 10;

const SORTS: { value: ExerciseSort; label: string }[] = [
  { value: 'recent', label: 'Latest record' },
  { value: 'name', label: 'A to Z' },
  { value: 'heaviest', label: 'Heaviest' },
];

// Turns the rows the database returns (with the exercise's name attached) into plain sets and a name for each exercise.
function prepare(raw: Record<string, any>[]): { rows: ExerciseSetRow[]; names: Record<string, string> } {
  const names: Record<string, string> = {};
  const rows: ExerciseSetRow[] = [];
  for (const r of raw) {
    const rel = Array.isArray(r.exercises) ? r.exercises[0] : r.exercises;
    if (rel?.name && !names[r.exercise_id]) names[r.exercise_id] = rel.name;
    rows.push({ exercise_id: r.exercise_id, logged_date: r.logged_date, weight: Number(r.weight), weight_unit: r.weight_unit === 'lb' ? 'lb' : 'kg', reps: Number(r.reps), created_at: r.created_at });
  }
  return { rows, names };
}

// Every personal record across every exercise: the badges earned recently, and the best lifts for each exercise. Worked out on the phone from the whole logbook,
// exactly as each exercise page does it (lib/prBadges.ts); nothing is stored.
export default function RecordsScreen({ load = fetchAllSetsWithNames }: { load?: LoadSets }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<ExerciseSort>('recent');
  const [feedShown, setFeedShown] = useState(FEED_STEP);
  const [listShown, setListShown] = useState(LIST_STEP);
  const latest = useRef(0);

  const fetchData = useCallback(async () => {
    const id = ++latest.current;
    try {
      const r = await load();
      if (id !== latest.current) return;
      setData({ ...prepare(r.rows), complete: r.complete });
      setError(null);
    } catch (e) {
      if (id !== latest.current) return;
      setError(e instanceof Error ? e.message : String(e));
      setData((d) => d ?? { rows: [], names: {}, complete: true });
    }
  }, [load]);

  useEffect(() => {
    fetchData();
    return () => {
      latest.current++;
    };
  }, [fetchData]);

  const overview = useMemo(() => (data ? recordsOverview(data.rows, data.names) : null), [data]);
  const list = useMemo(() => (overview ? sortExercises(filterExercises(overview.exercises, query), sort) : []), [overview, query, sort]);

  if (!data || !overview) return <ActivityIndicator style={{ marginTop: 40 }} color={dark.accent} />;

  const since7 = isoDaysAgo(NEW_DAYS);
  const since30 = isoDaysAgo(RECENT_DAYS);
  const last30 = overview.events.filter((e) => e.set.logged_date >= since30).length;
  const empty = overview.setCount === 0;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await fetchData();
            setRefreshing(false);
          }}
          tintColor={dark.accent}
        />
      }
    >
      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.error}>{error}</Text>
          <Pressable onPress={fetchData} accessibilityRole="button">
            <Text style={styles.retry}>Try again</Text>
          </Pressable>
        </View>
      ) : null}
      {!data.complete ? <Text style={styles.warn}>You have a very large logbook, so only your first 50,000 sets were read. Your newest records may be missing.</Text> : null}

      {error && empty ? null : empty ? (
        <Text style={styles.empty}>No sets logged yet. Log a few sets on an exercise page and your records appear here. The first set on an exercise is your starting point; beat it and it earns a badge.</Text>
      ) : (
        <>
          <View style={styles.tiles}>
            <Tile label="Exercises" value={String(overview.exercises.length)} />
            <Tile label="Records earned" value={String(overview.events.length)} />
            <Tile label="Last 30 days" value={String(last30)} />
          </View>

          <Text style={styles.section}>Recent records</Text>
          {overview.events.length === 0 ? (
            <Text style={styles.muted}>No records yet. Beat an earlier set with more weight, a better estimated 1RM or a rep record and it earns a badge here.</Text>
          ) : (
            <>
              {overview.events.slice(0, feedShown).map((e, i) => (
                <FeedRow key={`${e.exerciseId}-${e.set.logged_date}-${e.set.created_at}-${i}`} e={e} isNew={e.set.logged_date >= since7} />
              ))}
              {overview.events.length > feedShown ? (
                <Pressable style={styles.more} onPress={() => setFeedShown((n) => n + FEED_STEP)} accessibilityRole="button">
                  <Text style={styles.moreText}>Show more ({overview.events.length - feedShown} left)</Text>
                </Pressable>
              ) : null}
            </>
          )}

          <Text style={styles.section}>By exercise</Text>
          <TextInput style={styles.search} value={query} onChangeText={(v) => { setQuery(v); setListShown(LIST_STEP); }} placeholder="Search your exercises" placeholderTextColor={dark.textFaint} autoCorrect={false} accessibilityLabel="Search your exercises" />
          <View style={styles.chips}>
            {SORTS.map((o) => (
              <Pressable key={o.value} style={[styles.chip, sort === o.value && styles.chipOn]} onPress={() => setSort(o.value)} accessibilityRole="button" accessibilityState={{ selected: sort === o.value }}>
                <Text style={[styles.chipText, sort === o.value && styles.chipTextOn]}>{o.label}</Text>
              </Pressable>
            ))}
          </View>
          {list.length === 0 && query.trim() ? <Text style={styles.muted}>No exercises match "{query.trim()}".</Text> : null}
          {list.slice(0, listShown).map((x) => (
            <ExerciseRow key={x.exerciseId} x={x} />
          ))}
          {list.length > listShown ? (
            <Pressable style={styles.more} onPress={() => setListShown((n) => n + LIST_STEP)} accessibilityRole="button">
              <Text style={styles.moreText}>Show more ({list.length - listShown} left)</Text>
            </Pressable>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

function FeedRow({ e, isNew }: { e: FeedEvent; isNew: boolean }) {
  return (
    <View style={styles.card} accessible accessibilityLabel={`${e.name}, ${niceDate(e.set.logged_date)}. ${formatSet(e.set)}. ${e.prs.map((p) => KIND_LABEL[p.kind]).join(', ')}`}>
      <View style={styles.rowTop}>
        <Text style={styles.name} numberOfLines={1}>{e.name}</Text>
        <Text style={styles.date}>
          {isNew ? 'NEW · ' : ''}
          {niceDate(e.set.logged_date)}
        </Text>
      </View>
      <Text style={styles.set}>{formatSet(e.set)}</Text>
      <View style={styles.badges}>
        {e.prs.map((p) => (
          <Text key={p.kind} style={styles.badge}>
            {KIND_ICON[p.kind]} {KIND_LABEL[p.kind]}
          </Text>
        ))}
      </View>
      <Text style={styles.detail}>{e.prs[0].text}</Text>
    </View>
  );
}

function ExerciseRow({ x }: { x: ExerciseSummary }) {
  const e1 = x.bestE1rm ? `${round1(fromKg(x.bestE1rm.kg, x.bestE1rm.set.weight_unit))} ${x.bestE1rm.set.weight_unit}` : null;
  return (
    <View style={styles.card} accessible accessibilityLabel={`${x.name}. ${x.heaviest ? `Heaviest ${formatSet(x.heaviest)}.` : x.mostBodyweightReps ? `Most reps ${x.mostBodyweightReps}.` : ''} ${x.totalSets} sets.`}>
      <Text style={styles.name}>{x.name}</Text>
      {x.heaviest ? (
        <View style={styles.stat}>
          <Text style={styles.statLabel}>🏆 Heaviest</Text>
          <Text style={styles.statValue}>
            {formatSet(x.heaviest)} <Text style={styles.statDate}>{niceDate(x.heaviest.logged_date)}</Text>
          </Text>
        </View>
      ) : null}
      {e1 ? (
        <View style={styles.stat}>
          <Text style={styles.statLabel}>📈 Est. 1RM</Text>
          <Text style={styles.statValue}>
            {e1} <Text style={styles.statDate}>{niceDate(x.bestE1rm!.set.logged_date)}</Text>
          </Text>
        </View>
      ) : null}
      {!x.heaviest && x.mostBodyweightReps ? (
        <View style={styles.stat}>
          <Text style={styles.statLabel}>🔁 Most reps</Text>
          <Text style={styles.statValue}>{x.mostBodyweightReps} reps (bodyweight)</Text>
        </View>
      ) : null}
      <Text style={styles.meta}>
        {x.totalSets} set{x.totalSets === 1 ? '' : 's'} · last trained {niceDate(x.lastDate)}
        {x.lastPrDate ? ` · latest record ${niceDate(x.lastPrDate)}` : x.totalSets === 1 ? ' · starting point' : ' · no record yet'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 48 },
  tiles: { flexDirection: 'row', gap: 10, marginBottom: 6 },
  section: { color: dark.text, fontSize: 16, fontWeight: '700', marginTop: 18, marginBottom: 10 },
  empty: { color: dark.textMuted, fontSize: 14, lineHeight: 21, marginTop: 24, textAlign: 'center' },
  muted: { color: dark.textMuted, fontSize: 13, lineHeight: 19, marginBottom: 8 },
  warn: { color: '#fbbf24', fontSize: 12, lineHeight: 18, marginBottom: 10 },
  errorBox: { borderWidth: 1, borderColor: dark.danger, borderRadius: 12, padding: 12, marginBottom: 12 },
  error: { color: dark.danger, fontSize: 13, marginBottom: 6 },
  retry: { color: dark.accent, fontSize: 13, fontWeight: '700' },
  card: { borderWidth: 1, borderColor: dark.border, backgroundColor: dark.surface, borderRadius: 14, padding: 14, marginBottom: 10 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  name: { color: dark.text, fontSize: 15, fontWeight: '700', flexShrink: 1 },
  date: { color: dark.textFaint, fontSize: 11, fontWeight: '600' },
  set: { color: dark.text, fontSize: 18, fontWeight: '800', marginTop: 4 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  badge: { color: dark.accent, borderWidth: 1, borderColor: dark.accentDark, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, fontSize: 11, fontWeight: '700', overflow: 'hidden' },
  detail: { color: dark.textMuted, fontSize: 12, marginTop: 6 },
  search: { backgroundColor: dark.surface, borderWidth: 1, borderColor: dark.border, borderRadius: 10, color: dark.text, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, minHeight: 44, marginBottom: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: { borderWidth: 1, borderColor: dark.border, backgroundColor: dark.surface, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7 },
  chipOn: { borderColor: dark.accent, backgroundColor: dark.surfaceElevated },
  chipText: { color: dark.textMuted, fontSize: 12, fontWeight: '700' },
  chipTextOn: { color: dark.accent },
  stat: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 8, gap: 8 },
  statLabel: { color: dark.textMuted, fontSize: 12, fontWeight: '600' },
  statValue: { color: dark.text, fontSize: 14, fontWeight: '800', flexShrink: 1, textAlign: 'right' },
  statDate: { color: dark.textFaint, fontSize: 11, fontWeight: '600' },
  meta: { color: dark.textFaint, fontSize: 11, marginTop: 10 },
  more: { borderWidth: 1, borderColor: dark.border, borderRadius: 12, paddingVertical: 11, alignItems: 'center', marginBottom: 10 },
  moreText: { color: dark.accent, fontSize: 13, fontWeight: '700' },
});
