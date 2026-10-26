import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import BodyChart from '../components/BodyChart';
import { Chips, DateField, Field, Tile, confirmDelete, shareCsv } from '../components/trainerTools/Fields';
import {
  MEASURES,
  addDays,
  bodyLogCsv,
  formatLength,
  formatWeight,
  formatWeightChange,
  goalProgress,
  hasAnyValue,
  isValidIsoDate,
  isoDate,
  lastDays,
  lengthToInput,
  parseBodyFat,
  parseLength,
  parseWeight,
  series,
  sortEntries,
  summarize,
  weightToInput,
  type BodyEntry,
  type LengthUnit,
  type MeasureKey,
  type WeightUnit,
} from '../lib/bodyLog';
import { realBodyApi, type BodyApi } from '../lib/bodyLogApi';
import { POSES, comparablePoses, comparisonPair, groupByDate, type PhotoMeta, type PhotoStore, type Pose } from '../lib/photoIndex';
import { progressPhotos } from '../lib/progressPhotos';
import { dark } from '../lib/theme';

type Prefs = { weight: WeightUnit; length: LengthUnit; goalKg: number | null };
const PREFS_KEY = 'fitnfree.body.prefs.v1';
const DEFAULT_PREFS: Prefs = { weight: 'kg', length: 'cm', goalKg: null };

function readPrefs(raw: string | null): Prefs {
  try {
    const p = JSON.parse(raw ?? '{}') as Partial<Prefs>;
    return {
      weight: p.weight === 'lb' || p.weight === 'st' ? p.weight : 'kg',
      length: p.length === 'in' ? 'in' : 'cm',
      goalKg: typeof p.goalKg === 'number' && p.goalKg >= 20 && p.goalKg < 500 ? p.goalKg : null,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

type Metric = 'weight_kg' | 'body_fat_pct' | MeasureKey;
type Range = 30 | 90 | null;

type Draft = { date: string; weight: string; bodyFat: string; waist: string; chest: string; hips: string; thigh: string; arm: string; notes: string; syncProfile: boolean };
const DRAFT_KEYS: Record<MeasureKey, keyof Draft> = { waist_cm: 'waist', chest_cm: 'chest', hips_cm: 'hips', thigh_cm: 'thigh', arm_cm: 'arm' };

// Asks for the picture. The picker hands back a temporary copy, which the photo store then moves into the app's private folder.
async function pickFromDevice(source: 'camera' | 'library'): Promise<string | null> {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error('Camera access is needed to take a photo. Enable it in Settings, or choose a photo from your library instead.');
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8, allowsEditing: false, exif: false };
  const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  return result.canceled || result.assets.length === 0 ? null : result.assets[0].uri;
}

export default function BodyScreen({
  api = realBodyApi,
  photos = progressPhotos,
  pick = pickFromDevice,
}: {
  api?: BodyApi;
  photos?: PhotoStore;
  pick?: (source: 'camera' | 'library') => Promise<string | null>;
}) {
  const [entries, setEntries] = useState<BodyEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [metric, setMetric] = useState<Metric>('weight_kg');
  const [range, setRange] = useState<Range>(90);
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null);
  const [showPrefs, setShowPrefs] = useState(false);
  const today = isoDate(new Date());

  const load = useCallback(async () => {
    setError(null);
    try {
      setEntries(sortEntries(await api.fetchEntries()));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setEntries((x) => x ?? []);
    }
  }, [api]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    AsyncStorage.getItem(PREFS_KEY)
      .then((raw) => setPrefs(readPrefs(raw)))
      .catch(() => {});
  }, []);

  const savePrefs = (next: Prefs) => {
    setPrefs(next);
    AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next)).catch(() => {});
  };

  const summary = useMemo(() => summarize(entries ?? []), [entries]);
  const available = useMemo(() => {
    const list: { value: Metric; label: string }[] = [{ value: 'weight_kg', label: 'Weight' }];
    if (series(entries ?? [], 'body_fat_pct').length) list.push({ value: 'body_fat_pct', label: 'Body fat' });
    for (const m of MEASURES) if (series(entries ?? [], m.key).length) list.push({ value: m.key, label: m.label });
    return list;
  }, [entries]);
  const shownMetric: Metric = available.some((a) => a.value === metric) ? metric : 'weight_kg';
  const chartData = useMemo(() => lastDays(series(entries ?? [], shownMetric), range), [entries, shownMetric, range]);
  const format = useCallback(
    (v: number) => (shownMetric === 'weight_kg' ? formatWeight(v, prefs.weight) : shownMetric === 'body_fat_pct' ? `${Math.round(v * 10) / 10}%` : formatLength(v, prefs.length)),
    [shownMetric, prefs.weight, prefs.length]
  );

  if (entries === null) return <ActivityIndicator style={{ marginTop: 40 }} color={dark.accent} />;

  const emptyDraft = (date: string): Draft => ({ date, weight: '', bodyFat: '', waist: '', chest: '', hips: '', thigh: '', arm: '', notes: '', syncProfile: false });
  const draftOf = (e: BodyEntry): Draft => ({
    date: e.logged_date,
    weight: e.weight_kg === null ? '' : weightToInput(e.weight_kg, prefs.weight),
    bodyFat: e.body_fat_pct === null ? '' : String(e.body_fat_pct),
    waist: e.waist_cm === null ? '' : lengthToInput(e.waist_cm, prefs.length),
    chest: e.chest_cm === null ? '' : lengthToInput(e.chest_cm, prefs.length),
    hips: e.hips_cm === null ? '' : lengthToInput(e.hips_cm, prefs.length),
    thigh: e.thigh_cm === null ? '' : lengthToInput(e.thigh_cm, prefs.length),
    arm: e.arm_cm === null ? '' : lengthToInput(e.arm_cm, prefs.length),
    notes: e.notes ?? '',
    syncProfile: false,
  });
  const progress = goalProgress(summary.firstKg, summary.latestKg, prefs.goalKg);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Tile label="Latest" value={summary.latestKg === null ? '—' : formatWeight(summary.latestKg, prefs.weight)} />
      <View style={[styles.tileRow, { marginTop: 10 }]}>
        <Tile label="Last 30 days" value={summary.change30 === null ? '—' : formatWeightChange(summary.change30, prefs.weight)} />
        <Tile label="Per week" value={summary.weekly === null ? '—' : formatWeightChange(summary.weekly, prefs.weight)} />
      </View>
      {summary.weekly === null && summary.latestKg !== null ? <Text style={styles.hint}>The weekly trend appears once you have 3 weights over at least 2 weeks.</Text> : null}

      {prefs.goalKg !== null && summary.latestKg !== null ? (
        <View style={styles.goal}>
          <Text style={styles.goalText}>
            Goal {formatWeight(prefs.goalKg, prefs.weight)}
            {progress === null ? '' : `  ·  ${progress}% of the way from your first logged weight`}
          </Text>
          <View style={styles.bar}>
            <View style={[styles.barFill, { width: `${progress ?? 0}%` }]} />
          </View>
        </View>
      ) : null}

      {error ? (
        <View>
          <Text style={styles.error}>{error}</Text>
          <Pressable onPress={load} accessibilityRole="button">
            <Text style={styles.link}>Try again</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.actions}>
        <Pressable style={styles.addButton} onPress={() => setEditing({ id: null, draft: emptyDraft(today) })} accessibilityRole="button">
          <Text style={styles.addText}>+ Add entry</Text>
        </Pressable>
        {entries.length > 0 ? (
          <Pressable style={styles.ghostButton} onPress={() => shareCsv('fitnfree-body-log.csv', bodyLogCsv(entries)).catch(() => {})} accessibilityRole="button">
            <Text style={styles.ghostText}>Export</Text>
          </Pressable>
        ) : null}
        <Pressable style={styles.ghostButton} onPress={() => setShowPrefs(true)} accessibilityRole="button" accessibilityLabel="Units and goal weight">
          <Text style={styles.ghostText}>Units & goal</Text>
        </Pressable>
      </View>

      {entries.length === 0 ? (
        error ? null : <Text style={styles.empty}>Nothing logged yet. Add your first weight to start your chart. Weigh in at the same time of day for the clearest trend.</Text>
      ) : (
        <>
          <View style={styles.chartCard}>
            <Chips<Metric> value={shownMetric} onChange={setMetric} options={available} />
            <Chips<string> value={range === null ? 'all' : String(range)} onChange={(v) => setRange(v === 'all' ? null : (Number(v) as Range))} options={[{ value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: 'all', label: 'All' }]} />
            <BodyChart points={chartData} format={format} label={available.find((a) => a.value === shownMetric)?.label ?? 'Weight'} />
          </View>

          <Text style={styles.section}>Entries</Text>
          {entries.map((e) => (
            <Pressable key={e.id} style={styles.row} onPress={() => setEditing({ id: e.id, draft: draftOf(e) })} accessibilityRole="button" accessibilityLabel={`Edit the entry for ${e.logged_date}`}>
              <View style={styles.rowTop}>
                <Text style={styles.rowDate}>{e.logged_date}</Text>
                <Text style={styles.rowWeight}>{e.weight_kg === null ? '' : formatWeight(e.weight_kg, prefs.weight)}</Text>
              </View>
              <Text style={styles.rowMeta}>
                {[
                  e.body_fat_pct !== null ? `Body fat ${e.body_fat_pct}%` : null,
                  ...MEASURES.map((m) => (e[m.key] !== null ? `${m.label} ${formatLength(e[m.key] as number, prefs.length)}` : null)),
                ]
                  .filter(Boolean)
                  .join('  ·  ')}
              </Text>
              {e.notes ? (
                <Text style={styles.rowNotes} numberOfLines={2}>
                  {e.notes}
                </Text>
              ) : null}
            </Pressable>
          ))}
        </>
      )}

      <PhotosSection photos={photos} pick={pick} today={today} />

      {editing ? (
        <EntryForm
          initial={editing.draft}
          isNew={editing.id === null}
          prefs={prefs}
          today={today}
          existingDates={new Set(entries.filter((e) => e.id !== editing.id).map((e) => e.logged_date))}
          onCancel={() => setEditing(null)}
          onDelete={
            editing.id
              ? async () => {
                  if (!(await confirmDelete('Delete this entry?', 'This cannot be undone.'))) return;
                  try {
                    await api.deleteEntry(editing.id!);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : String(e));
                  }
                  setEditing(null);
                  load();
                }
              : undefined
          }
          onSave={async (input, syncKg) => {
            await api.saveEntry(editing.id, input);
            if (syncKg !== null) {
              try {
                await api.syncProfileWeight(syncKg);
              } catch {
                setError('Your entry was saved, but your profile weight could not be updated. You can change it in your profile.');
              }
            }
            setEditing(null);
            load();
          }}
        />
      ) : null}

      {showPrefs ? <PrefsForm prefs={prefs} onClose={(p) => { if (p) savePrefs(p); setShowPrefs(false); }} /> : null}
    </ScrollView>
  );
}

// ── Add or edit an entry ────────────────────────────────────────────────────────────────────────────
function EntryForm({
  initial,
  isNew,
  prefs,
  today,
  existingDates,
  onSave,
  onCancel,
  onDelete,
}: {
  initial: Draft;
  isNew: boolean;
  prefs: Prefs;
  today: string;
  existingDates: Set<string>;
  onSave: (input: Omit<BodyEntry, 'id'>, syncKg: number | null) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [d, setD] = useState<Draft>(initial);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  const weight = d.weight.trim() ? parseWeight(d.weight, prefs.weight) : null;
  const weightBad = d.weight.trim().length > 0 && weight === null;
  const fat = d.bodyFat.trim() ? parseBodyFat(d.bodyFat) : null;
  const fatBad = d.bodyFat.trim().length > 0 && fat === null;
  const len = (text: string) => (text.trim() ? parseLength(text, prefs.length) : null);
  const lenBad = (text: string) => text.trim().length > 0 && len(text) === null;
  const clash = isValidIsoDate(d.date) && existingDates.has(d.date);

  const weightHint = prefs.weight === 'kg' ? 'e.g. 82.4' : prefs.weight === 'lb' ? 'e.g. 181.5' : 'e.g. 12 st 13';
  const lengthHint = prefs.length === 'cm' ? 'e.g. 90.5' : 'e.g. 35.5';

  const save = async () => {
    if (!isValidIsoDate(d.date)) return setErr('Use a real date like 2026-11-05.');
    if (d.date > addDays(today, 1)) return setErr('That date is in the future.');
    if (weightBad) return setErr(`Check the weight. Use a number like ${weightHint.replace('e.g. ', '')}.`);
    if (fatBad) return setErr('Body fat should be a percentage between 2 and 70.');
    if (MEASURES.some((m) => lenBad(d[DRAFT_KEYS[m.key]] as string))) return setErr(`Check the measurements. Use a number like ${lengthHint.replace('e.g. ', '')}.`);
    const input: Omit<BodyEntry, 'id'> = {
      logged_date: d.date,
      weight_kg: weight,
      body_fat_pct: fat,
      waist_cm: len(d.waist),
      chest_cm: len(d.chest),
      hips_cm: len(d.hips),
      thigh_cm: len(d.thigh),
      arm_cm: len(d.arm),
      notes: d.notes.trim() || null,
    };
    if (!hasAnyValue(input)) return setErr('Add at least a weight, body fat or one measurement.');
    setSaving(true);
    setErr(null);
    try {
      await onSave(input, d.syncProfile && weight !== null && d.date === today ? weight : null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  return (
    <Modal animationType="slide" onRequestClose={onCancel}>
      <View style={styles.modal}>
        <View style={styles.modalTop}>
          <Text style={styles.modalTitle}>{isNew ? 'Add entry' : 'Edit entry'}</Text>
          <Pressable onPress={onCancel} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close without saving">
            <Text style={styles.link}>Cancel</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
          <DateField label="Date" value={d.date} onChange={(v) => set('date', v)} />
          {isNew && clash ? <Text style={styles.warn}>You already have an entry for this day. Saving will replace it.</Text> : null}
          {!isNew && clash ? <Text style={styles.warn}>Another entry already has this date. Choose a different day, or delete that entry first.</Text> : null}
          <Field label={`Weight (${prefs.weight === 'st' ? 'stone and pounds' : prefs.weight})`} value={d.weight} onChange={(v) => set('weight', v)} keyboardType="numbers-and-punctuation" placeholder={weightHint} maxLength={12} error={weightBad ? 'Not a weight we can read.' : null} />
          <Field label="Body fat (%) (optional)" value={d.bodyFat} onChange={(v) => set('bodyFat', v)} keyboardType="decimal-pad" placeholder="e.g. 18.5" maxLength={5} error={fatBad ? 'Between 2 and 70.' : null} />
          <Text style={styles.sub}>Measurements ({prefs.length}) (optional)</Text>
          {MEASURES.map((m) => {
            const key = DRAFT_KEYS[m.key];
            return <Field key={m.key} label={m.label} value={d[key] as string} onChange={(v) => set(key, v as never)} keyboardType="decimal-pad" placeholder={lengthHint} maxLength={7} error={lenBad(d[key] as string) ? 'Not a measurement we can read.' : null} />;
          })}
          <Field label="Notes (optional)" value={d.notes} onChange={(v) => set('notes', v)} multiline maxLength={500} placeholder="Sleep, cycle, travel, how you felt" />
          {weight !== null && d.date === today ? (
            <Chips<'no' | 'yes'>
              label="Also update the weight in my profile (used for calorie targets)"
              value={d.syncProfile ? 'yes' : 'no'}
              onChange={(v) => set('syncProfile', v === 'yes')}
              options={[{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }]}
            />
          ) : null}
          {err ? <Text style={styles.error}>{err}</Text> : null}
          <Pressable style={[styles.saveButton, saving && { opacity: 0.6 }]} onPress={save} disabled={saving} accessibilityRole="button">
            <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save entry'}</Text>
          </Pressable>
          {onDelete ? (
            <Pressable style={styles.deleteButton} onPress={onDelete} accessibilityRole="button">
              <Text style={styles.deleteText}>Delete entry</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Units and goal ───────────────────────────────────────────────────────────────────────────────────
function PrefsForm({ prefs, onClose }: { prefs: Prefs; onClose: (next: Prefs | null) => void }) {
  const [weight, setWeight] = useState<WeightUnit>(prefs.weight);
  const [length, setLength] = useState<LengthUnit>(prefs.length);
  const [goal, setGoal] = useState(prefs.goalKg === null ? '' : weightToInput(prefs.goalKg, prefs.weight));
  const [err, setErr] = useState<string | null>(null);
  const [goalUnit, setGoalUnit] = useState<WeightUnit>(prefs.weight);

  // Changing the unit re-writes the goal box in the new unit, so the number always means what the buttons say.
  const changeWeight = (u: WeightUnit) => {
    const kg = goal.trim() ? parseWeight(goal, goalUnit) : null;
    setWeight(u);
    setGoalUnit(u);
    if (kg !== null) setGoal(weightToInput(kg, u));
  };

  const done = () => {
    const kg = goal.trim() ? parseWeight(goal, weight) : null;
    if (goal.trim() && kg === null) return setErr('That goal weight is not one we can read.');
    onClose({ weight, length, goalKg: kg });
  };

  return (
    <Modal animationType="slide" onRequestClose={() => onClose(null)}>
      <View style={styles.modal}>
        <View style={styles.modalTop}>
          <Text style={styles.modalTitle}>Units & goal</Text>
          <Pressable onPress={() => onClose(null)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close without saving">
            <Text style={styles.link}>Cancel</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
          <Chips<WeightUnit> label="Weight" value={weight} onChange={changeWeight} options={[{ value: 'kg', label: 'Kilograms' }, { value: 'lb', label: 'Pounds' }, { value: 'st', label: 'Stone & pounds' }]} />
          <Chips<LengthUnit> label="Measurements" value={length} onChange={setLength} options={[{ value: 'cm', label: 'Centimetres' }, { value: 'in', label: 'Inches' }]} />
          <Field label="Goal weight (optional)" value={goal} onChange={setGoal} keyboardType="numbers-and-punctuation" placeholder={weight === 'kg' ? 'e.g. 75' : weight === 'lb' ? 'e.g. 165' : 'e.g. 11 st 7'} maxLength={12} />
          <Text style={styles.hint}>Units and goal are kept on this phone. Your entries are always stored in kilograms and centimetres, so you can switch whenever you like.</Text>
          {err ? <Text style={styles.error}>{err}</Text> : null}
          <Pressable style={styles.saveButton} onPress={done} accessibilityRole="button">
            <Text style={styles.saveText}>Done</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Progress photos (kept only on this phone) ────────────────────────────────────────────────────────
function PhotosSection({ photos, pick, today }: { photos: PhotoStore; pick: (source: 'camera' | 'library') => Promise<string | null>; today: string }) {
  const [list, setList] = useState<PhotoMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState<PhotoMeta | null>(null);
  const [comparePose, setComparePose] = useState<Pose | null>(null);

  useEffect(() => {
    if (!photos.available) return;
    photos
      .list()
      .then(setList)
      .catch((e) => {
        setError(e instanceof Error ? e.message : String(e));
        setList([]);
      });
  }, [photos]);

  if (!photos.available) {
    return (
      <View style={styles.photoCard}>
        <Text style={styles.section}>Progress photos</Text>
        <Text style={styles.photoNote}>Progress photos are kept only on your phone, never uploaded, so they are in the iPhone and Android app.</Text>
      </View>
    );
  }

  const groups = groupByDate(list ?? []);
  const poses = comparablePoses(list ?? []);
  const activePose = comparePose && poses.includes(comparePose) ? comparePose : poses[0] ?? null;
  const pair = activePose ? comparisonPair(list ?? [], activePose) : null;

  return (
    <View style={styles.photoCard}>
      <Text style={styles.section}>Progress photos</Text>
      <Text style={styles.photoNote}>Stored only on this phone. They are never uploaded, shared or sent to anyone, and they are not part of your account. If you delete the app or lose the phone, they go with it.</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable style={[styles.addButton, { alignSelf: 'flex-start', marginTop: 12 }]} onPress={() => setAdding(true)} accessibilityRole="button">
        <Text style={styles.addText}>+ Add photo</Text>
      </Pressable>

      {pair && activePose ? (
        <View style={styles.compare}>
          <Text style={styles.sub}>Before & after</Text>
          {poses.length > 1 ? <Chips<Pose> value={activePose} onChange={setComparePose} options={POSES.filter((p) => poses.includes(p.value)).map((p) => ({ value: p.value, label: p.label }))} /> : null}
          <View style={styles.compareRow}>
            {[pair.before, pair.after].map((p, i) => (
              <Pressable key={p.id} style={styles.compareCol} onPress={() => setViewing(p)} accessibilityRole="button" accessibilityLabel={`${i === 0 ? 'Before' : 'After'} photo, ${p.taken}`}>
                <Image source={{ uri: photos.uriFor(p) }} style={styles.compareImg} resizeMode="cover" />
                <Text style={styles.photoCaption}>{i === 0 ? 'Before' : 'After'} · {p.taken}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {list !== null && list.length === 0 ? <Text style={styles.empty}>No photos yet. Take one now to compare with later.</Text> : null}
      {groups.map((g) => (
        <View key={g.date}>
          <Text style={styles.photoDate}>{g.date}</Text>
          <View style={styles.grid}>
            {g.photos.map((p) => (
              <Pressable key={p.id} style={styles.thumbWrap} onPress={() => setViewing(p)} accessibilityRole="button" accessibilityLabel={`${p.pose} photo from ${p.taken}`}>
                <Image source={{ uri: photos.uriFor(p) }} style={styles.thumb} resizeMode="cover" />
                <Text style={styles.photoCaption}>{POSES.find((x) => x.value === p.pose)?.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}

      {adding ? (
        <AddPhoto
          today={today}
          pick={pick}
          onCancel={() => setAdding(false)}
          onAdd={async (uri, taken, pose) => {
            setList(await photos.add(uri, taken, pose));
            setAdding(false);
          }}
        />
      ) : null}

      {viewing ? (
        <Modal animationType="fade" onRequestClose={() => setViewing(null)}>
          <View style={styles.viewer}>
            <Image source={{ uri: photos.uriFor(viewing) }} style={styles.viewerImg} resizeMode="contain" accessibilityLabel={`${viewing.pose} photo from ${viewing.taken}`} />
            <Text style={styles.viewerCaption}>
              {POSES.find((x) => x.value === viewing.pose)?.label} · {viewing.taken}
            </Text>
            <View style={styles.viewerButtons}>
              <Pressable style={styles.ghostButton} onPress={() => setViewing(null)} accessibilityRole="button">
                <Text style={styles.ghostText}>Close</Text>
              </Pressable>
              <Pressable
                style={styles.deletePhoto}
                onPress={async () => {
                  if (!(await confirmDelete('Delete this photo?', 'It is only on this phone, so it cannot be recovered.'))) return;
                  try {
                    setList(await photos.remove(viewing.id));
                  } catch (e) {
                    setError(e instanceof Error ? e.message : String(e));
                  }
                  setViewing(null);
                }}
                accessibilityRole="button"
              >
                <Text style={styles.deleteText}>Delete photo</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

function AddPhoto({ today, pick, onAdd, onCancel }: { today: string; pick: (source: 'camera' | 'library') => Promise<string | null>; onAdd: (uri: string, taken: string, pose: Pose) => Promise<void>; onCancel: () => void }) {
  const [pose, setPose] = useState<Pose>('front');
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const go = async (source: 'camera' | 'library') => {
    if (!isValidIsoDate(date) || date > today) return setErr('Use a real date that is not in the future, like 2026-11-05.');
    setBusy(true);
    setErr(null);
    try {
      const uri = await pick(source);
      if (!uri) {
        setBusy(false);
        return;
      }
      await onAdd(uri, date, pose);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <Modal animationType="slide" onRequestClose={onCancel}>
      <View style={styles.modal}>
        <View style={styles.modalTop}>
          <Text style={styles.modalTitle}>Add photo</Text>
          <Pressable onPress={onCancel} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close without adding">
            <Text style={styles.link}>Cancel</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
          <Chips<Pose> label="Pose" value={pose} onChange={setPose} options={POSES} />
          <DateField label="Photo date" value={date} onChange={setDate} />
          <Text style={styles.hint}>The photo is saved only on this phone. It is never uploaded.</Text>
          {err ? <Text style={styles.error}>{err}</Text> : null}
          <Pressable style={[styles.saveButton, busy && { opacity: 0.6 }]} onPress={() => go('camera')} disabled={busy} accessibilityRole="button">
            <Text style={styles.saveText}>{busy ? 'Saving…' : 'Take a photo'}</Text>
          </Pressable>
          <Pressable style={[styles.ghostButton, { marginTop: 12, alignItems: 'center' }]} onPress={() => go('library')} disabled={busy} accessibilityRole="button">
            <Text style={styles.ghostText}>Choose from my library</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 80 },
  tileRow: { flexDirection: 'row', gap: 10 },
  hint: { color: dark.textFaint, fontSize: 12, marginTop: 8, marginBottom: 6 },
  goal: { marginTop: 14, backgroundColor: dark.surface, borderWidth: 1, borderColor: dark.border, borderRadius: 14, padding: 14 },
  goalText: { color: dark.text, fontWeight: '700', fontSize: 13 },
  bar: { height: 8, borderRadius: 4, backgroundColor: dark.border, marginTop: 10, overflow: 'hidden' },
  barFill: { height: 8, backgroundColor: dark.accent },
  error: { color: dark.danger, marginTop: 10 },
  warn: { color: '#fbbf24', fontSize: 12, marginTop: -6, marginBottom: 12 },
  empty: { color: dark.textFaint, textAlign: 'center', marginTop: 28 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16, alignItems: 'center' },
  addButton: { backgroundColor: dark.accent, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 20, minHeight: 46, justifyContent: 'center' },
  addText: { color: '#0a0a0a', fontWeight: '800', fontSize: 14 },
  ghostButton: { borderWidth: 1, borderColor: dark.border, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 18, minHeight: 46, justifyContent: 'center' },
  ghostText: { color: dark.text, fontWeight: '700', fontSize: 14 },
  chartCard: { marginTop: 18, backgroundColor: dark.surface, borderWidth: 1, borderColor: dark.border, borderRadius: 14, padding: 14 },
  section: { color: dark.text, fontSize: 16, fontWeight: '700', marginTop: 22, marginBottom: 6 },
  sub: { color: dark.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8, marginTop: 4 },
  row: { backgroundColor: dark.surface, borderWidth: 1, borderColor: dark.border, borderRadius: 14, padding: 14, marginTop: 10 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowDate: { color: dark.text, fontSize: 15, fontWeight: '700' },
  rowWeight: { color: dark.accent, fontSize: 15, fontWeight: '800' },
  rowMeta: { color: dark.textMuted, fontSize: 12, marginTop: 6 },
  rowNotes: { color: dark.textFaint, fontSize: 12, marginTop: 6 },
  link: { color: dark.accent, fontWeight: '700', fontSize: 15 },
  modal: { flex: 1, backgroundColor: dark.background, paddingTop: 48 },
  modalTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 8 },
  modalTitle: { color: dark.text, fontSize: 20, fontWeight: '800' },
  modalBody: { paddingHorizontal: 20, paddingBottom: 60 },
  saveButton: { backgroundColor: dark.accent, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 8 },
  saveText: { color: '#0a0a0a', fontWeight: '800', fontSize: 16 },
  deleteButton: { borderWidth: 1, borderColor: dark.danger, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 14 },
  deleteText: { color: dark.danger, fontWeight: '700' },
  photoCard: { marginTop: 8 },
  photoNote: { color: dark.textMuted, fontSize: 13, lineHeight: 19 },
  photoDate: { color: dark.textMuted, fontSize: 12, fontWeight: '700', marginTop: 16, marginBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumbWrap: { width: '31%' },
  thumb: { width: '100%', aspectRatio: 3 / 4, borderRadius: 10, backgroundColor: dark.surface },
  photoCaption: { color: dark.textMuted, fontSize: 11, marginTop: 4 },
  compare: { marginTop: 18, backgroundColor: dark.surface, borderWidth: 1, borderColor: dark.border, borderRadius: 14, padding: 14 },
  compareRow: { flexDirection: 'row', gap: 10 },
  compareCol: { flex: 1 },
  compareImg: { width: '100%', aspectRatio: 3 / 4, borderRadius: 10, backgroundColor: dark.background },
  viewer: { flex: 1, backgroundColor: '#000', paddingTop: 48, paddingBottom: 30 },
  viewerImg: { flex: 1, width: '100%' },
  viewerCaption: { color: dark.text, textAlign: 'center', marginTop: 12, fontWeight: '700' },
  viewerButtons: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginTop: 14 },
  deletePhoto: { borderWidth: 1, borderColor: dark.danger, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 18, minHeight: 46, justifyContent: 'center' },
});
