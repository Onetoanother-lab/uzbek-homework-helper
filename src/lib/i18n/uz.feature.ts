// src/lib/i18n/uz.feature.ts
// Strings for homework-link, /myhomeworks, /reportcard, /teacherstats.

export const uzFeature = {
  // Student homework picker (during submission)
  askHomework:
    "📚 Qaysi uy vazifasi uchun yuboryapsiz? Pastdagi ro'yxatdan tanlang.",
  askHomeworkNone: "🗂 Boshqa / umumiy",
  pickedHomework:
    "Tanlandi: 📚 #{id} — {title}\nEndi faylni yuboring.",
  pickedHomeworkNone:
    "Vazifaga bog'lanmagan yuborish. Endi faylni yuboring.",

  // /myhomeworks (student)
  myHwEmpty:
    "Sizda hozircha faol uy vazifalari yo'q. ✨",
  myHwHeader:
    "📚 Sizning faol uy vazifalaringiz:",
  myHwLine:
    "🆔 #{id} • {title}\n    ⏰ Muddat: {due}{statusPart}",
  myHwSubmitted: " • ✅ yuborildi",
  myHwOverdue:   " • ⚠️ muddat o'tdi",
  myHwNotStudent:
    "Avval /start orqali ro'yxatdan o'ting.",

  // /reportcard <group>
  reportCardUsage:
    "Foydalanish: /reportcard <SINF>  (masalan: /reportcard 5A)",
  reportCardNoGroup:
    "'{group}' sinfi topilmadi.",
  reportCardEmpty:
    "{group} sinfi uchun ma'lumot yo'q.",
  reportCardHeader:
    "📋 {group} sinf jurnal\nUy vazifalari (eng so'nggi {n} ta):",

  // /teacherstats
  teacherStatsEmpty:
    "Siz hali biror vazifani tekshirmagansiz.",
  teacherStatsHeader:
    "📊 Sizning tekshiruv statistikangiz (oxirgi 7 kun):",
  teacherStatsBody:
    "✅ Tekshirilganlar: {weekCount}\n📈 Jami (umumiy): {totalCount}\n⏱ O'rtacha javob vaqti: {avgHours} soat\n\n⭐ Baholar taqsimoti:\n{dist}",
} as const;
