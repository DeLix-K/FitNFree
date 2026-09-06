import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import AudioPlayerButton from '../components/AudioPlayerButton';
import TrainerCard from '../components/TrainerCard';
import TrainerChatModal from '../components/TrainerChatModal';
import TrainerMatchmakerModal from '../components/TrainerMatchmakerModal';
import TrainerProfileForm from '../components/TrainerProfileForm';
import SubmitReviewModal from '../components/SubmitReviewModal';
import {
  buyTrainerPlan,
  cancelMyBooking,
  fetchMyBookings,
  fetchMyFormReviews,
  fetchMyOrdersAsClient,
  fetchMyReviewedOrderIds,
  fetchTrainerRatings,
  fetchTrainers,
} from '../lib/trainers';
import { supabase } from '../lib/supabase';
import { dark } from '../lib/theme';
import type { TrainerFormReview, TrainerOrderView, TrainerProfile, TrainerRating, TrainerTimeSlot } from '../lib/types';
import TrainerProfileScreen from './TrainerProfileScreen';

type ScreenView = { mode: 'list' } | { mode: 'profile'; trainer: TrainerProfile };

const STATUS_LABEL: Record<string, string> = {
  pending: 'Awaiting payment',
  paid: 'Trainer is building your plan',
  fulfilled: 'Delivered — check My Plans',
  refunded: 'Refunded',
};

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatSlotTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function TrainersScreen() {
  const [view, setView] = useState<ScreenView>({ mode: 'list' });
  const [trainers, setTrainers] = useState<TrainerProfile[]>([]);
  const [ratings, setRatings] = useState<Map<string, TrainerRating>>(new Map());
  const [orders, setOrders] = useState<TrainerOrderView[]>([]);
  const [bookings, setBookings] = useState<TrainerTimeSlot[]>([]);
  const [formReviews, setFormReviews] = useState<TrainerFormReview[]>([]);
  const [reviewedOrderIds, setReviewedOrderIds] = useState<Set<string>>(new Set());
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [isTrainer, setIsTrainer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeSpecialty, setActiveSpecialty] = useState<string | null>(null);
  const [signupOpen, setSignupOpen] = useState(false);
  const [signupDone, setSignupDone] = useState(false);
  const [chatTarget, setChatTarget] = useState<TrainerProfile | null>(null);
  const [matchmakerOpen, setMatchmakerOpen] = useState(false);
  const [reviewOrder, setReviewOrder] = useState<TrainerOrderView | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id ?? null;
      setMyUserId(userId);

      const [trainerList, ratingMap, myOrders, myBookings, myFormReviews, myReviewedIds, profileRow] = await Promise.all([
        fetchTrainers(),
        fetchTrainerRatings(),
        fetchMyOrdersAsClient(),
        fetchMyBookings(),
        fetchMyFormReviews(),
        fetchMyReviewedOrderIds(),
        userId
          ? supabase.from('profiles').select('is_trainer').eq('id', userId).single()
          : Promise.resolve({ data: null }),
      ]);
      setTrainers(trainerList);
      setRatings(ratingMap);
      setOrders(myOrders);
      setBookings(myBookings.filter((b) => b.status === 'booked' && new Date(b.starts_at) > new Date()));
      setFormReviews(myFormReviews);
      setReviewedOrderIds(myReviewedIds);
      setIsTrainer(!!(profileRow as { data: { is_trainer: boolean } | null }).data?.is_trainer);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    if (view.mode !== 'list') return;
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [view.mode, load]);

  const specialties = useMemo(() => {
    const set = new Set<string>();
    trainers.forEach((t) => {
      if (t.specialty) set.add(t.specialty);
    });
    return Array.from(set).sort();
  }, [trainers]);

  const filteredTrainers = useMemo(() => {
    if (!activeSpecialty) return trainers;
    return trainers.filter((t) => t.specialty === activeSpecialty);
  }, [trainers, activeSpecialty]);

  const handleBuy = async (trainerProfileId: string) => {
    setBuyingId(trainerProfileId);
    setError(null);
    try {
      await buyTrainerPlan(trainerProfileId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBuyingId(null);
    }
  };

  const handleCancelBooking = async (slotId: string) => {
    try {
      await cancelMyBooking(slotId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  if (view.mode === 'profile') {
    return (
      <TrainerProfileScreen
        trainer={view.trainer}
        rating={ratings.get(view.trainer.user_id)}
        myUserId={myUserId}
        onBack={() => setView({ mode: 'list' })}
        onBuy={() => handleBuy(view.trainer.id)}
        buying={buyingId === view.trainer.id}
      />
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={dark.accent} />
      </View>
    );
  }

  return (
    <>
      <FlatList
        style={styles.container}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <>
            <Text style={styles.title}>Trainers</Text>
            <Text style={styles.subtitle}>
              Book a custom workout plan built for you by a real trainer or nutritionist.
            </Text>

            <Pressable style={styles.matchmakerBanner} onPress={() => setMatchmakerOpen(true)}>
              <Text style={styles.matchmakerBannerText}>⚡ Find Your Perfect Fitness Coach in 30 Seconds</Text>
            </Pressable>

            {error && <Text style={styles.error}>{error}</Text>}

            {isTrainer ? (
              <View style={styles.trainerNotice}>
                <Text style={styles.trainerNoticeText}>
                  ✓ You're a trainer — manage your listing, availability, orders, and messages from the Trainer
                  Dashboard tab above.
                </Text>
              </View>
            ) : signupOpen ? (
              <View style={{ marginBottom: 16 }}>
                <TrainerProfileForm
                  existing={null}
                  onCancel={() => setSignupOpen(false)}
                  onSaved={() => {
                    setSignupOpen(false);
                    setSignupDone(true);
                    setIsTrainer(true);
                  }}
                />
              </View>
            ) : (
              <Pressable style={styles.becomeTrainerCard} onPress={() => setSignupOpen(true)}>
                <Text style={styles.becomeTrainerTitle}>🏋️ Join as a Verified Trainer → Earn & Build</Text>
                <Text style={styles.becomeTrainerText}>
                  Sign up, fill in your profile, add a coaching reel, and start selling custom plans to FitNFree members.
                </Text>
                <Text style={styles.becomeTrainerCta}>Get started →</Text>
              </Pressable>
            )}

            {signupDone && (
              <Text style={styles.successNote}>
                ✓ Trainer profile created — open the new Trainer Dashboard tab above to set up payouts and start
                accepting orders.
              </Text>
            )}

            {bookings.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Upcoming Sessions</Text>
                {bookings.map((b) => (
                  <View key={b.id} style={styles.bookingRow}>
                    <View style={styles.orderInfo}>
                      <Text style={styles.orderTrainer}>
                        {b.slot_type === 'intro' ? '🎥 Free Intro Call' : '🏋️ Session'} · {formatSlotTime(b.starts_at)}
                      </Text>
                      {b.video_call_link ? <Text style={styles.callLink}>{b.video_call_link}</Text> : null}
                    </View>
                    <Pressable onPress={() => handleCancelBooking(b.id)}>
                      <Text style={styles.cancelLink}>Cancel</Text>
                    </Pressable>
                  </View>
                ))}
              </>
            )}

            {orders.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>My Orders</Text>
                {orders.map((order) => (
                  <View key={order.id} style={styles.orderRow}>
                    <View style={styles.orderInfo}>
                      <Text style={styles.orderTrainer}>{order.trainer_display_name}</Text>
                      <Text style={styles.orderStatus}>{STATUS_LABEL[order.status]}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.orderPrice}>{formatPrice(order.amount_cents)}</Text>
                      {order.status === 'fulfilled' && !reviewedOrderIds.has(order.id) && (
                        <Pressable onPress={() => setReviewOrder(order)}>
                          <Text style={styles.rateLink}>Rate this trainer</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                ))}
              </>
            )}

            {formReviews.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>My Form Checks</Text>
                {formReviews.map((fr) => (
                  <View key={fr.id} style={styles.formReviewCard}>
                    <Text style={styles.formReviewName}>{fr.exercise_name}</Text>
                    <Text style={styles.formReviewStatus}>{fr.status === 'pending' ? 'Waiting on trainer feedback...' : '✓ Reviewed'}</Text>
                    {fr.status === 'reviewed' && (
                      <>
                        {fr.comment ? <Text style={styles.formReviewComment}>{fr.comment}</Text> : null}
                        {fr.voice_note_url && <AudioPlayerButton uri={fr.voice_note_url} />}
                      </>
                    )}
                  </View>
                ))}
              </>
            )}

            <Text style={styles.sectionTitle}>Browse Trainers</Text>

            {specialties.length > 0 && (
              <View style={styles.filterRow}>
                <Pressable
                  style={[styles.filterChip, activeSpecialty === null && styles.filterChipActive]}
                  onPress={() => setActiveSpecialty(null)}
                >
                  <Text style={[styles.filterChipText, activeSpecialty === null && styles.filterChipTextActive]}>
                    All
                  </Text>
                </Pressable>
                {specialties.map((s) => (
                  <Pressable
                    key={s}
                    style={[styles.filterChip, activeSpecialty === s && styles.filterChipActive]}
                    onPress={() => setActiveSpecialty(s)}
                  >
                    <Text style={[styles.filterChipText, activeSpecialty === s && styles.filterChipTextActive]}>
                      {s}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </>
        }
        data={filteredTrainers}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <Text style={styles.empty}>No trainers are accepting orders yet — check back soon.</Text>
        }
        renderItem={({ item }) => {
          const isMe = item.user_id === myUserId;
          if (isMe) {
            return (
              <View style={styles.card}>
                <Text style={styles.cardName}>{item.display_name}</Text>
                <View style={styles.ownListingBadge}>
                  <Text style={styles.ownListingText}>This is your listing</Text>
                </View>
              </View>
            );
          }
          return (
            <TrainerCard
              trainer={item}
              rating={ratings.get(item.user_id)}
              onPress={() => setView({ mode: 'profile', trainer: item })}
              onBook={() => handleBuy(item.id)}
              onChat={() => setChatTarget(item)}
            />
          );
        }}
      />

      {chatTarget && myUserId && (
        <TrainerChatModal
          visible={!!chatTarget}
          onClose={() => setChatTarget(null)}
          trainerUserId={chatTarget.user_id}
          clientUserId={myUserId}
          otherPartyLabel={chatTarget.display_name}
        />
      )}

      <TrainerMatchmakerModal
        visible={matchmakerOpen}
        onClose={() => setMatchmakerOpen(false)}
        trainers={trainers.filter((t) => t.user_id !== myUserId)}
        ratings={ratings}
        onViewProfile={(t) => {
          setMatchmakerOpen(false);
          setView({ mode: 'profile', trainer: t });
        }}
        onBook={(t) => {
          setMatchmakerOpen(false);
          handleBuy(t.id);
        }}
        onChat={(t) => {
          setMatchmakerOpen(false);
          setChatTarget(t);
        }}
      />

      <SubmitReviewModal visible={!!reviewOrder} order={reviewOrder} onClose={() => setReviewOrder(null)} onSubmitted={load} />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: dark.background,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: dark.background,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: dark.text,
  },
  subtitle: {
    fontSize: 13,
    color: dark.textFaint,
    marginTop: 4,
    marginBottom: 16,
    lineHeight: 18,
  },
  matchmakerBanner: {
    backgroundColor: dark.accent,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  matchmakerBannerText: {
    color: '#0a0a0a',
    fontWeight: '800',
    fontSize: 14,
  },
  error: {
    color: dark.danger,
    marginBottom: 12,
  },
  becomeTrainerCard: {
    borderWidth: 1,
    borderColor: dark.accent,
    backgroundColor: dark.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  becomeTrainerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: dark.text,
  },
  becomeTrainerText: {
    fontSize: 13,
    color: dark.textMuted,
    marginTop: 4,
    lineHeight: 18,
  },
  becomeTrainerCta: {
    fontSize: 13,
    color: dark.accent,
    fontWeight: '700',
    marginTop: 10,
  },
  trainerNotice: {
    borderWidth: 1,
    borderColor: dark.accentDark,
    backgroundColor: dark.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  trainerNoticeText: {
    color: dark.text,
    fontSize: 13,
    lineHeight: 18,
  },
  successNote: {
    color: dark.accent,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 16,
    lineHeight: 17,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: dark.text,
    marginTop: 8,
    marginBottom: 8,
  },
  empty: {
    color: dark.textFaint,
    textAlign: 'center',
    marginTop: 12,
  },
  bookingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: dark.accentDark,
    backgroundColor: dark.surface,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  callLink: {
    color: dark.accent,
    fontSize: 11,
    marginTop: 3,
  },
  cancelLink: {
    color: dark.danger,
    fontSize: 12,
    fontWeight: '600',
  },
  orderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.surface,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  orderInfo: {
    flex: 1,
  },
  orderTrainer: {
    fontSize: 14,
    fontWeight: '700',
    color: dark.text,
  },
  orderStatus: {
    fontSize: 12,
    color: dark.textMuted,
    marginTop: 2,
  },
  orderPrice: {
    fontSize: 13,
    fontWeight: '600',
    color: dark.textMuted,
  },
  rateLink: {
    color: dark.accent,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 4,
  },
  formReviewCard: {
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  formReviewName: {
    color: dark.text,
    fontSize: 14,
    fontWeight: '700',
  },
  formReviewStatus: {
    color: dark.textMuted,
    fontSize: 12,
    marginTop: 2,
    marginBottom: 6,
  },
  formReviewComment: {
    color: dark.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  filterChip: {
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  filterChipActive: {
    backgroundColor: dark.accent,
    borderColor: dark.accent,
  },
  filterChipText: {
    color: dark.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#0a0a0a',
  },
  card: {
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  cardName: {
    fontSize: 16,
    fontWeight: '700',
    color: dark.text,
  },
  ownListingBadge: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  ownListingText: {
    color: dark.textFaint,
    fontSize: 12,
    fontWeight: '600',
  },
});
