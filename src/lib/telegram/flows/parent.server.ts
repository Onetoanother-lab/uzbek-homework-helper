// src/lib/telegram/flows/parent.server.ts
// Parent command: /childstatus
// Admin commands: /linkparent <parent_tg_id> <student_id>
//                 /unlinkparent <parent_tg_id> <student_id>

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendMessage } from "@/lib/telegram/client.server";
import { uzAdditions as t } from "@/lib/i18n/uz.additions";
import { tpl, fmtDate } from "@/lib/i18n/uz";
import { isAdmin } from "@/lib/telegram/flows/admin.server";

const PAGE_SIZE = 5;

// ─── /childstatus ─────────────────────────────────────────────────────────────

export async function handleChildStatus(
  chatId: number,
  tgUserId: number,
): Promise<void> {
  // Find all students linked to this parent
  const { data: links } = await supabaseAdmin
    .from("parent_student_links")
    .select("student_id, students(id, full_name, group_id, groups(name))")
    .eq("parent_tg_id", tgUserId);

  if (!links || links.length === 0) {
    await sendMessage({ chat_id: chatId, text: t.childStatusNotLinked });
    return;
  }

  for (const link of links as any[]) {
    const student = link.students;
    if (!student) continue;

    const studentName = student.full_name as string;
    const groupName = student.groups?.name ?? "—";

    // Fetch latest submissions
    const { data: subs } = await supabaseAdmin
      .from("submissions")
      .select("id, created_at, status, final_grade, final_feedback")
      .eq("student_id", student.id as string)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);

    // Totals for footer
    const { count: total } = await supabaseAdmin
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .eq("student_id", student.id as string);

    const { count: reviewed } = await supabaseAdmin
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .eq("student_id", student.id as string)
      .eq("status", "reviewed");

    const totalCount = total ?? 0;
    const reviewedCount = reviewed ?? 0;
    const pendingCount = totalCount - reviewedCount;

    const header = tpl(t.childStatusHeader, {
      name: studentName,
      group: groupName,
    });

    if (!subs || subs.length === 0) {
      await sendMessage({
        chat_id: chatId,
        text: header + t.childStatusEmpty,
      });
      continue;
    }

    const lines = (subs as any[]).map((s) => {
      const gradePart = s.final_grade ? `\n    ⭐ ${s.final_grade}` : "";
      const raw = typeof s.final_feedback === "string" ? s.final_feedback.trim() : "";
      const feedbackPart = raw
        ? `\n    💬 ${raw.length > 60 ? raw.slice(0, 57) + "…" : raw}`
        : "";
      return tpl(t.childStatusLine, {
        id: s.id,
        date: fmtDate(s.created_at),
        status: s.status === "reviewed" ? t.statusReviewed : t.statusPending,
        gradePart,
        feedbackPart,
      });
    });

    const footer = tpl(t.childStatusFooter, {
      total: totalCount,
      reviewed: reviewedCount,
      pending: pendingCount,
    });

    const text = header + lines.join("\n\n") + footer;
    await sendMessage({ chat_id: chatId, text });
  }
}

// ─── /linkparent <parent_tg_id> <student_id> (admin only) ────────────────────

export async function handleLinkParent(
  chatId: number,
  fromUserId: number,
  arg: string,
): Promise<void> {
  if (!(await isAdmin(fromUserId))) {
    await sendMessage({ chat_id: chatId, text: "Faqat administrator." });
    return;
  }

  const parts = arg.trim().split(/\s+/);
  if (parts.length < 2) {
    await sendMessage({ chat_id: chatId, text: t.linkParentUsage });
    return;
  }

  const parentTgId = parseInt(parts[0], 10);
  const studentId = parts[1];

  if (!Number.isFinite(parentTgId) || !studentId) {
    await sendMessage({ chat_id: chatId, text: t.linkParentUsage });
    return;
  }

  // Verify student exists
  const { data: student } = await supabaseAdmin
    .from("students")
    .select("id, full_name, groups(name)")
    .eq("id", studentId)
    .maybeSingle();

  if (!student) {
    await sendMessage({
      chat_id: chatId,
      text: tpl(t.linkParentStudentNotFound, { studentId }),
    });
    return;
  }

  const { error } = await supabaseAdmin.from("parent_student_links").upsert(
    {
      parent_tg_id: parentTgId,
      student_id: studentId,
      linked_by: fromUserId,
    },
    { onConflict: "parent_tg_id,student_id", ignoreDuplicates: true },
  );

  if (error) {
    // ignoreDuplicates means a conflict returns no error but also no change
    await sendMessage({ chat_id: chatId, text: t.linkParentAlready });
    return;
  }

  await sendMessage({
    chat_id: chatId,
    text: tpl(t.linkParentOk, {
      parentId: parentTgId,
      studentName: (student as any).full_name as string,
      group: (student as any).groups?.name ?? "—",
    }),
  });
}

// ─── /unlinkparent <parent_tg_id> <student_id> (admin only) ─────────────────

export async function handleUnlinkParent(
  chatId: number,
  fromUserId: number,
  arg: string,
): Promise<void> {
  if (!(await isAdmin(fromUserId))) {
    await sendMessage({ chat_id: chatId, text: "Faqat administrator." });
    return;
  }

  const parts = arg.trim().split(/\s+/);
  if (parts.length < 2) {
    await sendMessage({ chat_id: chatId, text: t.unlinkParentUsage });
    return;
  }

  const parentTgId = parseInt(parts[0], 10);
  const studentId = parts[1];

  const { data, error } = await supabaseAdmin
    .from("parent_student_links")
    .delete()
    .eq("parent_tg_id", parentTgId)
    .eq("student_id", studentId)
    .select("id");

  if (error || !data || data.length === 0) {
    await sendMessage({ chat_id: chatId, text: t.unlinkParentNotFound });
    return;
  }

  await sendMessage({ chat_id: chatId, text: t.unlinkParentOk });
}