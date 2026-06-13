// src/lib/telegram/rate-limit.server.ts
// Checks and records student submission attempts.
// Rule: max 3 submissions per 10-minute sliding window.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const WINDOW_MINUTES = 10;
const MAX_PER_WINDOW = 3;

export interface RateLimitResult {
  allowed: boolean;
  /** Minutes until the oldest submission in the window expires (only set when blocked) */
  retryInMinutes?: number;
}

/**
 * Check whether `tgUserId` is within the rate limit.
 * Does NOT record a new attempt — call `recordSubmission` separately on success.
 */
export async function checkRateLimit(tgUserId: number): Promise<RateLimitResult> {
  const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("submission_rate_limits")
    .select("submitted_at")
    .eq("tg_user_id", tgUserId)
    .gte("submitted_at", windowStart)
    .order("submitted_at", { ascending: true });

  if (error) {
    // On DB error, allow submission to avoid blocking legitimate users
    console.error("[rate-limit] check failed:", error);
    return { allowed: true };
  }

  if (!data || data.length < MAX_PER_WINDOW) {
    return { allowed: true };
  }

  // Window is full — calculate when the oldest entry expires
  const oldest = new Date(data[0].submitted_at as string);
  const expiresAt = new Date(oldest.getTime() + WINDOW_MINUTES * 60 * 1000);
  const retryInMs = Math.max(0, expiresAt.getTime() - Date.now());
  const retryInMinutes = Math.ceil(retryInMs / 60_000);

  return { allowed: false, retryInMinutes };
}

/**
 * Record a successful submission for rate-limit tracking.
 * Call this only after the submission row has been inserted.
 */
export async function recordSubmission(tgUserId: number): Promise<void> {
  const { error } = await supabaseAdmin
    .from("submission_rate_limits")
    .insert({ tg_user_id: tgUserId });

  if (error) {
    console.error("[rate-limit] record failed:", error);
  }
}

/**
 * Prune entries older than the window to keep the table small.
 * Safe to call periodically (e.g. once per dispatch cycle).
 */
export async function pruneOldEntries(): Promise<void> {
  const cutoff = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();
  await supabaseAdmin
    .from("submission_rate_limits")
    .delete()
    .lt("submitted_at", cutoff);
}