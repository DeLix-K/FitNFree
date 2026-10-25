import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import SegmentedHeader from '../components/SegmentedHeader';
import { CAN_SELL_DIGITAL_CONTENT, SHOW_ONLY_FREE_DIGITAL } from '../lib/storeRules';
import { dark } from '../lib/theme';
import CoursesScreen from './CoursesScreen';
import DigitalProductsScreen from './DigitalProductsScreen';
import MerchScreen from './MerchScreen';
import TrainersScreen from './TrainersScreen';

type Segment = 'trainers' | 'courses' | 'guides' | 'merch';

const ALL_SEGMENTS: { value: Segment; label: string }[] = [
  { value: 'trainers', label: '🧑‍🏫 Trainers' },
  { value: 'courses', label: '📚 Courses' },
  { value: 'guides', label: '📄 Guides & Plans' },
  { value: 'merch', label: '👕 Merch' },
];

// Courses and Guides & Plans are digital content, which the iOS and Android
// apps can't sell outside store billing (see storeRules.ts).
// On the phone apps the Guides tab stays, but it lists only free guides and is labelled that way.
// Courses has no free items, so it stays hidden there.
const SEGMENTS = CAN_SELL_DIGITAL_CONTENT
  ? ALL_SEGMENTS
  : ALL_SEGMENTS.filter((s) => s.value !== 'courses').map((s) =>
      SHOW_ONLY_FREE_DIGITAL && s.value === 'guides' ? { ...s, label: '📄 Free Guides' } : s
    );

// Trainers, Courses, Guides & Plans, and Merch are all "buy something"
// marketplace experiences -- merged under one Shop tab.
export default function ShopScreen() {
  const [segment, setSegment] = useState<Segment>('trainers');

  return (
    <View style={styles.container}>
      <SegmentedHeader segments={SEGMENTS} active={segment} onChange={setSegment} />
      <View style={styles.body}>
        {segment === 'trainers' && <TrainersScreen />}
        {segment === 'courses' && <CoursesScreen />}
        {segment === 'guides' && <DigitalProductsScreen />}
        {segment === 'merch' && <MerchScreen />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: dark.background },
  body: { flex: 1 },
});
