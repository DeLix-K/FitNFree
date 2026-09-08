import type { Session } from '@supabase/supabase-js';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { dark } from '../lib/theme';
import { supabase } from '../lib/supabase';

// Consolidated from 21 tabs to 9, then from 9 to a 4-item bottom bar (Home,
// Coach, Nutrition, More) on 2026-09-08. Every value below is still a real,
// reachable screen -- Wearables/Wellness/Exercises/Plans/Scan/FormCheck/
// History/Progress/Shop/TrainerDashboard/Profile/Videos are now reached via
// MoreScreen (the 'more' tab) or an in-context entry point (Profile links,
// Coach's Form Check quick-action, an Exercises quick-action) rather than
// being top-level tabs themselves. Home and Coach stay primary since
// they're the daily-open screen and the app's paywalled AI differentiator;
// Nutrition stays primary as the other high-frequency daily action (logged
// more often per day than a workout is, across comparable apps).
export type Tab =
  | 'dashboard'
  | 'coach'
  | 'wearables'
  | 'wellness'
  | 'exercises'
  | 'plans'
  | 'scan'
  | 'formCheck'
  | 'nutrition'
  | 'history'
  | 'progress'
  | 'shop'
  | 'trainerDashboard'
  | 'profile'
  | 'videos'
  | 'more';

const PRIMARY_TABS: { label: string; icon: string; value: Tab }[] = [
  { label: 'Home', icon: '🏠', value: 'dashboard' },
  { label: 'Coach', icon: '🤖', value: 'coach' },
  { label: 'Nutrition', icon: '🍎', value: 'nutrition' },
  { label: 'More', icon: '☰', value: 'more' },
];

// A tab also counts as "active" while a screen it hands off to (reached via
// MoreScreen, not a primary tab of its own) is open, so the bottom bar
// still highlights something sensible instead of going blank.
const MORE_TAB_VALUES: Tab[] = [
  'wearables',
  'wellness',
  'exercises',
  'plans',
  'scan',
  'formCheck',
  'history',
  'progress',
  'shop',
  'trainerDashboard',
  'profile',
  'videos',
];

export default function AppShell({
  session,
  activeTab,
  onChangeTab,
  children,
}: {
  session: Session;
  activeTab: Tab;
  onChangeTab: (tab: Tab) => void;
  children: ReactNode;
}) {
  // The bottom bar highlights "More" whenever the active screen is one of
  // its sub-destinations, rather than showing no tab selected at all.
  const highlightedTab = MORE_TAB_VALUES.includes(activeTab) ? 'more' : activeTab;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>FitNFree</Text>
          <Text style={styles.subtitle}>{session.user.email}</Text>
        </View>
        <Pressable onPress={() => supabase.auth.signOut()}>
          <Text style={styles.signOut}>Sign Out</Text>
        </Pressable>
      </View>

      <View style={styles.content}>{children}</View>

      <View style={styles.tabBar}>
        {PRIMARY_TABS.map((tab) => (
          <Pressable
            key={tab.value}
            style={styles.tab}
            onPress={() => onChangeTab(tab.value)}
          >
            <Text style={[styles.tabIcon, highlightedTab === tab.value && styles.tabIconActive]}>
              {tab.icon}
            </Text>
            <Text style={[styles.tabText, highlightedTab === tab.value && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: dark.background,
    paddingTop: 60,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: dark.text,
  },
  subtitle: {
    fontSize: 13,
    color: dark.textMuted,
    marginTop: 2,
  },
  signOut: {
    color: dark.danger,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 6,
  },
  content: {
    flex: 1,
    backgroundColor: '#fff',
  },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: dark.border,
    backgroundColor: dark.surface,
    paddingTop: 8,
    paddingBottom: 24,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  tabIcon: {
    fontSize: 20,
    opacity: 0.55,
  },
  tabIconActive: {
    opacity: 1,
  },
  tabText: {
    fontSize: 11,
    fontWeight: '600',
    color: dark.textFaint,
  },
  tabTextActive: {
    color: dark.accent,
  },
});
