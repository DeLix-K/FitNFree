import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { realApi, type ToolsApi } from '../../lib/trainerToolsApi';
import { dark } from '../../lib/theme';
import { CURRENCIES, MONTHS_SHORT, entriesForMonth, financeCsv, formatMoney, isoDate, isValidIsoDate, monthlyBreakdown, parseMoney, yearTotals, type CurrencyCode, type FinanceEntry } from '../../lib/trainerTools';
import { Chips, DateField, Field, Tile, confirmDelete, shareCsv } from './Fields';

type Draft = { kind: 'income' | 'expense'; entry_date: string; category: string; description: string; amount: string };

const CURRENCY_KEY = 'fitnfree.trainerTools.currency.v1';
const CATEGORY_HINTS = { income: ['Coaching', 'Package', 'Session', 'Other'], expense: ['Software', 'Equipment', 'Gym hire', 'Insurance', 'Travel', 'Marketing', 'Other'] } as const;

export default function FinancesTab({ api = realApi }: { api?: ToolsApi }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [entries, setEntries] = useState<FinanceEntry[] | null>(null);
  const [currency, setCurrency] = useState<CurrencyCode>('GBP');
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(CURRENCY_KEY)
      .then((v) => {
        if (v && v in CURRENCIES) setCurrency(v as CurrencyCode);
      })
      .catch(() => {});
  }, []);
  const pickCurrency = (c: CurrencyCode) => {
    setCurrency(c);
    AsyncStorage.setItem(CURRENCY_KEY, c).catch(() => {});
  };

  const load = useCallback(async () => {
    setError(null);
    setEntries(null);
    try {
      setEntries(await api.fetchFinance(year));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setEntries([]);
    }
  }, [api, year]);
  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => monthlyBreakdown(entries ?? [], year), [entries, year]);
  const totals = useMemo(() => yearTotals(rows), [rows]);
  const monthEntries = useMemo(() => entriesForMonth(entries ?? [], year, month), [entries, year, month]);
  const money = (c: number) => formatMoney(c, currency);
  const pct = (m: number | null) => (m === null ? '–' : `${m}%`);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.yearRow}>
        <Pressable onPress={() => setYear((y) => y - 1)} hitSlop={12} style={styles.yearBtn} accessibilityRole="button" accessibilityLabel="Previous year">
          <Text style={styles.yearBtnText}>‹</Text>
        </Pressable>
        <Text style={styles.year}>{year}</Text>
        <Pressable onPress={() => setYear((y) => y + 1)} hitSlop={12} style={styles.yearBtn} accessibilityRole="button" accessibilityLabel="Next year">
          <Text style={styles.yearBtnText}>›</Text>
        </Pressable>
      </View>

      <View style={styles.tileRow}>
        <Tile label="Income" value={money(totals.income)} />
        <Tile label="Expenses" value={money(totals.expenses)} />
      </View>
      <View style={[styles.tileRow, { marginTop: 10 }]}>
        <Tile label="Profit" value={money(totals.profit)} tone={totals.profit < 0 ? 'warn' : undefined} />
        <Tile label="Profit margin" value={pct(totals.margin)} />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Chips<CurrencyCode> label="Currency symbol" value={currency} onChange={pickCurrency} options={(Object.keys(CURRENCIES) as CurrencyCode[]).map((c) => ({ value: c, label: `${CURRENCIES[c]} ${c}` }))} />

      {entries === null ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={dark.accent} />
      ) : (
        <>
          <Text style={styles.section}>Month by month</Text>
          <View style={styles.table}>
            <View style={[styles.tr, styles.th]}>
              <Text style={[styles.td, styles.tdMonth, styles.thText]}>Month</Text>
              <Text style={[styles.td, styles.thText]}>Income</Text>
              <Text style={[styles.td, styles.thText]}>Spent</Text>
              <Text style={[styles.td, styles.thText]}>Profit</Text>
              <Text style={[styles.td, styles.tdMargin, styles.thText]}>%</Text>
            </View>
            {rows.map((r) => (
              <Pressable key={r.month} style={[styles.tr, month === r.month && styles.trActive]} onPress={() => setMonth(r.month)} accessibilityRole="button" accessibilityLabel={`${MONTHS_SHORT[r.month]}: income ${money(r.income)}, spent ${money(r.expenses)}, profit ${money(r.profit)}`}>
                <Text style={[styles.td, styles.tdMonth, styles.monthText]}>{MONTHS_SHORT[r.month]}</Text>
                <Text style={styles.td}>{money(r.income)}</Text>
                <Text style={styles.td}>{money(r.expenses)}</Text>
                <Text style={[styles.td, r.profit < 0 && styles.neg]}>{money(r.profit)}</Text>
                <Text style={[styles.td, styles.tdMargin]}>{pct(r.margin)}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.actions}>
            <Pressable style={styles.addButton} onPress={() => setEditing({ id: null, draft: { kind: 'income', entry_date: isoDate(new Date(year, month, Math.min(new Date().getDate(), 28))), category: '', description: '', amount: '' } })} accessibilityRole="button">
              <Text style={styles.addText}>+ Add entry</Text>
            </Pressable>
            <Pressable style={styles.ghostButton} onPress={() => shareCsv(`fitnfree-finances-${year}.csv`, financeCsv(entries, year)).catch(() => {})} accessibilityRole="button">
              <Text style={styles.ghostText}>Export {year}</Text>
            </Pressable>
          </View>

          <Text style={styles.section}>{MONTHS_SHORT[month]} {year}</Text>
          {monthEntries.length === 0 ? (
            <Text style={styles.empty}>Nothing recorded for this month.</Text>
          ) : (
            monthEntries.map((e) => (
              <Pressable key={e.id} style={styles.entry} onPress={() => setEditing({ id: e.id, draft: { kind: e.kind, entry_date: e.entry_date, category: e.category ?? '', description: e.description ?? '', amount: (e.amount_cents / 100).toFixed(2) } })} accessibilityRole="button">
                <View style={{ flex: 1 }}>
                  <Text style={styles.entryTitle}>{e.description || e.category || (e.kind === 'income' ? 'Income' : 'Expense')}</Text>
                  <Text style={styles.entryMeta}>{[e.entry_date, e.category].filter(Boolean).join('  ·  ')}</Text>
                </View>
                <Text style={[styles.entryAmount, e.kind === 'expense' && styles.neg]}>{e.kind === 'expense' ? '-' : '+'}{money(e.amount_cents)}</Text>
              </Pressable>
            ))
          )}
          <Text style={styles.fine}>This is your own record. Nothing here moves money or files anything with the tax office.</Text>
        </>
      )}

      {editing ? (
        <EntryForm
          initial={editing.draft}
          isNew={editing.id === null}
          onCancel={() => setEditing(null)}
          onDelete={
            editing.id
              ? async () => {
                  if (!(await confirmDelete('Delete this entry?', 'This cannot be undone.'))) return;
                  try {
                    await api.deleteFinance(editing.id!);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : String(e));
                  }
                  setEditing(null);
                  load();
                }
              : undefined
          }
          onSave={async (d) => {
            await api.saveFinance(editing.id, { entry_date: d.entry_date, kind: d.kind, category: d.category.trim() || null, description: d.description.trim() || null, amount_cents: parseMoney(d.amount)! });
            setEditing(null);
            load();
          }}
        />
      ) : null}
    </ScrollView>
  );
}

function EntryForm({ initial, isNew, onSave, onCancel, onDelete }: { initial: Draft; isNew: boolean; onSave: (d: Draft) => Promise<void>; onCancel: () => void; onDelete?: () => void }) {
  const [d, setD] = useState<Draft>(initial);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const amountBad = d.amount.trim().length > 0 && parseMoney(d.amount) === null;

  const save = async () => {
    if (!isValidIsoDate(d.entry_date)) return setErr('Use a real date like 2026-11-05.');
    if (parseMoney(d.amount) === null) return setErr('Enter an amount above zero, like 45 or 45.50.');
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
          <Text style={styles.modalTitle}>{isNew ? 'Add entry' : 'Edit entry'}</Text>
          <Pressable onPress={onCancel} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close without saving">
            <Text style={styles.link}>Cancel</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
          <Chips<'income' | 'expense'> label="Type" value={d.kind} onChange={(v) => set('kind', v)} options={[{ value: 'income', label: 'Income' }, { value: 'expense', label: 'Expense' }]} />
          <DateField label="Date" value={d.entry_date} onChange={(v) => set('entry_date', v)} />
          <Field label="Amount" value={d.amount} onChange={(v) => set('amount', v)} keyboardType="decimal-pad" placeholder="e.g. 45.00" maxLength={12} error={amountBad ? 'Enter an amount above zero.' : null} />
          <Chips<string> label="Category" value={d.category} onChange={(v) => set('category', d.category === v ? '' : v)} options={CATEGORY_HINTS[d.kind].map((c) => ({ value: c, label: c }))} />
          <Field label="Description" value={d.description} onChange={(v) => set('description', v)} maxLength={120} placeholder="Optional" />
          {err ? <Text style={styles.error}>{err}</Text> : null}
          <Pressable style={[styles.saveButton, saving && { opacity: 0.6 }]} onPress={save} disabled={saving} accessibilityRole="button">
            <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save entry'}</Text>
          </Pressable>
          {onDelete ? (
            <Pressable style={styles.deleteButton} onPress={onDelete} accessibilityRole="button">
              <Text style={styles.deleteText}>Delete entry</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 60 },
  yearRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 24, marginBottom: 14 },
  yearBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: dark.border, borderRadius: 22, backgroundColor: dark.surface },
  yearBtnText: { color: dark.accent, fontSize: 24, fontWeight: '800', marginTop: -2 },
  year: { color: dark.text, fontSize: 22, fontWeight: '800' },
  tileRow: { flexDirection: 'row', gap: 10 },
  error: { color: dark.danger, marginTop: 10 },
  section: { color: dark.text, fontSize: 16, fontWeight: '700', marginTop: 20, marginBottom: 8 },
  table: { borderWidth: 1, borderColor: dark.border, borderRadius: 12, overflow: 'hidden', backgroundColor: dark.surface },
  tr: { flexDirection: 'row', paddingVertical: 11, paddingHorizontal: 8, borderTopWidth: 1, borderTopColor: dark.border, alignItems: 'center', minHeight: 40 },
  th: { borderTopWidth: 0, backgroundColor: dark.surfaceElevated },
  trActive: { backgroundColor: dark.surfaceElevated },
  td: { flex: 1.5, color: dark.textMuted, fontSize: 11.5, textAlign: 'right' },
  tdMonth: { flex: 0.9, textAlign: 'left' },
  tdMargin: { flex: 0.9 },
  thText: { color: dark.textFaint, fontWeight: '800', textTransform: 'uppercase', fontSize: 10 },
  monthText: { color: dark.text, fontWeight: '700' },
  neg: { color: dark.danger },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16, alignItems: 'center' },
  addButton: { backgroundColor: dark.accent, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 20, minHeight: 46 },
  addText: { color: '#0a0a0a', fontWeight: '800', fontSize: 14 },
  ghostButton: { borderWidth: 1, borderColor: dark.border, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 18, minHeight: 46 },
  ghostText: { color: dark.text, fontWeight: '700', fontSize: 14 },
  empty: { color: dark.textFaint, textAlign: 'center', marginTop: 12 },
  entry: { flexDirection: 'row', alignItems: 'center', backgroundColor: dark.surface, borderWidth: 1, borderColor: dark.border, borderRadius: 12, padding: 12, marginTop: 8, minHeight: 52 },
  entryTitle: { color: dark.text, fontWeight: '700', fontSize: 14 },
  entryMeta: { color: dark.textFaint, fontSize: 11, marginTop: 2 },
  entryAmount: { color: dark.accent, fontWeight: '800', fontSize: 14 },
  fine: { color: dark.textFaint, fontSize: 11, marginTop: 18, textAlign: 'center' },
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
