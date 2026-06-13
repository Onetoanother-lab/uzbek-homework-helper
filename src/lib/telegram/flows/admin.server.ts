import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getChatMember, sendMessage } from "@/lib/telegram/client.server";
import { uz, tpl } from "@/lib/i18n/uz";

export async function isAdmin(tgUserId: number): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("admins")
    .select("tg_user_id")
    .eq("tg_user_id", tgUserId)
    .maybeSingle();
  return !!data;
}

export async function handleClaimAdmin(chatId: number, tgUserId: number, arg: string) {
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

export async function handleBindParents(opts: {
  chat_id: number;
  chat_type: string;
  from_user_id: number;
  arg: string;
}) {
  if (opts.chat_type === "private") {
    await sendMessage({ chat_id: opts.chat_id, text: uz.bindParentsGroupOnly });
    return;
  }
  const groupName = opts.arg.trim();
  if (!groupName) {
    await sendMessage({ chat_id: opts.chat_id, text: uz.bindParentsUsage });
    return;
  }
  const admin = await isAdmin(opts.from_user_id);
  let allowed = admin;
  if (!allowed) {
    try {
      const member = await getChatMember({
        chat_id: opts.chat_id,
        user_id: opts.from_user_id,
      });
      allowed = member.status === "creator" || member.status === "administrator";
    } catch {
      allowed = false;
    }
  }
  if (!allowed) {
    await sendMessage({ chat_id: opts.chat_id, text: uz.bindParentsForbidden });
    return;
  }

  // Upsert by name.
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

export async function handleBindTeachers(opts: {
  chat_id: number;
  chat_type: string;
  from_user_id: number;
  arg: string;
}) {
  if (opts.chat_type === "private") {
    await sendMessage({ chat_id: opts.chat_id, text: uz.bindTeachersGroupOnly });
    return;
  }
  if (!(await isAdmin(opts.from_user_id))) {
    await sendMessage({ chat_id: opts.chat_id, text: uz.bindTeachersForbidden });
    return;
  }
  await supabaseAdmin.from("teachers_chats").upsert({
    chat_id: opts.chat_id,
    label: opts.arg.trim() || null,
  });
  await sendMessage({ chat_id: opts.chat_id, text: uz.bindTeachersOk });
}
