import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import SegmentedHeader from '../components/SegmentedHeader';
import { dark } from '../lib/theme';
import BodyScreen from './BodyScreen';
import ChallengesScreen from './ChallengesScreen';
import RecordsScreen from './RecordsScreen';
import StreaksScreen from './StreaksScreen';

type Segment = 'streaks' | 'challenges' | 'records' | 'body';

const SEGMENTS: { value: Segment; label: string }[] = [
  { value: 'streaks', label: '🔥 Streaks' },
  { value: 'challenges', label: '🏆 Challenges' },
  { value: 'records', label: '🏅 Records' },
  { value: 'body', label: '⚖️ Body' },
];

// Streaks and Challenges are both motivation/gamification -- merged under
// one Progress tab. Records is every personal record across all exercises.
// Body is the weight and measurements log, with progress photos kept only on
// the phone.
export default function ProgressScreen() {
  const [segment, setSegment] = useState<Segment>('streaks');

  return (
    <View style={styles.container}>
      <SegmentedHeader segments={SEGMENTS} active={segment} onChange={setSegment} />
      <View style={styles.body}>
        {segment === 'streaks' ? <StreaksScreen /> : segment === 'challenges' ? <ChallengesScreen /> : segment === 'records' ? <RecordsScreen /> : <BodyScreen />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: dark.background },
  body: { flex: 1 },
});
