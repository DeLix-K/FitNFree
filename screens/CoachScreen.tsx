import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AiUsageIndicator from '../components/AiUsageIndicator';
import CoachMemoryModal from '../components/CoachMemoryModal';
import DailyBriefingCard from '../components/DailyBriefingCard';
import PostWorkoutInsightCard from '../components/PostWorkoutInsightCard';
import SessionRecalibrationModal from '../components/SessionRecalibrationModal';
import { useAiGate } from '../hooks/useAiGate';
import { saveHistoryEntry } from '../lib/aiHistory';
import {
  askClaudeChat,
  buildCoachSystemPrompt,
  COACH_PERSONALITIES,
  type ChatMessage,
  type CoachPersonality,
  type DailyBriefingData,
} from '../lib/claude';
import { fetchCoachMemory, regenerateCoachMemoryIfStale } from '../lib/coachMemory';
import {
  fetchCoachPersonality,
  fetchDailyBriefingData,
  fetchRecentCoachMessages,
  updateCoachPersonality,
} from '../lib/coachInsights';
import { getMyStats } from '../lib/streaks';
import { dark } from '../lib/theme';
import { supabase } from '../lib/supabase';
import { speak, stopSpeaking } from '../lib/voice';
import { useVoiceInput } from '../hooks/useVoiceInput';
import type { Tab } from '../components/AppShell';

const RECOMMENDATION_CARDS = [
  { icon: '🏋️', label: "Today's Workout", prompt: "What should I do for today's workout?" },
  { icon: '🍎', label: "Today's Nutrition", prompt: 'What should I eat today?' },
  { icon: '💤', label: 'Recovery', prompt: 'How should I recover today?' },
  { icon: '✅', label: 'Suggested Habit', prompt: 'Suggest one habit I should build starting today.' },
] as const;

const QUICK_PROMPTS = [
  'Build me a workout',
  'What should I eat?',
  'Analyse my progress',
  'Why am I feeling tired?',
  'Adjust my plan',
] as const;

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function CoachScreen({ onNavigate }: { onNavigate?: (tab: Tab) => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plans, setPlans] = useState<{ name: string; exerciseNames: string[] }[]>([]);
  const [displayName, setDisplayName] = useState('there');
  const [personality, setPersonality] = useState<CoachPersonality>('encouraging');
  const [dailyData, setDailyData] = useState<DailyBriefingData | null>(null);
  const [coachMemory, setCoachMemory] = useState<string | null>(null);
  const [memoryModalOpen, setMemoryModalOpen] = useState(false);
  // The Coach Dashboard (Daily Briefing, quick prompts, etc.) is always the
  // landing view -- even for a returning user whose past messages just got
  // reloaded via session continuity below. Chat only takes over once the
  // user explicitly steps into it (sending a message, or tapping "Back to
  // Chat" to resume a loaded thread), and "← Coach Dashboard" steps back
  // out without losing that thread.
  const [dashboardOpen, setDashboardOpen] = useState(true);
  const [recalibrateOpen, setRecalibrateOpen] = useState(false);
  const [voiceRepliesOn, setVoiceRepliesOn] = useState(false);
  const aiGate = useAiGate();
  const scrollRef = useRef<ScrollView>(null);
  const memoryCheckedRef = useRef(false);

  useEffect(() => {
    supabase
      .from('workout_plans')
      .select('name, workout_plan_exercises(exercises(name))')
      .then(({ data }) => {
        const loadedPlans = (data ?? []).map((plan) => {
          const rows = (plan.workout_plan_exercises ?? []) as unknown as {
            exercises: { name: string } | { name: string }[] | null;
          }[];
          const exerciseNames = rows.flatMap((wpe) => {
            const ex = wpe.exercises;
            if (!ex) return [];
            return Array.isArray(ex) ? ex.map((e) => e.name) : [ex.name];
          });
          return { name: plan.name as string, exerciseNames };
        });
        setPlans(loadedPlans);
      });

    getMyStats()
      .then((s) => setDisplayName(s.displayName))
      .catch(() => {});

    fetchCoachPersonality()
      .then(setPersonality)
      .catch(() => {});

    // Same real sleep/mood/streak/plan data the Daily Briefing card uses --
    // grounds the live chat in it too instead of the two features seeing
    // different slices of the same user. Non-critical: the chat still works
    // without it, just without that context.
    fetchDailyBriefingData()
      .then(setDailyData)
      .catch(() => {});

    // Cross-session memory: the durable summary (shapes future advice) and
    // the recent-transcript tail (continues the visible thread instead of
    // resetting to blank). Both non-critical -- the chat works with neither.
    fetchCoachMemory()
      .then((r) => setCoachMemory(r.memory))
      .catch(() => {});
    fetchRecentCoachMessages()
      .then((msgs) => {
        if (msgs.length > 0) setMessages(msgs);
      })
      .catch(() => {});
  }, []);

  // Background memory upkeep: at most once per mount, and only once the AI
  // gate is loaded and the user actually has quota left -- regeneration is
  // a real Claude call, so it shouldn't spend a free user's daily budget
  // silently if they're already out.
  useEffect(() => {
    if (!aiGate.loaded || !aiGate.canUse || memoryCheckedRef.current) return;
    memoryCheckedRef.current = true;
    regenerateCoachMemoryIfStale()
      .then((mem) => setCoachMemory(mem))
      .catch(() => {});
  }, [aiGate.loaded, aiGate.canUse]);

  const handlePersonalityChange = async (p: CoachPersonality) => {
    setPersonality(p);
    try {
      await updateCoachPersonality(p);
    } catch {
      // Non-critical preference — keep the local selection even if the save fails.
    }
  };

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    if (!aiGate.canUse) {
      setError("You've used today's free AI actions. Upgrade to Premium for unlimited access.");
      return;
    }

    setError(null);
    setInput('');
    setDashboardOpen(false);
    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(nextMessages);
    setSending(true);

    try {
      const reply = await askClaudeChat(
        nextMessages,
        buildCoachSystemPrompt(plans, personality, dailyData, coachMemory)
      );
      setMessages([...nextMessages, { role: 'assistant', content: reply }]);
      saveHistoryEntry('coach_chat', reply, trimmed);
      aiGate.refresh();
      if (voiceRepliesOn) speak(reply);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setMessages(messages);
    } finally {
      setSending(false);
    }
  };

  const showDashboard = dashboardOpen;

  const voice = useVoiceInput((transcript) => send(transcript));

  useEffect(() => {
    if (voice.error) setError(voice.error);
  }, [voice.error]);

  useEffect(() => {
    return () => stopSpeaking();
  }, []);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.greeting}>{greeting()}, {displayName} 👋</Text>
            <Text style={styles.title}>Ready to make progress?</Text>
          </View>
          <AiUsageIndicator
            isPremium={aiGate.isPremium}
            remaining={aiGate.remaining}
            loaded={aiGate.loaded}
          />
        </View>

        <View style={styles.personalityRow}>
          {COACH_PERSONALITIES.map((p) => (
            <Pressable
              key={p.value}
              style={[styles.personalityChip, personality === p.value && styles.personalityChipActive]}
              onPress={() => handlePersonalityChange(p.value)}
            >
              <Text
                style={[
                  styles.personalityChipText,
                  personality === p.value && styles.personalityChipTextActive,
                ]}
              >
                {p.label}
              </Text>
            </Pressable>
          ))}

          <Pressable
            style={[styles.personalityChip, voiceRepliesOn && styles.personalityChipActive]}
            onPress={() => {
              if (voiceRepliesOn) stopSpeaking();
              setVoiceRepliesOn((v) => !v);
            }}
          >
            <Text
              style={[styles.personalityChipText, voiceRepliesOn && styles.personalityChipTextActive]}
            >
              {voiceRepliesOn ? '🔊 Speaks Replies' : '🔈 Speak Replies'}
            </Text>
          </Pressable>

          <Pressable style={styles.personalityChip} onPress={() => setMemoryModalOpen(true)}>
            <Text style={styles.personalityChipText}>🧠 Memory</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.messagesScroll}
        contentContainerStyle={styles.messagesContent}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {showDashboard && aiGate.loaded && (
          <View style={styles.emptyState}>
            {messages.length > 0 && (
              <Pressable style={styles.backToChat} onPress={() => setDashboardOpen(false)}>
                <Text style={styles.backToChatText}>← Back to Chat</Text>
              </Pressable>
            )}

            <DailyBriefingCard isPremium={!!aiGate.isPremium} personality={personality} />
            <PostWorkoutInsightCard isPremium={!!aiGate.isPremium} personality={personality} />

            <View style={styles.actionRow}>
              <Pressable style={styles.actionCard} onPress={() => setRecalibrateOpen(true)}>
                <Text style={styles.actionCardIcon}>🎚️</Text>
                <Text style={styles.actionCardLabel}>Recalibrate Session</Text>
              </Pressable>
              <Pressable style={styles.actionCard} onPress={() => onNavigate?.('formCheck')}>
                <Text style={styles.actionCardIcon}>📸</Text>
                <Text style={styles.actionCardLabel}>Form Check</Text>
              </Pressable>
            </View>

            <View style={styles.cardGrid}>
              {RECOMMENDATION_CARDS.map((card) => (
                <Pressable key={card.label} style={styles.card} onPress={() => send(card.prompt)}>
                  <Text style={styles.cardIcon}>{card.icon}</Text>
                  <Text style={styles.cardLabel}>{card.label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.quickPromptsLabel}>Quick questions</Text>
            <View style={styles.quickPromptsRow}>
              {QUICK_PROMPTS.map((prompt) => (
                <Pressable key={prompt} style={styles.quickPromptChip} onPress={() => send(prompt)}>
                  <Text style={styles.quickPromptText}>{prompt}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {!showDashboard && (
          <>
            <Pressable style={styles.dashboardLink} onPress={() => setDashboardOpen(true)}>
              <Text style={styles.dashboardLinkText}>← Coach Dashboard</Text>
            </Pressable>

            {messages.map((message, index) => (
              <View
                key={index}
                style={[
                  styles.bubble,
                  message.role === 'user' ? styles.bubbleUser : styles.bubbleCoach,
                ]}
              >
                <Text style={message.role === 'user' ? styles.bubbleUserText : styles.bubbleCoachText}>
                  {message.content}
                </Text>
              </View>
            ))}
          </>
        )}

        {sending && (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={dark.accent} />
            <Text style={styles.loadingText}>Coach is thinking...</Text>
          </View>
        )}

        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>

      <View style={styles.inputRow}>
        <Pressable
          style={[styles.micButton, voice.listening && styles.micButtonActive]}
          onPress={() => (voice.listening ? voice.stopListening() : voice.startListening())}
          disabled={sending}
        >
          <Text style={styles.micButtonText}>{voice.listening ? '⏹️' : '🎙️'}</Text>
        </Pressable>
        <TextInput
          style={styles.input}
          placeholder={voice.listening ? 'Listening...' : 'Ask your coach...'}
          placeholderTextColor={dark.textFaint}
          value={voice.listening ? voice.interimText : input}
          onChangeText={setInput}
          onSubmitEditing={() => send(input)}
          returnKeyType="send"
          editable={!voice.listening}
        />
        <Pressable
          style={[styles.sendButton, (!input.trim() || sending) && styles.sendButtonDisabled]}
          onPress={() => send(input)}
          disabled={!input.trim() || sending}
        >
          <Text style={styles.sendButtonText}>Send</Text>
        </Pressable>
      </View>

      <SessionRecalibrationModal
        visible={recalibrateOpen}
        onClose={() => setRecalibrateOpen(false)}
        personality={personality}
        canUse={aiGate.canUse}
        onUsed={aiGate.refresh}
      />

      <CoachMemoryModal
        visible={memoryModalOpen}
        onClose={() => setMemoryModalOpen(false)}
        memory={coachMemory}
        onCleared={() => setCoachMemory(null)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: dark.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  headerTop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    rowGap: 8,
  },
  greeting: {
    color: dark.text,
    fontSize: 20,
    fontWeight: '700',
  },
  title: {
    color: dark.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  personalityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  personalityChip: {
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: 14,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  personalityChipActive: {
    backgroundColor: dark.accent,
    borderColor: dark.accent,
  },
  personalityChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: dark.textMuted,
  },
  personalityChipTextActive: {
    color: '#0a0a0a',
  },
  messagesScroll: {
    flex: 1,
  },
  messagesContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
  },
  emptyState: {
    paddingBottom: 8,
  },
  backToChat: {
    marginBottom: 14,
  },
  backToChatText: {
    color: dark.accent,
    fontSize: 13,
    fontWeight: '600',
  },
  dashboardLink: {
    marginBottom: 14,
  },
  dashboardLinkText: {
    color: dark.accent,
    fontSize: 13,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  actionCard: {
    flex: 1,
    backgroundColor: dark.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: dark.border,
    alignItems: 'center',
  },
  actionCardIcon: {
    fontSize: 22,
    marginBottom: 6,
  },
  actionCardLabel: {
    color: dark.text,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  cardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  card: {
    width: '48%',
    backgroundColor: dark.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: dark.border,
  },
  cardIcon: {
    fontSize: 22,
    marginBottom: 8,
  },
  cardLabel: {
    color: dark.text,
    fontSize: 13,
    fontWeight: '700',
  },
  quickPromptsLabel: {
    color: dark.textFaint,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  quickPromptsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  quickPromptChip: {
    borderWidth: 1,
    borderColor: dark.accentDark,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  quickPromptText: {
    color: dark.accent,
    fontSize: 13,
    fontWeight: '600',
  },
  bubble: {
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 10,
    maxWidth: '85%',
  },
  bubbleUser: {
    backgroundColor: dark.accent,
    alignSelf: 'flex-end',
  },
  bubbleCoach: {
    backgroundColor: dark.surface,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: dark.border,
  },
  bubbleUserText: {
    color: '#0a0a0a',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  bubbleCoachText: {
    color: dark.text,
    fontSize: 14,
    lineHeight: 20,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  loadingText: {
    fontSize: 13,
    color: dark.textMuted,
  },
  error: {
    color: dark.danger,
    marginBottom: 10,
    fontSize: 13,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: dark.border,
    gap: 10,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.surface,
    color: dark.text,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
  },
  sendButton: {
    backgroundColor: dark.accent,
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    color: '#0a0a0a',
    fontWeight: '700',
    fontSize: 13,
  },
  micButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micButtonActive: {
    backgroundColor: dark.danger,
    borderColor: dark.danger,
  },
  micButtonText: {
    fontSize: 16,
  },
});
