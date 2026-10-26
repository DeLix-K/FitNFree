import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { chartPoints, pathOf, trailingAverage, type Point } from '../lib/bodyLog';
import { dark } from '../lib/theme';

const HEIGHT = 190;

// A line chart of readings over time: each reading is a dot, and the line is the 7-day average, which shows the real direction through
// the day-to-day wobble. Time runs left to right by real date, so gaps in logging look like gaps.
export default function BodyChart({ points, format, label }: { points: Point[]; format: (value: number) => string; label: string }) {
  const [width, setWidth] = useState(0);

  if (points.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No readings in this range yet.</Text>
      </View>
    );
  }

  const average = trailingAverage(points);
  // Scale both the dots and the average line on the same axis, so neither is drawn off the chart.
  const all = [...points, ...average];
  const scaled = width > 0 ? chartPoints(all, width, HEIGHT, 14) : null;
  const dots = scaled ? scaled.points.slice(0, points.length) : [];
  const line = scaled ? scaled.points.slice(points.length) : [];
  const first = points[0];
  const last = points[points.length - 1];

  return (
    <View onLayout={(e) => setWidth(Math.floor(e.nativeEvent.layout.width))} accessible accessibilityLabel={`${label} chart. ${points.length} readings from ${first.date} to ${last.date}. Latest ${format(last.value)}.`}>
      {scaled ? (
        <View style={{ height: HEIGHT }}>
          <Svg width={width} height={HEIGHT}>
            <Line x1={0} x2={width} y1={14} y2={14} stroke={dark.border} strokeWidth={1} />
            <Line x1={0} x2={width} y1={HEIGHT - 14} y2={HEIGHT - 14} stroke={dark.border} strokeWidth={1} />
            {line.length > 1 ? <Path d={pathOf(line)} stroke={dark.accent} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" /> : null}
            {dots.map((p, i) => (
              <Circle key={`${p.date}-${i}`} cx={p.x} cy={p.y} r={i === dots.length - 1 ? 5 : 3} fill={i === dots.length - 1 ? dark.accent : dark.textMuted} />
            ))}
          </Svg>
          <View style={styles.axis}>
            <Text style={styles.axisText}>{format(scaled.max)}</Text>
            <Text style={styles.axisText}>{format(scaled.min)}</Text>
          </View>
        </View>
      ) : (
        <View style={{ height: HEIGHT }} />
      )}
      <View style={styles.dates}>
        <Text style={styles.axisText}>{first.date}</Text>
        <Text style={styles.axisText}>{last.date}</Text>
      </View>
      <Text style={styles.legend}>Dots are single readings. The line is the 7-day average.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { height: 120, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: dark.textFaint },
  axis: { position: 'absolute', right: 4, top: 0, bottom: 0, justifyContent: 'space-between', alignItems: 'flex-end' },
  axisText: { color: dark.textFaint, fontSize: 11 },
  dates: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  legend: { color: dark.textFaint, fontSize: 11, marginTop: 6 },
});
