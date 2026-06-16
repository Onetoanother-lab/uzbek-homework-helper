// src/lib/i18n/uz.ts
// All Uzbek user-facing strings — single source of truth.

export const uz = {
  // ── Onboarding ──────────────────────────────────────────────────────────────
  start:   "Assalomu alaykum! Vazifa yuborish uchun ismingiz va familiyangizni kiriting. (1/3 qadam)",
  askName: "Iltimos, ismingiz va familiyangizni kiriting. (1/3 qadam)",
  askGroup:
    "Rahmat, {name}! Endi sinfingizni tanlang yoki kiriting (masalan: 5A). (2/3 qadam)",
  groupNotFound:
    "Bunday sinf topilmadi. Iltimos, mavjud sinflardan birini tanlang yoki administrator bilan bog'laning.",
  askFile:
    "Ajoyib! Endi vazifa faylini yuboring — rasm yoki hujjat ko'rinishida. (3/3 qadam)",
  needFile: "Iltimos, vazifa faylini rasm yoki hujjat sifatida yuboring.",

  // ── Submission saved ────────────────────────────────────────────────────────
  saved:
    "✅ Vazifangiz qabul qilindi.\n🆔 ID: #{id}\n📊 Holat: ⏳ kutilmoqda\n\nO'qituvchi tekshirgach, sizga xabar beriladi.",

  // ── Rate limiting ────────────────────────────────────────────────────────────
  rateLimitExceeded:
    "⚠️ Siz oxirgi 10 daqiqada juda ko'p vazifa yubordingiz.\nIltimos, {minutes} daqiqadan so'ng qayta urinib ko'ring.",

  // ── Notifications ────────────────────────────────────────────────────────────
  parentsNotify:
    "📢 Yangi vazifa!\n👤 O'quvchi: {name}\n🏫 Sinf: {group}\n🆔 #{id}\n📊 Holat: kutilmoqda.",
  parentsResult:
    "📊 Vazifa tekshirildi\n👤 {name} ({group})\n🆔 #{id}\n⭐ Baho: {grade}\n💬 Izoh: {feedback}",
  parentsEditResult:
    "📝 Vazifa baholari yangilandi\n👤 {name} ({group})\n🆔 #{id}\n⭐ Yangi baho: {grade}\n💬 Yangi izoh: {feedback}",
  studentResult:
    "📊 Vazifangiz tekshirildi.\n🆔 #{id}\n⭐ Baho: {grade}\n💬 Izoh: {feedback}",
  studentEditNotify:
    "📝 Vazifangiz baholari yangilandi.\n🆔 #{id}\n⭐ Yangi baho: {grade}\n💬 Yangi izoh: {feedback}",

  // ── Teacher cards ────────────────────────────────────────────────────────────
  teacherCard:
    "🆕 Yangi vazifa #{id}\n👤 {name}\n🏫 {group}\n🕒 {time}\n\n🤖 AI taklifi: {aiGrade}\n{aiFeedback}\n\nBahoni tanlang:",
  teacherCardResubmit:
    "🔄 Vazifa qayta yuborildi #{id}\n👤 {name}\n🏫 {group}\n🕒 {time}\n\n🤖 AI taklifi: {aiGrade}\n{aiFeedback}\n\nBahoni tanlang:",
  teacherReviewed:
    "✅ Tekshirildi\n🆕 #{id} • 👤 {name} • 🏫 {group}\n⭐ Baho: {grade}\n👤 Tekshiruvchi: {reviewer}\n🕒 {time}\n💬 {feedback}",
  teacherReviewEdited:
    "✏️ Baho tahrirlandi\n🆕 #{id} • 👤 {name} • 🏫 {group}\n⭐ Baho: {grade}\n👤 Tahrir: {reviewer}\n🕒 {time}\n💬 {feedback}",
  teacherChooseGrade:     "Iltimos, bahoni tanlang.",
  teacherAskFeedback:
    "Baho tanlandi: {grade}\nEndi shu xabarga JAVOB qilib (reply) izohingizni yuboring.",
  teacherAlreadyReviewed: "Bu vazifa allaqachon tekshirilgan.",
  teacherNotAuthorized:
    "Bu chat o'qituvchilar uchun ro'yxatdan o'tkazilmagan.",
  feedbackSaved: "✅ Izoh saqlandi. O'quvchi va ota-onalarga xabar yuborildi.",

  // ── Resend ───────────────────────────────────────────────────────────────────
  resendUsage:       "Foydalanish: /resend <ID>  (masalan: /resend 42)",
  resendNotFound:    "#{id} raqamli vazifa topilmadi.",
  resendNoFile:      "#{id} raqamli vazifaning fayli endi mavjud emas (Telegram o'chirib yuborgan bo'lishi mumkin).",
  resendCaption:
    "📎 Qayta yuborildi\n🆔 #{id}\n👤 {name}\n🏫 {group}\n📊 Holat: {status}\n⭐ Baho: {grade}",

  // ── History ──────────────────────────────────────────────────────────────────
  historyUsage:
    "Foydalanish: /history [sinf|holat|ism]\nMasalan: /history 5A • /history pending • /history jasur",
  historyEmpty:   "Hech qanday vazifa topilmadi.",
  historyHeader:  "📚 Topilgan vazifalar ({count} ta):",
  historyLine:
    "🆔 #{id} | 👤 {name} | 🏫 {group} | 📊 {status}{gradePart}\n    📅 {date}",
  historyMore:    "\n… va yana {n} ta. Filtrlash uchun /history <sinf/holat/ism> ishlating.",

  // ── Edit review ──────────────────────────────────────────────────────────────
  editReviewUsage:
    "Foydalanish: /editreview <ID> <baho> | <izoh>\nMasalan: /editreview 42 Yaxshi | Yaxshi harakat",
  editReviewInvalidGrade:
    "Noto'g'ri baho. Mumkin bo'lgan baholar: A'lo, Yaxshi, Qoniqarli, Qayta ishlash",
  editReviewNotFound:     "#{id} raqamli vazifa topilmadi.",
  editReviewNotReviewed:  "Bu vazifa hali tekshirilmagan. Faqat tekshirilgan vazifalarni tahrirlash mumkin.",
  editReviewSaved:        "✅ #{id} raqamli vazifaning baholari yangilandi.",

  // ── Resubmit (student) ───────────────────────────────────────────────────────
  resubmitUsage:        "Foydalanish: /resubmit <ID>  (masalan: /resubmit 42)",
  resubmitNotFound:     "#{id} raqamli vazifa topilmadi yoki u sizniki emas.",
  resubmitAlreadyDone:  "#{id} raqamli vazifa allaqachon tekshirilgan. Uni qayta yuborib bo'lmaydi.",
  resubmitAskFile:
    "#{id} raqamli vazifani yangilamoqchisiz.\nYangi faylni yuboring (rasm yoki hujjat).",
  resubmitDone:
    "✅ #{id} raqamli vazifangiz yangilandi.\nO'qituvchiga xabar yuborildi.",
  resubmitTeacherNotify:
    "🔄 O'quvchi vazifani yangiladi!\n👤 {name}\n🏫 {group}\n🆔 #{id}",

  // ── My status (improved) ─────────────────────────────────────────────────────
  myStatusEmpty:  "Sizda hali vazifalar yo'q. /start orqali yuboring.",
  myStatusHeader: "📚 Sizning so'nggi vazifalaringiz:",
  myStatusLine:
    "🆔 #{id} • 📅 {date}\n📊 {status}{gradePart}{feedbackPart}",
  myStatusMore:   "\n… va yana {n} ta eski vazifa.",

  // ── Stats (admin) ────────────────────────────────────────────────────────────
  statsHeader: "📊 Tizim statistikasi\n",
  statsLine:
    "📥 Jami: {total}\n⏳ Kutilmoqda: {pending}\n✅ Tekshirildi: {reviewed}\n📈 Tekshirish darajasi: {rate}%\n🏫 Guruhlar: {groups}\n👥 Faol o'quvchilar: {students}",

  // ── Export (admin) ────────────────────────────────────────────────────────────
  exportGenerating: "📤 CSV fayl tayyorlanmoqda…",
  exportEmpty:      "Eksport uchun ma'lumot topilmadi.",
  exportFilename:   "submissions_{date}.csv",

  // ── Group / student stats ────────────────────────────────────────────────────
  groupStatsUsage:   "Foydalanish: /groupstats <SINF_NOMI>  (masalan: /groupstats 5A)",
  groupStatsHeader:  "📊 {group} sinfi statistikasi\n",
  groupStatsBody:
    "👥 O'quvchilar: {students}\n📥 Jami vazifalar: {total}\n✅ Tekshirildi: {reviewed}\n⏳ Kutilmoqda: {pending}\n⭐ O'rtacha baho: {avg}",
  groupStatsEmpty:   "{group} sinfi uchun ma'lumot topilmadi.",
  studentStatsUsage: "Foydalanish: /studentstats <ISM>  (masalan: /studentstats jasur)",
  studentStatsHeader:"📊 {name} ({group}) statistikasi\n",
  studentStatsBody:
    "📥 Jami vazifalar: {total}\n✅ Tekshirildi: {reviewed}\n⏳ Kutilmoqda: {pending}\n⭐ O'rtacha baho: {avg}",
  studentStatsEmpty: "'{query}' bo'yicha o'quvchi topilmadi.",
  studentStatsMultiple:
    "Bir nechta o'quvchi topildi:\n{names}\nIltimos, to'liq ism kiriting.",

  // ── Weekly report ────────────────────────────────────────────────────────────
  weeklyReportHeader:
    "📅 Haftalik hisobot ({week})\n🏫 Sinf: {group}\n",
  weeklyReportBody:
    "📥 Jami vazifalar: {total}\n✅ Tekshirildi: {reviewed}\n⏳ Kutilmoqda: {pending}\n⭐ O'rtacha baho: {avg}",
  weeklyReportEmpty: "Bu hafta {group} sinfidan vazifa kelmadi.",

  // ── Bind commands ────────────────────────────────────────────────────────────
  bindParentsOk:
    "✅ Ushbu chat \"{group}\" sinfining ota-onalar guruhi sifatida ro'yxatdan o'tkazildi.",
  bindParentsUsage:
    "Foydalanish: /bindparents <SINF_NOMI> (guruh ichida yuboring).",
  bindParentsGroupOnly:
    "Bu buyruq faqat guruh ichida ishlaydi. Botni ota-onalar Telegram guruhiga qo'shing va o'sha guruhda /bindparents <SINF_NOMI> yuboring.",
  bindParentsForbidden:
    "Faqat administrator yoki guruh admini bu buyruqni bajara oladi.",
  bindTeachersOk:
    "✅ Ushbu chat o'qituvchilar chati sifatida ro'yxatdan o'tkazildi.",
  bindTeachersForbidden: "Faqat administrator yoki guruh admini bu buyruqni bajara oladi.",
  bindTeachersGroupOnly: "Bu buyruq faqat guruh ichida ishlaydi. Botni o'qituvchilar Telegram guruhiga qo'shing va o'sha guruhda /bindteachers yuboring.",

  // ── Admin auth ───────────────────────────────────────────────────────────────
  claimAdminBadToken: "Notog'ri token.",
  claimAdminOk:       "✅ Siz administrator sifatida belgilandingiz.",
  claimAdminAlready:  "Siz allaqachon administratorsiz.",
  claimAdminUsage:    "Foydalanish: /claimadmin <token>",

  // ── Misc ─────────────────────────────────────────────────────────────────────
  noParentsBinding:
    "⚠️ Eslatma: {group} sinfi uchun ota-onalar guruhi ro'yxatdan o'tkazilmagan.",
  errorGeneric:   "Xatolik yuz berdi. Iltimos, keyinroq qayta urinib ko'ring.",
  aiUnavailable:  "AI taklifi hozircha mavjud emas.",
  help:
    "📋 Buyruqlar:\n/start — yangi vazifa yuborish\n/myhomeworks — faol uy vazifalarim\n/resubmit <ID> — vazifani yangilash\n/mystatus — oxirgi vazifalaringiz\n/help — yordam",
  unknownCmd:
    "Tushunmadim. /start — vazifa yuborish, /help — yordam.",

  // ── Status labels ─────────────────────────────────────────────────────────────
  statusPending:  "⏳ kutilmoqda",
  statusReviewed: "✅ tekshirildi",
} as const;

export const GRADES = ["A'lo", "Yaxshi", "Qoniqarli", "Qayta ishlash"] as const;
export type Grade = (typeof GRADES)[number];

/** Grade → numeric weight for averaging */
export const GRADE_WEIGHTS: Record<Grade, number> = {
  "A'lo":          4,
  "Yaxshi":        3,
  "Qoniqarli":     2,
  "Qayta ishlash": 1,
};

/** Numeric average → nearest grade label */
export function weightToGrade(avg: number): Grade {
  if (avg >= 3.5) return "A'lo";
  if (avg >= 2.5) return "Yaxshi";
  if (avg >= 1.5) return "Qoniqarli";
  return "Qayta ishlash";
}

/** Simple template interpolation: {key} → value */
export function tpl(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) =>
    vars[k] !== undefined ? String(vars[k]) : `{${k}}`,
  );
}

/** Format a date string or Date into a localised date */
export function fmtDate(d: string | Date): string {
  return new Date(d).toLocaleDateString("uz-UZ");
}

/** Format a date string or Date into a localised date-time */
export function fmtDateTime(d: string | Date): string {
  return new Date(d).toLocaleString("uz-UZ");
}