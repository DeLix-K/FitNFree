// Supabase Edge Function: proxies prompts to the Anthropic API.
// The ANTHROPIC_API_KEY is set as a Supabase secret and never reaches the app.
// Deploy this via the Supabase dashboard: Edge Functions > Create a new function.
//
// Also enforces the freemium daily AI limit server-side (not just in the app UI),
// so calling this function directly (e.g. with curl) can't bypass it.

import { createClient } from 'npm:@supabase/supabase-js@2';

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function buildCorsHeaders(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': isAllowedOrigin(origin) ? origin! : 'null',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    Vary: 'Origin',
  };
}

const FREE_DAILY_AI_LIMIT = 5;
const MAX_TEXT_LENGTH = 8000;
const MAX_MESSAGES = 40;
const MAX_IMAGE_BASE64_LENGTH = 8_000_000; // ~6MB decoded, comfortably under Anthropic's per-image limit

// AI cost controls. The AI Coach chat and anything personalized/sensitive
// (mood reflection, daily briefing, bedtime stories, ...) always use the
// full model below and are never cached -- callers only get the cheaper
// path by explicitly marking a one-shot call `routine: true` (see
// lib/claude.ts), for genuinely routine, mostly-impersonal lookups:
// nutrition search, per-exercise cues/guardrails, and equipment/food/menu
// photo identification. Those repeat often enough across users (or cost
// enough per call, for images) that this meaningfully cuts spend without a
// user-visible quality drop for that kind of task.
const DEFAULT_MODEL = 'claude-sonnet-5';
const ROUTINE_MODEL = 'claude-haiku-4-5-20251001';

async function hashCacheKey(parts: string[]): Promise<string> {
  const bytes = new TextEncoder().encode(parts.join('\u0000'));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req.headers.get('Origin'));
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { prompt, image, messages, system, routine } = await req.json();

    const hasPrompt = typeof prompt === 'string' && prompt.length > 0;
    const hasMessages = Array.isArray(messages) && messages.length > 0;

    if (!hasPrompt && !hasMessages) {
      return new Response(
        JSON.stringify({ error: 'Provide either a "prompt" string or a non-empty "messages" array.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (hasPrompt && prompt.length > MAX_TEXT_LENGTH) {
      return new Response(
        JSON.stringify({ error: `"prompt" must be ${MAX_TEXT_LENGTH} characters or fewer.` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (hasMessages) {
      if (messages.length > MAX_MESSAGES) {
        return new Response(
          JSON.stringify({ error: `"messages" must contain ${MAX_MESSAGES} entries or fewer.` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const valid = messages.every(
        (m: unknown) =>
          typeof m === 'object' &&
          m !== null &&
          ((m as { role?: unknown }).role === 'user' || (m as { role?: unknown }).role === 'assistant') &&
          typeof (m as { content?: unknown }).content === 'string' &&
          (m as { content: string }).content.length <= MAX_TEXT_LENGTH
      );
      if (!valid) {
        return new Response(
          JSON.stringify({
            error: `"messages" must be an array of { role: "user" | "assistant", content: string }, each content up to ${MAX_TEXT_LENGTH} characters.`,
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    if (system !== undefined && (typeof system !== 'string' || system.length > MAX_TEXT_LENGTH)) {
      return new Response(
        JSON.stringify({ error: `Optional "system" must be a string of ${MAX_TEXT_LENGTH} characters or fewer.` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (image !== undefined) {
      if (
        typeof image !== 'object' ||
        image === null ||
        typeof image.data !== 'string' ||
        typeof image.mediaType !== 'string' ||
        image.data.length > MAX_IMAGE_BASE64_LENGTH
      ) {
        return new Response(
          JSON.stringify({ error: 'Optional "image" must be { data: base64 string, mediaType: string } and within the size limit.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Client scoped to the caller's own JWT, so profiles/ai_history reads are
    // subject to the same RLS policies as the app itself — this function can
    // only ever see the calling user's own data.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired session.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_premium')
      .eq('id', user.id)
      .single();

    const isPremium = profile?.is_premium ?? false;

    if (!isPremium) {
      const startOfToday = new Date();
      startOfToday.setUTCHours(0, 0, 0, 0);

      const { count } = await supabase
        .from('ai_history')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', startOfToday.toISOString());

      if ((count ?? 0) >= FREE_DAILY_AI_LIMIT) {
        return new Response(
          JSON.stringify({
            error: `Daily free AI limit (${FREE_DAILY_AI_LIMIT}) reached. Upgrade to Premium for unlimited access.`,
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Conversational calls (askClaudeChat -- the AI Coach) never pass
    // `routine`, so this is always false for them regardless of what a
    // caller sent; `routine` only ever changes behavior for one-shot calls.
    const isRoutine = routine === true && !hasMessages;
    const model = isRoutine ? ROUTINE_MODEL : DEFAULT_MODEL;

    let cacheKey: string | null = null;
    if (isRoutine) {
      cacheKey = await hashCacheKey([
        model,
        prompt ?? '',
        system ?? '',
        image ? `${image.mediaType}:${image.data}` : '',
      ]);

      const { data: cached } = await supabase
        .from('ai_response_cache')
        .select('reply')
        .eq('prompt_hash', cacheKey)
        .maybeSingle();

      if (cached?.reply) {
        return new Response(JSON.stringify({ reply: cached.reply }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicKey) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY is not configured.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const anthropicMessages = hasMessages
      ? messages
      : [
          {
            role: 'user',
            content: image
              ? [
                  {
                    type: 'image',
                    source: { type: 'base64', media_type: image.mediaType, data: image.data },
                  },
                  { type: 'text', text: prompt },
                ]
              : prompt,
          },
        ];

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        thinking: { type: 'disabled' },
        ...(system ? { system } : {}),
        messages: anthropicMessages,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('Anthropic API error', response.status, errorBody);
      return new Response(JSON.stringify({ error: 'The AI service is temporarily unavailable. Please try again.' }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const textBlock = data.content?.find((block: { type: string }) => block.type === 'text');
    const reply = textBlock?.text ?? '';

    if (isRoutine && cacheKey && reply) {
      // Never let a cache-write problem fail a response the user already
      // has a good reply for; on conflict (a concurrent identical request
      // won the race) there's nothing to do either.
      const { error: cacheError } = await supabase
        .from('ai_response_cache')
        .insert({ prompt_hash: cacheKey, reply, model })
        .select()
        .maybeSingle();
      if (cacheError && cacheError.code !== '23505') {
        console.error('ai_response_cache insert failed', cacheError.message);
      }
    }

    return new Response(JSON.stringify({ reply }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: 'Something went wrong. Please try again.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
