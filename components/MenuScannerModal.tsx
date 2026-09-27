import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAiGate } from '../hooks/useAiGate';
import { saveHistoryEntry } from '../lib/aiHistory';
import { askClaude, buildMenuScanPrompt, parseMenuScanItems, type MenuScanItem } from '../lib/claude';
import { addMeal, todayLocalDate } from '../lib/nutrition';
import { dark } from '../lib/theme';
import type { MealType } from '../lib/types';
import AiUsageIndicator from './AiUsageIndicator';

export default function MenuScannerModal({
  visible,
  onClose,
  onSaved,
  remaining,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  remaining: { calories: number; protein: number; carbs: number; fat: number };
}) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<MenuScanItem[] | null>(null);
  const [addedNames, setAddedNames] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const aiGate = useAiGate();

  const reset = () => {
    setLoading(false);
    setItems(null);
    setAddedNames(new Set());
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const pickPhoto = async (source: 'camera' | 'library') => {
    setError(null);
    if (!aiGate.canUse) {
      setError("You've used today's free AI actions. Upgrade to Premium for unlimited access.");
      return;
    }
    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setError('Camera access is needed to take a photo. Enable it in Settings, or choose from your library instead.');
          return;
        }
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], base64: true, quality: 0.6, allowsEditing: false };
      const result =
        source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled || result.assets.length === 0) return;
      const asset = result.assets[0];
      if (!asset.base64) {
        setError("Couldn't read the selected image. Please try a different photo.");
        return;
      }
      setLoading(true);
      const reply = await askClaude(
        buildMenuScanPrompt(remaining),
        { data: asset.base64, mediaType: asset.mimeType ?? 'image/jpeg' },
        { routine: true }
      );
      const parsed = parseMenuScanItems(reply);
      if (parsed.length === 0) throw new Error("Couldn't read any dishes from that photo — try a clearer shot of the menu.");
      setItems(parsed);
      saveHistoryEntry('food_scan', reply);
      aiGate.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const addItem = async (item: MenuScanItem, mealType: MealType) => {
    try {
      await addMeal({
        logDate: todayLocalDate(),
        mealType,
        description: item.name,
        calories: item.calories,
        proteinG: item.protein,
        carbsG: item.carbs,
        fatG: item.fat,
        source: 'scan',
      });
      setAddedNames((prev) => new Set(prev).add(item.name));
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>📋 Menu Scanner</Text>
            <Pressable onPress={handleClose}>
              <Text style={styles.close}>Close</Text>
            </Pressable>
          </View>

          <AiUsageIndicator isPremium={aiGate.isPremium} remaining={aiGate.remaining} loaded={aiGate.loaded} />

          <Text style={styles.subtitle}>
            Rough AI estimates read from the menu's text — not a real restaurant database match. Flagged against your{' '}
            {Math.max(0, remaining.calories)} kcal / {Math.max(0, remaining.protein)}g protein left today.
          </Text>

          <ScrollView>
            {!items && (
              <View style={styles.captureRow}>
                <Pressable style={styles.captureButton} onPress={() => pickPhoto('camera')} disabled={loading}>
                  <Text style={styles.captureButtonText}>Take Photo</Text>
                </Pressable>
                <Pressable style={styles.captureButton} onPress={() => pickPhoto('library')} disabled={loading}>
                  <Text style={styles.captureButtonText}>Choose from Library</Text>
                </Pressable>
              </View>
            )}

            {loading && (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={dark.accent} />
                <Text style={styles.loadingText}>Reading menu...</Text>
              </View>
            )}

            {error && <Text style={styles.error}>{error}</Text>}

            {items?.map((item, i) => {
              const added = addedNames.has(item.name);
              return (
                <View key={`${item.name}-${i}`} style={styles.itemCard}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.itemMacros}>
                    {item.calories} kcal · P{item.protein}g C{item.carbs}g F{item.fat}g
                  </Text>
                  <Text style={styles.itemFit}>{item.fit}</Text>
                  {added ? (
                    <Text style={styles.addedText}>✓ Added</Text>
                  ) : (
                    <Pressable style={styles.addButton} onPress={() => addItem(item, 'lunch')}>
                      <Text style={styles.addButtonText}>+ Add to Today's Meals</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}

            {items && (
              <Pressable style={styles.rescanButton} onPress={reset}>
                <Text style={styles.rescanButtonText}>Scan a different menu</Text>
              </Pressable>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  card: { backgroundColor: dark.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '90%', borderWidth: 1, borderColor: dark.border },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { color: dark.text, fontSize: 17, fontWeight: '700' },
  close: { color: dark.accent, fontWeight: '600' },
  subtitle: { color: dark.textFaint, fontSize: 12, lineHeight: 17, marginTop: 10, marginBottom: 14 },
  captureRow: { flexDirection: 'row', gap: 12 },
  captureButton: { flex: 1, backgroundColor: dark.accent, borderRadius: 10, paddingVertical: 16, alignItems: 'center' },
  captureButtonText: { color: '#0a0a0a', fontWeight: '700', fontSize: 13, textAlign: 'center' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, justifyContent: 'center' },
  loadingText: { fontSize: 13, color: dark.textMuted },
  error: { color: dark.danger, marginTop: 12, fontSize: 12 },
  itemCard: { borderWidth: 1, borderColor: dark.border, backgroundColor: dark.surface, borderRadius: 12, padding: 14, marginBottom: 10 },
  itemName: { color: dark.text, fontSize: 15, fontWeight: '700', marginBottom: 4 },
  itemMacros: { color: dark.textMuted, fontSize: 12, fontWeight: '600', marginBottom: 4 },
  itemFit: { color: dark.accent, fontSize: 12, fontStyle: 'italic', marginBottom: 10 },
  addButton: { borderWidth: 1, borderColor: dark.accent, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  addButtonText: { color: dark.accent, fontWeight: '700', fontSize: 12 },
  addedText: { color: dark.accent, fontWeight: '700', fontSize: 12, textAlign: 'center' },
  rescanButton: { alignItems: 'center', paddingVertical: 16, marginBottom: 10 },
  rescanButtonText: { color: dark.textMuted, fontWeight: '600', fontSize: 13 },
});
