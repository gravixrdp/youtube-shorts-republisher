import { getConfig } from '@/lib/supabase/database';

interface EnhancementResult {
  title: string;
  description: string;
  hashtags: string[];
}

interface GeminiGenerateResult {
  text: string;
  model: string;
}

function cleanJsonPayload(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }
  return raw.trim();
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function parseModelJson<T>(raw: string): T {
  const cleaned = cleanJsonPayload(raw);
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      const sliced = cleaned.slice(start, end + 1);
      return JSON.parse(sliced) as T;
    }
    throw new Error('Model response is not valid JSON');
  }
}

function normalizeHashtag(value: string): string {
  const cleaned = value
    .replace(/^#+/, '')
    .replace(/[^a-zA-Z0-9_]/g, '')
    .trim();
  if (!cleaned) {
    return '';
  }
  return `#${cleaned.toLowerCase()}`;
}

function sanitizeHashtags(values: string[], fallbackTags: string[] = []): string[] {
  const base = ['#shorts', '#ytshorts', '#viral', '#trending'];
  const merged = [...values, ...fallbackTags.map((tag) => `#${tag}`), ...base];
  const normalized = merged.map((tag) => normalizeHashtag(tag)).filter(Boolean);
  return Array.from(new Set(normalized)).slice(0, 12);
}

function fallbackEnhancement(originalTitle: string, originalDescription: string, tags: string[]): EnhancementResult {
  return {
    title: originalTitle,
    description: originalDescription,
    hashtags: sanitizeHashtags([], tags),
  };
}

function extractGeminiText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return '';
  }
  const root = payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const partText = root.candidates?.[0]?.content?.parts?.find((part) => typeof part.text === 'string')?.text;
  return partText?.trim() || '';
}

async function getGeminiRuntimeConfig(): Promise<{ apiKey: string; preferredModel: string }> {
  const [apiKeyFromConfig, modelFromConfig] = await Promise.all([
    getConfig('gemini_api_key'),
    getConfig('gemini_model'),
  ]);

  return {
    apiKey: (apiKeyFromConfig || process.env.GEMINI_API_KEY || '').trim(),
    preferredModel: (modelFromConfig || 'gemini-2.5-flash').trim() || 'gemini-2.5-flash',
  };
}

async function generateWithGemini(
  prompt: string,
  options?: {
    temperature?: number;
    maxOutputTokens?: number;
    responseMimeType?: string;
    responseSchema?: Record<string, unknown>;
  },
): Promise<GeminiGenerateResult> {
  const { apiKey, preferredModel } = await getGeminiRuntimeConfig();
  if (!apiKey) {
    throw new Error('Gemini API key is not configured');
  }

  const candidateModels = Array.from(new Set([preferredModel, 'gemini-2.5-flash', 'gemini-2.5-flash-lite']));
  let lastError = 'Gemini request failed';

  for (const model of candidateModels) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: options?.temperature ?? 0.9,
          maxOutputTokens: options?.maxOutputTokens ?? 500,
          responseMimeType: options?.responseMimeType ?? 'application/json',
          thinkingConfig: {
            thinkingBudget: 0,
          },
          ...(options?.responseSchema ? { responseSchema: options.responseSchema } : {}),
        },
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const text = extractGeminiText(payload);

    if (response.ok && text) {
      return { text, model };
    }

    if (payload && typeof payload === 'object') {
      const maybeError = payload.error as { message?: string } | undefined;
      lastError = maybeError?.message || `${response.status} ${response.statusText}` || lastError;
    }
  }

  throw new Error(lastError);
}

async function generateJsonWithRetry<T>(
  prompt: string,
  retryPrompt: string,
  options?: {
    temperature?: number;
    maxOutputTokens?: number;
    responseMimeType?: string;
    responseSchema?: Record<string, unknown>;
  },
): Promise<T> {
  const first = await generateWithGemini(prompt, options);
  try {
    return parseModelJson<T>(first.text);
  } catch {
    const second = await generateWithGemini(retryPrompt, {
      temperature: 0.5,
      maxOutputTokens: options?.maxOutputTokens ?? 500,
      responseMimeType: 'text/plain',
      responseSchema: options?.responseSchema,
    });
    return parseModelJson<T>(second.text);
  }
}

// AI-enhanced title and description generation
export async function enhanceContent(originalTitle: string, originalDescription: string, tags: string[] = []): Promise<EnhancementResult> {
  try {
    const enhancementSchema: Record<string, unknown> = {
      type: 'OBJECT',
      properties: {
        title: { type: 'STRING' },
        description: { type: 'STRING' },
        hashtags: {
          type: 'ARRAY',
          items: { type: 'STRING' },
        },
      },
      required: ['title', 'description', 'hashtags'],
    };

    const prompt = `You are a YouTube Shorts growth expert.

Goal: maximize click-through and retention while staying truthful.

Input:
- Original title: ${originalTitle}
- Original description: ${originalDescription}
- Keywords: ${tags.join(', ')}

Return strict JSON only:
{
  "title": "string",
  "description": "string",
  "hashtags": ["#tag1", "#tag2"]
}

Rules:
- title must be high-energy, under 60 chars, and curiosity-driven.
- description must be concise, under 220 chars, with a clear viewer hook.
- hashtags must be 8 to 12, relevant + discoverable.
- always include #shorts and #ytshorts.
- avoid fake claims, hate, sexual content, and policy-violating text.
`;

    const retryPrompt = `${prompt}

Return a compact single-line JSON object only. No markdown, no prose.`;

    const parsed = await generateJsonWithRetry<Partial<EnhancementResult>>(prompt, retryPrompt, {
      temperature: 0.95,
      maxOutputTokens: 450,
      responseMimeType: 'application/json',
      responseSchema: enhancementSchema,
    });
    const title = compactWhitespace(parsed.title || originalTitle).slice(0, 60);
    const description = compactWhitespace(parsed.description || originalDescription).slice(0, 220);
    const hashtags = sanitizeHashtags(Array.isArray(parsed.hashtags) ? parsed.hashtags : [], tags);

    return {
      title: title || originalTitle,
      description: description || originalDescription,
      hashtags,
    };
  } catch (error) {
    console.error('AI enhancement error:', error);
    return fallbackEnhancement(originalTitle, originalDescription, tags);
  }
}

// Generate hashtags from content
export async function generateHashtags(title: string, description: string, tags: string[] = []): Promise<string[]> {
  try {
    const hashtagSchema: Record<string, unknown> = {
      type: 'OBJECT',
      properties: {
        hashtags: {
          type: 'ARRAY',
          items: { type: 'STRING' },
        },
      },
      required: ['hashtags'],
    };

    const prompt = `Create viral-ready YouTube Shorts hashtags.

Title: ${title}
Description: ${description}
Keywords: ${tags.join(', ')}

Return strict JSON:
{
  "hashtags": ["#tag1", "#tag2"]
}

Rules:
- 10 to 12 hashtags
- include #shorts and #ytshorts
- keep only relevant and searchable tags
- no spaces inside hashtags`;

    const retryPrompt = `${prompt}

Return compact one-line JSON only.`;

    const parsed = await generateJsonWithRetry<{ hashtags?: string[] }>(prompt, retryPrompt, {
      temperature: 0.9,
      maxOutputTokens: 250,
      responseMimeType: 'application/json',
      responseSchema: hashtagSchema,
    });
    return sanitizeHashtags(Array.isArray(parsed.hashtags) ? parsed.hashtags : [], tags);
  } catch (error) {
    console.error('Hashtag generation error:', error);
    return sanitizeHashtags([], tags);
  }
}

// Rewrite title for better engagement
export async function rewriteTitle(originalTitle: string): Promise<string> {
  try {
    const titleSchema: Record<string, unknown> = {
      type: 'OBJECT',
      properties: {
        title: { type: 'STRING' },
      },
      required: ['title'],
    };

    const prompt = `Rewrite this YouTube Shorts title to improve CTR.

Original title: ${originalTitle}

Return strict JSON:
{
  "title": "string"
}

Rules:
- max 60 chars
- high curiosity + energy
- keep claim truthful
- can use light emoji if it helps`;

    const retryPrompt = `${prompt}

Return one-line JSON only.`;

    const parsed = await generateJsonWithRetry<{ title?: string }>(prompt, retryPrompt, {
      temperature: 0.95,
      maxOutputTokens: 120,
      responseMimeType: 'application/json',
      responseSchema: titleSchema,
    });
    const title = compactWhitespace(parsed.title || originalTitle);
    return title.length > 60 ? `${title.slice(0, 57)}...` : title;
  } catch (error) {
    console.error('Title rewrite error:', error);
    return originalTitle;
  }
}
