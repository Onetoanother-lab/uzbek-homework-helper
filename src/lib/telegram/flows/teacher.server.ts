// src/lib/telegram/flows/teacher.server.ts
// Handles teacher-side interactions: grading, feedback, /resend, /history, /editreview.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  answerCallbackQuery,
  editMessageCaption,
  sendMessage,
  sendPhoto,
  sendDocument,
} from "@/lib/telegram/client.server";
import { uz, tpl, GRADES, fmtDate, fmtDateTime } from "@/lib/i18n/uz";

// ─── Inline grade button callback ────────────────────────────────────────────

export async function handleGradeCallback(opts: {
  callback_query_id: string;
  chat_id: number;
  message_id: number;
  from_user_id: number;
  from_name: string;
  submission_id: number;
  grade: string;
}): Promise<void> {
  // Verify this is a registered teachers chat
  const { data: tc } = await supabaseAdmin
    .from("teachers_chats")
    .select("chat_id")
    .eq("chat_id", opts.chat_id)
    .maybeSingle();

  if (!tc) {
    await answerCallbackQuery({
      callback_query_id: opts.callback_query_id,
      text: uz.teacherNotAuthorized,
      show_alert: true,
    });
    return;
  }

  if (!(GRADES as readonly string[]).includes(opts.grade)) {
    await answerCallbackQuery({ callback_query_id: opts.callback_query_id });
    return;
  }

  const { data: sub } = await supabaseAdmin
    .from("submissions")
    .select("id, status, teacher_message_id")
    .eq("id", opts.submission_id)
    .maybeSingle();

  if (!sub) {
    await answerCallbackQuery({
      callback_query_id: opts.callback_query_id,
      text: "Topilmadi",
      show_alert: true,
    });
    return;
  }

  if (sub.status === "reviewed") {
    await answerCallbackQuery({
      callback_query_id: opts.callback_query_id,
      text: uz.teacherAlreadyReviewed,
      show_alert: true,
    });
    return;
  }

  // Stash grade; ask for feedback via reply
  await supabaseAdmin
    .from("submissions")
    .update({
      pending_grade: opts.grade,
      reviewer_tg_id: opts.from_user_id,
    })
    .eq("id", opts.submission_id);

  await answerCallbackQuery({
    callback_query_id: opts.callback_query_id,
    text: opts.grade,
  });

  await sendMessage({
    chat_id: opts.chat_id,
    text: tpl(uz.teacherAskFeedback, { grade: opts.grade }),
    reply_to_message_id: opts.message_id,
  });
}

// ─── Teacher reply with feedback text ───────────────────────────────────────

export async function handleTeacherFeedbackReply(opts: {
  chat_id: number;
  reply_to_message_id: number;
  from_user_id: number;
  from_name: string;
  text: string;
}): Promise<boolean> {
  // Find submission by the message being replied to
  const { data: sub } = await supabaseAdmin
    .from("submissions")
    .select(
      "id, student_id, group_id, status, pending_grade, teacher_chat_id, teacher_message_id",
    )
    .eq("teacher_chat_id", opts.chat_id)
    .eq("teacher_message_id", opts.reply_to_message_id)
    .maybeSingle();

  if (!sub) return false;

  if (sub.status === "reviewed") {
    await sendMessage({ chat_id: opts.chat_id, text: uz.teacherAlreadyReviewed });
    return true;
  }

  const grade = (sub.pending_grade as string | null) ?? null;
  if (!grade) {
    await sendMessage({ chat_id: opts.chat_id, text: uz.teacherChooseGrade });
    return true;
  }

  const reviewedAt = new Date();
  await supabaseAdmin
    .from("submissions")
    .update({
      status: "reviewed",
      final_grade: grade,
      final_feedback: opts.text,
      reviewer_tg_id: opts.from_user_id,
      reviewed_at: reviewedAt.toISOString(),
    })
    .eq("id", sub.id as number);

  await finalizeReview({
    submissionId: sub.id as number,
    studentId: sub.student_id as string,
    groupId: sub.group_id as string,
    teacherChatId: opts.chat_id,
    teacherMessageId: opts.reply_to_message_id,
    grade,
    feedback: opts.text,
    reviewerName: opts.from_name,
    reviewedAt,
    edited: false,
  });

  return true;
}

// ─── /resend <id> ────────────────────────────────────────────────────────────

export async function handleResend(
  chatId: number,
  arg: string,
): Promise<void> {
  const id = parseInt(arg.trim(), 10);
  if (!Number.isFinite(id) || id <= 0) {
    await sendMessage({ chat_id: chatId, text: uz.resendUsage });
    return;
  }

  const { data: sub } = await supabaseAdmin
    .from("submissions")
    .select(
      "id, file_id, file_type, status, final_grade, student_id, group_id",
    )
    .eq("id", id)
    .maybeSingle();

  if (!sub) {
    await sendMessage({ chat_id: chatId, text: tpl(uz.resendNotFound, { id }) });
    return;
  }

  // Fetch student and group for caption
  const { data: student } = await supabaseAdmin
    .from("students")
    .select("full_name")
    .eq("id", sub.student_id as string)
    .maybeSingle();

  const { data: group } = await supabaseAdmin
    .from("groups")
    .select("name")
    .eq("id", sub.group_id as string)
    .maybeSingle();

  const studentName = (student?.full_name as string) ?? "—";
  const groupName = (group?.name as string) ?? "—";
  const status = sub.status === "reviewed" ? uz.statusReviewed : uz.statusPending;
  const grade = (sub.final_grade as string | null) ?? "—";

  const caption = tpl(uz.resendCaption, {
    id,
    name: studentName,
    group: groupName,
    status,
    grade,
  });

  try {
    if (sub.file_type === "photo") {
      await sendPhoto({
        chat_id: chatId,
        photo: sub.file_id as string,
        caption,
      });
    } else {
      await sendDocument({
        chat_id: chatId,
        document: sub.file_id as string,
        caption,
      });
    }
  } catch (err: any) {
    // Telegram returns 400 "Bad Request: wrong file_id" when file is gone
    if (err?.message?.includes("wrong file_id") || err?.message?.includes("file is not found")) {
      await sendMessage({ chat_id: chatId, text: tpl(uz.resendNoFile, { id }) });
    } else {
      console.error("[teacher] resend failed:", err);
      await sendMessage({ chat_id: chatId, text: uz.errorGeneric });
    }
  }
}

// ─── /history [filter] ───────────────────────────────────────────────────────

const HISTORY_PAGE = 10;

export async function handleHistory(
  chatId: number,
  arg: string,
): Promise<void> {
  if (!arg.trim()) {
    await sendMessage({ chat_id: chatId, text: uz.historyUsage });
    return;
  }

  const filter = arg.trim().toLowerCase();

  // Determine filter type
  let query = supabaseAdmin
    .from("submissions")
    .select(
      "id, status, final_grade, created_at, student_id, group_id, students(full_name), groups(name)",
    )
    .order("created_at", { ascending: false })
    .limit(HISTORY_PAGE + 1);

  if (filter === "pending") {
    query = query.eq("status", "pending");
  } else if (filter === "reviewed") {
    query = query.eq("status", "reviewed");
  } else {
    // Try group name match first, then student name
    // We do both via a follow-up join resolution below
    // Use a broad fetch and filter in-memory for the name search
    query = query.limit(200); // fetch more for name filtering
  }

  const { data: rows, error } = await query;

  if (error || !rows || rows.length === 0) {
    await sendMessage({ chat_id: chatId, text: uz.historyEmpty });
    return;
  }

  // For name/group filters: do in-memory filtering since Supabase can't
  // easily do nested ilike without an RPC.
  let filtered = rows as any[];

  if (filter !== "pending" && filter !== "reviewed") {
    filtered = rows.filter((r: any) => {
      const groupName = (r.groups?.name ?? "").toLowerCase();
      const studentName = (r.students?.full_name ?? "").toLowerCase();
      return groupName.includes(filter) || studentName.includes(filter);
    });
  }

  if (filtered.length === 0) {
    await sendMessage({ chat_id: chatId, text: uz.historyEmpty });
    return;
  }

  const hasMore = filtered.length > HISTORY_PAGE;
  const page = filtered.slice(0, HISTORY_PAGE);
  const totalFound = filtered.length;

  const lines = page.map((r: any) => {
    const gradePart = r.final_grade ? ` • ⭐ ${r.final_grade}` : "";
    return tpl(uz.historyLine, {
      id: r.id,
      name: r.students?.full_name ?? "—",
      group: r.groups?.name ?? "—",
      status: r.status === "reviewed" ? uz.statusReviewed : uz.statusPending,
      gradePart,
      date: fmtDate(r.created_at),
    });
  });

  let text = tpl(uz.historyHeader, { count: totalFound }) + "\n\n" + lines.join("\n\n");
  if (hasMore) {
    text += "\n" + tpl(uz.historyMore, { n: totalFound - HISTORY_PAGE });
  }

  await sendMessage({ chat_id: chatId, text });
}

// ─── /editreview <id> <grade> | <feedback> ───────────────────────────────────

export async function handleEditReview(
  chatId: number,
  fromUserId: number,
  fromName: string,
  arg: string,
): Promise<void> {
  // Parse: /editreview 42 Yaxshi | Yaxshilanishi kerak
  const match = arg.match(/^(\d+)\s+(.+?)\s*\|\s*(.+)$/);
  if (!match) {
    await sendMessage({ chat_id: chatId, text: uz.editReviewUsage });
    return;
  }

  const id = parseInt(match[1], 10);
  const newGrade = match[2].trim();
  const newFeedback = match[3].trim();

  if (!Number.isFinite(id) || id <= 0) {
    await sendMessage({ chat_id: chatId, text: uz.editReviewUsage });
    return;
  }

  if (!(GRADES as readonly string[]).includes(newGrade)) {
    await sendMessage({ chat_id: chatId, text: uz.editReviewInvalidGrade });
    return;
  }

  const { data: sub } = await supabaseAdmin
    .from("submissions")
    .select(
      "id, status, final_grade, final_feedback, student_id, group_id, teacher_chat_id, teacher_message_id",
    )
    .eq("id", id)
    .maybeSingle();

  if (!sub) {
    await sendMessage({ chat_id: chatId, text: tpl(uz.editReviewNotFound, { id }) });
    return;
  }

  if (sub.status !== "reviewed") {
    await sendMessage({ chat_id: chatId, text: tpl(uz.editReviewNotReviewed, { id }) });
    return;
  }

  // Record the edit in audit log
  await supabaseAdmin.from("review_edits").insert({
    submission_id: id,
    editor_tg_id: fromUserId,
    old_grade: sub.final_grade,
    new_grade: newGrade,
    old_feedback: sub.final_feedback,
    new_feedback: newFeedback,
  });

  const editedAt = new Date();

  // Update submission
  await supabaseAdmin
    .from("submissions")
    .update({
      final_grade: newGrade,
      final_feedback: newFeedback,
      reviewed_at: editedAt.toISOString(),
      reviewer_tg_id: fromUserId,
    })
    .eq("id", id);

  await sendMessage({
    chat_id: chatId,
    text: tpl(uz.editReviewSaved, { id }),
  });

  // Propagate edit notifications
  await finalizeReview({
    submissionId: id,
    studentId: sub.student_id as string,
    groupId: sub.group_id as string,
    teacherChatId: sub.teacher_chat_id as number | null,
    teacherMessageId: sub.teacher_message_id as number | null,
    grade: newGrade,
    feedback: newFeedback,
    reviewerName: fromName,
    reviewedAt: editedAt,
    edited: true,
  });
}

// ─── Shared review finalisation ──────────────────────────────────────────────

async function finalizeReview(opts: {
  submissionId: number;
  studentId: string;
  groupId: string;
  teacherChatId: number | null;
  teacherMessageId: number | null;
  grade: string;
  feedback: string;
  reviewerName: string;
  reviewedAt: Date;
  edited: boolean;
}): Promise<void> {
  const { data: student } = await supabaseAdmin
    .from("students")
    .select("full_name, tg_user_id")
    .eq("id", opts.studentId)
    .maybeSingle();

  const { data: group } = await supabaseAdmin
    .from("groups")
    .select("name, parents_chat_id")
    .eq("id", opts.groupId)
    .maybeSingle();

  const studentName = (student?.full_name as string) ?? "—";
  const groupName = (group?.name as string) ?? "—";
  const parentsChatId = group?.parents_chat_id as number | null | undefined;

  // 1) Edit the original teacher card to remove buttons and show result
  if (opts.teacherChatId && opts.teacherMessageId) {
    try {
      const cardTemplate = opts.edited ? uz.teacherReviewEdited : uz.teacherReviewed;
      await editMessageCaption({
        chat_id: opts.teacherChatId,
        message_id: opts.teacherMessageId,
        caption: tpl(cardTemplate, {
          id: opts.submissionId,
          name: studentName,
          group: groupName,
          grade: opts.grade,
          reviewer: opts.reviewerName,
          time: fmtDateTime(opts.reviewedAt),
          feedback: opts.feedback,
        }),
        reply_markup: { inline_keyboard: [] }, // removes all buttons
      });
    } catch (err) {
      console.error("[teacher] edit card failed:", err);
    }
  }

  // 2) Confirm to teacher chat
  if (opts.teacherChatId && !opts.edited) {
    // feedbackSaved sent inline in handleTeacherFeedbackReply to avoid
    // duplication on edit path; only send on first review.
    try {
      await sendMessage({ chat_id: opts.teacherChatId, text: uz.feedbackSaved });
    } catch (_) {}
  }

  // 3) Notify student
  if (student?.tg_user_id) {
    const studentMsg = opts.edited
      ? tpl(uz.studentEditNotify, {
          id: opts.submissionId,
          grade: opts.grade,
          feedback: opts.feedback,
        })
      : tpl(uz.studentResult, {
          id: opts.submissionId,
          grade: opts.grade,
          feedback: opts.feedback,
        });

    try {
      await sendMessage({
        chat_id: student.tg_user_id as number,
        text: studentMsg,
      });
    } catch (err) {
      console.error("[teacher] notify student failed:", err);
    }
  }

  // 4) Notify parents
  if (parentsChatId) {
    const parentsMsg = opts.edited
      ? tpl(uz.parentsEditResult, {
          id: opts.submissionId,
          name: studentName,
          group: groupName,
          grade: opts.grade,
          feedback: opts.feedback,
        })
      : tpl(uz.parentsResult, {
          id: opts.submissionId,
          name: studentName,
          group: groupName,
          grade: opts.grade,
          feedback: opts.feedback,
        });

    try {
      await sendMessage({ chat_id: parentsChatId, text: parentsMsg });
    } catch (err) {
      console.error("[teacher] notify parents failed:", err);
    }
  }
}