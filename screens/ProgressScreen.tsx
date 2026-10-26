import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import SegmentedHeader from '../components/SegmentedHeader';
import { dark } from '../lib/theme';
import BodyScreen from './BodyScreen';
import ChallengesScreen from './ChallengesScreen';
import StreaksScreen from './StreaksScreen';

type Segment = 'streaks' | 'challenges' | 'body';

const SEGMENTS: { value: Segment; label: string }[] = [
  { value: 'streaks', label: '🔥 Streaks' },
  { value: 'challenges', label: '🏆 Challenges' },
  { value: 'body', label: '⚖️ Body' },
];

// Streaks and Challenges are both motivation/gamification -- merged under
// one Progress tab. Body is the weight and measurements log, with progress
// photos kept only on the phone.
export default function ProgressScreen() {
  const [segment, setSegment] = useState<Segment>('streaks');

  return (
    <View style={styles.container}>
      <SegmentedHeader segments={SEGMENTS} active={segment} onChange={setSegment} />
      <View style={styles.body}>{segment === 'streaks' ? <StreaksScreen /> : segment === 'challenges' ? <ChallengesScreen /> : <BodyScreen />}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: dark.background },
  body: { flex: 1 },
});
