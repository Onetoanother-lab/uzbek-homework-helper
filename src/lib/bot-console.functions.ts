import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const consoleInput = z.object({ key: z.string().min(1) });

export const getBotConsoleData = createServerFn({ method: "POST" })
  .inputValidator((data) => consoleInput.parse(data))
  .handler(async ({ data }) => {
    const accessKey = process.env.CONSOLE_ACCESS_KEY ?? process.env.ADMIN_CLAIM_TOKEN;
    if (!accessKey || data.key !== accessKey) {
      throw new Error("Unauthorized");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [events, errors, updates, groups, teacherChats, students, submissions, admins, recentSubs] =
      await Promise.all([
        supabaseAdmin
          .from("bot_events")
          .select("id, update_id, chat_id, chat_type, from_user_id, command, event_type, message, metadata, created_at")
          .order("created_at", { ascending: false })
          .limit(100),
        supabaseAdmin
          .from("error_log")
          .select("id, context, message, stack, update_id, created_at")
          .order("created_at", { ascending: false })
          .limit(50),
        supabaseAdmin
          .from("processed_updates")
          .select("update_id, processed_at")
          .order("processed_at", { ascending: false })
          .limit(10),
        supabaseAdmin
          .from("groups")
          .select("id, name, parents_chat_id, teachers_chat_id, created_at")
          .order("created_at", { ascending: false })
          .limit(50),
        supabaseAdmin
          .from("teachers_chats")
          .select("chat_id, label, created_at")
          .order("created_at", { ascending: false })
          .limit(50),
        supabaseAdmin.from("students").select("id", { count: "exact", head: true }),
        supabaseAdmin.from("submissions").select("id, status", { count: "exact" }).limit(500),
        supabaseAdmin.from("admins").select("tg_user_id, added_at").order("added_at", { ascending: false }),
        supabaseAdmin
          .from("submissions")
          .select("id, status, final_grade, created_at, reviewed_at, student_id, group_id, homework_id, students(full_name), groups(name), homeworks(title)")
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

    const submissionRows = submissions.data ?? [];
    const webhook = await getWebhookInfo().catch((error) => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));

    return {
      fetchedAt: new Date().toISOString(),
      webhook,
      stats: {
        admins: admins.data?.length ?? 0,
        groups: groups.data?.length ?? 0,
        teacherChats: teacherChats.data?.length ?? 0,
        students: students.count ?? 0,
        submissions: submissions.count ?? submissionRows.length,
        pendingSubmissions: submissionRows.filter((row) => row.status === "pending").length,
        reviewedSubmissions: submissionRows.filter((row) => row.status === "reviewed").length,
        recentErrors: errors.data?.length ?? 0,
      },
      events: events.data ?? [],
      errors: errors.data ?? [],
      updates: updates.data ?? [],
      groups: groups.data ?? [],
      teacherChats: teacherChats.data ?? [],
      admins: admins.data ?? [],
      recentSubmissions: (recentSubs.data ?? []).map((row: any) => ({
        id: row.id as number,
        status: row.status as string,
        grade: (row.final_grade as string | null) ?? null,
        created_at: row.created_at as string,
        reviewed_at: (row.reviewed_at as string | null) ?? null,
        student_name: (row.students?.full_name as string | undefined) ?? "—",
        group_name: (row.groups?.name as string | undefined) ?? "—",
        homework_title: (row.homeworks?.title as string | undefined) ?? null,
      })),
    };
  });

async function getWebhookInfo() {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const telegramKey = process.env.TELEGRAM_API_KEY;
  if (!lovableKey || !telegramKey) {
    return { ok: false, error: "Telegram gateway secrets are not configured" };
  }

  const response = await fetch("https://connector-gateway.lovable.dev/telegram/getWebhookInfo", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": telegramKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.ok === false) {
    throw new Error(`Webhook info failed [${response.status}]: ${JSON.stringify(body)}`);
  }
  return { ok: true, result: body.result };
}