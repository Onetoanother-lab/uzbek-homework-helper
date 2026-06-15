// src/lib/i18n/uz.session3.ts
// Additive strings for session-3 features.
// Merge into uz.ts or import alongside it.

export const uzSession3 = {

  // ── /pendingcount ────────────────────────────────────────────────────────────
  pendingCountHeader:
    "📋 Tekshirilmagan vazifalar:\n",
  pendingCountLine:
    "🏫 {group}: {count} ta",
  pendingCountEmpty:
    "✅ Hamma vazifalar tekshirilgan!",
  pendingCountTotal:
    "\n📊 Jami: {total} ta",

  // ── /missing ─────────────────────────────────────────────────────────────────
  missingUsage:
    "Foydalanish: /missing <vazifa_id>\nMasalan: /missing 5",
  missingHwNotFound:
    "#{id} raqamli uyga vazifa topilmadi.",
  missingHeader:
    "📭 #{id}: {title} — topshirmagan o'quvchilar ({group}):\n",
  missingLine:
    "👤 {name}",
  missingEmpty:
    "✅ Barcha o'quvchilar #{id} vazifani topshirdi!",
  missingCount:
    "\n\nJami: {count} ta o'quvchi topshirmagan.",

  // ── 48h parent alert ─────────────────────────────────────────────────────────
  missingParentAlert:
    "⚠️ Farzandingiz uyga vazifani topshirmadi!\n👤 {name}\n🏫 {group}\n📚 Vazifa: {title}\n⏰ Muddat: {due}\n\nIltimos, farzandingizni rag'batlantiring.",
  missingParentFollowup:
    "✅ Farzandingiz vazifani topshirdi.\n👤 {name}\n🏫 {group}\n📚 Vazifa: {title}",

  // ── /bulkgrade ───────────────────────────────────────────────────────────────
  bulkgradeUsage:
    "Foydalanish: /bulkgrade <SINF>\nMasalan: /bulkgrade 5A",
  bulkgradeGroupNotFound:
    "'{group}' sinfi topilmadi.",
  bulkgradeNoPending:
    "✅ {group} sinfi uchun tekshirilmagan vazifalar yo'q.",
  bulkgradeStart:
    "📚 {group} sinfi — {count} ta vazifa tekshirishni boshlayapmiz.\n\nHar bir vazifa uchun:\n• Bahoni tanlang → Izohlang\n• Yoki /skipsubmission — keyingisiga o'tish\n• /stopbulk — to'xtatish",
  bulkgradeCard:
    "📄 {current}/{total} — {group} sinfi\n👤 {name}\n📅 {date}\n\n🤖 AI taklifi: {aiGrade}\n{aiFeedback}\n\nBahoni tanlang:",
  bulkgradeSkipped:
    "⏭ O'tkazib yuborildi. Keyingisi:",
  bulkgradeGraded:
    "✅ Baholandi. Keyingisi:",
  bulkgradeDone:
    "🎉 Bajarildi!\n✅ Baholandi: {graded} ta\n⏭ O'tkazildi: {skipped} ta\n🏫 {group}",
  bulkgradeAlreadyActive:
    "Siz allaqachon {group} sinfi uchun sessiyada ishlayapsiz.\nDavom etish uchun hozirgi vazifaga baho bering, yoki /stopbulk bilan to'xtating.",
  bulkgradeStopped:
    "⏹ Bulk grading to'xtatildi.\n✅ Baholandi: {graded} ta\n⏭ O'tkazildi: {skipped} ta",
  bulkgradeAskFeedback:
    "Baho: {grade}\nIzohingizni yozing (reply sifatida yuboring):",
  bulkgradeNoSession:
    "Faol sessiya topilmadi. /bulkgrade <SINF> bilan boshlang.",
  bulkgradePendingGrade:
    "Avval joriy vazifaga izoh yuboring yoki /skipsubmission bilan o'ting.",

  // ── Session timeout warning ───────────────────────────────────────────────────
  bulkgradeTimeout:
    "⏰ Bulk grading sessiyasi 30 daqiqa faolsizlik sababli yopildi.\n✅ Baholandi: {graded} ta",

} as const;