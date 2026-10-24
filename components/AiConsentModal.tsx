import { useEffect, useRef, useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { registerAiConsentPresenter } from '../lib/aiConsent';
import { LEGAL_LINKS } from '../lib/legalLinks';
import { dark } from '../lib/theme';

// The permission screen for sharing data with the AI provider (Guideline
// 5.1.2(i)). Mounted once at the app root; lib/aiConsent.ts opens it the first
// time any AI feature runs. A real <Modal> so it appears above other modals.

export default function AiConsentModal() {
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const decideRef = useRef<((granted: boolean) => void) | null>(null);

  useEffect(() => {
    return registerAiConsentPresenter((decide) => {
      decideRef.current?.(false);
      decideRef.current = decide;
      setVisible(true);
    });
  }, []);

  const finish = (granted: boolean) => {
    const decide = decideRef.current;
    decideRef.current = null;
    setVisible(false);
    decide?.(granted);
  };

  const openPrivacy = () => {
    if (LEGAL_LINKS.privacyPolicy) Linking.openURL(LEGAL_LINKS.privacyPolicy).catch(() => {});
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => finish(false)}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 12 }]}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
            <Text style={styles.eyebrow}>Your data and AI</Text>
            <Text style={styles.title}>Allow AI features?</Text>

            <Text style={styles.body}>
              FitNFree's AI Coach, scans, insights and stories are powered by Anthropic (Claude), a
              third-party AI provider. To answer you, FitNFree sends this to Anthropic:
            </Text>
            <Text style={styles.bullet}>{'•  '}what you type or say to the Coach</Text>
            <Text style={styles.bullet}>{'•  '}photos you submit for equipment, meal or menu scans</Text>
            <Text style={styles.bullet}>
              {'•  '}relevant information from your profile and logs, such as your goals, workouts,
              nutrition, sleep and mood entries
            </Text>

            <Text style={styles.body}>
              Anthropic processes it to produce your reply. We don't sell your data or use it for
              advertising. AI replies are general wellness information, not medical advice.
            </Text>
            <Text style={styles.body}>
              You can say no and still use the rest of FitNFree, and you can change this at any time in
              Profile under "AI data sharing".
            </Text>

            <Pressable onPress={openPrivacy} accessibilityRole="link">
              <Text style={styles.link}>Read the Privacy Policy</Text>
            </Pressable>
          </ScrollView>

          <Pressable style={styles.allow} onPress={() => finish(true)} accessibilityRole="button">
            <Text style={styles.allowText}>Allow AI features</Text>
          </Pressable>
          <Pressable style={styles.decline} onPress={() => finish(false)} accessibilityRole="button">
            <Text style={styles.declineText}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: dark.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: dark.border,
    paddingHorizontal: 20,
    paddingTop: 20,
    maxHeight: '90%',
  },
  content: { paddingBottom: 12 },
  eyebrow: { color: dark.accent, fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 },
  title: { color: dark.text, fontSize: 24, fontWeight: '800', marginBottom: 12 },
  body: { color: dark.textMuted, fontSize: 14, lineHeight: 20, marginTop: 10 },
  bullet: { color: dark.text, fontSize: 14, lineHeight: 20, marginTop: 6, paddingLeft: 4 },
  link: { color: dark.accent, fontSize: 13, fontWeight: '600', textDecorationLine: 'underline', marginTop: 14 },
  allow: { backgroundColor: dark.accent, borderRadius: 10, padding: 15, alignItems: 'center', marginTop: 8 },
  allowText: { color: '#0a0a0a', fontWeight: '800', fontSize: 15 },
  decline: { padding: 14, alignItems: 'center' },
  declineText: { color: dark.textMuted, fontSize: 14, fontWeight: '600' },
});
