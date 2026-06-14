// src/lib/telegram/flows/dispute.server.ts
// Student command: /dispute <submission_id> <reason>
// Teacher command: /resolvedispute <dispute_id> <resolution>

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendMessage } from "@/lib/telegram/client.server";
import { uzAdditions as t } from "@/lib/i18n/uz.additions";
import { tpl } from "@/lib/i18n/uz";
import { reportError } from "@/lib/telegram/error-reporter.server";

// ─── /dispute <id> <reason> ──────────────────────────────────────────────────

export async function handleDispute(
  chatId: number,
  tgUserId: number,
  arg: string,
): Promise<void> {
  // Parse: "42 Baho noto'g'ri, men to'g'ri bajardim"
  const spaceIdx = arg.indexOf(" ");
  if (spaceIdx === -1) {
    await sendMessage({ chat_id: chatId, text: t.disputeUsage });
    return;
  }

  const subId = parseInt(arg.slice(0, spaceIdx).trim(), 10);
  const reason = arg.slice(spaceIdx + 1).trim();

  if (!Number.isFinite(subId) || subId <= 0 || !reason) {
    await sendMessage({ chat_id: chatId, text: t.disputeUsage });
    return;
  }

  // Resolve student record
  const { data: student } = await supabaseAdmin
    .from("students")
    .select("id, full_name, group_id, groups(name)")
    .eq("tg_user_id", tgUserId)
    .maybeSingle();

  if (!student) {
    await sendMessage({ chat_id: chatId, text: tpl(t.disputeNotFound, { id: subId }) });
    return;
  }

  // Verify submission belongs to this student and is reviewed
  const { data: sub } = await supabaseAdmin
    .from("submissions")
    .select("id, status, final_grade, group_id")
    .eq("id", subId)
    .eq("student_id", student.id as string)
    .maybeSingle();

  if (!sub) {
    await sendMessage({ chat_id: chatId, text: tpl(t.disputeNotFound, { id: subId }) });
    return;
  }

  if (sub.status !== "reviewed") {
    await sendMessage({ chat_id: chatId, text: tpl(t.disputeNotReviewed, { id: subId }) });
    return;
  }

  // Check for existing open dispute
  const { data: existing } = await supabaseAdmin
    .from("disputes")
    .select("id, status")
    .eq("submission_id", subId)
    .maybeSingle();

  if (existing && existing.status === "open") {
    await sendMessage({ chat_id: chatId, text: tpl(t.disputeAlreadyOpen, { id: subId }) });
    return;
  }

  // Insert dispute (upsert to replace a previously resolved one if needed)
  const { data: dispute, error } = await supabaseAdmin
    .from("disputes")
    .upsert(
      {
        submission_id: subId,
        student_id: student.id,
        reason,
        status: "open",
        resolver_tg_id: null,
        resolution: null,
        resolved_at: null,
      },
      { onConflict: "submission_id" },
    )
    .select("id")
    .single();

  if (error || !dispute) {
    await reportError({ context: "dispute/create", error: error ?? "no row" });
    await sendMessage({ chat_id: chatId, text: "Xatolik yuz berdi." });
    return;
  }

  await sendMessage({
    chat_id: chatId,
    text: tpl(t.disputeCreated, { disputeId: dispute.id as number }),
  });

  // Alert teachers group
  await alertTeachers({
    disputeId: dispute.id as number,
    subId,
    studentName: (student as any).full_name as string,
    groupName: (student as any).groups?.name ?? "—",
    grade: (sub.final_grade as string | null) ?? "—",
    reason,
    groupId: sub.group_id as string,
  });
}

// ─── /resolvedispute <id> <resolution> ──────────────────────────────────────

export async function handleResolveDispute(
  chatId: number,
  fromUserId: number,
  arg: string,
): Promise<void> {
  const spaceIdx = arg.indexOf(" ");
  if (spaceIdx === -1) {
    await sendMessage({ chat_id: chatId, text: t.resolveUsage });
    return;
  }

  const disputeId = parseInt(arg.slice(0, spaceIdx).trim(), 10);
  const resolution = arg.slice(spaceIdx + 1).trim();

  if (!Number.isFinite(disputeId) || disputeId <= 0 || !resolution) {
    await sendMessage({ chat_id: chatId, text: t.resolveUsage });
    return;
  }

  const { data: dispute } = await supabaseAdmin
    .from("disputes")
    .select("id, status, submission_id, student_id")
    .eq("id", disputeId)
    .maybeSingle();

  if (!dispute) {
    await sendMessage({ chat_id: chatId, text: tpl(t.resolveNotFound, { id: disputeId }) });
    return;
  }

  if (dispute.status !== "open") {
    await sendMessage({ chat_id: chatId, text: tpl(t.resolveAlreadyClosed, { id: disputeId }) });
    return;
  }

  await supabaseAdmin
    .from("disputes")
    .update({
      status: "resolved",
      resolver_tg_id: fromUserId,
      resolution,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", disputeId);

  await sendMessage({
    chat_id: chatId,
    text: tpl(t.resolveOk, { id: disputeId }),
  });

  // Notify student
  const { data: student } = await supabaseAdmin
    .from("students")
    .select("tg_user_id")
    .eq("id", dispute.student_id as string)
    .maybeSingle();

  if (student?.tg_user_id) {
    try {
      await sendMessage({
        chat_id: student.tg_user_id as number,
        text: tpl(t.resolveStudentNotify, {
          subId: dispute.submission_id as number,
          resolution,
        }),
      });
    } catch (err) {
      await reportError({ context: "dispute/notify-student", error: err });
    }
  }
}

// ─── Internal: alert teachers chat ───────────────────────────────────────────

async function alertTeachers(opts: {
  disputeId: number;
  subId: number;
  studentName: string;
  groupName: string;
  grade: string;
  reason: string;
  groupId: string;
}): Promise<void> {
  // Prefer group-specific teachers chat; fall back to any registered chat
  const { data: group } = await supabaseAdmin
    .from("groups")
    .select("teachers_chat_id")
    .eq("id", opts.groupId)
    .maybeSingle();

  let teachersChatId = group?.teachers_chat_id as number | null | undefined;

  if (!teachersChatId) {
    const { data: anyChat } = await supabaseAdmin
      .from("teachers_chats")
      .select("chat_id")
      .limit(1)
      .maybeSingle();
    teachersChatId = anyChat?.chat_id as number | null | undefined;
  }

  if (!teachersChatId) {
    console.warn("[dispute] no teachers chat to alert");
    return;
  }

  try {
    await sendMessage({
      chat_id: teachersChatId,
      text: tpl(t.disputeTeacherAlert, {
        disputeId: opts.disputeId,
        name: opts.studentName,
        group: opts.groupName,
        subId: opts.subId,
        grade: opts.grade,
        reason: opts.reason,
      }),
    });
  } catch (err) {
    await reportError({ context: "dispute/alert-teachers", error: err });
  }
}