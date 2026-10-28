import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CSV_DATASETS, DATASETS, NOT_INCLUDED, collect, csvFile, everythingKeys, jsonFile, type DatasetKey, type ExportFile, type ExportReader, type Problem } from '../lib/dataExport';
import { supabaseReader } from '../lib/dataExportApi';
import { clearOldExports, shareExport } from '../lib/exportFile';
import { todayLocalDate } from '../lib/exercises';
import { dark } from '../lib/theme';

type Share = (file: ExportFile) => Promise<'shared' | 'unavailable'>;

// Props let the screen run against in-memory data (the reader and share function default to the real ones).
export default function ExportDataScreen({ onBack, reader = supabaseReader, share = shareExport }: { onBack?: () => void; reader?: ExportReader; share?: Share }) {
  const [busy, setBusy] = useState<DatasetKey | 'all' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A copy that is missing something is never handed over silently: it waits here until the person chooses to take it anyway.
  const [pending, setPending] = useState<{ file: ExportFile; problems: Problem[] } | null>(null);
  const mounted = useRef(true);
  const verb = Platform.OS === 'web' ? 'Download' : 'Export';

  useEffect(() => {
    mounted.current = true;
    clearOldExports();
    return () => {
      mounted.current = false;
    };
  }, []);

  const hand = async (file: ExportFile) => {
    const result = await share(file);
    if (!mounted.current) return;
    if (result === 'unavailable') setError('Sharing is not available on this device.');
    else setMessage(Platform.OS === 'web' ? `Downloaded ${file.name}.` : `${file.name} is ready: choose where to save or send it.`);
  };

  const run = async (which: DatasetKey | 'all') => {
    if (busy) return;
    setBusy(which);
    setMessage(null);
    setError(null);
    setPending(null);
    try {
      const day = todayLocalDate();
      const keys = which === 'all' ? everythingKeys() : [which];
      const collected = await collect(reader, keys);
      if (!mounted.current) return;
      if (which !== 'all') {
        if (collected.problems.length) {
          setError(`Could not read your ${collected.problems[0].label.toLowerCase()}: ${collected.problems[0].message}`);
          return;
        }
        const records = collected.records[which] ?? [];
        if (records.length === 0) {
          setMessage('Nothing logged here yet, so there is nothing to export.');
          return;
        }
        await hand(csvFile(which, records, day));
        return;
      }
      const file = jsonFile(collected, day, new Date().toISOString());
      if (collected.problems.length) {
        setPending({ file, problems: collected.problems });
        return;
      }
      await hand(file);
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current) setBusy(null);
    }
  };

  const takeAnyway = async () => {
    if (!pending || busy) return;
    const file = pending.file;
    setPending(null);
    setError(null);
    try {
      await hand(file);
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {onBack && (
        <Pressable onPress={onBack}>
          <Text style={styles.back}>{'< Profile'}</Text>
        </Pressable>
      )}
      <Text style={styles.title}>Export my data</Text>
      <Text style={styles.intro}>A copy of what you have logged in FitNFree. The file is made on your {Platform.OS === 'web' ? 'device' : 'phone'} and goes only where you choose to send it.</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Everything (one file)</Text>
        <Text style={styles.cardText}>A JSON file with {DATASETS.map((d) => d.label.toLowerCase()).join(', ')}. Good for keeping a backup or moving to another app.</Text>
        <Pressable style={[styles.primary, busy && styles.disabled]} onPress={() => run('all')} disabled={!!busy} accessibilityRole="button" accessibilityLabel={`${verb} everything as one file`}>
          {busy === 'all' ? <ActivityIndicator color="#0a0a0a" size="small" /> : <Text style={styles.primaryText}>{verb} everything</Text>}
        </Pressable>
      </View>

      {pending && (
        <View style={styles.warn}>
          <Text style={styles.warnTitle}>Some parts are missing</Text>
          {pending.problems.map((p) => (
            <Text key={p.dataset} style={styles.warnText}>
              • {p.label}: {p.message}
            </Text>
          ))}
          <Text style={styles.warnText}>You can try again, or take the copy as it is (the file lists what is missing or incomplete).</Text>
          <View style={styles.warnRow}>
            <Pressable style={styles.secondary} onPress={() => run('all')} accessibilityRole="button">
              <Text style={styles.secondaryText}>Try again</Text>
            </Pressable>
            <Pressable style={styles.secondary} onPress={takeAnyway} accessibilityRole="button">
              <Text style={styles.secondaryText}>{verb} anyway</Text>
            </Pressable>
          </View>
        </View>
      )}

      {message && <Text style={styles.ok}>{message}</Text>}
      {error && <Text style={styles.err}>{error}</Text>}

      <Text style={styles.section}>Spreadsheets (CSV)</Text>
      <Text style={styles.cardText}>One file per log, opens in Excel, Numbers or Google Sheets.</Text>
      {CSV_DATASETS.map((d) => (
        <View key={d.key} style={styles.row}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={styles.rowTitle}>{d.label}</Text>
            <Text style={styles.rowBlurb}>{d.blurb}</Text>
          </View>
          <Pressable style={[styles.small, busy && styles.disabled]} onPress={() => run(d.key)} disabled={!!busy} accessibilityRole="button" accessibilityLabel={`${verb} ${d.label} as a spreadsheet`}>
            {busy === d.key ? <ActivityIndicator color={dark.accent} size="small" /> : <Text style={styles.smallText}>{verb}</Text>}
          </Pressable>
        </View>
      ))}

      <Text style={styles.section}>Before you send it</Text>
      <Text style={styles.cardText}>
        The file is not encrypted and holds health information (weight, sleep, mood, food). Anyone you send it to can read it, so choose where it goes with care.
      </Text>
      <Text style={styles.section}>Not included</Text>
      {NOT_INCLUDED.map((line) => (
        <Text key={line} style={styles.cardText}>
          • {line}
        </Text>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: dark.background },
  content: { paddingBottom: 48 },
  back: { color: dark.accent, fontSize: 14, fontWeight: '600', marginTop: 16, marginHorizontal: 20 },
  title: { fontSize: 22, fontWeight: '700', color: dark.text, paddingHorizontal: 20, paddingTop: 16, marginBottom: 8 },
  intro: { color: dark.textMuted, fontSize: 14, lineHeight: 20, paddingHorizontal: 20, marginBottom: 16 },
  card: { borderWidth: 1, borderColor: dark.border, backgroundColor: dark.surface, borderRadius: 16, padding: 16, marginHorizontal: 20, marginBottom: 14 },
  cardTitle: { color: dark.text, fontSize: 16, fontWeight: '700', marginBottom: 6 },
  cardText: { color: dark.textMuted, fontSize: 13, lineHeight: 19, paddingHorizontal: 20, marginBottom: 4 },
  primary: { backgroundColor: dark.accent, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 12 },
  primaryText: { color: '#0a0a0a', fontSize: 15, fontWeight: '800' },
  disabled: { opacity: 0.5 },
  warn: { borderWidth: 1, borderColor: '#fbbf24', backgroundColor: dark.surface, borderRadius: 16, padding: 16, marginHorizontal: 20, marginBottom: 14 },
  warnTitle: { color: '#fbbf24', fontSize: 15, fontWeight: '700', marginBottom: 6 },
  warnText: { color: dark.textMuted, fontSize: 13, lineHeight: 19, marginBottom: 4 },
  warnRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  secondary: { borderWidth: 1, borderColor: dark.border, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 },
  secondaryText: { color: dark.text, fontSize: 13, fontWeight: '700' },
  ok: { color: dark.accent, fontSize: 13, paddingHorizontal: 20, marginBottom: 10 },
  err: { color: dark.danger, fontSize: 13, paddingHorizontal: 20, marginBottom: 10 },
  section: { color: dark.text, fontSize: 15, fontWeight: '700', paddingHorizontal: 20, marginTop: 18, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: dark.border, marginHorizontal: 20, paddingVertical: 12 },
  rowTitle: { color: dark.text, fontSize: 15, fontWeight: '600' },
  rowBlurb: { color: dark.textFaint, fontSize: 12, lineHeight: 17, marginTop: 2 },
  small: { borderWidth: 1, borderColor: dark.accentDark, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14, minWidth: 84, alignItems: 'center' },
  smallText: { color: dark.accent, fontSize: 13, fontWeight: '700' },
});
