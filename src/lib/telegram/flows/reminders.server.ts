// src/lib/telegram/flows/reminders.server.ts
// Deadline reminder engine.
// Call sendDeadlineReminders() every 30 minutes from a cron endpoint.
// It sends two reminder kinds:
//   - "24h" : when due_at is between now+23h and now+25h
//   - "1h"  : when due_at is between now+45min and now+75min
// Deduplication is handled by the homework_reminders_sent table.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  sendMessage,
  sendPhoto,
  sendDocument,
} from "@/lib/telegram/client.server";
import { uzAdditions as t } from "@/lib/i18n/uz.additions";
import { tpl, fmtDateTime } from "@/lib/i18n/uz";
import { reportError } from "@/lib/telegram/error-reporter.server";

type ReminderKind = "24h" | "1h";

interface ReminderWindow {
  kind: ReminderKind;
  minHoursFromNow: number;
  maxHoursFromNow: number;
}

const WINDOWS: ReminderWindow[] = [
  { kind: "24h", minHoursFromNow: 23, maxHoursFromNow: 25 },
  { kind: "1h",  minHoursFromNow: 0.75, maxHoursFromNow: 1.25 },
];

export async function sendDeadlineReminders(): Promise<void> {
  const now = new Date();

  for (const window of WINDOWS) {
    const windowStart = new Date(now.getTime() + window.minHoursFromNow * 3600_000);
    const windowEnd   = new Date(now.getTime() + window.maxHoursFromNow * 3600_000);

    // Fetch homeworks due in this window that haven't had this reminder sent yet
    const { data: homeworks, error } = await supabaseAdmin
      .from("homeworks")
      .select(
        "id, title, due_at, file_id, file_type, group_id, groups(name)",
      )
      .is("deleted_at", null)
      .gte("due_at", windowStart.toISOString())
      .lte("due_at", windowEnd.toISOString());

    if (error) {
      await reportError({ context: "reminders/query", error });
      continue;
    }

    if (!homeworks || homeworks.length === 0) continue;

    for (const hw of homeworks as any[]) {
      // Check if this reminder kind was already sent
      const { data: alreadySent } = await supabaseAdmin
        .from("homework_reminders_sent")
        .select("homework_id")
        .eq("homework_id", hw.id)
        .eq("kind", window.kind)
        .maybeSingle();

      if (alreadySent) continue;

      // Mark as sent BEFORE delivery to prevent duplicates on concurrent calls
      const { error: markErr } = await supabaseAdmin
        .from("homework_reminders_sent")
        .insert({ homework_id: hw.id, kind: window.kind });

      if (markErr) {
        // Unique violation = another process beat us to it — skip
        continue;
      }

      await sendReminderToGroup({
        hw,
        kind: window.kind,
        groupId: hw.group_id as string,
        groupName: hw.groups?.name ?? "—",
      });
    }
  }
}

async function sendReminderToGroup(opts: {
  hw: any;
  kind: ReminderKind;
  groupId: string;
  groupName: string;
}): Promise<void> {
  const { data: students } = await supabaseAdmin
    .from("students")
    .select("tg_user_id")
    .eq("group_id", opts.groupId);

  if (!students || students.length === 0) return;

  const msgTemplate = opts.kind === "24h" ? t.reminderDay : t.reminderHour;
  const text = tpl(msgTemplate, {
    id: opts.hw.id,
    title: opts.hw.title,
    group: opts.groupName,
    due: fmtDateTime(opts.hw.due_at),
  });

  for (const s of students as any[]) {
    const tgId = s.tg_user_id as number;
    try {
      // If the homework has an attachment, re-send it with the reminder caption
      if (opts.hw.file_id && opts.hw.file_type === "photo") {
        await sendPhoto({ chat_id: tgId, photo: opts.hw.file_id, caption: text });
      } else if (opts.hw.file_id && opts.hw.file_type === "document") {
        await sendDocument({ chat_id: tgId, document: opts.hw.file_id, caption: text });
      } else {
        await sendMessage({ chat_id: tgId, text });
      }
    } catch (err) {
      await reportError({
        context: `reminders/${opts.kind}`,
        error: err,
        meta: { hwId: opts.hw.id, tgId },
      });
    }
  }
}