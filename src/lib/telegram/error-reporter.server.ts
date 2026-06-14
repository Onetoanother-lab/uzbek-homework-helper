// src/lib/telegram/error-reporter.server.ts
// Centralized error reporting.
// - Writes every error to the `error_log` DB table (ring-buffered to 500 rows).
// - Sends a Telegram alert to the admin error channel (ADMIN_ERROR_CHAT_ID env var).
// - Designed to never throw — failure to report must not crash the caller.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendMessage } from "@/lib/telegram/client.server";

const ADMIN_ERROR_CHAT_ID = process.env.ADMIN_ERROR_CHAT_ID
  ? Number(process.env.ADMIN_ERROR_CHAT_ID)
  : null;

// How long to wait between identical alerts (prevents flooding on repeated errors)
const DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const recentAlerts = new Map<string, number>(); // message → timestamp

export interface ReportOptions {
  /** Short label for where the error happened, e.g. "dispatch", "weekly-report" */
  context: string;
  error: unknown;
  /** The Telegram update_id being processed, if applicable */
  updateId?: number;
  /** Extra key→value pairs appended to the Telegram alert */
  meta?: Record<string, string | number>;
}

export async function reportError(opts: ReportOptions): Promise<void> {
  const err = opts.error;
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? (err.stack ?? null) : null;

  // 1. Persist to DB (best-effort)
  try {
    await supabaseAdmin.from("error_log").insert({
      context: opts.context,
      message,
      stack,
      update_id: opts.updateId ?? null,
    });
  } catch (dbErr) {
    console.error("[error-reporter] failed to write error_log:", dbErr);
  }

  // 2. Console log always
  console.error(`[${opts.context}]`, message, stack ?? "");

  // 3. Telegram alert (if configured and not recently sent)
  if (!ADMIN_ERROR_CHAT_ID) return;

  const dedupKey = `${opts.context}:${message}`;
  const lastSent = recentAlerts.get(dedupKey) ?? 0;
  if (Date.now() - lastSent < DEDUP_WINDOW_MS) return;
  recentAlerts.set(dedupKey, Date.now());

  // Prune old dedup entries
  for (const [k, ts] of recentAlerts) {
    if (Date.now() - ts > DEDUP_WINDOW_MS * 2) recentAlerts.delete(k);
  }

  const metaLines = opts.meta
    ? Object.entries(opts.meta)
        .map(([k, v]) => `  ${k}: ${v}`)
        .join("\n")
    : "";

  const alertText = [
    "🚨 Bot Error",
    `📍 Context: ${opts.context}`,
    opts.updateId != null ? `🔁 Update ID: ${opts.updateId}` : null,
    `💬 ${message}`,
    stack
      ? `\`\`\`\n${stack.slice(0, 800)}${stack.length > 800 ? "\n…(truncated)" : ""}\n\`\`\``
      : null,
    metaLines || null,
    `🕒 ${new Date().toISOString()}`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    await sendMessage({
      chat_id: ADMIN_ERROR_CHAT_ID,
      text: alertText,
      parse_mode: "MarkdownV2",
    });
  } catch (sendErr) {
    console.error("[error-reporter] failed to send Telegram alert:", sendErr);
  }
}

/**
 * Wrap an async handler so any unhandled rejection is reported and
 * a safe fallback response is returned instead of crashing.
 */
export function withErrorReporting<T>(
  context: string,
  fn: () => Promise<T>,
  fallback: T,
  updateId?: number,
): Promise<T> {
  return fn().catch(async (err) => {
    await reportError({ context, error: err, updateId });
    return fallback;
  });
}