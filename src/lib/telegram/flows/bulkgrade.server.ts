// src/lib/telegram/flows/bulkgrade.server.ts
// /bulkgrade <group>  — sequential one-by-one grading session for teachers.
//
// Flow:
//   1. Teacher sends /bulkgrade 5A
//   2. Bot fetches first pending submission, sends the file + grade buttons
//   3. Teacher taps a grade button → bot sends "write your feedback (reply)"
//   4. Teacher replies with feedback → bot saves review, auto-sends next submission
//   5. Teacher can /skipsubmission to skip current, /stopbulk to end session
//
// State is persisted in `bulkgrade_sessions` table so it survives restarts.
// Sessions expire after 30 minutes of inactivity.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  sendMessage,
  sendPhoto,
  sendDocument,
  editMessageCaption,
  answerCallbackQuery,
} from "@/lib/telegram/client.server";
import { uzSession3 as t } from "@/lib/i18n/uz.session3";
import { uz, tpl, GRADES, fmtDate, fmtDateTime } from "@/lib/i18n/uz";
import { reportError } from "@/lib/telegram/error-reporter.server";

// In-memory map: teacher_tg_id → message_id of the current submission card
// (needed to edit it after grading; not worth storing in DB)
const cardMessageIds = new Map<number, number>();

// In-memory: teacher_tg_id → pending grade awaiting feedback text
const pendingGrades = new Map<number, string>();

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

// ─── /bulkgrade <group> ───────────────────────────────────────────────────────

export async function handleBulkGrade(
  chatId: number,
  teacherTgId: number,
  arg: string,
): Promise<void> {
  const groupName = arg.trim();
  if (!groupName) {
    await sendMessage({ chat_id: chatId, text: t.bulkgradeUsage });
    return;
  }

  // Check for existing active session
  const { data: existing } = await supabaseAdmin
    .from("bulkgrade_sessions")
    .select("group_id, graded_count, groups(name)")
    .eq("teacher_tg_id", teacherTgId)
    .maybeSingle();

  if (existing) {
    const sessionGroupName = (existing as any).groups?.name ?? "—";
    // Check if session has timed out
    const { data: fullSession } = await supabaseAdmin
      .from("bulkgrade_sessions")
      .select("last_activity_at")
      .eq("teacher_tg_id", teacherTgId)
      .maybeSingle();

    const lastActivity = new Date(
      (fullSession?.last_activity_at as string) ?? 0,
    ).getTime();

    if (Date.now() - lastActivity > SESSION_TIMEOUT_MS) {
      // Expired — clean it up and start fresh
      await clearSession(teacherTgId);
    } else {
      await sendMessage({
        chat_id: chatId,
        text: tpl(t.bulkgradeAlreadyActive, { group: sessionGroupName }),
      });
      return;
    }
  }

  // Resolve group
  const { data: group } = await supabaseAdmin
    .from("groups")
    .select("id, name")
    .ilike("name", groupName)
    .maybeSingle();

  if (!group) {
    await sendMessage({
      chat_id: chatId,
      text: tpl(t.bulkgradeGroupNotFound, { group: groupName }),
    });
    return;
  }

  // Count pending submissions for this group
  const { count } = await supabaseAdmin
    .from("submissions")
    .select("id", { count: "exact", head: true })
    .eq("group_id", group.id)
    .eq("status", "pending");

  if (!count || count === 0) {
    await sendMessage({
      chat_id: chatId,
      text: tpl(t.bulkgradeNoPending, { group: group.name as string }),
    });
    return;
  }

  // Create session
  await supabaseAdmin.from("bulkgrade_sessions").upsert({
    teacher_tg_id: teacherTgId,
    group_id: group.id,
    current_sub_id: null,
    graded_count: 0,
    skipped_count: 0,
    started_at: new Date().toISOString(),
    last_activity_at: new Date().toISOString(),
  });

  await sendMessage({
    chat_id: chatId,
    text: tpl(t.bulkgradeStart, {
      group: group.name as string,
      count,
    }),
  });

  await sendNextSubmission(chatId, teacherTgId, group.id as string);
}

// ─── Grade button callback (from bulkgrade session) ──────────────────────────

export async function handleBulkGradeCallback(opts: {
  callback_query_id: string;
  chat_id: number;
  message_id: number;
  teacher_tg_id: number;
  grade: string;
}): Promise<boolean> {
  const session = await getSession(opts.teacher_tg_id);
  if (!session) return false;

  // Confirm the callback is for the current submission in this session
  if (session.current_sub_id === null) return false;

  if (!(GRADES as readonly string[]).includes(opts.grade)) return false;

  // Save grade temporarily, ask for feedback
  pendingGrades.set(opts.teacher_tg_id, opts.grade);
  await touchSession(opts.teacher_tg_id);

  await answerCallbackQuery({
    callback_query_id: opts.callback_query_id,
    text: opts.grade,
  });

  await sendMessage({
    chat_id: opts.chat_id,
    text: tpl(t.bulkgradeAskFeedback, { grade: opts.grade }),
    reply_to_message_id: opts.message_id,
  });

  return true;
}

// ─── Feedback text reply (during bulkgrade session) ──────────────────────────

export async function handleBulkGradeFeedback(
  chatId: number,
  teacherTgId: number,
  fromName: string,
  text: string,
): Promise<boolean> {
  const grade = pendingGrades.get(teacherTgId);
  if (!grade) return false;

  const session = await getSession(teacherTgId);
  if (!session || session.current_sub_id === null) return false;

  const subId = session.current_sub_id;
  const reviewedAt = new Date();

  // Save review
  await supabaseAdmin
    .from("submissions")
    .update({
      status: "reviewed",
      final_grade: grade,
      final_feedback: text,
      reviewer_tg_id: teacherTgId,
      reviewed_at: reviewedAt.toISOString(),
    })
    .eq("id", subId);

  pendingGrades.delete(teacherTgId);

  // Edit the submission card to remove buttons + show result
  const cardMsgId = cardMessageIds.get(teacherTgId);
  if (cardMsgId) {
    await editCardToReviewed({
      chatId,
      messageId: cardMsgId,
      subId,
      grade,
      feedback: text,
      reviewerName: fromName,
      reviewedAt,
    });
    cardMessageIds.delete(teacherTgId);
  }

  // Notify student + parents
  await notifyReview({ subId, grade, feedback: text });

  // Update session counters
  await supabaseAdmin
    .from("bulkgrade_sessions")
    .update({
      graded_count: session.graded_count + 1,
      current_sub_id: null,
      last_activity_at: new Date().toISOString(),
    })
    .eq("teacher_tg_id", teacherTgId);

  await sendMessage({ chat_id: chatId, text: t.bulkgradeGraded });

  // Auto-advance to next submission
  await sendNextSubmission(chatId, teacherTgId, session.group_id);
  return true;
}

// ─── /skipsubmission ─────────────────────────────────────────────────────────

export async function handleSkipSubmission(
  chatId: number,
  teacherTgId: number,
): Promise<void> {
  const session = await getSession(teacherTgId);
  if (!session) {
    await sendMessage({ chat_id: chatId, text: t.bulkgradeNoSession });
    return;
  }

  pendingGrades.delete(teacherTgId);
  cardMessageIds.delete(teacherTgId);

  await supabaseAdmin
    .from("bulkgrade_sessions")
    .update({
      skipped_count: session.skipped_count + 1,
      current_sub_id: null,
      last_activity_at: new Date().toISOString(),
    })
    .eq("teacher_tg_id", teacherTgId);

  await sendMessage({ chat_id: chatId, text: t.bulkgradeSkipped });
  await sendNextSubmission(chatId, teacherTgId, session.group_id);
}

// ─── /stopbulk ───────────────────────────────────────────────────────────────

export async function handleStopBulk(
  chatId: number,
  teacherTgId: number,
): Promise<void> {
  const session = await getSession(teacherTgId);
  if (!session) {
    await sendMessage({ chat_id: chatId, text: t.bulkgradeNoSession });
    return;
  }

  const { data: group } = await supabaseAdmin
    .from("groups")
    .select("name")
    .eq("id", session.group_id)
    .maybeSingle();

  pendingGrades.delete(teacherTgId);
  cardMessageIds.delete(teacherTgId);
  await clearSession(teacherTgId);

  await sendMessage({
    chat_id: chatId,
    text: tpl(t.bulkgradeStopped, {
      graded: session.graded_count,
      skipped: session.skipped_count,
      group: (group?.name as string) ?? "—",
    }),
  });
}

// ─── Check if message is a bulkgrade feedback reply ──────────────────────────
// Called by router BEFORE the regular teacher feedback handler.

export async function isBulkGradeActive(teacherTgId: number): Promise<boolean> {
  const grade = pendingGrades.get(teacherTgId);
  return !!grade;
}

// ─── Session helpers ──────────────────────────────────────────────────────────

interface Session {
  group_id: string;
  current_sub_id: number | null;
  graded_count: number;
  skipped_count: number;
}

async function getSession(teacherTgId: number): Promise<Session | null> {
  const { data } = await supabaseAdmin
    .from("bulkgrade_sessions")
    .select("group_id, current_sub_id, graded_count, skipped_count, last_activity_at")
    .eq("teacher_tg_id", teacherTgId)
    .maybeSingle();

  if (!data) return null;

  // Auto-expire
  const lastActivity = new Date(data.last_activity_at as string).getTime();
  if (Date.now() - lastActivity > SESSION_TIMEOUT_MS) {
    await clearSession(teacherTgId);
    return null;
  }

  return {
    group_id: data.group_id as string,
    current_sub_id: data.current_sub_id as number | null,
    graded_count: data.graded_count as number,
    skipped_count: data.skipped_count as number,
  };
}

async function clearSession(teacherTgId: number): Promise<void> {
  await supabaseAdmin
    .from("bulkgrade_sessions")
    .delete()
    .eq("teacher_tg_id", teacherTgId);
}

async function touchSession(teacherTgId: number): Promise<void> {
  await supabaseAdmin
    .from("bulkgrade_sessions")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("teacher_tg_id", teacherTgId);
}

// ─── Core: send next pending submission ──────────────────────────────────────

async function sendNextSubmission(
  chatId: number,
  teacherTgId: number,
  groupId: string,
): Promise<void> {
  // Fetch the oldest pending submission not currently assigned to another
  // bulkgrade session (use current_sub_id to detect in-progress ones)
  const { data: inProgress } = await supabaseAdmin
    .from("bulkgrade_sessions")
    .select("current_sub_id")
    .not("current_sub_id", "is", null);

  const lockedIds = (inProgress ?? [])
    .map((r: any) => r.current_sub_id as number)
    .filter(Boolean);

  let query = supabaseAdmin
    .from("submissions")
    .select(
      "id, file_id, file_type, created_at, ai_draft_grade, ai_draft_feedback, student_id, students(full_name)",
    )
    .eq("group_id", groupId)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1);

  if (lockedIds.length > 0) {
    query = query.not("id", "in", `(${lockedIds.join(",")})`);
  }

  const { data: subs } = await query;

  if (!subs || subs.length === 0) {
    // No more pending — end session
    const session = await getSession(teacherTgId);
    const { data: group } = await supabaseAdmin
      .from("groups")
      .select("name")
      .eq("id", groupId)
      .maybeSingle();

    await clearSession(teacherTgId);
    await sendMessage({
      chat_id: chatId,
      text: tpl(t.bulkgradeDone, {
        graded: session?.graded_count ?? 0,
        skipped: session?.skipped_count ?? 0,
        group: (group?.name as string) ?? "—",
      }),
    });
    return;
  }

  const sub = subs[0] as any;

  // How many pending remain (for progress indicator)
  const { count: remaining } = await supabaseAdmin
    .from("submissions")
    .select("id", { count: "exact", head: true })
    .eq("group_id", groupId)
    .eq("status", "pending");

  // Update session with current submission
  await supabaseAdmin
    .from("bulkgrade_sessions")
    .update({
      current_sub_id: sub.id,
      last_activity_at: new Date().toISOString(),
    })
    .eq("teacher_tg_id", teacherTgId);

  // Fetch total count for progress display
  const session = await getSession(teacherTgId);
  const graded = session?.graded_count ?? 0;
  const skipped = session?.skipped_count ?? 0;
  const current = graded + skipped + 1;
  const total = current + ((remaining ?? 1) - 1);

  const { data: group } = await supabaseAdmin
    .from("groups")
    .select("name")
    .eq("id", groupId)
    .maybeSingle();

  const caption = tpl(t.bulkgradeCard, {
    current,
    total,
    group: (group?.name as string) ?? "—",
    name: sub.students?.full_name ?? "—",
    date: fmtDate(sub.created_at),
    aiGrade: (sub.ai_draft_grade as string | null) ?? "—",
    aiFeedback: (sub.ai_draft_feedback as string | null) ?? uz.aiUnavailable,
  });

  const keyboard = {
    inline_keyboard: chunk(
      GRADES.map((g) => ({
        text: g,
        callback_data: `bulkgrade:${sub.id}:${g}`,
      })),
      2,
    ),
  };

  try {
    let sent: { message_id: number };
    if (sub.file_type === "photo") {
      sent = await sendPhoto({
        chat_id: chatId,
        photo: sub.file_id,
        caption,
        reply_markup: keyboard,
      });
    } else {
      sent = await sendDocument({
        chat_id: chatId,
        document: sub.file_id,
        caption,
        reply_markup: keyboard,
      });
    }
    cardMessageIds.set(teacherTgId, sent.message_id);
  } catch (err) {
    await reportError({ context: "bulkgrade/send-card", error: err });
    // File might be gone — skip this one automatically
    await supabaseAdmin
      .from("bulkgrade_sessions")
      .update({
        skipped_count: (session?.skipped_count ?? 0) + 1,
        current_sub_id: null,
      })
      .eq("teacher_tg_id", teacherTgId);
    await sendMessage({
      chat_id: chatId,
      text: "⚠️ Fayl topilmadi, o'tkazib yuborildi.",
    });
    await sendNextSubmission(chatId, teacherTgId, groupId);
  }
}

// ─── Edit card after review ───────────────────────────────────────────────────

async function editCardToReviewed(opts: {
  chatId: number;
  messageId: number;
  subId: number;
  grade: string;
  feedback: string;
  reviewerName: string;
  reviewedAt: Date;
}): Promise<void> {
  try {
    await editMessageCaption({
      chat_id: opts.chatId,
      message_id: opts.messageId,
      caption: tpl(uz.teacherReviewed, {
        id: opts.subId,
        name: "—", // already shown in original card
        group: "—",
        grade: opts.grade,
        reviewer: opts.reviewerName,
        time: fmtDateTime(opts.reviewedAt),
        feedback: opts.feedback,
      }),
      reply_markup: { inline_keyboard: [] },
    });
  } catch (err) {
    // Non-critical — card edit failure doesn't block grading
    await reportError({ context: "bulkgrade/edit-card", error: err });
  }
}

// ─── Notify student + parents after review ────────────────────────────────────

async function notifyReview(opts: {
  subId: number;
  grade: string;
  feedback: string;
}): Promise<void> {
  const { data: sub } = await supabaseAdmin
    .from("submissions")
    .select("student_id, group_id, students(tg_user_id, full_name), groups(name, parents_chat_id)")
    .eq("id", opts.subId)
    .maybeSingle();

  if (!sub) return;

  const studentTgId = (sub as any).students?.tg_user_id as number | null;
  const studentName = (sub as any).students?.full_name as string ?? "—";
  const groupName   = (sub as any).groups?.name as string ?? "—";
  const parentsChatId = (sub as any).groups?.parents_chat_id as number | null;

  if (studentTgId) {
    try {
      await sendMessage({
        chat_id: studentTgId,
        text: tpl(uz.studentResult, {
          id: opts.subId,
          grade: opts.grade,
          feedback: opts.feedback,
        }),
      });
    } catch (err) {
      await reportError({ context: "bulkgrade/notify-student", error: err });
    }
  }

  if (parentsChatId) {
    try {
      await sendMessage({
        chat_id: parentsChatId,
        text: tpl(uz.parentsResult, {
          id: opts.subId,
          name: studentName,
          group: groupName,
          grade: opts.grade,
          feedback: opts.feedback,
        }),
      });
    } catch (err) {
      await reportError({ context: "bulkgrade/notify-parents", error: err });
    }
  }
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}