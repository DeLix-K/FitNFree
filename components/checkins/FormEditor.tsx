import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { CUSTOM_TYPES, DEFAULT_FORM, LIMITS, QUESTION_TYPE_LABEL, STANDARD_QUESTIONS, STANDARD_IDS, normalizeForm, newCustomId, validateForm, type CustomQuestion, type FormDef, type QuestionType } from '../../lib/checkinForms';
import type { CheckinApi } from '../../lib/checkinFormsApi';
import { dark } from '../../lib/theme';
import { Chips, Field } from '../trainerTools/Fields';
import { confirmAction } from './confirm';

// The trainer's check-in form: which standard questions are on, plus up to 10 questions of their own. Every client linked to the trainer gets this form.
// Changing it never changes check-ins already sent: each one keeps the questions it answered.
export default function FormEditor({ api, onSaved }: { api: CheckinApi; onSaved?: () => void }) {
  const [def, setDef] = useState<FormDef | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    api
      .getForm()
      .then((f) => {
        if (!mounted.current) return;
        setIsNew(f === null);
        setDef(f ?? DEFAULT_FORM);
      })
      .catch((e) => {
        if (!mounted.current) return;
        setError(e instanceof Error ? e.message : String(e));
        setIsNew(true);
        setDef(DEFAULT_FORM);
      });
    return () => {
      mounted.current = false;
    };
  }, [api]);

  if (!def) return <ActivityIndicator color={dark.accent} style={{ marginTop: 30 }} />;

  const change = (next: FormDef) => {
    setDef(next);
    setNotice(null);
    setErrors([]);
  };
  const setCustom = (i: number, patch: Partial<CustomQuestion>) => change({ ...def, custom: def.custom.map((q, k) => (k === i ? { ...q, ...patch } : q)) });
  const setType = (i: number, type: QuestionType) => {
    const old = def.custom[i];
    const next: CustomQuestion = { id: old.id, label: old.label, type };
    if (type === 'choice') next.options = old.options && old.options.length ? old.options : ['', ''];
    if (type === 'scale') next.max = 5;
    if (type === 'number' && old.unit) next.unit = old.unit;
    change({ ...def, custom: def.custom.map((q, k) => (k === i ? next : q)) });
  };
  const move = (i: number, by: -1 | 1) => {
    const j = i + by;
    if (j < 0 || j >= def.custom.length) return;
    const next = [...def.custom];
    [next[i], next[j]] = [next[j], next[i]];
    change({ ...def, custom: next });
  };
  const remove = async (i: number) => {
    if (!(await confirmAction('Remove this question?', 'Check-ins already sent keep their answers to it.', 'Remove'))) return;
    change({ ...def, custom: def.custom.filter((_, k) => k !== i) });
  };

  const save = async () => {
    const problems = validateForm(def);
    if (problems.length) {
      setErrors(problems);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.saveForm(normalizeForm(def));
      if (!mounted.current) return;
      setIsNew(false);
      setNotice('Saved. Your clients see this form the next time they open it.');
      onSaved?.();
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current) setSaving(false);
    }
  };

  return (
    <View>
      <Text style={styles.note}>
        This is the form your linked clients fill in. Only ask for what you need to coach them: clients see every question before answering, can skip any of them, can stop sharing at any
        time and can report you. Do not ask for medical diagnoses, payment details or passwords.
      </Text>
      {isNew ? <Text style={styles.hint}>You have not saved a form yet. Clients can only send check-ins once you do.</Text> : null}

      <Field label="Form title" value={def.title} onChange={(v) => change({ ...def, title: v })} maxLength={LIMITS.title} />
      <Field label="Introduction (optional)" value={def.intro ?? ''} onChange={(v) => change({ ...def, intro: v })} multiline maxLength={LIMITS.intro} placeholder="A line or two clients see above the questions" />

      <Text style={styles.section}>Standard questions</Text>
      {STANDARD_QUESTIONS.map((q) => (
        <View key={q.id} style={styles.switchRow}>
          <Text style={styles.switchLabel}>{q.label}</Text>
          <Switch
            value={def.standard.includes(q.id)}
            onValueChange={(on) => change({ ...def, standard: STANDARD_IDS.filter((id) => (id === q.id ? on : def.standard.includes(id))) })}
            trackColor={{ true: dark.accentDark }}
            thumbColor={def.standard.includes(q.id) ? dark.accent : undefined}
            accessibilityLabel={q.label}
          />
        </View>
      ))}

      <Text style={styles.section}>Your own questions ({def.custom.length} of {LIMITS.custom})</Text>
      {def.custom.map((q, i) => (
        <View key={q.id} style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>Question {i + 1}</Text>
            <View style={styles.cardActions}>
              <Pressable onPress={() => move(i, -1)} disabled={i === 0} accessibilityRole="button" accessibilityLabel={`Move question ${i + 1} up`}>
                <Text style={[styles.action, i === 0 && styles.off]}>↑</Text>
              </Pressable>
              <Pressable onPress={() => move(i, 1)} disabled={i === def.custom.length - 1} accessibilityRole="button" accessibilityLabel={`Move question ${i + 1} down`}>
                <Text style={[styles.action, i === def.custom.length - 1 && styles.off]}>↓</Text>
              </Pressable>
              <Pressable onPress={() => remove(i)} accessibilityRole="button" accessibilityLabel={`Remove question ${i + 1}`}>
                <Text style={styles.remove}>Remove</Text>
              </Pressable>
            </View>
          </View>
          <Field label="Question" value={q.label} onChange={(v) => setCustom(i, { label: v })} maxLength={LIMITS.label} placeholder="e.g. How many steps a day on average?" />
          <Chips<QuestionType> label="Answer type" options={CUSTOM_TYPES.map((t) => ({ value: t, label: QUESTION_TYPE_LABEL[t] }))} value={q.type} onChange={(t) => setType(i, t)} />
          {q.type === 'choice' && (
            <Field label="Options (one per line, 2 to 8)" value={(q.options ?? []).join('\n')} onChange={(v) => setCustom(i, { options: v.split('\n') })} multiline placeholder={'Never\nSometimes\nOften'} />
          )}
          {q.type === 'number' && <Field label="Unit (optional)" value={q.unit ?? ''} onChange={(v) => setCustom(i, { unit: v })} maxLength={LIMITS.unit} placeholder="e.g. steps, cm, hours" />}
          {q.type === 'scale' && <Chips<number> label="Scale goes up to" options={[{ value: 5, label: '1 to 5' }, { value: 10, label: '1 to 10' }]} value={q.max ?? 5} onChange={(v) => setCustom(i, { max: v })} />}
        </View>
      ))}
      <Pressable
        style={[styles.add, def.custom.length >= LIMITS.custom && styles.off]}
        disabled={def.custom.length >= LIMITS.custom}
        onPress={() => change({ ...def, custom: [...def.custom, { id: newCustomId(def.custom.map((q) => q.id)), label: '', type: 'text' }] })}
        accessibilityRole="button"
      >
        <Text style={styles.addText}>+ Add your own question</Text>
      </Pressable>

      {errors.length > 0 && (
        <View style={styles.errorBox}>
          {errors.map((e) => (
            <Text key={e} style={styles.error}>
              • {e}
            </Text>
          ))}
        </View>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {notice ? <Text style={styles.ok}>{notice}</Text> : null}

      <Pressable style={[styles.save, saving && styles.off]} onPress={save} disabled={saving} accessibilityRole="button" accessibilityLabel="Save the check-in form">
        {saving ? <ActivityIndicator color="#0a0a0a" size="small" /> : <Text style={styles.saveText}>Save form</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  note: { color: dark.textFaint, fontSize: 12, lineHeight: 18, marginBottom: 12 },
  hint: { color: '#fbbf24', fontSize: 13, marginBottom: 12 },
  section: { color: dark.text, fontSize: 15, fontWeight: '700', marginTop: 10, marginBottom: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: dark.border, paddingVertical: 8 },
  switchLabel: { color: dark.text, fontSize: 14, flex: 1, paddingRight: 12 },
  card: { borderWidth: 1, borderColor: dark.border, backgroundColor: dark.surface, borderRadius: 14, padding: 14, marginBottom: 12 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  cardTitle: { color: dark.text, fontSize: 14, fontWeight: '700' },
  cardActions: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  action: { color: dark.accent, fontSize: 18, fontWeight: '800' },
  remove: { color: dark.danger, fontSize: 13, fontWeight: '700' },
  add: { borderWidth: 1, borderColor: dark.accent, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginBottom: 14 },
  addText: { color: dark.accent, fontSize: 14, fontWeight: '700' },
  off: { opacity: 0.4 },
  errorBox: { borderWidth: 1, borderColor: dark.danger, borderRadius: 12, padding: 12, marginBottom: 10 },
  error: { color: dark.danger, fontSize: 13, lineHeight: 19 },
  ok: { color: dark.accent, fontSize: 13, marginBottom: 10 },
  save: { backgroundColor: dark.accent, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 4 },
  saveText: { color: '#0a0a0a', fontSize: 15, fontWeight: '800' },
});
