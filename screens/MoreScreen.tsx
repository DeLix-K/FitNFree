import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, Pressable, View } from 'react-native';
import type { Tab } from '../components/AppShell';
import { supabase } from '../lib/supabase';
import { dark } from '../lib/theme';

const ADMIN_EMAIL = 'teamlix6@gmail.com';

// Everything that used to be its own top-level tab before the bottom-bar
// consolidation (2026-09-08) lives here now, grouped the same way the old
// scrolling tab row read left-to-right. Home/Coach/Nutrition stay off this
// list since they're the three primary bottom-bar tabs.
const TRAIN_LINKS: { label: string; icon: string; value: Tab }[] = [
  { label: 'My Plans', icon: '📋', value: 'plans' },
  { label: 'Exercises', icon: '💪', value: 'exercises' },
  { label: 'Wellness', icon: '🌿', value: 'wellness' },
  { label: 'Progress', icon: '📈', value: 'progress' },
];

const OTHER_LINKS: { label: string; icon: string; value: Tab }[] = [
  { label: 'Shop', icon: '🛍️', value: 'shop' },
  { label: 'Profile', icon: '👤', value: 'profile' },
];

export default function MoreScreen({
  session,
  onNavigate,
}: {
  session: Session;
  onNavigate: (tab: Tab) => void;
}) {
  const [isTrainer, setIsTrainer] = useState(false);
  const isAdmin = session.user.email === ADMIN_EMAIL;

  useEffect(() => {
    supabase
      .from('profiles')
      .select('is_trainer')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => setIsTrainer(!!data?.is_trainer));
  }, [session.user.id]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>More</Text>

      <Text style={styles.sectionTitle}>Train &amp; Track</Text>
      {TRAIN_LINKS.map((item) => (
        <Pressable key={item.value} style={styles.row} onPress={() => onNavigate(item.value)}>
          <Text style={styles.rowIcon}>{item.icon}</Text>
          <Text style={styles.rowText}>{item.label}</Text>
          <Text style={styles.rowArrow}>→</Text>
        </Pressable>
      ))}

      <Text style={styles.sectionTitle}>Shop &amp; Account</Text>
      {OTHER_LINKS.map((item) => (
        <Pressable key={item.value} style={styles.row} onPress={() => onNavigate(item.value)}>
          <Text style={styles.rowIcon}>{item.icon}</Text>
          <Text style={styles.rowText}>{item.label}</Text>
          <Text style={styles.rowArrow}>→</Text>
        </Pressable>
      ))}

      {(isTrainer || isAdmin) && (
        <>
          <Text style={styles.sectionTitle}>Manage</Text>
          {isTrainer && (
            <Pressable style={styles.row} onPress={() => onNavigate('trainerDashboard')}>
              <Text style={styles.rowIcon}>🧑‍🏫</Text>
              <Text style={styles.rowText}>Trainer Dashboard</Text>
              <Text style={styles.rowArrow}>→</Text>
            </Pressable>
          )}
          {isAdmin && (
            <Pressable style={styles.row} onPress={() => onNavigate('videos')}>
              <Text style={styles.rowIcon}>🎬</Text>
              <Text style={styles.rowText}>Manage Videos</Text>
              <Text style={styles.rowArrow}>→</Text>
            </Pressable>
          )}
        </>
      )}

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Privacy Policy, Terms &amp; Conditions, and Contact are in Profile.
        </Text>
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
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: dark.text,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: dark.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 24,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.surface,
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  rowIcon: {
    fontSize: 18,
  },
  rowText: {
    flex: 1,
    color: dark.text,
    fontSize: 14,
    fontWeight: '600',
  },
  rowArrow: {
    color: dark.textFaint,
    fontSize: 16,
  },
  footer: {
    marginTop: 24,
    alignItems: 'center',
  },
  footerText: {
    color: dark.textFaint,
    fontSize: 12,
    textAlign: 'center',
  },
});
