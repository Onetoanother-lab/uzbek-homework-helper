import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  handleStart,
  handleHelp,
  handleMyStatus,
  handlePrivateText,
  handlePickGroupCallback,
  handleSubmissionFile,
} from "@/lib/telegram/flows/student.server";
import {
  handleGradeCallback,
  handleTeacherFeedbackReply,
} from "@/lib/telegram/flows/teacher.server";
import {
  handleClaimAdmin,
  handleBindParents,
  handleBindTeachers,
} from "@/lib/telegram/flows/admin.server";

export async function dispatch(update: any): Promise<void> {
  if (typeof update?.update_id !== "number") return;

  // Idempotency: skip if we've already processed this update_id.
  const { error: dupErr } = await supabaseAdmin
    .from("processed_updates")
    .insert({ update_id: update.update_id });
  if (dupErr) {
    // Duplicate (unique violation) — skip.
    return;
  }

  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query);
    return;
  }

  const message = update.message ?? update.edited_message;
  if (!message) return;
  await handleMessage(message);
}

async function handleCallbackQuery(cq: any) {
  const data: string = cq.data ?? "";
  const chat_id: number = cq.message?.chat?.id;
  const message_id: number = cq.message?.message_id;
  const from_user_id: number = cq.from?.id;
  const from_name: string =
    [cq.from?.first_name, cq.from?.last_name].filter(Boolean).join(" ") ||
    cq.from?.username ||
    "—";

  if (data.startsWith("grade:")) {
    const [, idStr, grade] = data.split(":");
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

async function handleMessage(message: any) {
  const chat_id: number = message.chat?.id;
  const chat_type: string = message.chat?.type ?? "private";
  const from_user_id: number | undefined = message.from?.id;
  if (!chat_id || !from_user_id) return;

  // Photo / document in private chat → submission file.
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

  // Commands first.
  if (text.startsWith("/")) {
    const firstSpace = text.indexOf(" ");
    const head = (firstSpace === -1 ? text : text.slice(0, firstSpace)).toLowerCase();
    const arg = firstSpace === -1 ? "" : text.slice(firstSpace + 1).trim();
    // Strip bot username suffix from commands like "/start@MyBot".
    const cmd = head.split("@")[0];

    switch (cmd) {
      case "/start":
        if (chat_type === "private") await handleStart(chat_id, from_user_id);
        return;
      case "/help":
        await handleHelp(chat_id);
        return;
      case "/mystatus":
        if (chat_type === "private") await handleMyStatus(chat_id, from_user_id);
        return;
      case "/claimadmin":
        if (chat_type === "private") await handleClaimAdmin(chat_id, from_user_id, arg);
        return;
      case "/bindparents":
        await handleBindParents({ chat_id, chat_type, from_user_id, arg });
        return;
      case "/bindteachers":
        await handleBindTeachers({ chat_id, chat_type, from_user_id, arg });
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

  // Teacher feedback reply?
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

  // Private text → student conversation state machine.
  if (chat_type === "private") {
    await handlePrivateText(chat_id, from_user_id, text);
  }
}
