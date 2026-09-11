import type { ReactNode } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dark } from '../lib/theme';

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
  | 'outdoor'
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
  'outdoor',
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
  activeTab,
  onChangeTab,
  children,
}: {
  activeTab: Tab;
  onChangeTab: (tab: Tab) => void;
  children: ReactNode;
}) {
  // The bottom bar highlights "More" whenever the active screen is one of
  // its sub-destinations, rather than showing no tab selected at all.
  const highlightedTab = MORE_TAB_VALUES.includes(activeTab) ? 'more' : activeTab;

  // Real device insets, not a guessed constant -- a fixed paddingBottom
  // (previously 24) cleared iOS's home indicator and gesture-nav Android
  // fine, but on 3-button-nav Android the system bar is taller and the tab
  // bar rendered almost flush against it.
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <View style={styles.header}>
        <Image source={require('../assets/icon.png')} style={styles.logo} />
        <Text style={styles.title}>FitNFree</Text>
      </View>

      <View style={styles.content}>{children}</View>

      <View style={[styles.tabBar, { paddingBottom: insets.bottom + 8 }]}>
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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  logo: {
    width: 34,
    height: 34,
    borderRadius: 9,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: dark.text,
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
