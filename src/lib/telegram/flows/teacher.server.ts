import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  answerCallbackQuery,
  editMessageCaption,
  sendMessage,
} from "@/lib/telegram/client.server";
import { uz, tpl, GRADES } from "@/lib/i18n/uz";

export async function handleGradeCallback(opts: {
  callback_query_id: string;
  chat_id: number;
  message_id: number;
  from_user_id: number;
  from_name: string;
  submission_id: number;
  grade: string;
}) {
  // Verify chat is registered teachers chat.
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

  // Stash the chosen grade; ask teacher for feedback as a reply.
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

export async function handleTeacherFeedbackReply(opts: {
  chat_id: number;
  reply_to_message_id: number;
  from_user_id: number;
  from_name: string;
  text: string;
}): Promise<boolean> {
  // Find submission whose teacher_message_id matches the reply target.
  const { data: sub } = await supabaseAdmin
    .from("submissions")
    .select("id, student_id, group_id, status, pending_grade, teacher_chat_id, teacher_message_id, ai_draft_grade, ai_draft_feedback")
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

  // Edit original card to strip buttons + append review summary.
  try {
    // Re-fetch student/group for the caption.
    const { data: student } = await supabaseAdmin
      .from("students")
      .select("full_name, tg_user_id, group_id")
      .eq("id", sub.student_id as string)
      .maybeSingle();
    const { data: group } = await supabaseAdmin
      .from("groups")
      .select("name, parents_chat_id")
      .eq("id", sub.group_id as string)
      .maybeSingle();
    const studentName = (student?.full_name as string) ?? "—";
    const groupName = (group?.name as string) ?? "—";

    await editMessageCaption({
      chat_id: opts.chat_id,
      message_id: opts.reply_to_message_id,
      caption: tpl(uz.teacherReviewed, {
        id: sub.id as number,
        name: studentName,
        group: groupName,
        grade,
        reviewer: opts.from_name,
        time: reviewedAt.toLocaleString("uz-UZ"),
        feedback: opts.text,
      }),
      reply_markup: { inline_keyboard: [] },
    });

    // Notify student.
    if (student?.tg_user_id) {
      try {
        await sendMessage({
          chat_id: student.tg_user_id as number,
          text: tpl(uz.studentResult, {
            id: sub.id as number,
            grade,
            feedback: opts.text,
          }),
        });
      } catch (err) {
        console.error("[teacher] notify student failed:", err);
      }
    }

    // Notify parents group.
    if (group?.parents_chat_id) {
      try {
        await sendMessage({
          chat_id: group.parents_chat_id as number,
          text: tpl(uz.parentsResult, {
            id: sub.id as number,
            name: studentName,
            group: groupName,
            grade,
            feedback: opts.text,
          }),
        });
      } catch (err) {
        console.error("[teacher] notify parents failed:", err);
      }
    }

    await sendMessage({ chat_id: opts.chat_id, text: uz.feedbackSaved });
  } catch (err) {
    console.error("[teacher] finalize failed:", err);
  }
  return true;
}
