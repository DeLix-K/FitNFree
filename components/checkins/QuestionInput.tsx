import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { LIMITS, type Question } from '../../lib/checkinForms';
import { dark } from '../../lib/theme';

export type InputValue = string | number | boolean | null | undefined;

// One question of a check-in form, as the client answers it (and as the trainer previews it). Nothing is required: every answer can be left blank.
export default function QuestionInput({ q, value, onChange, error }: { q: Question; value: InputValue; onChange: (v: string | number | boolean | null) => void; error?: string }) {
  const toggle = <T extends string | number | boolean>(next: T) => onChange(value === next ? null : next);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{q.label}</Text>
      {q.hint ? <Text style={styles.hint}>{q.hint}</Text> : null}

      {q.type === 'number' && (
        <View style={styles.numberRow}>
          <TextInput
            style={[styles.input, { flex: 1 }, !!error && styles.inputError]}
            value={typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value)}
            onChangeText={onChange}
            keyboardType="decimal-pad"
            placeholder="Optional"
            placeholderTextColor={dark.textFaint}
            maxLength={12}
            accessibilityLabel={q.label}
          />
          {q.unit ? <Text style={styles.unit}>{q.unit}</Text> : null}
        </View>
      )}

      {q.type === 'scale' && (
        <View style={styles.pills}>
          {Array.from({ length: q.max ?? 5 }, (_, i) => i + 1).map((n) => (
            <Pressable key={n} style={[styles.pill, styles.pillNumber, value === n && styles.pillOn]} onPress={() => toggle(n)} accessibilityRole="button" accessibilityLabel={`${q.label}: ${n}`} accessibilityState={{ selected: value === n }}>
              <Text style={[styles.pillText, value === n && styles.pillTextOn]}>{n}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {q.type === 'yesno' && (
        <View style={styles.pills}>
          {[true, false].map((b) => (
            <Pressable key={String(b)} style={[styles.pill, value === b && styles.pillOn]} onPress={() => toggle(b)} accessibilityRole="button" accessibilityLabel={`${q.label}: ${b ? 'Yes' : 'No'}`} accessibilityState={{ selected: value === b }}>
              <Text style={[styles.pillText, value === b && styles.pillTextOn]}>{b ? 'Yes' : 'No'}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {q.type === 'choice' && (
        <View style={styles.pills}>
          {(q.options ?? []).map((o) => (
            <Pressable key={o} style={[styles.pill, value === o && styles.pillOn]} onPress={() => toggle(o)} accessibilityRole="button" accessibilityLabel={`${q.label}: ${o}`} accessibilityState={{ selected: value === o }}>
              <Text style={[styles.pillText, value === o && styles.pillTextOn]}>{o}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {q.type === 'text' && (
        <TextInput
          style={[styles.input, styles.multi, !!error && styles.inputError]}
          value={typeof value === 'string' ? value : ''}
          onChangeText={onChange}
          multiline
          maxLength={LIMITS.text}
          placeholder="Optional"
          placeholderTextColor={dark.textFaint}
          accessibilityLabel={q.label}
        />
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 18 },
  label: { color: dark.text, fontSize: 15, fontWeight: '700', marginBottom: 4 },
  hint: { color: dark.textFaint, fontSize: 12, marginBottom: 8 },
  input: { backgroundColor: dark.surface, borderWidth: 1, borderColor: dark.border, borderRadius: 10, color: dark.text, paddingHorizontal: 12, paddingVertical: 12, fontSize: 15, minHeight: 46, marginTop: 4 },
  multi: { minHeight: 90, textAlignVertical: 'top' },
  inputError: { borderColor: dark.danger },
  numberRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  unit: { color: dark.textMuted, fontSize: 14, fontWeight: '600', marginTop: 4 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  pill: { borderWidth: 1, borderColor: dark.border, backgroundColor: dark.surface, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9, minHeight: 42, justifyContent: 'center' },
  pillNumber: { minWidth: 46, alignItems: 'center' },
  pillOn: { borderColor: dark.accent, backgroundColor: dark.surfaceElevated },
  pillText: { color: dark.textMuted, fontSize: 14, fontWeight: '700' },
  pillTextOn: { color: dark.accent },
  error: { color: dark.danger, fontSize: 12, marginTop: 4 },
});
