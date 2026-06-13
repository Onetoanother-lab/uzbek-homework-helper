// All Uzbek user-facing strings live here for easy editing.
export const uz = {
  start: "Assalomu alaykum! Vazifa yuborish uchun ismingiz va familiyangizni kiriting. (1/3)",
  askName: "Iltimos, ismingiz va familiyangizni kiriting. (1/3)",
  askGroup:
    "Rahmat, {name}! Endi sinfingizni tanlang yoki kiriting (masalan: 5A). (2/3)",
  groupNotFound:
    "Bunday sinf topilmadi. Iltimos, mavjud sinflardan birini tanlang yoki administrator bilan bog'laning.",
  askFile:
    "Ajoyib! Endi vazifa faylini yuboring — rasm yoki hujjat ko'rinishida. (3/3)",
  needFile: "Iltimos, vazifa faylini rasm yoki hujjat sifatida yuboring.",
  saved:
    "✅ Vazifangiz qabul qilindi.\nID: #{id}\nHolat: ⏳ kutilmoqda\nO'qituvchi tekshirgach, sizga xabar beriladi.",
  parentsNotify:
    "📢 Yangi vazifa!\n👤 O'quvchi: {name}\n🏫 Sinf: {group}\n🆔 #{id}\nHolat: kutilmoqda.",
  parentsResult:
    "📊 Vazifa tekshirildi\n👤 {name} ({group})\n🆔 #{id}\n⭐ Baho: {grade}\n💬 Izoh: {feedback}",
  studentResult:
    "📊 Vazifangiz tekshirildi.\n🆔 #{id}\n⭐ Baho: {grade}\n💬 Izoh: {feedback}",
  teacherCard:
    "🆕 Yangi vazifa #{id}\n👤 {name}\n🏫 {group}\n🕒 {time}\n\n🤖 AI taklifi: {aiGrade}\n{aiFeedback}\n\nBahoni tanlang:",
  teacherReviewed:
    "✅ Tekshirildi\n🆕 #{id} • 👤 {name} • 🏫 {group}\n⭐ Baho: {grade}\n👤 Tekshiruvchi: {reviewer}\n🕒 {time}\n💬 {feedback}",
  teacherChooseGrade: "Iltimos, bahoni tanlang.",
  teacherAskFeedback:
    "Baho tanlandi: {grade}\nEndi shu xabarga JAVOB qilib (reply) izohingizni yuboring.",
  teacherAlreadyReviewed: "Bu vazifa allaqachon tekshirilgan.",
  teacherNotAuthorized:
    "Bu chat o'qituvchilar uchun ro'yxatdan o'tkazilmagan.",
  feedbackSaved: "Izoh saqlandi. O'quvchi va ota-onalarga xabar yuborildi.",
  aiUnavailable: "AI taklifi hozircha mavjud emas.",
  help:
    "📋 Buyruqlar:\n/start — yangi vazifa yuborish\n/mystatus — oxirgi vazifalaringiz\n/help — yordam",
  myStatusEmpty: "Sizda hali vazifalar yo'q. /start orqali yuboring.",
  myStatusHeader: "📚 Sizning oxirgi vazifalaringiz:",
  myStatusLine: "🆔 #{id} • {date} • {status}{gradeLine}",
  statusPending: "⏳ kutilmoqda",
  statusReviewed: "✅ tekshirildi",
  unknownCmd:
    "Tushunmadim. /start — vazifa yuborish, /help — yordam.",
  bindParentsOk:
    "✅ Ushbu chat \"{group}\" sinfining ota-onalar guruhi sifatida ro'yxatdan o'tkazildi.",
  bindParentsUsage:
    "Foydalanish: /bindparents <SINF_NOMI> (guruh ichida yuboring).",
  bindParentsGroupOnly:
    "Bu buyruq faqat guruh ichida ishlaydi.",
  bindParentsForbidden:
    "Faqat administrator yoki guruh admini bu buyruqni bajara oladi.",
  bindTeachersOk:
    "✅ Ushbu chat o'qituvchilar chati sifatida ro'yxatdan o'tkazildi.",
  bindTeachersForbidden: "Faqat administrator bu buyruqni bajara oladi.",
  bindTeachersGroupOnly: "Bu buyruq faqat guruh ichida ishlaydi.",
  claimAdminBadToken: "Notog'ri token.",
  claimAdminOk: "✅ Siz administrator sifatida belgilandingiz.",
  claimAdminAlready: "Siz allaqachon administratorsiz.",
  claimAdminUsage: "Foydalanish: /claimadmin <token>",
  noParentsBinding:
    "⚠️ Eslatma: {group} sinfi uchun ota-onalar guruhi ro'yxatdan o'tkazilmagan.",
  errorGeneric: "Xatolik yuz berdi. Iltimos, keyinroq qayta urinib ko'ring.",
} as const;

export const GRADES = ["A'lo", "Yaxshi", "Qoniqarli", "Qayta ishlash"] as const;
export type Grade = (typeof GRADES)[number];

export function tpl(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) =>
    vars[k] !== undefined ? String(vars[k]) : `{${k}}`,
  );
}
