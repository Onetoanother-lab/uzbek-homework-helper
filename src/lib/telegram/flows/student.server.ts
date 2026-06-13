import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendMessage, sendPhoto, sendDocument, type InlineKeyboardMarkup } from "@/lib/telegram/client.server";
import { getFileBytes } from "@/lib/telegram/client.server";
import { draftReview } from "@/lib/ai/review.server";
import { uz, tpl, GRADES } from "@/lib/i18n/uz";

type Step = "ask_name" | "ask_group" | "ask_file" | "idle";

interface State {
  step: Step;
  draft: { name?: string; group_id?: string; group_name?: string };
}

async function loadState(tgUserId: number): Promise<State | null> {
  const { data } = await supabaseAdmin
    .from("conversation_state")
    .select("step, draft")
    .eq("tg_user_id", tgUserId)
    .maybeSingle();
  return data ? ({ step: data.step as Step, draft: (data.draft as any) ?? {} }) : null;
}

async function saveState(tgUserId: number, state: State) {
  await supabaseAdmin.from("conversation_state").upsert({
    tg_user_id: tgUserId,
    step: state.step,
    draft: state.draft,
    updated_at: new Date().toISOString(),
  });
}

async function clearState(tgUserId: number) {
  await supabaseAdmin.from("conversation_state").delete().eq("tg_user_id", tgUserId);
}

export async function handleStart(chatId: number, tgUserId: number) {
  await saveState(tgUserId, { step: "ask_name", draft: {} });
  await sendMessage({ chat_id: chatId, text: uz.start });
}

export async function handleHelp(chatId: number) {
  await sendMessage({ chat_id: chatId, text: uz.help });
}

export async function handleMyStatus(chatId: number, tgUserId: number) {
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
    .select("id, created_at, status, final_grade")
    .eq("student_id", student.id)
    .order("created_at", { ascending: false })
    .limit(10);
  if (!subs || subs.length === 0) {
    await sendMessage({ chat_id: chatId, text: uz.myStatusEmpty });
    return;
  }
  const lines = subs.map((s) =>
    tpl(uz.myStatusLine, {
      id: s.id as number,
      date: new Date(s.created_at as string).toLocaleDateString("uz-UZ"),
      status: s.status === "reviewed" ? uz.statusReviewed : uz.statusPending,
      gradeLine: s.final_grade ? ` • ⭐ ${s.final_grade}` : "",
    }),
  );
  await sendMessage({
    chat_id: chatId,
    text: `${uz.myStatusHeader}\n${lines.join("\n")}`,
  });
}

export async function handlePrivateText(chatId: number, tgUserId: number, text: string) {
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
              groups.map((g) => ({ text: g.name as string, callback_data: `pickgroup:${g.name}` })),
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

  if (state.step === "ask_file") {
    await sendMessage({ chat_id: chatId, text: uz.needFile });
    return;
  }
}

export async function handlePickGroupCallback(
  chatId: number,
  tgUserId: number,
  groupName: string,
) {
  const state = await loadState(tgUserId);
  if (!state || state.step !== "ask_group") return;
  await acceptGroup(chatId, tgUserId, groupName, state);
}

async function acceptGroup(chatId: number, tgUserId: number, rawName: string, state: State) {
  const name = rawName.trim();
  if (!name) {
    await sendMessage({ chat_id: chatId, text: uz.groupNotFound });
    return;
  }
  // Upsert group by name (auto-create so first submissions can land before /bindparents).
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

  // Upsert student.
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
  state.step = "ask_file";
  await saveState(tgUserId, state);
  await sendMessage({ chat_id: chatId, text: uz.askFile });
}

export async function handleSubmissionFile(
  chatId: number,
  tgUserId: number,
  file: { file_id: string; file_type: "photo" | "document" },
  caption: string | undefined,
) {
  const state = await loadState(tgUserId);
  if (!state || state.step !== "ask_file") {
    await sendMessage({ chat_id: chatId, text: uz.unknownCmd });
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

  const { data: sub, error } = await supabaseAdmin
    .from("submissions")
    .insert({
      student_id: student.id,
      group_id: student.group_id,
      file_id: file.file_id,
      file_type: file.file_type,
      caption: caption ?? null,
      status: "pending",
    })
    .select("id")
    .single();
  if (error || !sub) {
    console.error("[student] insert failed:", error);
    await sendMessage({ chat_id: chatId, text: uz.errorGeneric });
    return;
  }
  const subId = sub.id as number;

  await clearState(tgUserId);
  await sendMessage({
    chat_id: chatId,
    text: tpl(uz.saved, { id: subId }),
  });

  // Fan out async-ish (await sequentially; webhook lives in a Worker).
  await fanout({
    submissionId: subId,
    studentName: student.full_name as string,
    groupId: student.group_id as string,
    groupName: state.draft.group_name ?? "",
    file,
    caption,
  });
}

async function fanout(opts: {
  submissionId: number;
  studentName: string;
  groupId: string;
  groupName: string;
  file: { file_id: string; file_type: "photo" | "document" };
  caption: string | undefined;
}) {
  // 1) AI draft
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

  // 2) Resolve teachers chat (group-specific, fallback to any registered teachers chat).
  const { data: group } = await supabaseAdmin
    .from("groups")
    .select("teachers_chat_id, parents_chat_id, name")
    .eq("id", opts.groupId)
    .maybeSingle();
  const groupName = group?.name ?? opts.groupName;
  let teachersChatId: number | null =
    (group?.teachers_chat_id as number | null) ?? null;
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
    const caption = tpl(uz.teacherCard, {
      id: opts.submissionId,
      name: opts.studentName,
      group: groupName,
      time: new Date().toLocaleString("uz-UZ"),
      aiGrade: aiGrade ?? "—",
      aiFeedback: aiFeedback ?? uz.aiUnavailable,
    });
    const keyboard: InlineKeyboardMarkup = {
      inline_keyboard: chunk(
        GRADES.map((g) => ({ text: g, callback_data: `grade:${opts.submissionId}:${g}` })),
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

  // 4) Parents notify
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

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
