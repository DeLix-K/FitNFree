import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import SegmentedHeader from '../components/SegmentedHeader';
import CheckInsTab from '../components/trainerTools/CheckInsTab';
import ClientsTab from '../components/trainerTools/ClientsTab';
import FinancesTab from '../components/trainerTools/FinancesTab';
import { realApi, type ToolsApi } from '../lib/trainerToolsApi';
import { dark } from '../lib/theme';

type Segment = 'clients' | 'checkins' | 'finances';

const SEGMENTS: { value: Segment; label: string }[] = [
  { value: 'clients', label: '👥 Clients' },
  { value: 'checkins', label: '✅ Check-ins' },
  { value: 'finances', label: '💷 Finances' },
];

// A trainer's own business tools: who they coach and who has paid, weekly check-ins, and monthly income and expenses.
// Private to the trainer (see supabase/trainer_tools.sql). Shown only to people who have a trainer profile.
export default function TrainerToolsScreen({ api = realApi }: { api?: ToolsApi }) {
  const [segment, setSegment] = useState<Segment>('clients');
  return (
    <View style={styles.container}>
      <SegmentedHeader segments={SEGMENTS} active={segment} onChange={setSegment} />
      <Text style={styles.subtitle}>Your private coaching toolkit. Only you can see this.</Text>
      <View style={styles.body}>
        {segment === 'clients' && <ClientsTab api={api} />}
        {segment === 'checkins' && <CheckInsTab api={api} />}
        {segment === 'finances' && <FinancesTab api={api} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: dark.background },
  subtitle: { color: dark.textFaint, fontSize: 12, textAlign: 'center', marginTop: 4 },
  body: { flex: 1 },
});
