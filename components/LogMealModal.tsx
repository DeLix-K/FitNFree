import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAiGate } from '../hooks/useAiGate';
import { useVoiceInput } from '../hooks/useVoiceInput';
import { lookupBarcode } from '../lib/barcode';
import { saveHistoryEntry } from '../lib/aiHistory';
import {
  askClaude,
  buildNutritionSearchPrompt,
  buildPhotoFoodEstimatePrompt,
  buildVoiceFoodEstimatePrompt,
  parseInstantFoodEstimate,
} from '../lib/claude';
import { addMeal, todayLocalDate, uploadMealPhoto } from '../lib/nutrition';
import { dark } from '../lib/theme';
import type { MealSource, MealType } from '../lib/types';
import { searchUsdaFoods, type UsdaFoodMatch } from '../lib/usda';
import AiUsageIndicator from './AiUsageIndicator';

export type LogMealMode = 'snap' | 'voice' | 'barcode' | 'search';

const MEAL_TYPES: { value: MealType; label: string; icon: string }[] = [
  { value: 'breakfast', label: 'Breakfast', icon: '🍳' },
  { value: 'lunch', label: 'Lunch', icon: '🥗' },
  { value: 'dinner', label: 'Dinner', icon: '🍽️' },
  { value: 'snack', label: 'Snack', icon: '🍎' },
];

// A sensible default meal type from the time of day, so the form doesn't
// always default to "Snack" if the user is logging lunch at noon.
function defaultMealTypeNow(): MealType {
  const hour = new Date().getHours();
  if (hour < 11) return 'breakfast';
  if (hour < 15) return 'lunch';
  if (hour < 21) return 'dinner';
  return 'snack';
}

type Stage = 'capture' | 'analyzing' | 'form' | 'saved';

export default function LogMealModal({
  visible,
  mode,
  onClose,
  onSaved,
}: {
  visible: boolean;
  mode: LogMealMode;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [stage, setStage] = useState<Stage>('capture');
  const [error, setError] = useState<string | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const aiGate = useAiGate();

  // Form fields
  const [mealType, setMealType] = useState<MealType>(defaultMealTypeNow());
  const [description, setDescription] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [fiber, setFiber] = useState('');
  const [iron, setIron] = useState('');
  const [source, setSource] = useState<MealSource>('manual');
  const [saving, setSaving] = useState(false);

  // Photo (Snap mode) -- kept around to upload on Save, not before, so
  // cancelling never leaves an orphaned upload.
  const [photo, setPhoto] = useState<{ base64: string; mimeType: string; uri: string } | null>(null);
  // Barcode-mode real product photo -- no upload needed, it's already a URL.
  const [remoteImageUrl, setRemoteImageUrl] = useState<string | null>(null);

  // Search mode
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [asking, setAsking] = useState(false);
  const [matches, setMatches] = useState<UsdaFoodMatch[]>([]);
  const [aiSearchResult, setAiSearchResult] = useState<string | null>(null);

  // Barcode mode
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const scannedRef = useRef(false);

  const voice = useVoiceInput((transcript) => runVoiceEstimate(transcript));

  const reset = () => {
    setStage('capture');
    setError(null);
    setAiNote(null);
    setMealType(defaultMealTypeNow());
    setDescription('');
    setCalories('');
    setProtein('');
    setCarbs('');
    setFat('');
    setFiber('');
    setIron('');
    setSource('manual');
    setPhoto(null);
    setRemoteImageUrl(null);
    setQuery('');
    setMatches([]);
    setAiSearchResult(null);
    scannedRef.current = false;
    if (voice.listening) voice.stopListening();
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  useEffect(() => {
    if (visible) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, mode]);

  useEffect(() => {
    if (mode === 'barcode' && visible && cameraPermission && !cameraPermission.granted) {
      requestCameraPermission();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, visible, cameraPermission]);

  useEffect(() => {
    if (voice.error) setError(voice.error);
  }, [voice.error]);

  const applyEstimate = (est: { name: string; calories: number; protein: number; carbs: number; fat: number; note: string }) => {
    setDescription(est.name);
    setCalories(String(est.calories));
    setProtein(String(est.protein));
    setCarbs(String(est.carbs));
    setFat(String(est.fat));
    setAiNote(est.note || null);
    setStage('form');
  };

  const runVoiceEstimate = async (transcript: string) => {
    if (!aiGate.canUse) {
      setError("You've used today's free AI actions. Upgrade to Premium for unlimited access.");
      return;
    }
    setStage('analyzing');
    setError(null);
    try {
      const reply = await askClaude(buildVoiceFoodEstimatePrompt(transcript));
      const est = parseInstantFoodEstimate(reply);
      if (!est) throw new Error("Couldn't understand that — try describing it differently.");
      saveHistoryEntry('food_scan', reply, transcript);
      aiGate.refresh();
      setSource('voice');
      applyEstimate(est);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStage('capture');
    }
  };

  const pickPhoto = async (pickSource: 'camera' | 'library') => {
    setError(null);
    try {
      if (pickSource === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setError('Camera access is needed to take a photo. Enable it in Settings, or choose from your library instead.');
          return;
        }
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], base64: true, quality: 0.6, allowsEditing: false };
      const result =
        pickSource === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled || result.assets.length === 0) return;
      const asset = result.assets[0];
      if (!asset.base64) {
        setError("Couldn't read the selected image. Please try a different photo.");
        return;
      }
      if (!aiGate.canUse) {
        setError("You've used today's free AI actions. Upgrade to Premium for unlimited access.");
        return;
      }
      const mimeType = asset.mimeType ?? 'image/jpeg';
      setPhoto({ base64: asset.base64, mimeType, uri: asset.uri });
      setStage('analyzing');
      const reply = await askClaude(buildPhotoFoodEstimatePrompt(), { data: asset.base64, mediaType: mimeType });
      const est = parseInstantFoodEstimate(reply);
      if (!est) throw new Error("Couldn't read that photo — try Search or Voice Log instead.");
      saveHistoryEntry('food_scan', reply);
      aiGate.refresh();
      setSource('scan');
      applyEstimate(est);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStage('capture');
    }
  };

  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    if (scannedRef.current) return;
    scannedRef.current = true;
    setStage('analyzing');
    setError(null);
    try {
      const match = await lookupBarcode(data);
      if (!match) {
        setError(`No match found for barcode ${data} — try Search or Snap instead.`);
        setStage('capture');
        scannedRef.current = false;
        return;
      }
      setDescription(`${match.name}${match.brand ? ` (${match.brand})` : ''}`);
      setCalories(String(Math.round(match.calories ?? 0)));
      setProtein(String(Math.round(match.protein ?? 0)));
      setCarbs(String(Math.round(match.carbs ?? 0)));
      setFat(String(Math.round(match.fat ?? 0)));
      setFiber(match.fiber != null ? String(Math.round(match.fiber)) : '');
      setIron(match.iron != null ? String(Math.round(match.iron * 10) / 10) : '');
      setAiNote(
        `Real values from Open Food Facts, per 100g${match.servingSize ? ` (label serving: ${match.servingSize})` : ''} — adjust for your actual portion.`
      );
      setRemoteImageUrl(match.imageUrl);
      setSource('barcode');
      setStage('form');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStage('capture');
      scannedRef.current = false;
    }
  };

  const runSearch = async () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setSearching(true);
    setError(null);
    setAiSearchResult(null);
    setMatches([]);
    try {
      const usdaMatches = await searchUsdaFoods(trimmed);
      setMatches(usdaMatches);
      if (usdaMatches.length === 0) setError(`No database matches for "${trimmed}" — try Ask AI instead for an estimate.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSearching(false);
    }
  };

  const askAi = async () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    if (!aiGate.canUse) {
      setError("You've used today's free AI actions. Upgrade to Premium for unlimited access.");
      return;
    }
    setAsking(true);
    setError(null);
    setAiSearchResult(null);
    setMatches([]);
    try {
      const reply = await askClaude(buildNutritionSearchPrompt(trimmed));
      setAiSearchResult(reply);
      saveHistoryEntry('nutrition_search', reply, trimmed);
      aiGate.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAsking(false);
    }
  };

  const pickMatch = (match: UsdaFoodMatch) => {
    setDescription(match.description);
    setCalories(String(Math.round(match.calories ?? 0)));
    setProtein(String(Math.round(match.protein ?? 0)));
    setCarbs(String(Math.round(match.carbs ?? 0)));
    setFat(String(Math.round(match.fat ?? 0)));
    setFiber(match.fiber != null ? String(Math.round(match.fiber)) : '');
    setIron(match.iron != null ? String(Math.round(match.iron * 10) / 10) : '');
    setAiNote('Real values from USDA FoodData Central, per 100g — adjust for your actual portion.');
    setSource('search');
    setStage('form');
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      let photoUrl: string | null = remoteImageUrl;
      if (photo) photoUrl = await uploadMealPhoto(photo.base64, photo.mimeType);
      await addMeal({
        logDate: todayLocalDate(),
        mealType,
        description: description.trim() || 'Logged meal',
        calories: Number(calories) || 0,
        proteinG: Number(protein) || 0,
        carbsG: Number(carbs) || 0,
        fatG: Number(fat) || 0,
        fiberG: fiber.trim() ? Number(fiber) : null,
        ironMg: iron.trim() ? Number(iron) : null,
        photoUrl,
        source,
      });
      setStage('saved');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const title = { snap: '📸 Snap Meal', voice: '🎙️ Voice Log', barcode: '📱 Scan Barcode', search: '🔍 Search Database' }[mode];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={handleClose}>
              <Text style={styles.close}>Close</Text>
            </Pressable>
          </View>

          {(mode === 'snap' || mode === 'voice' || mode === 'search') && (
            <AiUsageIndicator isPremium={aiGate.isPremium} remaining={aiGate.remaining} loaded={aiGate.loaded} />
          )}

          <ScrollView keyboardShouldPersistTaps="handled">
            {stage === 'capture' && mode === 'snap' && (
              <View style={styles.captureRow}>
                <Pressable style={styles.captureButton} onPress={() => pickPhoto('camera')}>
                  <Text style={styles.captureButtonText}>Take Photo</Text>
                </Pressable>
                <Pressable style={styles.captureButton} onPress={() => pickPhoto('library')}>
                  <Text style={styles.captureButtonText}>Choose from Library</Text>
                </Pressable>
              </View>
            )}

            {stage === 'capture' && mode === 'voice' && (
              <View style={styles.voiceWrap}>
                <Text style={styles.voiceHint}>
                  {voice.listening ? voice.interimText || 'Listening...' : 'Tap the mic and describe what you ate.'}
                </Text>
                <Pressable
                  style={[styles.micButton, voice.listening && styles.micButtonActive]}
                  onPress={() => (voice.listening ? voice.stopListening() : voice.startListening())}
                >
                  <Text style={styles.micButtonIcon}>{voice.listening ? '⏹️' : '🎙️'}</Text>
                </Pressable>
              </View>
            )}

            {stage === 'capture' && mode === 'barcode' && (
              <View style={styles.cameraWrap}>
                {!cameraPermission?.granted ? (
                  <Text style={styles.voiceHint}>Camera access is needed to scan a barcode.</Text>
                ) : (
                  <CameraView
                    style={styles.camera}
                    facing="back"
                    barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
                    onBarcodeScanned={handleBarcodeScanned}
                  />
                )}
                <Text style={styles.voiceHint}>Point your camera at a product barcode.</Text>
              </View>
            )}

            {stage === 'capture' && mode === 'search' && (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="Search a food (e.g. chicken breast)"
                  placeholderTextColor={dark.textFaint}
                  value={query}
                  onChangeText={setQuery}
                  onSubmitEditing={runSearch}
                  returnKeyType="search"
                />
                <View style={styles.actionRow}>
                  <Pressable style={[styles.searchButton, styles.actionButton]} onPress={runSearch} disabled={searching || asking || !query.trim()}>
                    {searching ? <ActivityIndicator color="#0a0a0a" /> : <Text style={styles.searchButtonText}>Search</Text>}
                  </Pressable>
                  <Pressable style={[styles.askAiButton, styles.actionButton]} onPress={askAi} disabled={searching || asking || !query.trim()}>
                    {asking ? <ActivityIndicator color={dark.accent} /> : <Text style={styles.askAiButtonText}>Ask AI</Text>}
                  </Pressable>
                </View>
                {matches.map((match) => (
                  <Pressable key={match.fdcId} style={styles.matchRow} onPress={() => pickMatch(match)}>
                    <Text style={styles.matchDescription}>{match.description}</Text>
                    <Text style={styles.matchCalories}>{match.calories !== null ? `${Math.round(match.calories)} kcal` : ''}</Text>
                  </Pressable>
                ))}
                {aiSearchResult && (
                  <View style={styles.aiResultBox}>
                    <Text style={styles.aiResultText}>{aiSearchResult}</Text>
                    <Text style={styles.aiResultHint}>
                      AI results aren't precise enough to auto-fill — search a more specific food name above for a real database match.
                    </Text>
                  </View>
                )}
              </>
            )}

            {stage === 'analyzing' && (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={dark.accent} />
                <Text style={styles.loadingText}>Analyzing...</Text>
              </View>
            )}

            {error && <Text style={styles.error}>{error}</Text>}

            {stage === 'form' && (
              <View>
                {photo && <Image source={{ uri: photo.uri }} style={styles.preview} resizeMode="cover" />}
                {!photo && remoteImageUrl && <Image source={{ uri: remoteImageUrl }} style={styles.preview} resizeMode="cover" />}
                {aiNote && <Text style={styles.aiNote}>{aiNote}</Text>}

                <View style={styles.mealTypeRow}>
                  {MEAL_TYPES.map((m) => (
                    <Pressable
                      key={m.value}
                      style={[styles.mealTypeChip, mealType === m.value && styles.mealTypeChipActive]}
                      onPress={() => setMealType(m.value)}
                    >
                      <Text style={[styles.mealTypeChipText, mealType === m.value && styles.mealTypeChipTextActive]}>
                        {m.icon} {m.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <TextInput style={styles.input} placeholder="Description" placeholderTextColor={dark.textFaint} value={description} onChangeText={setDescription} />

                <View style={styles.macroRow}>
                  <TextInput style={[styles.input, styles.macroInput]} placeholder="Calories" placeholderTextColor={dark.textFaint} value={calories} onChangeText={setCalories} keyboardType="numeric" />
                  <TextInput style={[styles.input, styles.macroInput]} placeholder="Protein (g)" placeholderTextColor={dark.textFaint} value={protein} onChangeText={setProtein} keyboardType="numeric" />
                </View>
                <View style={styles.macroRow}>
                  <TextInput style={[styles.input, styles.macroInput]} placeholder="Carbs (g)" placeholderTextColor={dark.textFaint} value={carbs} onChangeText={setCarbs} keyboardType="numeric" />
                  <TextInput style={[styles.input, styles.macroInput]} placeholder="Fat (g)" placeholderTextColor={dark.textFaint} value={fat} onChangeText={setFat} keyboardType="numeric" />
                </View>
                {(source === 'search' || source === 'barcode') && (
                  <View style={styles.macroRow}>
                    <TextInput style={[styles.input, styles.macroInput]} placeholder="Fiber (g, optional)" placeholderTextColor={dark.textFaint} value={fiber} onChangeText={setFiber} keyboardType="numeric" />
                    <TextInput style={[styles.input, styles.macroInput]} placeholder="Iron (mg, optional)" placeholderTextColor={dark.textFaint} value={iron} onChangeText={setIron} keyboardType="numeric" />
                  </View>
                )}

                <Pressable style={styles.saveButton} onPress={handleSave} disabled={saving}>
                  {saving ? <ActivityIndicator color="#0a0a0a" /> : <Text style={styles.saveButtonText}>Save to Today's Meals</Text>}
                </Pressable>
              </View>
            )}

            {stage === 'saved' && (
              <View style={styles.savedWrap}>
                <Text style={styles.savedText}>✓ Added to today's meals</Text>
                <Pressable style={styles.saveButton} onPress={handleClose}>
                  <Text style={styles.saveButtonText}>Done</Text>
                </Pressable>
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  card: { backgroundColor: dark.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '90%', borderWidth: 1, borderColor: dark.border },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { color: dark.text, fontSize: 17, fontWeight: '700' },
  close: { color: dark.accent, fontWeight: '600' },
  captureRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  captureButton: { flex: 1, backgroundColor: dark.accent, borderRadius: 10, paddingVertical: 16, alignItems: 'center' },
  captureButtonText: { color: '#0a0a0a', fontWeight: '700', fontSize: 13, textAlign: 'center' },
  voiceWrap: { alignItems: 'center', paddingVertical: 24 },
  voiceHint: { color: dark.textMuted, fontSize: 13, textAlign: 'center', marginBottom: 16 },
  micButton: { width: 72, height: 72, borderRadius: 36, backgroundColor: dark.surfaceElevated, borderWidth: 2, borderColor: dark.accent, alignItems: 'center', justifyContent: 'center' },
  micButtonActive: { backgroundColor: dark.accent },
  micButtonIcon: { fontSize: 30 },
  cameraWrap: { alignItems: 'center', paddingVertical: 8 },
  camera: { width: '100%', aspectRatio: 4 / 3, borderRadius: 14, overflow: 'hidden', marginBottom: 12 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, justifyContent: 'center' },
  loadingText: { fontSize: 13, color: dark.textMuted },
  error: { color: dark.danger, marginTop: 12, fontSize: 12 },
  preview: { width: '100%', aspectRatio: 4 / 3, borderRadius: 12, marginBottom: 12, backgroundColor: dark.surfaceElevated },
  aiNote: { color: dark.textFaint, fontSize: 11, fontStyle: 'italic', marginBottom: 12, lineHeight: 16 },
  mealTypeRow: { flexDirection: 'row', gap: 8, marginBottom: 10, flexWrap: 'wrap' },
  mealTypeChip: { borderWidth: 1, borderColor: dark.border, borderRadius: 14, paddingVertical: 6, paddingHorizontal: 10 },
  mealTypeChipActive: { backgroundColor: dark.accent, borderColor: dark.accent },
  mealTypeChipText: { color: dark.textMuted, fontSize: 12, fontWeight: '600' },
  mealTypeChipTextActive: { color: '#0a0a0a' },
  input: { borderWidth: 1, borderColor: dark.border, backgroundColor: dark.surfaceElevated, color: dark.text, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 10 },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  actionButton: { flex: 1 },
  searchButton: { backgroundColor: dark.accent, borderRadius: 8, padding: 12, alignItems: 'center' },
  searchButtonText: { color: '#0a0a0a', fontWeight: '700' },
  askAiButton: { borderWidth: 1, borderColor: dark.accent, borderRadius: 8, padding: 12, alignItems: 'center' },
  askAiButtonText: { color: dark.accent, fontWeight: '700' },
  matchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: dark.border, borderRadius: 10, padding: 12, marginBottom: 8 },
  matchDescription: { fontSize: 13, color: dark.text, flexShrink: 1, marginRight: 8 },
  matchCalories: { fontSize: 12, color: dark.textMuted, fontWeight: '600' },
  aiResultBox: { borderWidth: 1, borderColor: dark.border, borderRadius: 10, padding: 12, marginBottom: 10 },
  aiResultText: { fontSize: 13, color: dark.text, lineHeight: 19 },
  aiResultHint: { fontSize: 11, color: dark.textFaint, marginTop: 8, fontStyle: 'italic' },
  macroRow: { flexDirection: 'row', gap: 10 },
  macroInput: { flex: 1 },
  saveButton: { backgroundColor: dark.accent, borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginTop: 6, marginBottom: 20 },
  saveButtonText: { color: '#0a0a0a', fontWeight: '700' },
  savedWrap: { alignItems: 'center', paddingVertical: 20 },
  savedText: { color: dark.accent, fontWeight: '700', fontSize: 16, marginBottom: 16 },
});
