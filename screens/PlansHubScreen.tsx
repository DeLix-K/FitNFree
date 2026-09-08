import type { Session } from '@supabase/supabase-js';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import SegmentedHeader from '../components/SegmentedHeader';
import { dark } from '../lib/theme';
import OutdoorActivityScreen from './OutdoorActivityScreen';
import PlansScreen from './PlansScreen';

type Segment = 'workouts' | 'outdoor';

const SEGMENTS: { value: Segment; label: string }[] = [
  { value: 'workouts', label: '🏋️ Workouts' },
  { value: 'outdoor', label: '🏃 Outdoor' },
];

export default function PlansHubScreen({
  session,
  initialSegment,
}: {
  session: Session;
  initialSegment?: Segment;
}) {
  const [segment, setSegment] = useState<Segment>(initialSegment ?? 'workouts');

  return (
    <View style={styles.container}>
      <SegmentedHeader segments={SEGMENTS} active={segment} onChange={setSegment} />
      <View style={styles.body}>
        {segment === 'workouts' ? <PlansScreen session={session} /> : <OutdoorActivityScreen />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: dark.background },
  body: { flex: 1 },
});
