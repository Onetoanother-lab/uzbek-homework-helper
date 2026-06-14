// src/lib/telegram/router.server.ts
// Central dispatcher for all incoming Telegram updates.
// Session 2: added homework, reminders, disputes, parent, error reporting.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { reportError, withErrorReporting } from "@/lib/telegram/error-reporter.server";

// ── Session 1 flows ───────────────────────────────────────────────────────────
import {
  handleStart,
  handleHelp,
  handleMyStatus,
  handlePrivateText,
  handlePickGroupCallback,
  handleSubmissionFile,
  handleResubmitCommand,
} from "@/lib/telegram/flows/student.server";
import {
  handleGradeCallback,
  handleTeacherFeedbackReply,
  handleResend,
  handleHistory,
  handleEditReview,
} from "@/lib/telegram/flows/teacher.server";
import {
  handleClaimAdmin,
  handleBindParents,
  handleBindTeachers,
  handleStats,
  handleExport,
  handleGroupStats,
  handleStudentStats,
  isAdmin,
} from "@/lib/telegram/flows/admin.server";

// ── Session 2 flows ───────────────────────────────────────────────────────────
import {
  handleNewHomework,
  handleHomeworksList,
  handleHomeworkFileAttach,
} from "@/lib/telegram/flows/homework.server";
import {
  handleDispute,
  handleResolveDispute,
} from "@/lib/telegram/flows/dispute.server";
import {
  handleChildStatus,
  handleLinkParent,
  handleUnlinkParent,
} from "@/lib/telegram/flows/parent.server";

import { pruneOldEntries } from "@/lib/telegram/rate-limit.server";
import { sendMessage } from "@/lib/telegram/client.server";
import { uz } from "@/lib/i18n/uz";

// ─── Public entry point ───────────────────────────────────────────────────────

export async function dispatch(update: any): Promise<void> {
  return withErrorReporting(
    "dispatch",
    () => _dispatch(update),
    undefined,
    update?.update_id,
  );
}

async function _dispatch(update: any): Promise<void> {
  if (typeof update?.update_id !== "number") return;

  // Idempotency — skip already-processed updates
  const { error: dupErr } = await supabaseAdmin
    .from("processed_updates")
    .insert({ update_id: update.update_id });
  if (dupErr) return;

  // Probabilistic cleanup (5% of calls)
  if (Math.random() < 0.05) {
    pruneOldEntries().catch((e) =>
      reportError({ context: "rate-limit/prune", error: e }),
    );
  }

  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query).catch((e) =>
      reportError({ context: "callback_query", error: e, updateId: update.update_id }),
    );
    return;
  }

  const message = update.message ?? update.edited_message;
  if (!message) return;

  await handleMessage(message).catch((e) =>
    reportError({ context: "message", error: e, updateId: update.update_id }),
  );
}

// ─── Callback query routing ───────────────────────────────────────────────────

async function handleCallbackQuery(cq: any): Promise<void> {
  const data: string = cq.data ?? "";
  const chat_id: number = cq.message?.chat?.id;
  const message_id: number = cq.message?.message_id;
  const from_user_id: number = cq.from?.id;
  const from_name: string = buildName(cq.from);

  if (data.startsWith("grade:")) {
    const [, idStr, ...gradeParts] = data.split(":");
    const grade = gradeParts.join(":");
    const submission_id = Number(idStr);
    if (!Number.isFinite(submission_id) || !grade) return;

    await handleGradeCallback({
      callback_query_id: cq.id,
      chat_id,
      message_id,
      from_user_id,
      from_name,
      submission_id,
      grade,
    });
    return;
  }

  if (data.startsWith("pickgroup:")) {
    const groupName = data.slice("pickgroup:".length);
    await handlePickGroupCallback(chat_id, from_user_id, groupName);
    return;
  }
}

// ─── Message routing ──────────────────────────────────────────────────────────

async function handleMessage(message: any): Promise<void> {
  const chat_id: number = message.chat?.id;
  const chat_type: string = message.chat?.type ?? "private";
  const from_user_id: number | undefined = message.from?.id;
  if (!chat_id || !from_user_id) return;

  // ── Media handling ──
  const file = extractFile(message);

  if (file) {
    // Private chat → student submission or resubmit file
    if (chat_type === "private") {
      await handleSubmissionFile(chat_id, from_user_id, file, message.caption);
      return;
    }

    // Teacher group: check if this is a homework file attachment (reply)
    if (
      chat_type !== "private" &&
      message.reply_to_message?.message_id
    ) {
      const attached = await handleHomeworkFileAttach({
        chatId: chat_id,
        replyToMessageId: message.reply_to_message.message_id,
        file,
      });
      if (attached) return;
    }

    return; // ignore other media in groups
  }

  const text: string = message.text ?? "";
  if (!text) return;

  // ── Command dispatch ──
  if (text.startsWith("/")) {
    await dispatchCommand({
      chat_id,
      chat_type,
      from_user_id,
      from_name: buildName(message.from),
      text,
      reply_to_message_id: message.reply_to_message?.message_id,
    });
    return;
  }

  // ── Teacher feedback reply (non-command text, replying to a submission card) ──
  if (chat_type !== "private" && message.reply_to_message?.message_id) {
    const handled = await handleTeacherFeedbackReply({
      chat_id,
      reply_to_message_id: message.reply_to_message.message_id,
      from_user_id,
      from_name: buildName(message.from),
      text,
    });
    if (handled) return;
  }

  // ── Student free-text conversation ──
  if (chat_type === "private") {
    await handlePrivateText(chat_id, from_user_id, text);
  }
}

// ─── Command dispatch table ───────────────────────────────────────────────────

async function dispatchCommand(opts: {
  chat_id: number;
  chat_type: string;
  from_user_id: number;
  from_name: string;
  text: string;
  reply_to_message_id?: number;
}): Promise<void> {
  const { chat_id, chat_type, from_user_id, from_name, text } = opts;

  const firstSpace = text.indexOf(" ");
  const head = (firstSpace === -1 ? text : text.slice(0, firstSpace)).toLowerCase();
  const arg = firstSpace === -1 ? "" : text.slice(firstSpace + 1).trim();
  const cmd = head.split("@")[0]; // strip @BotUsername

  switch (cmd) {
    // ── Student ──────────────────────────────────────────────────────────────
    case "/start":
      if (chat_type === "private") await handleStart(chat_id, from_user_id);
      break;

    case "/help":
      await handleHelp(chat_id);
      break;

    case "/mystatus":
      if (chat_type === "private") await handleMyStatus(chat_id, from_user_id);
      break;

    case "/resubmit":
      if (chat_type === "private")
        await handleResubmitCommand(chat_id, from_user_id, arg);
      break;

    case "/dispute":
      if (chat_type === "private") await handleDispute(chat_id, from_user_id, arg);
      break;

    // ── Teacher ──────────────────────────────────────────────────────────────
    case "/resend":
      await handleResend(chat_id, arg);
      break;

    case "/history":
      await handleHistory(chat_id, arg);
      break;

    case "/editreview":
      await handleEditReview(chat_id, from_user_id, from_name, arg);
      break;

    case "/newhomework":
      await handleNewHomework(chat_id, from_user_id, arg);
      break;

    case "/homeworks":
      await handleHomeworksList(chat_id, arg);
      break;

    case "/resolvedispute":
      await handleResolveDispute(chat_id, from_user_id, arg);
      break;

    // ── Parent ───────────────────────────────────────────────────────────────
    case "/childstatus":
      if (chat_type === "private") await handleChildStatus(chat_id, from_user_id);
      break;

    // ── Admin ────────────────────────────────────────────────────────────────
    case "/claimadmin":
      if (chat_type === "private")
        await handleClaimAdmin(chat_id, from_user_id, arg);
      break;

    case "/bindparents":
      await handleBindParents({ chat_id, chat_type, from_user_id, arg });
      break;

    case "/bindteachers":
      await handleBindTeachers({ chat_id, chat_type, from_user_id, arg });
      break;

    case "/stats":
      await handleStats(chat_id);
      break;

    case "/export": {
      const admin = await isAdmin(from_user_id);
      if (!admin) {
        await sendMessage({ chat_id, text: uz.bindTeachersForbidden });
        break;
      }
      await handleExport(chat_id);
      break;
    }

    case "/groupstats":
      await handleGroupStats(chat_id, arg);
      break;

    case "/studentstats":
      await handleStudentStats(chat_id, arg);
      break;

    case "/linkparent":
      await handleLinkParent(chat_id, from_user_id, arg);
      break;

    case "/unlinkparent":
      await handleUnlinkParent(chat_id, from_user_id, arg);
      break;

    default:
      if (chat_type === "private") {
        await sendMessage({ chat_id, text: uz.unknownCmd });
      }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractFile(
  message: any,
): { file_id: string; file_type: "photo" | "document" } | null {
  if (message.photo && Array.isArray(message.photo) && message.photo.length > 0) {
    return {
      file_id: message.photo[message.photo.length - 1].file_id,
      file_type: "photo",
    };
  }
  if (message.document?.file_id) {
    return { file_id: message.document.file_id, file_type: "document" };
  }
  return null;
}

function buildName(from: any): string {
  return (
    [from?.first_name, from?.last_name].filter(Boolean).join(" ") ||
    from?.username ||
    "—"
  );
}