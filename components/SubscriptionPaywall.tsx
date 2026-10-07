import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { notifyPremiumChanged } from '../lib/billing';
import { loadPremiumProductInfo, restorePremiumPurchases, type PremiumProductInfo } from '../lib/iap';
import { LEGAL_LINKS } from '../lib/legalLinks';
import { registerPaywallPresenter } from '../lib/paywall';
import { dark } from '../lib/theme';

// The subscription screen App Review Guideline 3.1.2(c) asks for: title, length,
// price, what's included, and working Privacy Policy / Terms of Use (EULA)
// links, shown BEFORE the store purchase sheet. Mounted once at the app root;
// startCheckout() opens it (see lib/paywall.ts).
//
// It is a real <Modal> because several Upgrade buttons live inside other
// modals, which would hide anything drawn in the normal app layer.

const FEATURES = [
  'Unlimited AI coaching and scans',
  'Daily briefing and post-workout insights',
  'Unlimited programs, Smart Swap All and every card theme',
  'Premium-only challenges',
  'Live map view for outdoor activities',
];

const RENEWAL_TERMS =
  Platform.OS === 'ios'
    ? 'Payment will be charged to your Apple Account when you confirm the purchase. The subscription renews automatically every month unless you cancel at least 24 hours before the end of the current period, and your account will be charged for the renewal within 24 hours before the period ends. You can manage or cancel it at any time in your App Store account settings (Settings, your name, then Subscriptions).'
    : 'Payment will be charged to your Google Play account when you confirm the purchase. The subscription renews automatically every month until you cancel. You can manage or cancel it at any time in Google Play (Payments & subscriptions, then Subscriptions). Cancel before the renewal date to avoid being charged for the next period.';

type InfoState = { status: 'loading' } | { status: 'ready'; info: PremiumProductInfo } | { status: 'error' };

export default function SubscriptionPaywall() {
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [info, setInfo] = useState<InfoState>({ status: 'loading' });
  const [restoring, setRestoring] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Held in a ref: the pending startCheckout() call waits on this.
  const decideRef = useRef<((confirmed: boolean) => void) | null>(null);

  const loadInfo = useCallback(() => {
    setInfo({ status: 'loading' });
    loadPremiumProductInfo()
      .then((loaded) => setInfo(loaded ? { status: 'ready', info: loaded } : { status: 'error' }))
      .catch(() => setInfo({ status: 'error' }));
  }, []);

  useEffect(() => {
    return registerPaywallPresenter((decide) => {
      // If something was already waiting (shouldn't be -- startCheckout allows
      // one at a time), treat it as declined so it doesn't hang.
      decideRef.current?.(false);
      decideRef.current = decide;
      setMessage(null);
      setVisible(true);
      loadInfo();
    });
  }, [loadInfo]);

  const finish = (confirmed: boolean, delayMs = 0) => {
    const decide = decideRef.current;
    decideRef.current = null;
    setVisible(false);
    // Give the sheet time to slide away before the store's own purchase sheet
    // appears, so the two don't fight over the screen.
    if (decide) setTimeout(() => decide(confirmed), delayMs);
  };

  const restore = async () => {
    setRestoring(true);
    setMessage(null);
    try {
      const found = await restorePremiumPurchases();
      if (found) {
        notifyPremiumChanged();
        finish(false);
      } else {
        setMessage("We couldn't find a Premium subscription on this store account.");
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Restore failed. Please try again.');
    } finally {
      setRestoring(false);
    }
  };

  const openLink = async (url: string | null) => {
    if (!url) return;
    try {
      await Linking.openURL(url);
    } catch {
      setMessage('Could not open the link. You can also find it in More, then Profile.');
    }
  };

  const ready = info.status === 'ready' ? info.info : null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => finish(false)}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 12 }]}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
            <Text style={styles.eyebrow}>Auto-renewing subscription</Text>
            <Text style={styles.title}>FitNFree Premium</Text>

            <View style={styles.priceCard}>
              {info.status === 'loading' && <ActivityIndicator color={dark.accent} />}
              {ready && <Text style={styles.price}>{ready.displayPrice} per month</Text>}
              {info.status === 'error' && (
                <>
                  <Text style={styles.priceError}>
                    We couldn't load the price from the store. Check your connection and try again.
                  </Text>
                  <Pressable onPress={loadInfo} accessibilityRole="button">
                    <Text style={styles.retry}>Try again</Text>
                  </Pressable>
                </>
              )}
              <Text style={styles.length}>Length: 1 month, renews automatically until you cancel</Text>
            </View>

            <Text style={styles.sectionLabel}>Included with Premium</Text>
            {FEATURES.map((feature) => (
              <Text key={feature} style={styles.feature}>
                {'✓  '}
                {feature}
              </Text>
            ))}

            <Text style={styles.terms}>{RENEWAL_TERMS}</Text>

            <View style={styles.links}>
              <Pressable onPress={() => openLink(LEGAL_LINKS.privacyPolicy)} accessibilityRole="link">
                <Text style={styles.link}>Privacy Policy</Text>
              </Pressable>
              <Text style={styles.linkDivider}>{'·'}</Text>
              <Pressable onPress={() => openLink(LEGAL_LINKS.terms)} accessibilityRole="link">
                <Text style={styles.link}>Terms of Use (EULA)</Text>
              </Pressable>
            </View>

            {message && <Text style={styles.message}>{message}</Text>}
          </ScrollView>

          <Pressable
            style={[styles.subscribe, !ready && styles.subscribeDisabled]}
            disabled={!ready}
            onPress={() => finish(true, 400)}
            accessibilityRole="button"
          >
            <Text style={styles.subscribeText}>
              {ready ? `Subscribe for ${ready.displayPrice} per month` : 'Subscribe'}
            </Text>
          </Pressable>
          <View style={styles.secondaryRow}>
            <Pressable onPress={restore} disabled={restoring} accessibilityRole="button">
              <Text style={styles.secondary}>{restoring ? 'Restoring…' : 'Restore Purchases'}</Text>
            </Pressable>
            <Pressable onPress={() => finish(false)} accessibilityRole="button">
              <Text style={styles.secondary}>Not now</Text>
            </Pressable>
          </View>
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
  title: { color: dark.text, fontSize: 24, fontWeight: '800', marginBottom: 14 },
  priceCard: {
    backgroundColor: dark.surfaceElevated,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    gap: 6,
  },
  price: { color: dark.text, fontSize: 20, fontWeight: '800' },
  priceError: { color: dark.danger, fontSize: 13 },
  retry: { color: dark.accent, fontSize: 13, fontWeight: '700' },
  length: { color: dark.textMuted, fontSize: 13 },
  sectionLabel: { color: dark.textMuted, fontSize: 12, fontWeight: '700', marginBottom: 8 },
  feature: { color: dark.text, fontSize: 14, marginBottom: 6, lineHeight: 20 },
  terms: { color: dark.textFaint, fontSize: 11, lineHeight: 16, marginTop: 14 },
  links: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  link: { color: dark.accent, fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' },
  linkDivider: { color: dark.textFaint },
  message: { color: dark.danger, fontSize: 13, marginTop: 12 },
  subscribe: { backgroundColor: dark.accent, borderRadius: 10, padding: 15, alignItems: 'center', marginTop: 8 },
  subscribeDisabled: { opacity: 0.4 },
  subscribeText: { color: '#0a0a0a', fontWeight: '800', fontSize: 15 },
  secondaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 14 },
  secondary: { color: dark.textMuted, fontSize: 14, fontWeight: '600' },
});
