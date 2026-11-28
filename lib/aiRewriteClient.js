export const AI_ERROR_MESSAGES = {
  ai_not_configured: "Add GEMINI_API_KEY in Vercel environment variables, then redeploy.",
  ai_key_invalid: "Gemini rejected the API key — check GEMINI_API_KEY.",
  ai_rate_limited: "Gemini free limit reached — wait a minute and try again.",
  ai_timeout: "Gemini took too long — try again.",
  ai_empty: "Gemini returned nothing — try again.",
  ai_failed: "Gemini request failed — try again.",
  no_description: "Enter a title or description first.",
  run_migration_018: "Run supabase/migration_018 in the Supabase SQL editor first.",
};

export function formatAiError(code, detail) {
  const base = AI_ERROR_MESSAGES[code] || code || "AI request failed.";
  return detail ? `${base} — ${detail}` : base;
}

/**
 * Shared client helper to generate an on-demand AI description draft without long client polling loops.
 */
export async function requestAiDraft({ id, title, description }) {
  try {
    const res = await fetch("/api/admin/ai-descriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "generate", id, title, description }),
    });
    const data = await res.json();
    if (!data.success) {
      return {
        ok: false,
        error: data.error,
        message: formatAiError(data.error, data.detail),
      };
    }
    return { ok: true, draft: data.draft };
  } catch {
    return {
      ok: false,
      error: "network_error",
      message: "Network error reaching AI endpoint.",
    };
  }
}

