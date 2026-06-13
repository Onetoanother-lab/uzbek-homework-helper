// src/lib/telegram/router.server.ts
// Central dispatcher for all incoming Telegram updates.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
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
} from "@/lib/telegram/flows/admin.server";
import { isAdmin } from "@/lib/telegram/flows/admin.server";
import { pruneOldEntries } from "@/lib/telegram/rate-limit.server";

// ─── Main dispatch ───────────────────────────────────────────────────────────

export async function dispatch(update: any): Promise<void> {
  if (typeof update?.update_id !== "number") return;

  // Idempotency: skip duplicate update_ids
  const { error: dupErr } = await supabaseAdmin
    .from("processed_updates")
    .insert({ update_id: update.update_id });
  if (dupErr) return; // duplicate unique violation — skip

  // Periodically prune old rate-limit entries (1-in-20 chance per dispatch)
  if (Math.random() < 0.05) {
    pruneOldEntries().catch((e) =>
      console.error("[router] rate-limit prune failed:", e),
    );
  }

  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query);
    return;
  }

  const message = update.message ?? update.edited_message;
  if (!message) return;
  await handleMessage(message);
}

// ─── Callback query routing ───────────────────────────────────────────────────

async function handleCallbackQuery(cq: any): Promise<void> {
  const data: string = cq.data ?? "";
  const chat_id: number = cq.message?.chat?.id;
  const message_id: number = cq.message?.message_id;
  const from_user_id: number = cq.from?.id;
  const from_name: string =
    [cq.from?.first_name, cq.from?.last_name].filter(Boolean).join(" ") ||
    cq.from?.username ||
    "—";

  if (data.startsWith("grade:")) {
    // grade:<submission_id>:<grade>
    const [, idStr, ...gradeParts] = data.split(":");
    const grade = gradeParts.join(":"); // guard against colons in grade strings
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

  // ── Media in private chat → submission ──
  if (chat_type === "private") {
    if (message.photo && Array.isArray(message.photo) && message.photo.length > 0) {
      const largest = message.photo[message.photo.length - 1];
      await handleSubmissionFile(
        chat_id,
        from_user_id,
        { file_id: largest.file_id, file_type: "photo" },
        message.caption,
      );
      return;
    }
    if (message.document?.file_id) {
      await handleSubmissionFile(
        chat_id,
        from_user_id,
        { file_id: message.document.file_id, file_type: "document" },
        message.caption,
      );
      return;
    }
  }

  const text: string = message.text ?? "";
  if (!text) return;

  // ── Commands ──
  if (text.startsWith("/")) {
    const firstSpace = text.indexOf(" ");
    const head = (firstSpace === -1 ? text : text.slice(0, firstSpace)).toLowerCase();
    const arg = firstSpace === -1 ? "" : text.slice(firstSpace + 1).trim();
    const cmd = head.split("@")[0]; // strip @BotUsername suffix

    const from_name: string =
      [message.from?.first_name, message.from?.last_name].filter(Boolean).join(" ") ||
      message.from?.username ||
      "—";

    switch (cmd) {
      // ── Student commands ──
      case "/start":
        if (chat_type === "private") await handleStart(chat_id, from_user_id);
        return;

      case "/help":
        await handleHelp(chat_id);
        return;

      case "/mystatus":
        if (chat_type === "private") await handleMyStatus(chat_id, from_user_id);
        return;

      case "/resubmit":
        if (chat_type === "private") await handleResubmitCommand(chat_id, from_user_id, arg);
        return;

      // ── Teacher commands ──
      case "/resend":
        await handleResend(chat_id, arg);
        return;

      case "/history":
        await handleHistory(chat_id, arg);
        return;

      case "/editreview": {
        await handleEditReview(chat_id, from_user_id, from_name, arg);
        return;
      }

      // ── Admin commands ──
      case "/claimadmin":
        if (chat_type === "private") await handleClaimAdmin(chat_id, from_user_id, arg);
        return;

      case "/bindparents":
        await handleBindParents({ chat_id, chat_type, from_user_id, arg });
        return;

      case "/bindteachers":
        await handleBindTeachers({ chat_id, chat_type, from_user_id, arg });
        return;

      case "/stats": {
        // Available to admins in any chat, or to anyone in private for simplicity
        await handleStats(chat_id);
        return;
      }

      case "/export": {
        const admin = await isAdmin(from_user_id);
        if (!admin) {
          const { sendMessage } = await import("@/lib/telegram/client.server");
          const { uz } = await import("@/lib/i18n/uz");
          await sendMessage({ chat_id, text: uz.bindTeachersForbidden });
          return;
        }
        await handleExport(chat_id);
        return;
      }

      case "/groupstats":
        await handleGroupStats(chat_id, arg);
        return;

      case "/studentstats":
        await handleStudentStats(chat_id, arg);
        return;

      default:
        if (chat_type === "private") {
          const { sendMessage } = await import("@/lib/telegram/client.server");
          const { uz } = await import("@/lib/i18n/uz");
          await sendMessage({ chat_id, text: uz.unknownCmd });
        }
        return;
    }
  }

  // ── Teacher feedback reply (non-command text in a teacher group) ──
  if (chat_type !== "private" && message.reply_to_message?.message_id) {
    const from_name: string =
      [message.from?.first_name, message.from?.last_name].filter(Boolean).join(" ") ||
      message.from?.username ||
      "—";
    const handled = await handleTeacherFeedbackReply({
      chat_id,
      reply_to_message_id: message.reply_to_message.message_id,
      from_user_id,
      from_name,
      text,
    });
    if (handled) return;
  }

  // ── Student free-text conversation ──
  if (chat_type === "private") {
    await handlePrivateText(chat_id, from_user_id, text);
  }
}