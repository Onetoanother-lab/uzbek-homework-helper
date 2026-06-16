// src/lib/telegram/flows/reportcard.server.ts
// /myhomeworks (student) — list pending homeworks for student's group
// /reportcard <group> (teacher) — matrix of students × homeworks
// /teacherstats (teacher) — caller's review activity

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendMessage } from "@/lib/telegram/client.server";
import { tpl, fmtDateTime, GRADE_WEIGHTS, type Grade } from "@/lib/i18n/uz";
import { uzFeature as t } from "@/lib/i18n/uz.feature";

const REPORT_CARD_HW_LIMIT = 8;

// ─── /myhomeworks ────────────────────────────────────────────────────────────

export async function handleMyHomeworks(chatId: number, tgUserId: number): Promise<void> {
  const { data: student } = await supabaseAdmin
    .from("students")
    .select("id, group_id")
    .eq("tg_user_id", tgUserId)
    .maybeSingle();

  if (!student || !student.group_id) {
    await sendMessage({ chat_id: chatId, text: t.myHwNotStudent });
    return;
  }

  const nowIso = new Date().toISOString();
  // Active = not deleted, due in the future OR within last 7 days (so overdue still visible briefly)
  const sinceIso = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  const { data: hws } = await supabaseAdmin
    .from("homeworks")
    .select("id, title, due_at")
    .eq("group_id", student.group_id as string)
    .is("deleted_at", null)
    .gte("due_at", sinceIso)
    .order("due_at", { ascending: true });

  if (!hws || hws.length === 0) {
    await sendMessage({ chat_id: chatId, text: t.myHwEmpty });
    return;
  }

  // Find which homeworks this student already submitted to
  const hwIds = hws.map((h: any) => h.id as number);
  const { data: subs } = await supabaseAdmin
    .from("submissions")
    .select("homework_id")
    .eq("student_id", student.id as string)
    .in("homework_id", hwIds);

  const submitted = new Set((subs ?? []).map((s: any) => s.homework_id as number));

  const lines = (hws as any[]).map((h) => {
    const isSubmitted = submitted.has(h.id);
    const isOverdue = new Date(h.due_at as string).getTime() < Date.now();
    let statusPart = "";
    if (isSubmitted) statusPart = t.myHwSubmitted;
    else if (isOverdue) statusPart = t.myHwOverdue;
    return tpl(t.myHwLine, {
      id: h.id,
      title: h.title,
      due: fmtDateTime(h.due_at),
      statusPart,
    });
  });

  void nowIso;
  await sendMessage({
    chat_id: chatId,
    text: `${t.myHwHeader}\n\n${lines.join("\n\n")}`,
  });
}

// ─── /reportcard <group> ─────────────────────────────────────────────────────

export async function handleReportCard(chatId: number, arg: string): Promise<void> {
  const groupName = arg.trim();
  if (!groupName) {
    await sendMessage({ chat_id: chatId, text: t.reportCardUsage });
    return;
  }

  const { data: group } = await supabaseAdmin
    .from("groups")
    .select("id, name")
    .ilike("name", groupName)
    .maybeSingle();

  if (!group) {
    await sendMessage({ chat_id: chatId, text: tpl(t.reportCardNoGroup, { group: groupName }) });
    return;
  }

  const groupId = group.id as string;

  const [{ data: students }, { data: hws }] = await Promise.all([
    supabaseAdmin
      .from("students")
      .select("id, full_name")
      .eq("group_id", groupId)
      .order("full_name", { ascending: true }),
    supabaseAdmin
      .from("homeworks")
      .select("id, title")
      .eq("group_id", groupId)
      .is("deleted_at", null)
      .order("due_at", { ascending: false })
      .limit(REPORT_CARD_HW_LIMIT),
  ]);

  if (!students || students.length === 0 || !hws || hws.length === 0) {
    await sendMessage({ chat_id: chatId, text: tpl(t.reportCardEmpty, { group: group.name as string }) });
    return;
  }

  // Newest-first → reverse to chronological so columns read naturally
  const hwList = (hws as any[]).slice().reverse();
  const hwIds = hwList.map((h) => h.id as number);
  const studentIds = (students as any[]).map((s) => s.id as string);

  const { data: subs } = await supabaseAdmin
    .from("submissions")
    .select("student_id, homework_id, final_grade, status")
    .in("homework_id", hwIds)
    .in("student_id", studentIds);

  // Index: student_id + homework_id → { grade, status }
  const grid = new Map<string, { grade: string | null; status: string }>();
  for (const s of (subs ?? []) as any[]) {
    const key = `${s.student_id}::${s.homework_id}`;
    grid.set(key, { grade: s.final_grade as string | null, status: s.status as string });
  }

  // Build text-table
  const header = `📋 ${group.name as string}`;
  const legend =
    "Vazifalar:\n" +
    hwList.map((h, i) => `  ${i + 1}. #${h.id} — ${truncate(h.title as string, 40)}`).join("\n");

  const rowLines: string[] = [];
  const colHeader = `${pad("O'quvchi", 18)} ${hwList.map((_, i) => pad(`#${i + 1}`, 4)).join(" ")}`;
  rowLines.push("```");
  rowLines.push(colHeader);
  rowLines.push("-".repeat(colHeader.length));
  for (const st of students as any[]) {
    const cells = hwList.map((h) => {
      const cell = grid.get(`${st.id}::${h.id}`);
      if (!cell) return pad("—", 4);
      if (cell.status === "pending") return pad("·", 4);
      return pad(shortGrade(cell.grade), 4);
    });
    rowLines.push(`${pad(truncate(st.full_name as string, 18), 18)} ${cells.join(" ")}`);
  }
  rowLines.push("```");

  const text = `${header}\n${tpl(t.reportCardHeader, { group: group.name as string, n: hwList.length })}\n\n${legend}\n\n${rowLines.join("\n")}`;

  await sendMessage({ chat_id: chatId, text });
}

// ─── /teacherstats ────────────────────────────────────────────────────────────

export async function handleTeacherStats(chatId: number, fromUserId: number): Promise<void> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  const [{ data: weekRows }, { data: allRows }] = await Promise.all([
    supabaseAdmin
      .from("submissions")
      .select("final_grade, created_at, reviewed_at")
      .eq("reviewer_tg_id", fromUserId)
      .eq("status", "reviewed")
      .gte("reviewed_at", weekAgo),
    supabaseAdmin
      .from("submissions")
      .select("final_grade")
      .eq("reviewer_tg_id", fromUserId)
      .eq("status", "reviewed"),
  ]);

  const weekCount = weekRows?.length ?? 0;
  const totalCount = allRows?.length ?? 0;

  if (totalCount === 0) {
    await sendMessage({ chat_id: chatId, text: t.teacherStatsEmpty });
    return;
  }

  // Avg response time (created → reviewed) for this week
  let avgHours = 0;
  if (weekRows && weekRows.length > 0) {
    const sum = (weekRows as any[]).reduce((acc, r) => {
      const c = new Date(r.created_at).getTime();
      const v = new Date(r.reviewed_at).getTime();
      return acc + Math.max(0, v - c);
    }, 0);
    avgHours = +(sum / weekRows.length / 3600000).toFixed(1);
  }

  // Grade distribution (all-time)
  const dist: Record<string, number> = {};
  for (const r of (allRows ?? []) as any[]) {
    const g = (r.final_grade as string) ?? "—";
    dist[g] = (dist[g] ?? 0) + 1;
  }
  const distLines = Object.keys(GRADE_WEIGHTS).map((g) => {
    const n = dist[g] ?? 0;
    const pct = totalCount > 0 ? Math.round((n / totalCount) * 100) : 0;
    return `  ${g}: ${n} (${pct}%)`;
  });

  void (null as Grade | null);

  await sendMessage({
    chat_id: chatId,
    text: `${t.teacherStatsHeader}\n\n${tpl(t.teacherStatsBody, {
      weekCount,
      totalCount,
      avgHours: avgHours || "—",
      dist: distLines.join("\n"),
    })}`,
  });
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function pad(s: string, n: number): string {
  if (s.length >= n) return s.slice(0, n);
  return s + " ".repeat(n - s.length);
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function shortGrade(g: string | null): string {
  if (!g) return "·";
  switch (g) {
    case "A'lo": return "5";
    case "Yaxshi": return "4";
    case "Qoniqarli": return "3";
    case "Qayta ishlash": return "2";
    default: return g.slice(0, 3);
  }
}
