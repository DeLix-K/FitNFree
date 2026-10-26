import { Alert, Platform, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { isoDate, isValidIsoDate } from '../../lib/trainerTools';
import { dark } from '../../lib/theme';

// Small form pieces shared by the three Trainer Tools tabs.

export function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  keyboardType,
  maxLength,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'decimal-pad' | 'numbers-and-punctuation';
  maxLength?: number;
  error?: string | null;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.inputMulti, !!error && styles.inputError]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={dark.textFaint}
        multiline={multiline}
        keyboardType={keyboardType}
        maxLength={maxLength}
        autoCorrect={false}
        accessibilityLabel={label}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

// A date written YYYY-MM-DD, with a button for today.
export function DateField({ label, value, onChange, optional, error }: { label: string; value: string; onChange: (v: string) => void; optional?: boolean; error?: string | null }) {
  const bad = value.length > 0 && !isValidIsoDate(value);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label}
        {optional ? ' (optional)' : ''}
      </Text>
      <View style={styles.dateRow}>
        <TextInput
          style={[styles.input, styles.dateInput, (bad || !!error) && styles.inputError]}
          value={value}
          onChangeText={onChange}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={dark.textFaint}
          maxLength={10}
          keyboardType="numbers-and-punctuation"
          autoCorrect={false}
          accessibilityLabel={label}
        />
        <Pressable style={styles.todayButton} onPress={() => onChange(isoDate(new Date()))} accessibilityRole="button" accessibilityLabel={`Set ${label} to today`}>
          <Text style={styles.todayText}>Today</Text>
        </Pressable>
      </View>
      {bad ? <Text style={styles.error}>Use the form 2026-11-05, a real date.</Text> : error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

export function Chips<T extends string | number>({ label, options, value, onChange }: { label?: string; options: { value: T; label: string }[]; value: T | null; onChange: (v: T) => void }) {
  return (
    <View style={styles.field}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.chipRow}>
        {options.map((o) => (
          <Pressable key={String(o.value)} style={[styles.chip, value === o.value && styles.chipActive]} onPress={() => onChange(o.value)} accessibilityRole="button" accessibilityState={{ selected: value === o.value }}>
            <Text style={[styles.chipText, value === o.value && styles.chipTextActive]}>{o.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function Tile({ label, value, tone }: { label: string; value: string; tone?: 'warn' }) {
  return (
    <View style={styles.tile}>
      <Text style={[styles.tileValue, tone === 'warn' && styles.tileWarn]}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

export function confirmDelete(title: string, message: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

// Hands a CSV to the share sheet on the phone, or downloads it in a browser.
export async function shareCsv(filename: string, csv: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof document === 'undefined') return;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return;
  }
  await Share.share({ message: csv, title: filename });
}

const styles = StyleSheet.create({
  field: { marginBottom: 14 },
  label: { color: dark.textMuted, fontSize: 12, fontWeight: '700', marginBottom: 6, textTransform: 'uppercase' },
  input: { backgroundColor: dark.surface, borderWidth: 1, borderColor: dark.border, borderRadius: 10, color: dark.text, paddingHorizontal: 12, paddingVertical: 12, fontSize: 15, minHeight: 46 },
  inputMulti: { minHeight: 80, textAlignVertical: 'top' },
  inputError: { borderColor: dark.danger },
  error: { color: dark.danger, fontSize: 12, marginTop: 4 },
  dateRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  dateInput: { flex: 1 },
  todayButton: { borderWidth: 1, borderColor: dark.accent, borderRadius: 10, paddingHorizontal: 14, minHeight: 46, justifyContent: 'center' },
  todayText: { color: dark.accent, fontWeight: '700', fontSize: 13 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: dark.border, backgroundColor: dark.surface, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 9, minHeight: 40, justifyContent: 'center' },
  chipActive: { borderColor: dark.accent, backgroundColor: dark.surfaceElevated },
  chipText: { color: dark.textMuted, fontSize: 13, fontWeight: '700' },
  chipTextActive: { color: dark.accent },
  tile: { flex: 1, backgroundColor: dark.surface, borderWidth: 1, borderColor: dark.border, borderRadius: 14, padding: 14, alignItems: 'center' },
  tileValue: { color: dark.text, fontSize: 24, fontWeight: '800' },
  tileWarn: { color: '#fbbf24' },
  tileLabel: { color: dark.textMuted, fontSize: 11, fontWeight: '700', marginTop: 4, textTransform: 'uppercase', textAlign: 'center' },
});
