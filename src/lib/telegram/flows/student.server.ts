// src/lib/telegram/flows/student.server.ts
// Handles all private-chat student interactions.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  sendMessage,
  sendPhoto,
  sendDocument,
  type InlineKeyboardMarkup,
} from "@/lib/telegram/client.server";
import { getFileBytes } from "@/lib/telegram/client.server";
import { draftReview } from "@/lib/ai/review.server";
import { uz, tpl, GRADES, fmtDate, fmtDateTime } from "@/lib/i18n/uz";
import { uzFeature } from "@/lib/i18n/uz.feature";
import { checkRateLimit, recordSubmission } from "@/lib/telegram/rate-limit.server";

// ─── Conversation state ─────────────────────────────────────────────────────

type Step = "ask_name" | "ask_group" | "ask_homework" | "ask_file" | "resubmit_file" | "idle";

interface State {
  step: Step;
  draft: {
    name?: string;
    group_id?: string;
    group_name?: string;
    /** Homework the next submission is for (null = unattached). */
    homework_id?: number | null;
    /** For resubmit flow: the submission ID being replaced */
    resubmit_id?: number;
  };
}

async function loadState(tgUserId: number): Promise<State | null> {
  const { data } = await supabaseAdmin
    .from("conversation_state")
    .select("step, draft")
    .eq("tg_user_id", tgUserId)
    .maybeSingle();
  return data ? { step: data.step as Step, draft: (data.draft as any) ?? {} } : null;
}

async function saveState(tgUserId: number, state: State): Promise<void> {
  await supabaseAdmin.from("conversation_state").upsert({
    tg_user_id: tgUserId,
    step: state.step,
    draft: state.draft,
    updated_at: new Date().toISOString(),
  });
}

async function clearState(tgUserId: number): Promise<void> {
  await supabaseAdmin.from("conversation_state").delete().eq("tg_user_id", tgUserId);
}

// ─── /start ─────────────────────────────────────────────────────────────────

export async function handleStart(chatId: number, tgUserId: number): Promise<void> {
  await saveState(tgUserId, { step: "ask_name", draft: {} });
  await sendMessage({ chat_id: chatId, text: uz.start });
}

// ─── /help ──────────────────────────────────────────────────────────────────

export async function handleHelp(chatId: number): Promise<void> {
  await sendMessage({ chat_id: chatId, text: uz.help });
}

// ─── /mystatus (improved) ───────────────────────────────────────────────────

const MY_STATUS_PAGE_SIZE = 5;

export async function handleMyStatus(chatId: number, tgUserId: number): Promise<void> {
  const { data: student } = await supabaseAdmin
    .from("students")
    .select("id")
    .eq("tg_user_id", tgUserId)
    .maybeSingle();

  if (!student) {
    await sendMessage({ chat_id: chatId, text: uz.myStatusEmpty });
    return;
  }

  const { data: subs } = await supabaseAdmin
    .from("submissions")
    .select("id, created_at, status, final_grade, final_feedback")
    .eq("student_id", student.id)
    .order("created_at", { ascending: false })
    .limit(MY_STATUS_PAGE_SIZE + 1); // fetch one extra to know if there are more

  if (!subs || subs.length === 0) {
    await sendMessage({ chat_id: chatId, text: uz.myStatusEmpty });
    return;
  }

  const hasMore = subs.length > MY_STATUS_PAGE_SIZE;
  const page = subs.slice(0, MY_STATUS_PAGE_SIZE);
  const totalCount = await getStudentSubmissionCount(student.id as string);

  const lines = page.map((s) => {
    const gradePart = s.final_grade ? `\n    ⭐ ${s.final_grade}` : "";
    const raw = typeof s.final_feedback === "string" ? s.final_feedback.trim() : "";
    const feedbackPart = raw
      ? `\n    💬 ${raw.length > 60 ? raw.slice(0, 57) + "…" : raw}`
      : "";
    return tpl(uz.myStatusLine, {
      id: s.id as number,
      date: fmtDate(s.created_at as string),
      status: s.status === "reviewed" ? uz.statusReviewed : uz.statusPending,
      gradePart,
      feedbackPart,
    });
  });

  let text = `${uz.myStatusHeader}\n\n${lines.join("\n\n")}`;
  if (hasMore) {
    text += "\n" + tpl(uz.myStatusMore, { n: totalCount - MY_STATUS_PAGE_SIZE });
  }

  await sendMessage({ chat_id: chatId, text });
}

async function getStudentSubmissionCount(studentId: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from("submissions")
    .select("id", { count: "exact", head: true })
    .eq("student_id", studentId);
  return count ?? 0;
}

// ─── /resubmit <id> ─────────────────────────────────────────────────────────

export async function handleResubmitCommand(
  chatId: number,
  tgUserId: number,
  arg: string,
): Promise<void> {
  const id = parseInt(arg.trim(), 10);
  if (!Number.isFinite(id) || id <= 0) {
    await sendMessage({ chat_id: chatId, text: uz.resubmitUsage });
    return;
  }

  // Verify the submission exists and belongs to this user
  const { data: student } = await supabaseAdmin
    .from("students")
    .select("id")
    .eq("tg_user_id", tgUserId)
    .maybeSingle();

  if (!student) {
    await sendMessage({ chat_id: chatId, text: tpl(uz.resubmitNotFound, { id }) });
    return;
  }

  const { data: sub } = await supabaseAdmin
    .from("submissions")
    .select("id, status")
    .eq("id", id)
    .eq("student_id", student.id)
    .maybeSingle();

  if (!sub) {
    await sendMessage({ chat_id: chatId, text: tpl(uz.resubmitNotFound, { id }) });
    return;
  }

  if (sub.status === "reviewed") {
    await sendMessage({ chat_id: chatId, text: tpl(uz.resubmitAlreadyDone, { id }) });
    return;
  }

  // Enter resubmit_file step
  await saveState(tgUserId, { step: "resubmit_file", draft: { resubmit_id: id } });
  await sendMessage({ chat_id: chatId, text: tpl(uz.resubmitAskFile, { id }) });
}

// ─── Incoming file handler (new submission OR resubmit) ──────────────────────

export async function handleSubmissionFile(
  chatId: number,
  tgUserId: number,
  file: { file_id: string; file_type: "photo" | "document" },
  caption: string | undefined,
): Promise<void> {
  const state = await loadState(tgUserId);
  if (!state) {
    await sendMessage({ chat_id: chatId, text: uz.unknownCmd });
    return;
  }

  if (state.step === "resubmit_file") {
    await processResubmit(chatId, tgUserId, file, caption, state);
    return;
  }

  if (state.step !== "ask_file") {
    await sendMessage({ chat_id: chatId, text: uz.unknownCmd });
    return;
  }

  // ── Rate limiting ──
  const rl = await checkRateLimit(tgUserId);
  if (!rl.allowed) {
    await sendMessage({
      chat_id: chatId,
      text: tpl(uz.rateLimitExceeded, { minutes: rl.retryInMinutes ?? 10 }),
    });
    return;
  }

  const { data: student } = await supabaseAdmin
    .from("students")
    .select("id, full_name, group_id")
    .eq("tg_user_id", tgUserId)
    .maybeSingle();

  if (!student) {
    await sendMessage({ chat_id: chatId, text: uz.errorGeneric });
    return;
  }

  const homeworkId = state.draft.homework_id ?? null;

  const { data: sub, error } = await supabaseAdmin
    .from("submissions")
    .insert({
      student_id: student.id,
      group_id: student.group_id,
      homework_id: homeworkId,
      file_id: file.file_id,
      file_type: file.file_type,
      caption: caption ?? null,
      status: "pending",
    } as any)
    .select("id")
    .single();

  if (error || !sub) {
    console.error("[student] insert failed:", error);
    await sendMessage({ chat_id: chatId, text: uz.errorGeneric });
    return;
  }

  const subId = sub.id as number;
  await clearState(tgUserId);
  await recordSubmission(tgUserId);

  await sendMessage({ chat_id: chatId, text: tpl(uz.saved, { id: subId }) });

  await fanout({
    submissionId: subId,
    studentName: student.full_name as string,
    groupId: student.group_id as string,
    groupName: state.draft.group_name ?? "",
    homeworkId,
    file,
    caption,
    isResubmit: false,
  });
}

// ─── Resubmit processing ─────────────────────────────────────────────────────

async function processResubmit(
  chatId: number,
  tgUserId: number,
  file: { file_id: string; file_type: "photo" | "document" },
  caption: string | undefined,
  state: State,
): Promise<void> {
  const subId = state.draft.resubmit_id;
  if (!subId) {
    await sendMessage({ chat_id: chatId, text: uz.errorGeneric });
    return;
  }

  // Double-check status hasn't changed
  const { data: sub } = await supabaseAdmin
    .from("submissions")
    .select("id, status, student_id, group_id, teacher_chat_id, homework_id")
    .eq("id", subId)
    .maybeSingle();

  if (!sub) {
    await sendMessage({ chat_id: chatId, text: tpl(uz.resubmitNotFound, { id: subId }) });
    await clearState(tgUserId);
    return;
  }

  if (sub.status === "reviewed") {
    await sendMessage({ chat_id: chatId, text: tpl(uz.resubmitAlreadyDone, { id: subId }) });
    await clearState(tgUserId);
    return;
  }

  // Update the existing submission row
  await supabaseAdmin
    .from("submissions")
    .update({
      file_id: file.file_id,
      file_type: file.file_type,
      caption: caption ?? null,
      last_resubmit_at: new Date().toISOString(),
      resubmit_count: (sub as any).resubmit_count + 1,
      // Clear any AI draft from the previous file
      ai_draft_grade: null,
      ai_draft_feedback: null,
      pending_grade: null,
    })
    .eq("id", subId);

  await clearState(tgUserId);
  await sendMessage({ chat_id: chatId, text: tpl(uz.resubmitDone, { id: subId }) });

  // Fetch student & group for notifications
  const { data: student } = await supabaseAdmin
    .from("students")
    .select("full_name, group_id")
    .eq("id", sub.student_id as string)
    .maybeSingle();

  const { data: group } = await supabaseAdmin
    .from("groups")
    .select("name")
    .eq("id", sub.group_id as string)
    .maybeSingle();

  const studentName = (student?.full_name as string) ?? "—";
  const groupName = (group?.name as string) ?? "—";

  // Notify teachers chat of the update
  await fanout({
    submissionId: subId,
    studentName,
    groupId: sub.group_id as string,
    groupName,
    homeworkId: ((sub as any).homework_id as number | null) ?? null,
    file,
    caption,
    isResubmit: true,
  });
}

// ─── Text handler (conversation state machine) ───────────────────────────────

export async function handlePrivateText(
  chatId: number,
  tgUserId: number,
  text: string,
): Promise<void> {
  const state = await loadState(tgUserId);
  if (!state || state.step === "idle") {
    await sendMessage({ chat_id: chatId, text: uz.unknownCmd });
    return;
  }

  if (state.step === "ask_name") {
    const name = text.trim();
    if (name.length < 2) {
      await sendMessage({ chat_id: chatId, text: uz.askName });
      return;
    }
    state.draft.name = name;
    state.step = "ask_group";
    await saveState(tgUserId, state);

    const { data: groups } = await supabaseAdmin
      .from("groups")
      .select("name")
      .order("name");

    const keyboard: InlineKeyboardMarkup | undefined =
      groups && groups.length > 0
        ? {
            inline_keyboard: chunk(
              groups.map((g) => ({
                text: g.name as string,
                callback_data: `pickgroup:${g.name}`,
              })),
              3,
            ),
          }
        : undefined;

    await sendMessage({
      chat_id: chatId,
      text: tpl(uz.askGroup, { name }),
      reply_markup: keyboard,
    });
    return;
  }

  if (state.step === "ask_group") {
    await acceptGroup(chatId, tgUserId, text.trim(), state);
    return;
  }

  if (state.step === "ask_file" || state.step === "resubmit_file") {
    await sendMessage({ chat_id: chatId, text: uz.needFile });
    return;
  }

  if (state.step === "ask_homework") {
    await sendMessage({ chat_id: chatId, text: uzFeature.askHomework });
    return;
  }
}

// ─── Inline "pickgroup" callback ─────────────────────────────────────────────

export async function handlePickGroupCallback(
  chatId: number,
  tgUserId: number,
  groupName: string,
): Promise<void> {
  const state = await loadState(tgUserId);
  if (!state || state.step !== "ask_group") return;
  await acceptGroup(chatId, tgUserId, groupName, state);
}

// ─── Group selection logic (shared by text & callback) ───────────────────────

async function acceptGroup(
  chatId: number,
  tgUserId: number,
  rawName: string,
  state: State,
): Promise<void> {
  const name = rawName.trim();
  if (!name) {
    await sendMessage({ chat_id: chatId, text: uz.groupNotFound });
    return;
  }

  const { data: existing } = await supabaseAdmin
    .from("groups")
    .select("id, name")
    .ilike("name", name)
    .maybeSingle();

  let groupId: string;
  let groupName: string;

  if (existing) {
    groupId = existing.id as string;
    groupName = existing.name as string;
  } else {
    const { data: inserted, error } = await supabaseAdmin
      .from("groups")
      .insert({ name })
      .select("id, name")
      .single();
    if (error || !inserted) {
      await sendMessage({ chat_id: chatId, text: uz.errorGeneric });
      return;
    }
    groupId = inserted.id as string;
    groupName = inserted.name as string;
  }

  // Upsert student record
  await supabaseAdmin.from("students").upsert(
    {
      tg_user_id: tgUserId,
      full_name: state.draft.name ?? "—",
      group_id: groupId,
    },
    { onConflict: "tg_user_id" },
  );

  state.draft.group_id = groupId;
  state.draft.group_name = groupName;
  await offerHomeworkPicker(chatId, tgUserId, groupId, state);
}

// ─── Homework picker ─────────────────────────────────────────────────────────

async function offerHomeworkPicker(
  chatId: number,
  tgUserId: number,
  groupId: string,
  state: State,
): Promise<void> {
  const sinceIso = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { data: hws } = await supabaseAdmin
    .from("homeworks")
    .select("id, title, due_at")
    .eq("group_id", groupId)
    .is("deleted_at", null)
    .gte("due_at", sinceIso)
    .order("due_at", { ascending: true })
    .limit(8);

  if (!hws || hws.length === 0) {
    state.draft.homework_id = null;
    state.step = "ask_file";
    await saveState(tgUserId, state);
    await sendMessage({ chat_id: chatId, text: uz.askFile });
    return;
  }

  state.step = "ask_homework";
  await saveState(tgUserId, state);

  const buttons = (hws as any[]).map((h) => ({
    text: `#${h.id} ${truncate(h.title as string, 28)}`,
    callback_data: `pickhw:${h.id}`,
  }));
  buttons.push({ text: uzFeature.askHomeworkNone, callback_data: "pickhw:none" });

  await sendMessage({
    chat_id: chatId,
    text: uzFeature.askHomework,
    reply_markup: { inline_keyboard: chunk(buttons, 1) },
  });
}

export async function handlePickHomeworkCallback(
  chatId: number,
  tgUserId: number,
  raw: string,
): Promise<void> {
  const state = await loadState(tgUserId);
  if (!state || state.step !== "ask_homework") return;

  if (raw === "none") {
    state.draft.homework_id = null;
    state.step = "ask_file";
    await saveState(tgUserId, state);
    await sendMessage({ chat_id: chatId, text: uzFeature.pickedHomeworkNone });
    return;
  }

  const hwId = parseInt(raw, 10);
  if (!Number.isFinite(hwId)) return;

  const { data: hw } = await supabaseAdmin
    .from("homeworks")
    .select("id, title")
    .eq("id", hwId)
    .maybeSingle();

  if (!hw) {
    state.draft.homework_id = null;
  } else {
    state.draft.homework_id = hwId;
  }
  state.step = "ask_file";
  await saveState(tgUserId, state);
  await sendMessage({
    chat_id: chatId,
    text: hw
      ? tpl(uzFeature.pickedHomework, { id: hwId, title: hw.title as string })
      : uz.askFile,
  });
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

// ─── Fan-out (AI review + teacher card + parents notify) ─────────────────────

async function fanout(opts: {
  submissionId: number;
  studentName: string;
  groupId: string;
  groupName: string;
  file: { file_id: string; file_type: "photo" | "document" };
  caption: string | undefined;
  isResubmit: boolean;
}): Promise<void> {
  // 1) AI draft review
  let aiGrade: string | null = null;
  let aiFeedback: string | null = null;

  const fileBytes = await getFileBytes(opts.file.file_id);
  if (fileBytes) {
    const review = await draftReview({
      bytes: fileBytes.bytes,
      mime: fileBytes.mime,
      caption: opts.caption,
    });
    aiGrade = review.grade;
    aiFeedback = review.feedback;
    if (aiGrade || aiFeedback) {
      await supabaseAdmin
        .from("submissions")
        .update({ ai_draft_grade: aiGrade, ai_draft_feedback: aiFeedback })
        .eq("id", opts.submissionId);
    }
  }

  // 2) Resolve teachers chat
  const { data: group } = await supabaseAdmin
    .from("groups")
    .select("teachers_chat_id, parents_chat_id, name")
    .eq("id", opts.groupId)
    .maybeSingle();

  const groupName = (group?.name as string) ?? opts.groupName;
  let teachersChatId: number | null = (group?.teachers_chat_id as number | null) ?? null;

  if (!teachersChatId) {
    const { data: anyTeachers } = await supabaseAdmin
      .from("teachers_chats")
      .select("chat_id")
      .limit(1)
      .maybeSingle();
    teachersChatId = (anyTeachers?.chat_id as number | null) ?? null;
  }

  // 3) Teacher card
  if (teachersChatId) {
    const cardTemplate = opts.isResubmit ? uz.teacherCardResubmit : uz.teacherCard;
    const caption = tpl(cardTemplate, {
      id: opts.submissionId,
      name: opts.studentName,
      group: groupName,
      time: fmtDateTime(new Date()),
      aiGrade: aiGrade ?? "—",
      aiFeedback: aiFeedback ?? uz.aiUnavailable,
    });

    const keyboard: InlineKeyboardMarkup = {
      inline_keyboard: chunk(
        GRADES.map((g) => ({
          text: g,
          callback_data: `grade:${opts.submissionId}:${g}`,
        })),
        2,
      ),
    };

    try {
      const sent =
        opts.file.file_type === "photo"
          ? await sendPhoto({
              chat_id: teachersChatId,
              photo: opts.file.file_id,
              caption,
              reply_markup: keyboard,
            })
          : await sendDocument({
              chat_id: teachersChatId,
              document: opts.file.file_id,
              caption,
              reply_markup: keyboard,
            });

      await supabaseAdmin
        .from("submissions")
        .update({
          teacher_chat_id: teachersChatId,
          teacher_message_id: sent.message_id,
        })
        .eq("id", opts.submissionId);
    } catch (err) {
      console.error("[student] teacher fan-out failed:", err);
    }
  } else {
    console.warn("[student] no teachers chat registered");
  }

  // 4) Parents notification
  const parentsChatId = group?.parents_chat_id as number | null | undefined;
  if (parentsChatId) {
    try {
      await sendMessage({
        chat_id: parentsChatId,
        text: tpl(uz.parentsNotify, {
          id: opts.submissionId,
          name: opts.studentName,
          group: groupName,
        }),
      });
    } catch (err) {
      console.error("[student] parents notify failed:", err);
    }
  } else {
    console.warn(`[student] no parents binding for group ${groupName}`);
  }
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}