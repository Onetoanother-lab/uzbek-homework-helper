// src/lib/telegram/flows/pending-missing.server.ts
// Teacher commands: /pendingcount, /missing <homework_id>

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendMessage } from "@/lib/telegram/client.server";
import { uzSession3 as t } from "@/lib/i18n/uz.session3";
import { tpl, fmtDateTime } from "@/lib/i18n/uz";
import { reportError } from "@/lib/telegram/error-reporter.server";

// ─── /pendingcount ────────────────────────────────────────────────────────────
// Shows total unreviewed submissions broken down by group.

export async function handlePendingCount(chatId: number): Promise<void> {
  // Join submissions → groups, filter pending, group by group name
  const { data, error } = await supabaseAdmin
    .from("submissions")
    .select("group_id, groups(name)")
    .eq("status", "pending");

  if (error) {
    await reportError({ context: "pendingcount/query", error });
    return;
  }

  if (!data || data.length === 0) {
    await sendMessage({ chat_id: chatId, text: t.pendingCountEmpty });
    return;
  }

  // Tally per group
  const tally = new Map<string, { name: string; count: number }>();
  for (const row of data as any[]) {
    const gid = row.group_id as string;
    const name = row.groups?.name ?? "—";
    const entry = tally.get(gid) ?? { name, count: 0 };
    entry.count++;
    tally.set(gid, entry);
  }

  // Sort by group name
  const sorted = [...tally.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  const lines = sorted
    .map((g) => tpl(t.pendingCountLine, { group: g.name, count: g.count }))
    .join("\n");

  const total = sorted.reduce((s, g) => s + g.count, 0);

  await sendMessage({
    chat_id: chatId,
    text:
      t.pendingCountHeader +
      lines +
      tpl(t.pendingCountTotal, { total }),
  });
}

// ─── /missing <homework_id> ───────────────────────────────────────────────────
// Lists students who haven't submitted for a specific homework assignment.

export async function handleMissing(
  chatId: number,
  arg: string,
): Promise<void> {
  const hwId = parseInt(arg.trim(), 10);
  if (!Number.isFinite(hwId) || hwId <= 0) {
    await sendMessage({ chat_id: chatId, text: t.missingUsage });
    return;
  }

  // Fetch homework + group
  const { data: hw } = await supabaseAdmin
    .from("homeworks")
    .select("id, title, due_at, group_id, groups(name)")
    .eq("id", hwId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!hw) {
    await sendMessage({ chat_id: chatId, text: tpl(t.missingHwNotFound, { id: hwId }) });
    return;
  }

  const groupId = hw.group_id as string;
  const groupName = (hw as any).groups?.name ?? "—";

  // All students in this group
  const { data: students } = await supabaseAdmin
    .from("students")
    .select("id, full_name")
    .eq("group_id", groupId);

  if (!students || students.length === 0) {
    await sendMessage({
      chat_id: chatId,
      text: tpl(t.missingEmpty, { id: hwId }),
    });
    return;
  }

  // Students who DID submit (link via homework_id on submissions)
  // Submissions reference homework via group_id + created_after homework creation.
  // If you have a homework_id FK on submissions (recommended), use that.
  // Here we use the group + created_after approach as a safe fallback.
  const hwCreatedAt = (hw as any).created_at ?? new Date(0).toISOString();

  const { data: submitted } = await supabaseAdmin
    .from("submissions")
    .select("student_id")
    .eq("group_id", groupId)
    .gte("created_at", hwCreatedAt);

  const submittedIds = new Set(
    (submitted ?? []).map((s: any) => s.student_id as string),
  );

  const missing = (students as any[]).filter(
    (s) => !submittedIds.has(s.id as string),
  );

  if (missing.length === 0) {
    await sendMessage({
      chat_id: chatId,
      text: tpl(t.missingEmpty, { id: hwId }),
    });
    return;
  }

  const lines = missing
    .map((s) => tpl(t.missingLine, { name: s.full_name as string }))
    .join("\n");

  await sendMessage({
    chat_id: chatId,
    text:
      tpl(t.missingHeader, {
        id: hwId,
        title: hw.title as string,
        group: groupName,
      }) +
      lines +
      tpl(t.missingCount, { count: missing.length }),
  });
}

// ─── 48h missing submission cron job ─────────────────────────────────────────
// Called by POST /api/internal/missing-check (every 30 min).
// For each homework past its deadline by 48h, find students who never
// submitted and alert their parents (once). Also sends follow-up if
// a student submitted after the alert.

export async function checkMissingSubmissions(): Promise<void> {
  const now = new Date();

  // Window: homeworks whose due_at was between 48h and 49h ago
  // (30-min cron means we check a 30-min slice around the 48h mark)
  const windowStart = new Date(now.getTime() - 49 * 3600_000);
  const windowEnd   = new Date(now.getTime() - 48 * 3600_000);

  const { data: homeworks, error } = await supabaseAdmin
    .from("homeworks")
    .select("id, title, due_at, group_id, groups(name, parents_chat_id)")
    .is("deleted_at", null)
    .gte("due_at", windowStart.toISOString())
    .lte("due_at", windowEnd.toISOString());

  if (error) {
    await reportError({ context: "missing-check/query-hw", error });
    return;
  }

  if (!homeworks || homeworks.length === 0) return;

  for (const hw of homeworks as any[]) {
    const groupId    = hw.group_id as string;
    const groupName  = hw.groups?.name ?? "—";
    const parentsChatId = hw.groups?.parents_chat_id as number | null;

    // All students in the group
    const { data: students } = await supabaseAdmin
      .from("students")
      .select("id, full_name, tg_user_id")
      .eq("group_id", groupId);

    if (!students || students.length === 0) continue;

    // Students who submitted for this homework
    const { data: submitted } = await supabaseAdmin
      .from("submissions")
      .select("student_id")
      .eq("group_id", groupId)
      .gte("created_at", hw.created_at ?? new Date(0).toISOString());

    const submittedIds = new Set(
      (submitted ?? []).map((s: any) => s.student_id as string),
    );

    for (const student of students as any[]) {
      const studentId   = student.id as string;
      const studentName = student.full_name as string;
      const didSubmit   = submittedIds.has(studentId);

      // Check if we already sent an alert for this (hw, student) pair
      const { data: existing } = await supabaseAdmin
        .from("missing_submission_alerts")
        .select("id, followup_sent_at")
        .eq("homework_id", hw.id)
        .eq("student_id", studentId)
        .maybeSingle();

      if (!didSubmit && !existing) {
        // Never submitted, never alerted → send parent alert
        await sendMissingAlert({
          parentsChatId,
          studentName,
          groupName,
          hwTitle: hw.title,
          hwDue: hw.due_at,
        });

        // Record the alert
        await supabaseAdmin.from("missing_submission_alerts").insert({
          homework_id: hw.id,
          student_id: studentId,
        });
      }

      if (didSubmit && existing && !existing.followup_sent_at) {
        // Submitted after the alert was sent → send follow-up
        await sendMissingFollowup({
          parentsChatId,
          studentName,
          groupName,
          hwTitle: hw.title,
        });

        await supabaseAdmin
          .from("missing_submission_alerts")
          .update({ followup_sent_at: now.toISOString() })
          .eq("id", existing.id);
      }
    }
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function sendMissingAlert(opts: {
  parentsChatId: number | null;
  studentName: string;
  groupName: string;
  hwTitle: string;
  hwDue: string;
}): Promise<void> {
  if (!opts.parentsChatId) return;
  const { sendMessage: send } = await import("@/lib/telegram/client.server");
  try {
    await send({
      chat_id: opts.parentsChatId,
      text: tpl(t.missingParentAlert, {
        name:  opts.studentName,
        group: opts.groupName,
        title: opts.hwTitle,
        due:   fmtDateTime(opts.hwDue),
      }),
    });
  } catch (err) {
    await reportError({ context: "missing-check/send-alert", error: err });
  }
}

async function sendMissingFollowup(opts: {
  parentsChatId: number | null;
  studentName: string;
  groupName: string;
  hwTitle: string;
}): Promise<void> {
  if (!opts.parentsChatId) return;
  const { sendMessage: send } = await import("@/lib/telegram/client.server");
  try {
    await send({
      chat_id: opts.parentsChatId,
      text: tpl(t.missingParentFollowup, {
        name:  opts.studentName,
        group: opts.groupName,
        title: opts.hwTitle,
      }),
    });
  } catch (err) {
    await reportError({ context: "missing-check/send-followup", error: err });
  }
}