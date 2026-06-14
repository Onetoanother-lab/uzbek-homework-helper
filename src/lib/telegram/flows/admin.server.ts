// src/lib/telegram/flows/admin.server.ts
// Admin commands: /claimadmin, /bindparents, /bindteachers, /stats, /export,
// /groupstats, /studentstats

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getChatMember, sendMessage, sendDocument } from "@/lib/telegram/client.server";
import { uz, tpl, GRADES, GRADE_WEIGHTS, weightToGrade, fmtDate } from "@/lib/i18n/uz";

// ─── Auth helpers ─────────────────────────────────────────────────────────────

export async function isAdmin(tgUserId: number): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("admins")
    .select("tg_user_id")
    .eq("tg_user_id", tgUserId)
    .maybeSingle();
  return !!data;
}

async function canBindGroupChat(chatId: number, tgUserId: number): Promise<boolean> {
  if (await isAdmin(tgUserId)) return true;
  try {
    const member = await getChatMember({ chat_id: chatId, user_id: tgUserId });
    return member.status === "creator" || member.status === "administrator";
  } catch (err) {
    console.error("[admin] getChatMember failed:", err);
    return false;
  }
}

// ─── /claimadmin ─────────────────────────────────────────────────────────────

export async function handleClaimAdmin(
  chatId: number,
  tgUserId: number,
  arg: string,
): Promise<void> {
  const expected = process.env.ADMIN_CLAIM_TOKEN;
  if (!expected) {
    await sendMessage({ chat_id: chatId, text: uz.errorGeneric });
    return;
  }
  if (!arg) {
    await sendMessage({ chat_id: chatId, text: uz.claimAdminUsage });
    return;
  }
  if (arg.trim() !== expected) {
    await sendMessage({ chat_id: chatId, text: uz.claimAdminBadToken });
    return;
  }
  if (await isAdmin(tgUserId)) {
    await sendMessage({ chat_id: chatId, text: uz.claimAdminAlready });
    return;
  }
  await supabaseAdmin.from("admins").insert({ tg_user_id: tgUserId });
  await sendMessage({ chat_id: chatId, text: uz.claimAdminOk });
}

// ─── /bindparents <group> ─────────────────────────────────────────────────────

export async function handleBindParents(opts: {
  chat_id: number;
  chat_type: string;
  from_user_id: number;
  arg: string;
}): Promise<void> {
  if (opts.chat_type === "private") {
    await sendMessage({ chat_id: opts.chat_id, text: uz.bindParentsGroupOnly });
    return;
  }
  const groupName = opts.arg.trim();
  if (!groupName) {
    await sendMessage({ chat_id: opts.chat_id, text: uz.bindParentsUsage });
    return;
  }
  if (!(await canBindGroupChat(opts.chat_id, opts.from_user_id))) {
    await sendMessage({ chat_id: opts.chat_id, text: uz.bindParentsForbidden });
    return;
  }

  const { data: existing } = await supabaseAdmin
    .from("groups")
    .select("id")
    .ilike("name", groupName)
    .maybeSingle();

  if (existing) {
    await supabaseAdmin
      .from("groups")
      .update({ parents_chat_id: opts.chat_id })
      .eq("id", existing.id as string);
  } else {
    await supabaseAdmin
      .from("groups")
      .insert({ name: groupName, parents_chat_id: opts.chat_id });
  }

  await sendMessage({
    chat_id: opts.chat_id,
    text: tpl(uz.bindParentsOk, { group: groupName }),
  });
}

// ─── /bindteachers ───────────────────────────────────────────────────────────

export async function handleBindTeachers(opts: {
  chat_id: number;
  chat_type: string;
  from_user_id: number;
  arg: string;
}): Promise<void> {
  if (opts.chat_type === "private") {
    await sendMessage({ chat_id: opts.chat_id, text: uz.bindTeachersGroupOnly });
    return;
  }
  if (!(await canBindGroupChat(opts.chat_id, opts.from_user_id))) {
    await sendMessage({ chat_id: opts.chat_id, text: uz.bindTeachersForbidden });
    return;
  }
  await supabaseAdmin.from("teachers_chats").upsert({
    chat_id: opts.chat_id,
    label: opts.arg.trim() || null,
  });
  await sendMessage({ chat_id: opts.chat_id, text: uz.bindTeachersOk });
}

// ─── /stats ──────────────────────────────────────────────────────────────────

export async function handleStats(chatId: number): Promise<void> {
  const [totalRes, pendingRes, reviewedRes, groupsRes, studentsRes] = await Promise.all([
    supabaseAdmin.from("submissions").select("id", { count: "exact", head: true }),
    supabaseAdmin
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabaseAdmin
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .eq("status", "reviewed"),
    supabaseAdmin.from("groups").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("students").select("id", { count: "exact", head: true }),
  ]);

  const total = totalRes.count ?? 0;
  const pending = pendingRes.count ?? 0;
  const reviewed = reviewedRes.count ?? 0;
  const groups = groupsRes.count ?? 0;
  const students = studentsRes.count ?? 0;
  const rate = total > 0 ? Math.round((reviewed / total) * 100) : 0;

  const text =
    uz.statsHeader +
    tpl(uz.statsLine, { total, pending, reviewed, rate, groups, students });

  await sendMessage({ chat_id: chatId, text });
}

// ─── /export ─────────────────────────────────────────────────────────────────

export async function handleExport(chatId: number): Promise<void> {
  await sendMessage({ chat_id: chatId, text: uz.exportGenerating });

  const { data, error } = await supabaseAdmin
    .from("submissions")
    .select(
      "id, created_at, status, final_grade, final_feedback, reviewed_at, ai_draft_grade, resubmit_count, students(full_name, tg_user_id), groups(name)",
    )
    .order("created_at", { ascending: false });

  if (error || !data || data.length === 0) {
    await sendMessage({ chat_id: chatId, text: uz.exportEmpty });
    return;
  }

  // Build CSV
  const headers = [
    "id",
    "created_at",
    "student_name",
    "student_tg_id",
    "group",
    "status",
    "final_grade",
    "ai_draft_grade",
    "final_feedback",
    "reviewed_at",
    "resubmit_count",
  ].join(",");

  const rows = (data as any[]).map((r) => {
    return [
      r.id,
      r.created_at,
      csvEscape(r.students?.full_name ?? ""),
      r.students?.tg_user_id ?? "",
      csvEscape(r.groups?.name ?? ""),
      r.status,
      csvEscape(r.final_grade ?? ""),
      csvEscape(r.ai_draft_grade ?? ""),
      csvEscape(r.final_feedback ?? ""),
      r.reviewed_at ?? "",
      r.resubmit_count ?? 0,
    ].join(",");
  });

  const csv = [headers, ...rows].join("\n");
  const bytes = new TextEncoder().encode(csv);

  const filename = tpl(uz.exportFilename, {
    date: new Date().toISOString().slice(0, 10),
  });

  // Telegram requires a file URL or file_id for sendDocument.
  // We encode the CSV as a data URI and send via the gateway.
  // The gateway accepts base64-encoded file data.
  const base64 = bytesToBase64(bytes);

  try {
    await sendDocument({
      chat_id: chatId,
      document: `data:text/csv;base64,${base64}`,
      caption: filename,
    });
  } catch (err) {
    // If the gateway does not support data URIs, fall back to sending as text
    console.error("[admin] export sendDocument failed, falling back:", err);
    // Split into chunks of 4096 chars to stay under Telegram message limits
    const MAX = 3800;
    const text = "```csv\n" + csv.slice(0, MAX) + (csv.length > MAX ? "\n…(truncated)" : "") + "\n```";
    await sendMessage({ chat_id: chatId, text, parse_mode: "MarkdownV2" });
  }
}

// ─── /groupstats <group> ─────────────────────────────────────────────────────

export async function handleGroupStats(chatId: number, arg: string): Promise<void> {
  if (!arg.trim()) {
    await sendMessage({ chat_id: chatId, text: uz.groupStatsUsage });
    return;
  }

  const groupName = arg.trim();

  const { data: group } = await supabaseAdmin
    .from("groups")
    .select("id, name")
    .ilike("name", groupName)
    .maybeSingle();

  if (!group) {
    await sendMessage({ chat_id: chatId, text: tpl(uz.groupStatsEmpty, { group: groupName }) });
    return;
  }

  const [studentsRes, subsRes] = await Promise.all([
    supabaseAdmin
      .from("students")
      .select("id", { count: "exact", head: true })
      .eq("group_id", group.id),
    supabaseAdmin
      .from("submissions")
      .select("status, final_grade")
      .eq("group_id", group.id),
  ]);

  const studentCount = studentsRes.count ?? 0;
  const subs = subsRes.data ?? [];
  const total = subs.length;
  const reviewed = subs.filter((s: any) => s.status === "reviewed").length;
  const pending = total - reviewed;

  const avg = computeAverageGrade(
    subs.filter((s: any) => s.final_grade).map((s: any) => s.final_grade),
  );

  const text =
    tpl(uz.groupStatsHeader, { group: group.name as string }) +
    tpl(uz.groupStatsBody, { students: studentCount, total, reviewed, pending, avg });

  await sendMessage({ chat_id: chatId, text });
}

// ─── /studentstats <name> ────────────────────────────────────────────────────

export async function handleStudentStats(chatId: number, arg: string): Promise<void> {
  if (!arg.trim()) {
    await sendMessage({ chat_id: chatId, text: uz.studentStatsUsage });
    return;
  }

  const query = arg.trim().toLowerCase();

  const { data: students } = await supabaseAdmin
    .from("students")
    .select("id, full_name, group_id, groups(name)")
    .ilike("full_name", `%${query}%`);

  if (!students || students.length === 0) {
    await sendMessage({ chat_id: chatId, text: tpl(uz.studentStatsEmpty, { query: arg.trim() }) });
    return;
  }

  if (students.length > 1) {
    const names = (students as any[])
      .map((s) => `• ${s.full_name} (${s.groups?.name ?? "?"})`)
      .join("\n");
    await sendMessage({
      chat_id: chatId,
      text: tpl(uz.studentStatsMultiple, { names }),
    });
    return;
  }

  const student = students[0] as any;

  const { data: subs } = await supabaseAdmin
    .from("submissions")
    .select("status, final_grade")
    .eq("student_id", student.id);

  const all = subs ?? [];
  const total = all.length;
  const reviewed = all.filter((s: any) => s.status === "reviewed").length;
  const pending = total - reviewed;
  const avg = computeAverageGrade(
    all.filter((s: any) => s.final_grade).map((s: any) => s.final_grade),
  );

  const text =
    tpl(uz.studentStatsHeader, {
      name: student.full_name,
      group: student.groups?.name ?? "—",
    }) +
    tpl(uz.studentStatsBody, { total, reviewed, pending, avg });

  await sendMessage({ chat_id: chatId, text });
}

// ─── Weekly report (called by scheduler) ─────────────────────────────────────

export async function sendWeeklyReports(): Promise<void> {
  const weekStart = getMonday(new Date());
  const weekStartStr = weekStart.toISOString().slice(0, 10);
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Fetch all groups with a parents_chat_id
  const { data: groups } = await supabaseAdmin
    .from("groups")
    .select("id, name, parents_chat_id")
    .not("parents_chat_id", "is", null);

  if (!groups || groups.length === 0) return;

  for (const group of groups as any[]) {
    // Skip if already sent this week
    const { data: existing } = await supabaseAdmin
      .from("weekly_reports")
      .select("id")
      .eq("group_id", group.id)
      .eq("week_start", weekStartStr)
      .maybeSingle();

    if (existing) continue;

    // Fetch submissions in this week's window
    const { data: subs } = await supabaseAdmin
      .from("submissions")
      .select("status, final_grade")
      .eq("group_id", group.id)
      .gte("created_at", weekStart.toISOString())
      .lt("created_at", weekEnd.toISOString());

    const all = subs ?? [];
    const total = all.length;
    const reviewed = all.filter((s: any) => s.status === "reviewed").length;
    const pending = total - reviewed;
    const avg = computeAverageGrade(
      all.filter((s: any) => s.final_grade).map((s: any) => s.final_grade),
    );

    const weekLabel = `${fmtDate(weekStart)} – ${fmtDate(weekEnd)}`;

    let text: string;
    if (total === 0) {
      text = tpl(uz.weeklyReportEmpty, { group: group.name });
    } else {
      text =
        tpl(uz.weeklyReportHeader, { week: weekLabel, group: group.name }) +
        tpl(uz.weeklyReportBody, { total, reviewed, pending, avg });
    }

    try {
      await sendMessage({ chat_id: group.parents_chat_id, text });

      await supabaseAdmin.from("weekly_reports").insert({
        group_id: group.id,
        week_start: weekStartStr,
      });
    } catch (err) {
      console.error(`[admin] weekly report failed for group ${group.name}:`, err);
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeAverageGrade(grades: string[]): string {
  if (grades.length === 0) return "—";
  const total = grades.reduce((sum, g) => {
    return sum + (GRADE_WEIGHTS[g as keyof typeof GRADE_WEIGHTS] ?? 0);
  }, 0);
  const avg = total / grades.length;
  return weightToGrade(avg);
}

function getMonday(d: Date): Date {
  const day = d.getDay(); // 0=Sun, 1=Mon…
  const diff = (day === 0 ? -6 : 1 - day); // offset to Monday
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}