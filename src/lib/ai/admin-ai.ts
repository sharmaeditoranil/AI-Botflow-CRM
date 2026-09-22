import { supabaseAdmin } from '@/lib/automations/admin-client';

export interface AdminAiCredentials {
  openaiApiKey: string;
  geminiApiKey: string;
  model: string;
}

/**
 * Loads platform Master AI credentials set by Super Admin in platform_settings,
 * falling back to server environment variables (OPENAI_API_KEY, GEMINI_API_KEY).
 */
export async function getAdminAiCredentials(): Promise<AdminAiCredentials> {
  const adminDb = supabaseAdmin();
  let openaiApiKey = process.env.OPENAI_API_KEY || '';
  let geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '';
  let model = 'gpt-4o-mini';

  try {
    const { data } = await adminDb
      .from('platform_settings')
      .select('admin_openai_api_key, admin_gemini_api_key, admin_ai_model')
      .eq('id', 'default')
      .maybeSingle();

    if (data?.admin_openai_api_key) openaiApiKey = data.admin_openai_api_key.trim();
    if (data?.admin_gemini_api_key) geminiApiKey = data.admin_gemini_api_key.trim();
    if (data?.admin_ai_model) model = data.admin_ai_model.trim();
  } catch (err) {
    console.warn('[admin-ai] Failed to load platform_settings AI credentials, using env:', err);
  }

  return { openaiApiKey, geminiApiKey, model };
}

/**
 * Generate text using the Platform Master Admin AI API (OpenAI or Gemini).
 * Used for CRM Follow-up, Lead Qualification, Drafts, and Review Generator.
 * Individual tenants do NOT need to provide an API key for these features.
 */
export async function generateWithAdminAi(
  prompt: string,
  options?: { systemPrompt?: string; maxTokens?: number }
): Promise<string> {
  const { openaiApiKey, geminiApiKey, model } = await getAdminAiCredentials();

  // 1. Try OpenAI if API key is present
  if (openaiApiKey) {
    try {
      const isLegacy =
        model.startsWith('gpt-3.5') ||
        model === 'gpt-4' ||
        model.startsWith('gpt-4-0') ||
        model.startsWith('gpt-4-turbo');
      const reqBody: Record<string, unknown> = {
        model: model || 'gpt-4o-mini',
        messages: [
          ...(options?.systemPrompt ? [{ role: 'system', content: options.systemPrompt }] : []),
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
      };
      if (isLegacy) {
        reqBody.max_tokens = options?.maxTokens || 300;
      } else {
        reqBody.max_completion_tokens = options?.maxTokens || 300;
      }

      let res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiApiKey}`,
        },
        body: JSON.stringify(reqBody),
      });

      if (!res.ok && res.status === 400) {
        const errJson = (await res.clone().json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        const msg = errJson?.error?.message || '';
        if (msg.includes('max_tokens') || msg.includes('max_completion_tokens')) {
          if (isLegacy) {
            delete reqBody.max_tokens;
            reqBody.max_completion_tokens = options?.maxTokens || 300;
          } else {
            delete reqBody.max_completion_tokens;
            reqBody.max_tokens = options?.maxTokens || 300;
          }
          res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${openaiApiKey}`,
            },
            body: JSON.stringify(reqBody),
          });
        }
      }

      if (res.ok) {
        const json = await res.json();
        const text = json.choices?.[0]?.message?.content?.trim();
        if (text) return text;
      } else {
        const errBody = await res.text();
        console.warn('[admin-ai] OpenAI API non-200 response:', res.status, errBody);
      }
    } catch (err) {
      console.warn('[admin-ai] OpenAI request exception, attempting Gemini fallback:', err);
    }
  }

  // 2. Try Gemini if API key is present
  if (geminiApiKey) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${geminiApiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                ...(options?.systemPrompt ? [{ text: `System Instruction: ${options.systemPrompt}\n\n` }] : []),
                { text: prompt },
              ],
            },
          ],
          generationConfig: {
            maxOutputTokens: options?.maxTokens || 300,
            temperature: 0.7,
          },
        }),
      });

      if (res.ok) {
        const json = await res.json();
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (text) return text;
      } else {
        const errBody = await res.text();
        console.warn('[admin-ai] Gemini API non-200 response:', res.status, errBody);
      }
    } catch (err) {
      console.warn('[admin-ai] Gemini request exception:', err);
    }
  }

  throw new Error(
    'No valid platform AI API key found. Please configure OpenAI or Gemini key in Super Admin Settings or server environment.'
  );
}
