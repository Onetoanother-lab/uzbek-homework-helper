// src/lib/i18n/uz.additions.ts
// Additive strings for session-2 features.
// Merge these into uz.ts (or import alongside it).

export const uzAdditions = {
  // ── /newhomework ────────────────────────────────────────────────────────────
  newHwUsage:
    "Foydalanish:\n/newhomework <SINF> | <SARLAVHA> | <MUDDAT>\n\nMuddat formati: YYYY-MM-DD HH:MM  (masalan: 2026-06-20 23:59)\nMisol:\n/newhomework 5A | Matematika: §12 mashqlar | 2026-06-20 23:59\n\nFayl qo'shish uchun ushbu xabarga rasm yoki hujjat sifatida javob bering.",
  newHwGroupNotFound:
    "'{group}' sinfi topilmadi. Avval /bindparents bilan sinfni ro'yxatdan o'tkazing.",
  newHwBadDate:
    "Muddat formati noto'g'ri. YYYY-MM-DD HH:MM shaklida kiriting (masalan: 2026-06-20 23:59).",
  newHwPastDate:
    "Muddat o'tib ketgan. Kelajakdagi sana kiriting.",
  newHwAskFile:
    "✅ Vazifa yaratildi (ID: #{id}).\nFayl qo'shish istasangiz, ushbu xabarga javob qilib yuboring. Aks holda tayyor.",
  newHwCreated:
    "✅ Yangi vazifa #{id} yaratildi va {group} sinfi o'quvchilariga yuborildi.",
  newHwStudentNotice:
    "📚 Yangi uyga vazifa!\n🏫 Sinf: {group}\n📝 {title}\n⏰ Muddat: {due}\n🆔 Vazifa #{id}\n\n{description}",
  newHwStudentNoDesc:   "",
  newHwList:
    "📚 {group} sinfi uchun faol vazifalar:\n\n{lines}",
  newHwListLine:
    "🆔 #{id} • {title}\n    ⏰ {due}{statusPart}",
  newHwListEmpty:
    "{group} sinfi uchun faol vazifalar yo'q.",
  newHwListUsage:
    "Foydalanish: /homeworks <SINF>  (masalan: /homeworks 5A)",

  // ── Deadline reminders ───────────────────────────────────────────────────────
  reminderDay:
    "⏰ Eslatma! Ertaga muddat tugaydi.\n📚 #{id}: {title}\n🏫 {group}\n⏰ {due}",
  reminderHour:
    "🔔 Oxirgi soat! Muddat 1 soatdan keyin tugaydi.\n📚 #{id}: {title}\n🏫 {group}\n⏰ {due}",

  // ── /dispute ────────────────────────────────────────────────────────────────
  disputeUsage:
    "Foydalanish: /dispute <ID> <sabab>\nMasalan: /dispute 42 Baho noto'g'ri, men to'g'ri bajardim",
  disputeNotFound:
    "#{id} raqamli vazifa topilmadi yoki u sizniki emas.",
  disputeNotReviewed:
    "Faqat tekshirilgan vazifalar uchun e'tiroz bildiriladi.",
  disputeAlreadyOpen:
    "Bu vazifa uchun allaqachon ochiq e'tiroz mavjud.",
  disputeCreated:
    "✅ E'tirozingiz qabul qilindi (ID: #{disputeId}).\nO'qituvchi ko'rib chiqadi va javob beradi.",
  disputeTeacherAlert:
    "⚠️ Yangi e'tiroz!\n👤 O'quvchi: {name} ({group})\n🆔 Vazifa #{subId}\n⭐ Baho: {grade}\n💬 Sabab: {reason}\n\nHal qilish uchun: /resolvedispute {disputeId} <qaror>",
  resolveUsage:
    "Foydalanish: /resolvedispute <ID> <qaror>\nMasalan: /resolvedispute 7 Baho o'zgartirildi",
  resolveNotFound:
    "#{id} raqamli e'tiroz topilmadi.",
  resolveAlreadyClosed:
    "Bu e'tiroz allaqachon yopilgan.",
  resolveOk:
    "✅ #{id} raqamli e'tiroz hal qilindi.",
  resolveStudentNotify:
    "📋 E'tirozingiz ko'rib chiqildi.\n🆔 Vazifa #{subId}\n💬 Qaror: {resolution}",

  // ── /childstatus (parent) ────────────────────────────────────────────────────
  childStatusNotLinked:
    "Sizning hisobingiz hech qanday o'quvchiga bog'lanmagan.\nAdministrator bilan bog'laning.",
  childStatusHeader:
    "👨‍👩‍👧 {name} ({group}) — so'nggi vazifalar:\n",
  childStatusLine:
    "🆔 #{id} • 📅 {date}\n    📊 {status}{gradePart}{feedbackPart}",
  childStatusEmpty:
    "Hali vazifalar yo'q.",
  childStatusFooter:
    "\n📊 Jami: {total} | ✅ {reviewed} | ⏳ {pending}",

  // ── /linkparent (admin) ──────────────────────────────────────────────────────
  linkParentUsage:
    "Foydalanish: /linkparent <parent_tg_id> <student_id>\nMasalan: /linkparent 123456789 uuid-here",
  linkParentStudentNotFound:
    "Student topilmadi: {studentId}",
  linkParentOk:
    "✅ Parent {parentId} → {studentName} ({group}) bog'landi.",
  linkParentAlready:
    "Bu bog'liq allaqachon mavjud.",
  unlinkParentUsage:
    "Foydalanish: /unlinkparent <parent_tg_id> <student_id>",
  unlinkParentOk:
    "✅ Bog'liq o'chirildi.",
  unlinkParentNotFound:
    "Bunday bog'liq topilmadi.",

  // ── Error alert (admin channel) ──────────────────────────────────────────────
  errorAlertHeader: "🚨 Bot xatosi",

  // ── Status labels (reuse from uz.ts) ────────────────────────────────────────
  statusPending:  "⏳ kutilmoqda",
  statusReviewed: "✅ tekshirildi",
} as const;