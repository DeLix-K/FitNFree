import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { FORMAT_OPTIONS } from '../lib/trainerMatchmaker';
import { CAN_SELL_DIGITAL_CONTENT } from '../lib/storeRules';
import { dark } from '../lib/theme';
import type { TrainerProfile, TrainerRating } from '../lib/types';
import StarRating from './StarRating';
import TrainerVideoPlayer from './TrainerVideoPlayer';

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// Real photo (Roman Odintsov, free under the Pexels License, no attribution
// required) -- generic gym texture behind a trainer's initials when they
// haven't uploaded an intro video, instead of a flat color block. Never
// claims to be a photo of that specific trainer.
const TRAINER_FALLBACK_BG = require('../assets/photos/trainer_fallback.jpg');

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
  return (first + last).toUpperCase() || '?';
}

export default function TrainerCard({
  trainer,
  rating,
  matchScore,
  matchReasons,
  onPress,
  onBook,
  onChat,
}: {
  trainer: TrainerProfile;
  rating?: TrainerRating;
  matchScore?: number;
  matchReasons?: string[];
  onPress: () => void;
  onBook: () => void;
  onChat: () => void;
}) {
  return (
    <View style={styles.card}>
      {matchScore != null && (
        <View style={styles.matchBadge}>
          <Text style={styles.matchBadgeText}>🟢 {matchScore}% MATCH</Text>
        </View>
      )}

      <Pressable onPress={onPress}>
        {trainer.intro_video_url ? (
          <TrainerVideoPlayer uri={trainer.intro_video_url} aspectRatio={16 / 10} />
        ) : (
          <View style={styles.avatarFallback}>
            <Image source={TRAINER_FALLBACK_BG} style={styles.avatarFallbackImage} resizeMode="cover" />
            <View style={styles.avatarFallbackDim} />
            <Text style={styles.avatarFallbackText}>{initials(trainer.display_name)}</Text>
          </View>
        )}
      </Pressable>

      <Pressable onPress={onPress} style={styles.header}>
        <View style={styles.headerInfo}>
          <Text style={styles.name}>{trainer.display_name}</Text>
          <StarRating rating={rating?.avg_rating ?? null} reviewCount={rating?.review_count ?? 0} />
        </View>
        <Text style={styles.price}>{formatPrice(trainer.price_cents)}</Text>
      </Pressable>

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
        {trainer.payouts_enabled && (
          <View style={[styles.tag, styles.verifiedTag]}>
            <Text style={[styles.tagText, styles.verifiedTagText]}>✓ Verified Payouts</Text>
          </View>
        )}
      </View>

      {matchReasons && matchReasons.length > 0 && (
        <View style={styles.reasonsBox}>
          <Text style={styles.reasonsTitle}>💡 WHY YOU MATCH</Text>
          {matchReasons.map((r) => (
            <Text key={r} style={styles.reasonLine}>
              • {r}
            </Text>
          ))}
        </View>
      )}

      <View style={styles.actionRow}>
        {CAN_SELL_DIGITAL_CONTENT && trainer.payouts_enabled && (
          <Pressable style={[styles.bookButton, styles.actionButton]} onPress={onBook}>
            <Text style={styles.bookButtonText}>📅 Book This Trainer</Text>
          </Pressable>
        )}
        <Pressable style={[styles.messageButton, styles.actionButton]} onPress={onChat}>
          <Text style={styles.messageButtonText}>💬 Chat</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.surface,
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  matchBadge: {
    marginBottom: 8,
  },
  matchBadgeText: {
    color: dark.accent,
    fontSize: 12,
    fontWeight: '800',
  },
  avatarFallback: {
    width: '100%',
    aspectRatio: 16 / 10,
    borderRadius: 14,
    backgroundColor: dark.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarFallbackImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  avatarFallbackDim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(10,10,10,0.6)',
  },
  avatarFallbackText: {
    color: dark.accent,
    fontWeight: '800',
    fontSize: 32,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  headerInfo: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    color: dark.text,
    marginBottom: 3,
  },
  price: {
    fontSize: 15,
    fontWeight: '700',
    color: dark.accent,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  tag: {
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: 10,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  tagText: {
    color: dark.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  verifiedTag: {
    borderColor: dark.accentDark,
  },
  verifiedTagText: {
    color: dark.accent,
  },
  reasonsBox: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.surfaceElevated,
    borderRadius: 10,
    padding: 10,
  },
  reasonsTitle: {
    color: dark.textFaint,
    fontSize: 10,
    fontWeight: '800',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  reasonLine: {
    color: dark.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  actionButton: {
    flex: 1,
  },
  bookButton: {
    backgroundColor: dark.accent,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  bookButtonText: {
    color: '#0a0a0a',
    fontWeight: '700',
    fontSize: 13,
  },
  messageButton: {
    borderWidth: 1,
    borderColor: dark.accent,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  messageButtonText: {
    color: dark.accent,
    fontWeight: '700',
    fontSize: 13,
  },
});
