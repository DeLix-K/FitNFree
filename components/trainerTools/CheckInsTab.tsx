import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { realApi, type ToolsApi } from '../../lib/trainerToolsApi';
import { dark } from '../../lib/theme';
import { WEEKDAYS_SHORT, checkInSummary, checkInsCsv, isoDate, isValidIsoDate, parseWeightKg, sortCheckIns, upcomingCheckIns, type TrainerCheckIn, type TrainerClient } from '../../lib/trainerTools';
import { Chips, DateField, Field, Tile, confirmDelete, shareCsv } from './Fields';

type Draft = { client_id: string; checkin_date: string; status: 'to_do' | 'done'; photos_submitted: boolean; weight: string; coach_feedback: string; notes: string };

export default function CheckInsTab({ api = realApi }: { api?: ToolsApi }) {
  const [clients, setClients] = useState<TrainerClient[] | null>(null);
  const [items, setItems] = useState<TrainerCheckIn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null);
  const today = isoDate(new Date());

  const load = useCallback(async () => {
    setError(null);
    try {
      const [c, k] = await Promise.all([api.fetchClients(), api.fetchCheckIns()]);
      setClients(c);
      setItems(k);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setClients((c) => c ?? []);
    }
  }, [api]);
  useEffect(() => {
    load();
  }, [load]);

  const name = useMemo(() => new Map((clients ?? []).map((c) => [c.id, c.name])), [clients]);
  const sorted = useMemo(() => sortCheckIns(items), [items]);
  const summary = useMemo(() => checkInSummary(items), [items]);
  const upcoming = useMemo(() => upcomingCheckIns(clients ?? [], items, today), [clients, items, today]);

  if (clients === null) return <ActivityIndicator style={{ marginTop: 40 }} color={dark.accent} />;

  const openNew = (clientId: string, date: string) => setEditing({ id: null, draft: { client_id: clientId, checkin_date: date, status: 'to_do', photos_submitted: false, weight: '', coach_feedback: '', notes: '' } });
  const noClients = clients.length === 0;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.tileRow}>
        <Tile label="Total check-ins" value={String(summary.total)} />
        <Tile label="Check-ins left to do" value={String(summary.left)} tone={summary.left > 0 ? 'warn' : undefined} />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {noClients ? (
        <Text style={styles.empty}>Add a client in the Clients tab first, then log their check-ins here.</Text>
      ) : (
        <>
          <View style={styles.actions}>
            <Pressable style={styles.addButton} onPress={() => openNew(clients[0].id, today)} accessibilityRole="button">
              <Text style={styles.addText}>+ Log check-in</Text>
            </Pressable>
            {sorted.length > 0 ? (
              <Pressable style={styles.ghostButton} onPress={() => shareCsv('fitnfree-check-ins.csv', checkInsCsv(items, clients)).catch(() => {})} accessibilityRole="button">
                <Text style={styles.ghostText}>Export</Text>
              </Pressable>
            ) : null}
          </View>

          {upcoming.length > 0 ? (
            <>
              <Text style={styles.section}>Coming up</Text>
              {upcoming.map(({ client, date }) => (
                <Pressable key={client.id} style={styles.upRow} onPress={() => openNew(client.id, date)} accessibilityRole="button" accessibilityLabel={`Log a check-in for ${client.name} on ${date}`}>
                  <Text style={styles.upName}>{client.name}</Text>
                  <Text style={styles.upDate}>{date === today ? 'Today' : `${WEEKDAYS_SHORT[new Date(`${date}T00:00:00`).getDay()]} ${date.slice(5)}`}  +</Text>
                </Pressable>
              ))}
            </>
          ) : null}

          <Text style={styles.section}>Check-ins</Text>
          {sorted.length === 0 ? (
            <Text style={styles.empty}>No check-ins logged yet.</Text>
          ) : (
            sorted.map((k) => (
              <Pressable
                key={k.id}
                style={styles.row}
                onPress={() => setEditing({ id: k.id, draft: { client_id: k.client_id, checkin_date: k.checkin_date, status: k.status, photos_submitted: k.photos_submitted, weight: k.weight_kg === null ? '' : String(k.weight_kg), coach_feedback: k.coach_feedback ?? '', notes: k.notes ?? '' } })}
                accessibilityRole="button"
              >
                <View style={styles.rowTop}>
                  <Text style={styles.rowName}>{name.get(k.client_id) ?? 'Client'}</Text>
                  <Text style={[styles.badge, k.status === 'done' ? styles.badgeDone : styles.badgeTodo]}>{k.status === 'done' ? 'Done' : 'To do'}</Text>
                </View>
                <Text style={styles.rowMeta}>
                  {[k.checkin_date, k.weight_kg !== null ? `${k.weight_kg} kg` : null, k.photos_submitted ? 'Photos in' : null].filter(Boolean).join('  ·  ')}
                </Text>
                {k.coach_feedback ? <Text style={styles.rowNotes} numberOfLines={2}>Feedback: {k.coach_feedback}</Text> : null}
              </Pressable>
            ))
          )}
        </>
      )}

      {editing ? (
        <CheckInForm
          clients={clients}
          initial={editing.draft}
          isNew={editing.id === null}
          onCancel={() => setEditing(null)}
          onDelete={
            editing.id
              ? async () => {
                  if (!(await confirmDelete('Delete this check-in?', 'This cannot be undone.'))) return;
                  try {
                    await api.deleteCheckIn(editing.id!);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : String(e));
                  }
                  setEditing(null);
                  load();
                }
              : undefined
          }
          onSave={async (d) => {
            await api.saveCheckIn(editing.id, {
              client_id: d.client_id,
              checkin_date: d.checkin_date,
              status: d.status,
              photos_submitted: d.photos_submitted,
              weight_kg: d.weight.trim() ? parseWeightKg(d.weight) : null,
              coach_feedback: d.coach_feedback.trim() || null,
              notes: d.notes.trim() || null,
            });
            setEditing(null);
            load();
          }}
        />
      ) : null}
    </ScrollView>
  );
}

function CheckInForm({ clients, initial, isNew, onSave, onCancel, onDelete }: { clients: TrainerClient[]; initial: Draft; isNew: boolean; onSave: (d: Draft) => Promise<void>; onCancel: () => void; onDelete?: () => void }) {
  const [d, setD] = useState<Draft>(initial);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const weightBad = d.weight.trim().length > 0 && parseWeightKg(d.weight) === null;

  const save = async () => {
    if (!isValidIsoDate(d.checkin_date)) return setErr('Use a real date like 2026-11-05.');
    if (weightBad) return setErr('Weight should be in kilograms, like 82.4.');
    setSaving(true);
    setErr(null);
    try {
      await onSave(d);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  return (
    <Modal animationType="slide" onRequestClose={onCancel}>
      <View style={styles.modal}>
        <View style={styles.modalTop}>
          <Text style={styles.modalTitle}>{isNew ? 'Log check-in' : 'Edit check-in'}</Text>
          <Pressable onPress={onCancel} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close without saving">
            <Text style={styles.link}>Cancel</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
          <Chips<string> label="Client" value={d.client_id} onChange={(v) => set('client_id', v)} options={clients.filter((c) => c.status !== 'ended' || c.id === d.client_id).map((c) => ({ value: c.id, label: c.name }))} />
          <DateField label="Check-in date" value={d.checkin_date} onChange={(v) => set('checkin_date', v)} />
          <Chips<'to_do' | 'done'> label="Status" value={d.status} onChange={(v) => set('status', v)} options={[{ value: 'to_do', label: 'To do' }, { value: 'done', label: 'Done' }]} />
          <Chips<'yes' | 'no'> label="Photos submitted" value={d.photos_submitted ? 'yes' : 'no'} onChange={(v) => set('photos_submitted', v === 'yes')} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} />
          <Field label="Current weight (kg)" value={d.weight} onChange={(v) => set('weight', v)} keyboardType="decimal-pad" placeholder="e.g. 82.4" maxLength={5} error={weightBad ? 'Kilograms, one decimal at most.' : null} />
          <Field label="Coach feedback" value={d.coach_feedback} onChange={(v) => set('coach_feedback', v)} multiline maxLength={1000} placeholder="What you told them" />
          <Field label="Notes" value={d.notes} onChange={(v) => set('notes', v)} multiline maxLength={1000} />
          {err ? <Text style={styles.error}>{err}</Text> : null}
          <Pressable style={[styles.saveButton, saving && { opacity: 0.6 }]} onPress={save} disabled={saving} accessibilityRole="button">
            <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save check-in'}</Text>
          </Pressable>
          {onDelete ? (
            <Pressable style={styles.deleteButton} onPress={onDelete} accessibilityRole="button">
              <Text style={styles.deleteText}>Delete check-in</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 60 },
  tileRow: { flexDirection: 'row', gap: 10 },
  error: { color: dark.danger, marginTop: 10 },
  empty: { color: dark.textFaint, textAlign: 'center', marginTop: 28 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16, alignItems: 'center' },
  addButton: { backgroundColor: dark.accent, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 20, minHeight: 46 },
  addText: { color: '#0a0a0a', fontWeight: '800', fontSize: 14 },
  ghostButton: { borderWidth: 1, borderColor: dark.border, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 18, minHeight: 46 },
  ghostText: { color: dark.text, fontWeight: '700', fontSize: 14 },
  section: { color: dark.text, fontSize: 16, fontWeight: '700', marginTop: 22, marginBottom: 6 },
  upRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: dark.surface, borderWidth: 1, borderColor: dark.accentDark, borderRadius: 12, padding: 12, marginTop: 8, minHeight: 46, alignItems: 'center' },
  upName: { color: dark.text, fontWeight: '700' },
  upDate: { color: dark.accent, fontWeight: '700', fontSize: 13 },
  row: { backgroundColor: dark.surface, borderWidth: 1, borderColor: dark.border, borderRadius: 14, padding: 14, marginTop: 10 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowName: { color: dark.text, fontSize: 16, fontWeight: '700', flex: 1 },
  badge: { fontSize: 11, fontWeight: '800', borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden' },
  badgeDone: { color: dark.accent, borderColor: dark.accent },
  badgeTodo: { color: '#fbbf24', borderColor: '#fbbf24' },
  rowMeta: { color: dark.textMuted, fontSize: 12, marginTop: 6 },
  rowNotes: { color: dark.textFaint, fontSize: 12, marginTop: 6 },
  modal: { flex: 1, backgroundColor: dark.background, paddingTop: 48 },
  modalTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 8 },
  modalTitle: { color: dark.text, fontSize: 20, fontWeight: '800' },
  link: { color: dark.accent, fontWeight: '700', fontSize: 15 },
  modalBody: { paddingHorizontal: 20, paddingBottom: 60 },
  saveButton: { backgroundColor: dark.accent, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 8 },
  saveText: { color: '#0a0a0a', fontWeight: '800', fontSize: 16 },
  deleteButton: { borderWidth: 1, borderColor: dark.danger, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 14 },
  deleteText: { color: dark.danger, fontWeight: '700' },
});
