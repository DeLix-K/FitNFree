import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { Tab } from '../components/AppShell';
import { LEGAL_LINKS, openLegalLink } from '../lib/legalLinks';
import { computeTargets, deleteAccount, fetchBodyStats, updateBodyStats } from '../lib/profile';
import { getMyStats, updateDisplayName } from '../lib/streaks';
import { supabase } from '../lib/supabase';
import { dark } from '../lib/theme';
import type { ActivityLevel, BodyStats, Goal, Sex } from '../lib/types';

const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string }[] = [
  { value: 'sedentary', label: 'Sedentary' },
  { value: 'light', label: 'Light' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'active', label: 'Active' },
  { value: 'very_active', label: 'Very Active' },
];

const GOAL_OPTIONS: { value: Goal; label: string }[] = [
  { value: 'lose', label: 'Lose Weight' },
  { value: 'maintain', label: 'Maintain' },
  { value: 'gain', label: 'Gain Weight' },
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
  return (first + last).toUpperCase() || '?';
}

function formatMemberSince(iso: string | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export default function ProfileScreen({ onNavigate }: { onNavigate?: (tab: Tab) => void }) {
  const [stats, setStats] = useState<BodyStats>({
    height_cm: null,
    weight_kg: null,
    age: null,
    sex: null,
    activity_level: null,
    goal: null,
  });
  const [heightInput, setHeightInput] = useState('');
  const [weightInput, setWeightInput] = useState('');
  const [ageInput, setAgeInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [email, setEmail] = useState('');
  const [memberSince, setMemberSince] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [activityStats, setActivityStats] = useState<{
    currentStreak: number;
    longestStreak: number;
    totalWorkouts: number;
  } | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [data, { data: userData }, myStats] = await Promise.all([
        fetchBodyStats(),
        supabase.auth.getUser(),
        getMyStats(),
      ]);
      if (data) {
        setStats(data);
        setHeightInput(data.height_cm != null ? String(data.height_cm) : '');
        setWeightInput(data.weight_kg != null ? String(data.weight_kg) : '');
        setAgeInput(data.age != null ? String(data.age) : '');
      }
      setEmail(userData.user?.email ?? '');
      setMemberSince(formatMemberSince(userData.user?.created_at));
      setDisplayName(myStats.displayName);
      setNameInput(myStats.displayName);
      setActivityStats({
        currentStreak: myStats.currentStreak,
        longestStreak: myStats.longestStreak,
        totalWorkouts: myStats.totalWorkouts,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const handleSaveName = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === displayName) {
      setEditingName(false);
      setNameInput(displayName);
      return;
    }
    setSavingName(true);
    setError(null);
    try {
      await updateDisplayName(trimmed);
      setDisplayName(trimmed);
      setEditingName(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingName(false);
    }
  };

  const handleSave = async () => {
    setError(null);
    setSaved(false);

    const height_cm = heightInput ? Number(heightInput) : null;
    const weight_kg = weightInput ? Number(weightInput) : null;
    const age = ageInput ? Number(ageInput) : null;

    if (heightInput && (Number.isNaN(height_cm) || height_cm! <= 0)) {
      setError('Enter a valid height in cm.');
      return;
    }
    if (weightInput && (Number.isNaN(weight_kg) || weight_kg! <= 0)) {
      setError('Enter a valid weight in kg.');
      return;
    }
    if (ageInput && (Number.isNaN(age) || age! <= 0)) {
      setError('Enter a valid age.');
      return;
    }

    const nextStats: BodyStats = { ...stats, height_cm, weight_kg, age };
    setSaving(true);
    try {
      await updateBodyStats(nextStats);
      setStats(nextStats);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const setSex = async (sex: Sex) => {
    const nextStats = { ...stats, sex };
    setStats(nextStats);
    try {
      await updateBodyStats(nextStats);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const setActivityLevel = async (activity_level: ActivityLevel) => {
    const nextStats = { ...stats, activity_level };
    setStats(nextStats);
    try {
      await updateBodyStats(nextStats);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const setGoal = async (goal: Goal) => {
    const nextStats = { ...stats, goal };
    setStats(nextStats);
    try {
      await updateBodyStats(nextStats);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    setError(null);
    try {
      await deleteAccount();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={dark.accent} />
      </View>
    );
  }

  const targets = computeTargets(stats);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Profile</Text>
      {error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.identityCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(displayName || 'Fitness Fan')}</Text>
        </View>
        <View style={styles.identityInfo}>
          {editingName ? (
            <View style={styles.nameEditRow}>
              <TextInput
                style={styles.nameInput}
                value={nameInput}
                onChangeText={setNameInput}
                autoFocus
                placeholder="Your name"
                placeholderTextColor={dark.textFaint}
              />
              <Pressable onPress={handleSaveName} disabled={savingName} style={styles.nameSaveButton}>
                {savingName ? (
                  <ActivityIndicator size="small" color="#0a0a0a" />
                ) : (
                  <Text style={styles.nameSaveButtonText}>Save</Text>
                )}
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={() => {
                setNameInput(displayName);
                setEditingName(true);
              }}
            >
              <Text style={styles.displayName}>{displayName} ✎</Text>
            </Pressable>
          )}
          {email ? <Text style={styles.email}>{email}</Text> : null}
          {memberSince ? <Text style={styles.memberSince}>Member since {memberSince}</Text> : null}
        </View>
      </View>

      {activityStats && (
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{activityStats.currentStreak}</Text>
            <Text style={styles.statLabel}>Day Streak</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{activityStats.longestStreak}</Text>
            <Text style={styles.statLabel}>Best Streak</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{activityStats.totalWorkouts}</Text>
            <Text style={styles.statLabel}>Workouts</Text>
          </View>
        </View>
      )}

      <Text style={styles.subtitle}>
        Add your body stats to get personalized daily calorie and protein targets.
      </Text>

      <View style={styles.form}>
        <View style={styles.row}>
          <View style={styles.field}>
            <Text style={styles.label}>Height (cm)</Text>
            <TextInput
              style={styles.input}
              value={heightInput}
              onChangeText={setHeightInput}
              keyboardType="decimal-pad"
              placeholder="175"
              placeholderTextColor={dark.textFaint}
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Weight (kg)</Text>
            <TextInput
              style={styles.input}
              value={weightInput}
              onChangeText={setWeightInput}
              keyboardType="decimal-pad"
              placeholder="70"
              placeholderTextColor={dark.textFaint}
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Age</Text>
            <TextInput
              style={styles.input}
              value={ageInput}
              onChangeText={setAgeInput}
              keyboardType="number-pad"
              placeholder="30"
              placeholderTextColor={dark.textFaint}
            />
          </View>
        </View>

        <Text style={styles.label}>Sex</Text>
        <View style={styles.chipRow}>
          {(['male', 'female'] as Sex[]).map((s) => (
            <Pressable
              key={s}
              style={[styles.chip, stats.sex === s && styles.chipSelected]}
              onPress={() => setSex(s)}
            >
              <Text style={[styles.chipText, stats.sex === s && styles.chipTextSelected]}>
                {s === 'male' ? 'Male' : 'Female'}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Activity Level</Text>
        <View style={styles.chipRow}>
          {ACTIVITY_OPTIONS.map((o) => (
            <Pressable
              key={o.value}
              style={[styles.chip, stats.activity_level === o.value && styles.chipSelected]}
              onPress={() => setActivityLevel(o.value)}
            >
              <Text
                style={[styles.chipText, stats.activity_level === o.value && styles.chipTextSelected]}
              >
                {o.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Goal</Text>
        <View style={styles.chipRow}>
          {GOAL_OPTIONS.map((o) => (
            <Pressable
              key={o.value}
              style={[styles.chip, stats.goal === o.value && styles.chipSelected]}
              onPress={() => setGoal(o.value)}
            >
              <Text style={[styles.chipText, stats.goal === o.value && styles.chipTextSelected]}>
                {o.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Pressable style={styles.saveButton} onPress={handleSave} disabled={saving}>
          {saving ? (
            <ActivityIndicator color="#0a0a0a" size="small" />
          ) : (
            <Text style={styles.saveButtonText}>{saved ? 'Saved ✓' : 'Save'}</Text>
          )}
        </Pressable>
      </View>

      {targets && (
        <View style={styles.targetsCard}>
          <Text style={styles.targetsTitle}>Your Daily Targets</Text>
          <View style={styles.targetsRow}>
            <View style={styles.targetBox}>
              <Text style={styles.targetValue}>{targets.calories}</Text>
              <Text style={styles.targetLabel}>calories</Text>
            </View>
            <View style={styles.targetBox}>
              <Text style={styles.targetValue}>{targets.proteinGrams}g</Text>
              <Text style={styles.targetLabel}>protein</Text>
            </View>
            <View style={styles.targetBox}>
              <Text style={styles.targetValue}>{targets.carbGrams}g</Text>
              <Text style={styles.targetLabel}>carbs</Text>
            </View>
            <View style={styles.targetBox}>
              <Text style={styles.targetValue}>{targets.fatGrams}g</Text>
              <Text style={styles.targetLabel}>fat</Text>
            </View>
          </View>
        </View>
      )}

      <Text style={styles.sectionTitle}>Account</Text>
      <Pressable style={styles.linkRow} onPress={() => onNavigate?.('wearables')}>
        <Text style={styles.linkRowText}>⌚ Connected Devices</Text>
        <Text style={styles.linkRowArrow}>→</Text>
      </Pressable>
      <Pressable style={styles.linkRow} onPress={() => onNavigate?.('history')}>
        <Text style={styles.linkRowText}>🕘 Activity History</Text>
        <Text style={styles.linkRowArrow}>→</Text>
      </Pressable>

      <Text style={styles.sectionTitle}>Legal &amp; Support</Text>
      <Pressable style={styles.linkRow} onPress={() => openLegalLink(LEGAL_LINKS.privacyPolicy)}>
        <Text style={styles.linkRowText}>🔒 Privacy Policy</Text>
        <Text style={styles.linkRowArrow}>→</Text>
      </Pressable>
      <Pressable style={styles.linkRow} onPress={() => openLegalLink(LEGAL_LINKS.terms)}>
        <Text style={styles.linkRowText}>📄 Terms &amp; Conditions</Text>
        <Text style={styles.linkRowArrow}>→</Text>
      </Pressable>
      <Pressable style={styles.linkRow} onPress={() => openLegalLink(LEGAL_LINKS.support)}>
        <Text style={styles.linkRowText}>✉️ Contact &amp; Support</Text>
        <Text style={styles.linkRowArrow}>→</Text>
      </Pressable>

      <View style={styles.dangerZone}>
        <Text style={styles.dangerTitle}>Danger Zone</Text>
        <Text style={styles.dangerText}>
          Deleting your account permanently removes your profile, plans, history, streaks, and
          all other data. This cannot be undone.
        </Text>

        {confirmingDelete ? (
          <View style={styles.confirmRow}>
            <Pressable
              style={styles.deleteConfirmButton}
              onPress={handleDeleteAccount}
              disabled={deleting}
            >
              {deleting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.deleteConfirmButtonText}>Yes, delete my account</Text>
              )}
            </Pressable>
            <Pressable onPress={() => setConfirmingDelete(false)} disabled={deleting}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable style={styles.deleteButton} onPress={() => setConfirmingDelete(true)}>
            <Text style={styles.deleteButtonText}>Delete My Account</Text>
          </Pressable>
        )}
      </View>
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
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: dark.background,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: dark.text,
  },
  subtitle: {
    fontSize: 13,
    color: dark.textFaint,
    marginTop: 16,
    marginBottom: 16,
  },
  error: {
    color: dark.danger,
    marginTop: 8,
  },
  identityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: dark.surfaceElevated,
    borderWidth: 1,
    borderColor: dark.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  avatarText: {
    color: dark.accent,
    fontWeight: '700',
    fontSize: 18,
  },
  identityInfo: {
    flex: 1,
  },
  displayName: {
    fontSize: 17,
    fontWeight: '700',
    color: dark.text,
  },
  nameEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  nameInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.surfaceElevated,
    color: dark.text,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 14,
  },
  nameSaveButton: {
    backgroundColor: dark.accent,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  nameSaveButtonText: {
    color: '#0a0a0a',
    fontWeight: '700',
    fontSize: 12,
  },
  email: {
    fontSize: 12,
    color: dark.textMuted,
    marginTop: 2,
  },
  memberSince: {
    fontSize: 12,
    color: dark.textFaint,
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  statBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.surface,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    color: dark.accent,
  },
  statLabel: {
    fontSize: 11,
    color: dark.textMuted,
    marginTop: 2,
  },
  form: {
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 4,
  },
  field: {
    flex: 1,
  },
  label: {
    fontSize: 12,
    color: dark.textMuted,
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.surfaceElevated,
    color: dark.text,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 14,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  chipSelected: {
    backgroundColor: dark.accent,
    borderColor: dark.accent,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: dark.text,
  },
  chipTextSelected: {
    color: '#0a0a0a',
  },
  saveButton: {
    backgroundColor: dark.accent,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 18,
  },
  saveButtonText: {
    color: '#0a0a0a',
    fontWeight: '700',
  },
  targetsCard: {
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  targetsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: dark.text,
    marginBottom: 10,
  },
  targetsRow: {
    flexDirection: 'row',
    gap: 20,
    flexWrap: 'wrap',
  },
  targetBox: {},
  targetValue: {
    fontSize: 22,
    fontWeight: '800',
    color: dark.accent,
  },
  targetLabel: {
    fontSize: 12,
    color: dark.textMuted,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: dark.text,
    marginTop: 24,
    marginBottom: 10,
  },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.surface,
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  linkRowText: { color: dark.text, fontSize: 14, fontWeight: '600' },
  linkRowArrow: { color: dark.textFaint, fontSize: 16 },
  dangerZone: {
    borderWidth: 1,
    borderColor: dark.danger,
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  dangerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: dark.danger,
    marginBottom: 6,
  },
  dangerText: {
    fontSize: 12,
    color: dark.textMuted,
    marginBottom: 12,
    lineHeight: 17,
  },
  deleteButton: {
    borderWidth: 1,
    borderColor: dark.danger,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  deleteButtonText: {
    color: dark.danger,
    fontWeight: '700',
    fontSize: 13,
  },
  confirmRow: {
    gap: 10,
  },
  deleteConfirmButton: {
    backgroundColor: dark.danger,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  deleteConfirmButtonText: {
    color: '#0a0a0a',
    fontWeight: '700',
    fontSize: 13,
  },
  cancelText: {
    color: dark.textMuted,
    textAlign: 'center',
    fontWeight: '600',
    fontSize: 13,
  },
});
