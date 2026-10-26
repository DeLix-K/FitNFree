import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { realApi, type ToolsApi } from '../../lib/trainerToolsApi';
import { dark } from '../../lib/theme';
import {
  WEEKDAYS,
  WEEKDAYS_SHORT,
  clientSummary,
  clientsCsv,
  effectivePayment,
  isoDate,
  isValidIsoDate,
  sortClients,
  type ClientStatus,
  type PaymentStatus,
  type TrainerClient,
} from '../../lib/trainerTools';
import { Chips, Field, DateField, Tile, confirmDelete, shareCsv } from './Fields';

type Draft = {
  name: string;
  status: ClientStatus;
  package_name: string;
  start_date: string;
  check_in_day: number | null;
  payment_due_date: string;
  payment_status: PaymentStatus;
  notes: string;
};

const BLANK: Draft = { name: '', status: 'active', package_name: '', start_date: isoDate(new Date()), check_in_day: null, payment_due_date: '', payment_status: 'paid', notes: '' };

const PAY_LABEL: Record<PaymentStatus, string> = { paid: 'Paid', due: 'Due', overdue: 'Overdue' };
const PAY_COLOUR: Record<PaymentStatus, string> = { paid: dark.accent, due: '#fbbf24', overdue: dark.danger };

export default function ClientsTab({ api = realApi }: { api?: ToolsApi }) {
  const [clients, setClients] = useState<TrainerClient[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null);
  const today = isoDate(new Date());

  const load = useCallback(async () => {
    setError(null);
    try {
      setClients(await api.fetchClients());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setClients((c) => c ?? []);
    }
  }, [api]);
  useEffect(() => {
    load();
  }, [load]);

  const summary = useMemo(() => clientSummary(clients ?? [], today), [clients, today]);
  const sorted = useMemo(() => sortClients(clients ?? [], today), [clients, today]);

  if (clients === null) return <ActivityIndicator style={{ marginTop: 40 }} color={dark.accent} />;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.tileRow}>
        <Tile label="Active clients" value={String(summary.active)} />
        <Tile label="Payments due" value={String(summary.paymentsDue)} tone={summary.paymentsDue > 0 ? 'warn' : undefined} />
      </View>
      {summary.overdue > 0 ? <Text style={styles.overdueNote}>{summary.overdue} overdue</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.actions}>
        <Pressable style={styles.addButton} onPress={() => setEditing({ id: null, draft: { ...BLANK, start_date: isoDate(new Date()) } })} accessibilityRole="button">
          <Text style={styles.addText}>+ Add client</Text>
        </Pressable>
        {sorted.length > 0 ? (
          <Pressable style={styles.ghostButton} onPress={() => shareCsv('fitnfree-clients.csv', clientsCsv(sorted, today)).catch(() => {})} accessibilityRole="button">
            <Text style={styles.ghostText}>Export</Text>
          </Pressable>
        ) : null}
      </View>

      <Text style={styles.privacy}>Use first names or initials, and keep notes to coaching details. Do not store anything sensitive. You are responsible for the information you keep about your clients.</Text>

      {sorted.length === 0 ? (
        <Text style={styles.empty}>No clients yet. Add your first client to track packages, check-in days and payments.</Text>
      ) : (
        sorted.map((c) => {
          const pay = effectivePayment(c, today);
          return (
            <Pressable
              key={c.id}
              style={[styles.row, c.status !== 'active' && styles.rowMuted]}
              onPress={() =>
                setEditing({
                  id: c.id,
                  draft: {
                    name: c.name,
                    status: c.status,
                    package_name: c.package_name ?? '',
                    start_date: c.start_date ?? '',
                    check_in_day: c.check_in_day,
                    payment_due_date: c.payment_due_date ?? '',
                    payment_status: c.payment_status,
                    notes: c.notes ?? '',
                  },
                })
              }
              accessibilityRole="button"
              accessibilityLabel={`${c.name}, ${PAY_LABEL[pay]}. Tap to edit.`}
            >
              <View style={styles.rowTop}>
                <Text style={styles.rowName}>{c.name}</Text>
                <Text style={[styles.badge, { color: PAY_COLOUR[pay], borderColor: PAY_COLOUR[pay] }]}>{PAY_LABEL[pay]}</Text>
              </View>
              <Text style={styles.rowMeta}>
                {[c.status !== 'active' ? c.status : null, c.package_name, c.check_in_day !== null ? `Check-in ${WEEKDAYS_SHORT[c.check_in_day]}` : null, c.payment_due_date ? `Payment ${c.payment_due_date}` : null].filter(Boolean).join('  ·  ') || 'No details yet'}
              </Text>
              {c.notes ? <Text style={styles.rowNotes} numberOfLines={2}>{c.notes}</Text> : null}
            </Pressable>
          );
        })
      )}

      {editing ? (
        <ClientForm
          initial={editing.draft}
          isNew={editing.id === null}
          onCancel={() => setEditing(null)}
          onDelete={
            editing.id
              ? async () => {
                  if (!(await confirmDelete('Delete this client?', 'Their check-in records are deleted too. This cannot be undone.'))) return;
                  try {
                    await api.deleteClient(editing.id!);
                    setEditing(null);
                    load();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : String(e));
                    setEditing(null);
                  }
                }
              : undefined
          }
          onSave={async (d) => {
            await api.saveClient(editing.id, {
              name: d.name.trim(),
              status: d.status,
              package_name: d.package_name.trim() || null,
              start_date: d.start_date || null,
              check_in_day: d.check_in_day,
              payment_due_date: d.payment_due_date || null,
              payment_status: d.payment_status,
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

function ClientForm({ initial, isNew, onSave, onCancel, onDelete }: { initial: Draft; isNew: boolean; onSave: (d: Draft) => Promise<void>; onCancel: () => void; onDelete?: () => void }) {
  const [d, setD] = useState<Draft>(initial);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  const nameError = d.name.trim().length === 0 ? 'Enter a name.' : null;
  const dateProblem = (d.start_date && !isValidIsoDate(d.start_date)) || (d.payment_due_date && !isValidIsoDate(d.payment_due_date));

  const save = async () => {
    if (nameError || dateProblem) {
      setErr(nameError ?? 'Check the dates.');
      return;
    }
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
          <Text style={styles.modalTitle}>{isNew ? 'Add client' : 'Edit client'}</Text>
          <Pressable onPress={onCancel} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close without saving">
            <Text style={styles.link}>Cancel</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
          <Field label="Client name" value={d.name} onChange={(v) => set('name', v)} placeholder="First name or initials" maxLength={80} />
          <Chips<ClientStatus> label="Status" value={d.status} onChange={(v) => set('status', v)} options={[{ value: 'active', label: 'Active' }, { value: 'paused', label: 'Paused' }, { value: 'ended', label: 'Ended' }]} />
          <Field label="Package" value={d.package_name} onChange={(v) => set('package_name', v)} placeholder="e.g. 12-week transformation" maxLength={80} />
          <DateField label="Start date" optional value={d.start_date} onChange={(v) => set('start_date', v)} />
          <Chips<number> label="Check-in day" value={d.check_in_day} onChange={(v) => set('check_in_day', d.check_in_day === v ? null : v)} options={WEEKDAYS.map((w, i) => ({ value: i, label: w.slice(0, 3) }))} />
          <DateField label="Payment due date" optional value={d.payment_due_date} onChange={(v) => set('payment_due_date', v)} />
          <Chips<PaymentStatus> label="Payment status" value={d.payment_status} onChange={(v) => set('payment_status', v)} options={[{ value: 'paid', label: 'Paid' }, { value: 'due', label: 'Due' }, { value: 'overdue', label: 'Overdue' }]} />
          <Field label="Notes" value={d.notes} onChange={(v) => set('notes', v)} multiline maxLength={1000} placeholder="Goals, how it is going" />
          {err ? <Text style={styles.error}>{err}</Text> : null}
          <Pressable style={[styles.saveButton, saving && { opacity: 0.6 }]} onPress={save} disabled={saving} accessibilityRole="button">
            <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save client'}</Text>
          </Pressable>
          {onDelete ? (
            <Pressable style={styles.deleteButton} onPress={onDelete} accessibilityRole="button">
              <Text style={styles.deleteText}>Delete client</Text>
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
  overdueNote: { color: dark.danger, fontSize: 12, fontWeight: '700', marginTop: 8, textAlign: 'center' },
  error: { color: dark.danger, marginTop: 10 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16, alignItems: 'center' },
  addButton: { backgroundColor: dark.accent, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 20, minHeight: 46 },
  addText: { color: '#0a0a0a', fontWeight: '800', fontSize: 14 },
  ghostButton: { borderWidth: 1, borderColor: dark.border, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 18, minHeight: 46 },
  ghostText: { color: dark.text, fontWeight: '700', fontSize: 14 },
  privacy: { color: dark.textFaint, fontSize: 11, marginTop: 12, marginBottom: 6 },
  empty: { color: dark.textFaint, textAlign: 'center', marginTop: 28 },
  row: { backgroundColor: dark.surface, borderWidth: 1, borderColor: dark.border, borderRadius: 14, padding: 14, marginTop: 10 },
  rowMuted: { opacity: 0.65 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowName: { color: dark.text, fontSize: 16, fontWeight: '700', flex: 1 },
  badge: { fontSize: 11, fontWeight: '800', borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden' },
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
