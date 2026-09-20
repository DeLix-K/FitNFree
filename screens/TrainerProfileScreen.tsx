import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import FormReviewRequestModal from '../components/FormReviewRequestModal';
import StarRating from '../components/StarRating';
import TrainerChatModal from '../components/TrainerChatModal';
import TrainerVideoPlayer from '../components/TrainerVideoPlayer';
import { FORMAT_OPTIONS } from '../lib/trainerMatchmaker';
import { bookSlot, buyPackage, fetchMySessionCredits, fetchOpenSlots, fetchTrainerPackages, fetchTrainerReviews } from '../lib/trainers';
import { CAN_SELL_DIGITAL_CONTENT } from '../lib/storeRules';
import { dark } from '../lib/theme';
import type { OpenTrainerSlot, TrainerProfile, TrainerRating, TrainerReview, TrainerSessionPackage } from '../lib/types';

// Same generic gym-texture fallback as TrainerCard -- Pexels License, free,
// no attribution required, never claims to depict this specific trainer.
const TRAINER_FALLBACK_BG = require('../assets/photos/trainer_fallback.jpg');

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
  return (first + last).toUpperCase() || '?';
}

function formatSlotTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function TrainerProfileScreen({
  trainer,
  rating,
  myUserId,
  onBack,
  onBuy,
  buying,
}: {
  trainer: TrainerProfile;
  rating?: TrainerRating;
  myUserId: string | null;
  onBack: () => void;
  onBuy: () => void;
  buying: boolean;
}) {
  const [reviews, setReviews] = useState<TrainerReview[]>([]);
  const [slots, setSlots] = useState<OpenTrainerSlot[]>([]);
  const [packages, setPackages] = useState<TrainerSessionPackage[]>([]);
  const [sessionsRemaining, setSessionsRemaining] = useState(0);
  const [loading, setLoading] = useState(true);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [buyingPackageId, setBuyingPackageId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [formCheckOpen, setFormCheckOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [reviewData, slotData, packageData, creditBalances] = await Promise.all([
        fetchTrainerReviews(trainer.user_id),
        fetchOpenSlots(trainer.user_id),
        fetchTrainerPackages(trainer.user_id),
        fetchMySessionCredits(),
      ]);
      setReviews(reviewData);
      setSlots(slotData);
      setPackages(packageData);
      setSessionsRemaining(creditBalances.find((b) => b.trainer_user_id === trainer.user_id)?.sessions_remaining ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [trainer.user_id]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const handleBook = async (slot: OpenTrainerSlot) => {
    setBookingId(slot.id);
    setError(null);
    try {
      const booked = await bookSlot(slot.id);
      const linkNote = booked.video_call_link ? `\n\nVideo call link: ${booked.video_call_link}` : '';
      Alert.alert('Booked!', `${slot.slot_type === 'intro' ? 'Free intro call' : 'Session'} on ${formatSlotTime(slot.starts_at)}.${linkNote}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBookingId(null);
    }
  };

  const handleBuyPackage = async (pkg: TrainerSessionPackage) => {
    setBuyingPackageId(pkg.id);
    setError(null);
    try {
      await buyPackage(pkg.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBuyingPackageId(null);
    }
  };

  const introSlots = slots.filter((s) => s.slot_type === 'intro');
  const sessionSlots = slots.filter((s) => s.slot_type === 'session');

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={onBack}>
          <Text style={styles.back}>{'< Trainers'}</Text>
        </Pressable>

        {trainer.intro_video_url ? (
          <TrainerVideoPlayer uri={trainer.intro_video_url} aspectRatio={16 / 10} />
        ) : (
          <View style={styles.avatarFallback}>
            <Image source={TRAINER_FALLBACK_BG} style={styles.avatarFallbackImage} resizeMode="cover" />
            <View style={styles.avatarFallbackDim} />
            <Text style={styles.avatarFallbackText}>{initials(trainer.display_name)}</Text>
          </View>
        )}

        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{trainer.display_name}</Text>
            <StarRating rating={rating?.avg_rating ?? null} reviewCount={rating?.review_count ?? 0} size={14} />
          </View>
          <Text style={styles.price}>{formatPrice(trainer.price_cents)}</Text>
        </View>

        <View style={styles.tagRow}>
          {trainer.specialty ? (
            <View style={styles.tag}>
              <Text style={styles.tagText}>🏷️ {trainer.specialty}</Text>
            </View>
          ) : null}
          {trainer.training_format.map((f) => (
            <View key={f} style={styles.tag}>
              <Text style={styles.tagText}>
                {FORMAT_OPTIONS.find((o) => o.key === f)?.icon} {FORMAT_OPTIONS.find((o) => o.key === f)?.label ?? f}
              </Text>
            </View>
          ))}
          {trainer.location_text ? (
            <View style={styles.tag}>
              <Text style={styles.tagText}>📍 {trainer.location_text}</Text>
            </View>
          ) : null}
          {trainer.payouts_enabled && (
            <View style={[styles.tag, styles.verifiedTag]}>
              <Text style={[styles.tagText, styles.verifiedTagText]}>✓ Verified Coach (Stripe payouts verified)</Text>
            </View>
          )}
        </View>

        {trainer.bio ? <Text style={styles.bio}>{trainer.bio}</Text> : null}

        {error && <Text style={styles.error}>{error}</Text>}

        <View style={styles.actionRow}>
          {CAN_SELL_DIGITAL_CONTENT && (
            <Pressable style={[styles.bookButton, styles.actionButton]} onPress={onBuy} disabled={buying}>
              {buying ? <ActivityIndicator color="#0a0a0a" /> : <Text style={styles.bookButtonText}>📅 Book Custom Plan</Text>}
            </Pressable>
          )}
          <Pressable style={[styles.messageButton, styles.actionButton]} onPress={() => setChatOpen(true)}>
            <Text style={styles.messageButtonText}>💬 Chat</Text>
          </Pressable>
        </View>
        <Pressable style={styles.formCheckButton} onPress={() => setFormCheckOpen(true)}>
          <Text style={styles.formCheckButtonText}>🎥 Request Async Form Check</Text>
        </Pressable>

        {loading ? (
          <ActivityIndicator color={dark.accent} style={{ marginTop: 24 }} />
        ) : (
          <>
            {introSlots.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>1-Tap Test Drive</Text>
                <Text style={styles.sectionHint}>Free 15-minute intro call — no commitment.</Text>
                {introSlots.map((slot) => (
                  <Pressable key={slot.id} style={styles.slotRow} onPress={() => handleBook(slot)} disabled={bookingId === slot.id}>
                    <Text style={styles.slotTime}>{formatSlotTime(slot.starts_at)}</Text>
                    {bookingId === slot.id ? (
                      <ActivityIndicator color={dark.accent} size="small" />
                    ) : (
                      <Text style={styles.slotBookText}>Book Free Intro Call</Text>
                    )}
                  </Pressable>
                ))}
              </>
            )}

            {packages.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Session Packages</Text>
                {sessionsRemaining > 0 && (
                  <Text style={styles.creditsBadge}>✓ You have {sessionsRemaining} session{sessionsRemaining === 1 ? '' : 's'} left with this trainer</Text>
                )}
                {packages.map((pkg) => (
                  <View key={pkg.id} style={styles.packageRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.packageName}>{pkg.name}</Text>
                      <Text style={styles.packageDetail}>
                        {pkg.session_count} sessions · {formatPrice(pkg.price_cents)}
                      </Text>
                    </View>
                    <Pressable style={styles.packageBuyButton} onPress={() => handleBuyPackage(pkg)} disabled={buyingPackageId === pkg.id}>
                      {buyingPackageId === pkg.id ? (
                        <ActivityIndicator color="#0a0a0a" size="small" />
                      ) : (
                        <Text style={styles.packageBuyButtonText}>Buy</Text>
                      )}
                    </Pressable>
                  </View>
                ))}
              </>
            )}

            <Text style={styles.sectionTitle}>Available Session Times</Text>
            {sessionSlots.length === 0 ? (
              <Text style={styles.empty}>No open session slots right now — message the trainer directly.</Text>
            ) : (
              sessionSlots.map((slot) => (
                <Pressable key={slot.id} style={styles.slotRow} onPress={() => handleBook(slot)} disabled={bookingId === slot.id}>
                  <Text style={styles.slotTime}>
                    {formatSlotTime(slot.starts_at)} · {slot.duration_minutes} min
                  </Text>
                  {bookingId === slot.id ? <ActivityIndicator color={dark.accent} size="small" /> : <Text style={styles.slotBookText}>Book</Text>}
                </Pressable>
              ))
            )}

            <Text style={styles.sectionTitle}>Reviews {reviews.length > 0 ? `(${reviews.length})` : ''}</Text>
            {reviews.length === 0 ? (
              <Text style={styles.empty}>No reviews yet.</Text>
            ) : (
              reviews.map((r) => (
                <View key={r.id} style={styles.reviewRow}>
                  <Text style={styles.reviewStars}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</Text>
                  {r.comment ? <Text style={styles.reviewComment}>{r.comment}</Text> : null}
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>

      {myUserId && (
        <TrainerChatModal
          visible={chatOpen}
          onClose={() => setChatOpen(false)}
          trainerUserId={trainer.user_id}
          clientUserId={myUserId}
          otherPartyLabel={trainer.display_name}
        />
      )}

      <FormReviewRequestModal
        visible={formCheckOpen}
        onClose={() => setFormCheckOpen(false)}
        trainerUserId={trainer.user_id}
        trainerName={trainer.display_name}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: dark.background },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  back: { color: dark.accent, fontSize: 14, fontWeight: '600', marginBottom: 12 },
  avatarFallback: { width: '100%', aspectRatio: 16 / 10, borderRadius: 16, backgroundColor: dark.surfaceElevated, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarFallbackImage: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  avatarFallbackDim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(10,10,10,0.6)' },
  avatarFallbackText: { color: dark.accent, fontWeight: '800', fontSize: 40 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 14 },
  name: { fontSize: 20, fontWeight: '800', color: dark.text, marginBottom: 4 },
  price: { fontSize: 18, fontWeight: '800', color: dark.accent },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  tag: { borderWidth: 1, borderColor: dark.border, borderRadius: 10, paddingVertical: 4, paddingHorizontal: 9 },
  tagText: { color: dark.textMuted, fontSize: 11, fontWeight: '600' },
  verifiedTag: { borderColor: dark.accentDark },
  verifiedTagText: { color: dark.accent },
  bio: { color: dark.textMuted, fontSize: 14, lineHeight: 20, marginTop: 14 },
  error: { color: dark.danger, marginTop: 12 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  actionButton: { flex: 1 },
  bookButton: { backgroundColor: dark.accent, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  bookButtonText: { color: '#0a0a0a', fontWeight: '700', fontSize: 13 },
  messageButton: { borderWidth: 1, borderColor: dark.accent, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  messageButtonText: { color: dark.accent, fontWeight: '700', fontSize: 13 },
  formCheckButton: { borderWidth: 1, borderColor: dark.border, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 10 },
  formCheckButtonText: { color: dark.text, fontWeight: '700', fontSize: 13 },
  sectionTitle: { color: dark.text, fontSize: 16, fontWeight: '700', marginTop: 22, marginBottom: 4 },
  sectionHint: { color: dark.textFaint, fontSize: 12, marginBottom: 10 },
  empty: { color: dark.textFaint, fontSize: 12, marginTop: 8 },
  slotRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: dark.border,
    backgroundColor: dark.surface, borderRadius: 10, padding: 12, marginTop: 8,
  },
  slotTime: { color: dark.text, fontSize: 13, fontWeight: '600' },
  slotBookText: { color: dark.accent, fontSize: 12, fontWeight: '700' },
  creditsBadge: { color: dark.accent, fontSize: 12, fontWeight: '600', marginBottom: 8 },
  packageRow: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: dark.border,
    backgroundColor: dark.surface, borderRadius: 10, padding: 12, marginTop: 8,
  },
  packageName: { color: dark.text, fontSize: 14, fontWeight: '700' },
  packageDetail: { color: dark.textMuted, fontSize: 12, marginTop: 2 },
  packageBuyButton: { backgroundColor: dark.accent, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 18 },
  packageBuyButtonText: { color: '#0a0a0a', fontWeight: '700', fontSize: 12 },
  reviewRow: { borderWidth: 1, borderColor: dark.border, backgroundColor: dark.surface, borderRadius: 10, padding: 12, marginTop: 8 },
  reviewStars: { color: '#fbbf24', fontSize: 14, marginBottom: 4 },
  reviewComment: { color: dark.textMuted, fontSize: 13, lineHeight: 18 },
});
