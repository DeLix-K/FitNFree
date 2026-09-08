import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ImageBackground, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Tab } from '../components/AppShell';
import { getOuraData } from '../lib/oura';
import { fetchMyProgress, fetchChallenges, getChallengeStatus } from '../lib/challenges';
import { fetchSleepHistory } from '../lib/sleep';
import { getMyStats } from '../lib/streaks';
import { supabase } from '../lib/supabase';
import { dark } from '../lib/theme';

// Real photo (Pixabay contributor via Pexels, free under the Pexels
// License, no attribution required) -- trainer coaching energy behind the
// AI Coach hero card instead of a flat color fill.
const COACH_HERO = require('../assets/photos/coach_hero.jpg');

type DashboardData = {
  displayName: string;
  currentStreak: number;
  activeChallengeCount: number;
  wearableConnected: boolean;
  lastNightMinutes: number | null;
  focusPlanName: string | null;
};

function formatSleep(minutes: number | null): string {
  if (minutes == null) return 'No data';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export default function DashboardScreen({ onNavigate }: { onNavigate: (tab: Tab) => void }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [stats, challenges, myProgress, sleep, oura, planRes] = await Promise.all([
        getMyStats().catch(() => ({ currentStreak: 0, totalWorkouts: 0, displayName: 'Fitness Fan' })),
        fetchChallenges().catch(() => []),
        fetchMyProgress().catch(() => []),
        fetchSleepHistory(3).catch(() => []),
        getOuraData().catch(() => ({ connected: false }) as const),
        supabase
          .from('workout_plans')
          .select('name')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (cancelled) return;

      const myChallengeIds = new Set(myProgress.map((p) => p.challenge_id));
      const activeChallengeCount = challenges.filter(
        (c) => myChallengeIds.has(c.id) && getChallengeStatus(c) === 'active'
      ).length;

      setData({
        displayName: stats.displayName,
        currentStreak: stats.currentStreak,
        activeChallengeCount,
        wearableConnected: oura.connected,
        lastNightMinutes: sleep[0]?.duration_minutes ?? null,
        focusPlanName: (planRes.data as { name?: string } | null)?.name ?? null,
      });
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || !data) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={dark.accent} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.welcomeRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(data.displayName) || '🙂'}</Text>
        </View>
        <View style={styles.welcomeTextWrap}>
          <Text style={styles.welcomeText}>Welcome back, {data.displayName}! 👋</Text>
          <Text style={styles.welcomeSubtext}>Ready to crush your goals today?</Text>
        </View>
      </View>

      <Pressable style={styles.heroCard} onPress={() => onNavigate('coach')}>
        <ImageBackground
          source={COACH_HERO}
          style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]}
          resizeMode="cover"
        />
        <LinearGradient
          colors={['rgba(10,10,10,0.55)', 'rgba(10,10,10,0.92)']}
          style={StyleSheet.absoluteFill}
        />
        <Text style={styles.heroLabel}>COACH</Text>
        <Text style={styles.heroTitle}>Hi {data.displayName}, I'm your AI Coach</Text>
        <Text style={styles.heroSubtitle}>
          I'm here to guide, motivate, and help you become your best.
        </Text>
        {data.focusPlanName && (
          <View style={styles.focusChip}>
            <Text style={styles.focusChipLabel}>Focus for today</Text>
            <Text style={styles.focusChipValue}>{data.focusPlanName}</Text>
          </View>
        )}
        <View style={styles.heroButton}>
          <Text style={styles.heroButtonText}>Chat with Coach →</Text>
        </View>
      </Pressable>

      <View style={styles.statsGrid}>
        <Pressable style={styles.statCard} onPress={() => onNavigate('progress')}>
          <Text style={styles.statIcon}>🔥</Text>
          <Text style={styles.statLabel}>STREAK</Text>
          <Text style={styles.statValue}>{data.currentStreak} days</Text>
        </Pressable>
        <Pressable style={styles.statCard} onPress={() => onNavigate('progress')}>
          <Text style={styles.statIcon}>🏆</Text>
          <Text style={styles.statLabel}>CHALLENGES</Text>
          <Text style={styles.statValue}>{data.activeChallengeCount} active</Text>
        </Pressable>
        <Pressable style={styles.statCard} onPress={() => onNavigate('wearables')}>
          <Text style={styles.statIcon}>⌚</Text>
          <Text style={styles.statLabel}>WEARABLE</Text>
          <Text style={styles.statValue}>{data.wearableConnected ? 'Connected' : 'Not connected'}</Text>
        </Pressable>
        <Pressable style={styles.statCard} onPress={() => onNavigate('wellness')}>
          <Text style={styles.statIcon}>🌙</Text>
          <Text style={styles.statLabel}>SLEEP</Text>
          <Text style={styles.statValue}>{formatSleep(data.lastNightMinutes)}</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>Explore</Text>
      <View style={styles.tileGrid}>
        {(
          [
            { label: 'Wellness', icon: '🧘', tab: 'wellness' },
            { label: 'Exercises', icon: '🏋️', tab: 'exercises' },
            { label: 'My Plans', icon: '📅', tab: 'plans' },
            { label: 'Nutrition', icon: '🍎', tab: 'nutrition' },
            { label: 'Shop', icon: '🛍️', tab: 'shop' },
            { label: 'Progress', icon: '📈', tab: 'progress' },
            { label: 'History', icon: '🕘', tab: 'history' },
            { label: 'Profile', icon: '👤', tab: 'profile' },
            { label: 'Outdoor', icon: '🏃', tab: 'outdoor' },
          ] as { label: string; icon: string; tab: Tab }[]
        ).map((tile) => (
          <Pressable key={tile.tab} style={styles.tile} onPress={() => onNavigate(tile.tab)}>
            <Text style={styles.tileIcon}>{tile.icon}</Text>
            <Text style={styles.tileLabel}>{tile.label}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable style={styles.banner} onPress={() => onNavigate('exercises')}>
        <View style={styles.bannerText}>
          <Text style={styles.bannerTitle}>You've got this, {data.displayName}! 🏆</Text>
          <Text style={styles.bannerSubtitle}>Consistency today. Results tomorrow.</Text>
        </View>
        <View style={styles.bannerButton}>
          <Text style={styles.bannerButtonText}>Let's Go →</Text>
        </View>
      </Pressable>
    </ScrollView>
  );
}

const CARD_BG = dark.surface;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: dark.background,
  },
  centered: {
    flex: 1,
    backgroundColor: dark.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: 20,
    paddingBottom: 48,
  },
  welcomeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: dark.surfaceElevated,
    borderWidth: 1,
    borderColor: dark.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: dark.accent,
    fontWeight: '700',
    fontSize: 14,
  },
  welcomeTextWrap: {
    flex: 1,
  },
  welcomeText: {
    color: dark.text,
    fontSize: 18,
    fontWeight: '700',
  },
  welcomeSubtext: {
    color: dark.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  heroCard: {
    backgroundColor: CARD_BG,
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: dark.border,
    overflow: 'hidden',
  },
  heroLabel: {
    color: dark.accent,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 6,
  },
  heroTitle: {
    color: dark.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  heroSubtitle: {
    color: dark.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  focusChip: {
    backgroundColor: dark.surfaceElevated,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 14,
    alignSelf: 'flex-start',
  },
  focusChipLabel: {
    color: dark.textFaint,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  focusChipValue: {
    color: dark.text,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  heroButton: {
    backgroundColor: dark.accent,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  heroButtonText: {
    color: '#0a0a0a',
    fontWeight: '700',
    fontSize: 14,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  statCard: {
    width: '48%',
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: dark.border,
  },
  statIcon: {
    fontSize: 20,
    marginBottom: 6,
  },
  statLabel: {
    color: dark.textFaint,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  statValue: {
    color: dark.text,
    fontSize: 15,
    fontWeight: '700',
  },
  sectionTitle: {
    color: dark.text,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 10,
  },
  tileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  tile: {
    width: '31%',
    backgroundColor: CARD_BG,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: dark.border,
  },
  tileIcon: {
    fontSize: 22,
    marginBottom: 6,
  },
  tileLabel: {
    color: dark.text,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: dark.surfaceElevated,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: dark.accentDark,
  },
  bannerText: {
    flex: 1,
    paddingRight: 10,
  },
  bannerTitle: {
    color: dark.text,
    fontSize: 14,
    fontWeight: '700',
  },
  bannerSubtitle: {
    color: dark.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  bannerButton: {
    backgroundColor: dark.accent,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  bannerButtonText: {
    color: '#0a0a0a',
    fontWeight: '700',
    fontSize: 13,
  },
});
