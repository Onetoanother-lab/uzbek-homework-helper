// src/lib/telegram/flows/homework.server.ts
// Teacher commands: /newhomework, /homeworks
// Handles the two-step flow: command → optional file attachment via reply.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  sendMessage,
  sendPhoto,
  sendDocument,
} from "@/lib/telegram/client.server";
import { uzAdditions as t } from "@/lib/i18n/uz.additions";
import { tpl, fmtDateTime, fmtDate } from "@/lib/i18n/uz";
import { reportError } from "@/lib/telegram/error-reporter.server";

// ─── /newhomework <group> | <title> | <due YYYY-MM-DD HH:MM> ─────────────────
// Optional step 2: teacher replies with a file to the bot's confirmation message.

/**
 * Key: teacher_chat_id:bot_confirm_message_id → homework_id
 * Used to attach a file to a just-created homework via reply.
 * In-memory is fine — it's ephemeral and per-process.
 */
const pendingFileAttach = new Map<string, number>();

export async function handleNewHomework(
  chatId: number,
  fromUserId: number,
  arg: string,
): Promise<void> {
  // Parse: "5A | Matematika §12 | 2026-06-20 23:59"
  const parts = arg.split("|").map((p) => p.trim());
  if (parts.length < 3) {
    await sendMessage({ chat_id: chatId, text: t.newHwUsage });
    return;
  }

  const [groupRaw, titleRaw, ...dueParts] = parts;
  const groupName = groupRaw.trim();
  const title = titleRaw.trim();
  // description is optional: any extra pipe-separated segments join as description
  const dueRaw = dueParts[dueParts.length - 1].trim();
  const description =
    dueParts.length > 1 ? dueParts.slice(0, -1).join(" | ").trim() : null;

  if (!groupName || !title || !dueRaw) {
    await sendMessage({ chat_id: chatId, text: t.newHwUsage });
    return;
  }

  // Parse due date
  const dueAt = parseDue(dueRaw);
  if (!dueAt) {
    await sendMessage({ chat_id: chatId, text: t.newHwBadDate });
    return;
  }
  if (dueAt <= new Date()) {
    await sendMessage({ chat_id: chatId, text: t.newHwPastDate });
    return;
  }

  // Resolve group
  const { data: group } = await supabaseAdmin
    .from("groups")
    .select("id, name")
    .ilike("name", groupName)
    .maybeSingle();

  if (!group) {
    await sendMessage({
      chat_id: chatId,
      text: tpl(t.newHwGroupNotFound, { group: groupName }),
    });
    return;
  }

  // Insert homework row
  const { data: hw, error } = await supabaseAdmin
    .from("homeworks")
    .insert({
      group_id: group.id,
      created_by: fromUserId,
      title,
      description: description ?? null,
      due_at: dueAt.toISOString(),
    })
    .select("id")
    .single();

  if (error || !hw) {
    await reportError({ context: "homework/create", error: error ?? "no row" });
    return;
  }

  const hwId = hw.id as number;

  // Notify teacher and offer file attachment
  const confirmMsg = await sendMessage({
    chat_id: chatId,
    text: tpl(t.newHwAskFile, { id: hwId }),
  });

  // Store the mapping so a reply to this message attaches a file
  const key = `${chatId}:${confirmMsg.message_id}`;
  pendingFileAttach.set(key, hwId);
  // Expire after 10 minutes
  setTimeout(() => pendingFileAttach.delete(key), 10 * 60 * 1000);

  // Fan out to students
  await fanoutHomework({
    hwId,
    groupId: group.id as string,
    groupName: group.name as string,
    title,
    description,
    dueAt,
    fileId: null,
    fileType: null,
  });

  await sendMessage({
    chat_id: chatId,
    text: tpl(t.newHwCreated, { id: hwId, group: group.name as string }),
  });
}

/**
 * Called by the router when a teacher replies to the bot's confirmation message
 * with a file. Attaches the file to the homework and re-notifies students.
 */
export async function handleHomeworkFileAttach(opts: {
  chatId: number;
  replyToMessageId: number;
  file: { file_id: string; file_type: "photo" | "document" };
}): Promise<boolean> {
  const key = `${opts.chatId}:${opts.replyToMessageId}`;
  const hwId = pendingFileAttach.get(key);
  if (!hwId) return false;

  pendingFileAttach.delete(key);

  const { data: hw } = await supabaseAdmin
    .from("homeworks")
    .select("id, group_id, title, description, due_at, groups(name)")
    .eq("id", hwId)
    .maybeSingle();

  if (!hw) return false;

  await supabaseAdmin
    .from("homeworks")
    .update({ file_id: opts.file.file_id, file_type: opts.file.file_type })
    .eq("id", hwId);

  // Re-fan-out with the file
  await fanoutHomework({
    hwId,
    groupId: hw.group_id as string,
    groupName: (hw as any).groups?.name ?? "—",
    title: hw.title as string,
    description: (hw.description as string | null) ?? null,
    dueAt: new Date(hw.due_at as string),
    fileId: opts.file.file_id,
    fileType: opts.file.file_type,
    isUpdate: true,
  });

  return true;
}

// ─── /homeworks <group> ───────────────────────────────────────────────────────

export async function handleHomeworksList(
  chatId: number,
  arg: string,
): Promise<void> {
  const groupName = arg.trim();
  if (!groupName) {
    await sendMessage({ chat_id: chatId, text: t.newHwListUsage });
    return;
  }

  const { data: group } = await supabaseAdmin
    .from("groups")
    .select("id, name")
    .ilike("name", groupName)
    .maybeSingle();

  if (!group) {
    await sendMessage({
      chat_id: chatId,
      text: tpl(t.newHwListEmpty, { group: groupName }),
    });
    return;
  }

  const { data: hws } = await supabaseAdmin
    .from("homeworks")
    .select("id, title, due_at")
    .eq("group_id", group.id)
    .is("deleted_at", null)
    .gte("due_at", new Date().toISOString())
    .order("due_at", { ascending: true });

  if (!hws || hws.length === 0) {
    await sendMessage({
      chat_id: chatId,
      text: tpl(t.newHwListEmpty, { group: group.name as string }),
    });
    return;
  }

  const lines = (hws as any[]).map((h) =>
    tpl(t.newHwListLine, {
      id: h.id,
      title: h.title,
      due: fmtDateTime(h.due_at),
      statusPart: "",
    }),
  );

  await sendMessage({
    chat_id: chatId,
    text: tpl(t.newHwList, {
      group: group.name as string,
      lines: lines.join("\n\n"),
    }),
  });
}

// ─── Fan-out to students ──────────────────────────────────────────────────────

async function fanoutHomework(opts: {
  hwId: number;
  groupId: string;
  groupName: string;
  title: string;
  description: string | null;
  dueAt: Date;
  fileId: string | null;
  fileType: "photo" | "document" | null;
  isUpdate?: boolean;
}): Promise<void> {
  const { data: students } = await supabaseAdmin
    .from("students")
    .select("tg_user_id")
    .eq("group_id", opts.groupId);

  if (!students || students.length === 0) return;

  const desc = opts.description?.trim() ?? "";
  const caption = tpl(t.newHwStudentNotice, {
    id: opts.hwId,
    group: opts.groupName,
    title: opts.title,
    due: fmtDateTime(opts.dueAt),
    description: desc ? `\n📄 ${desc}` : "",
  });

  for (const s of students as any[]) {
    const tgId = s.tg_user_id as number;
    try {
      if (opts.fileId && opts.fileType === "photo") {
        await sendPhoto({ chat_id: tgId, photo: opts.fileId, caption });
      } else if (opts.fileId && opts.fileType === "document") {
        await sendDocument({ chat_id: tgId, document: opts.fileId, caption });
      } else {
        await sendMessage({ chat_id: tgId, text: caption });
      }
    } catch (err) {
      await reportError({
        context: "homework/fanout",
        error: err,
        meta: { hwId: opts.hwId, tgId },
      });
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse "YYYY-MM-DD HH:MM" into a Date (local server time, then UTC).
 * Returns null on invalid input.
 */
function parseDue(raw: string): Date | null {
  // Accept "YYYY-MM-DD HH:MM" or "YYYY-MM-DDTHH:MM"
  const normalized = raw.replace("T", " ").trim();
  const match = normalized.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})$/);
  if (!match) return null;
  const d = new Date(`${match[1]}T${match[2]}:00`);
  return isNaN(d.getTime()) ? null : d;
}