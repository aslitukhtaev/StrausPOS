/**
 * Telefon raqamini qarzdorlarni solishtirish uchun normallashtirish (toza funksiya; migratsiya va PosService umumiy).
 *  - faqat raqamlar qoldiriladi ("+998 (90) 123-45-67" → "998901234567");
 *  - O'zbekiston mahalliy 9 xonali raqami ("90 123 45 67") → "998" bilan to'ldiriladi;
 *  - raqam yo'q bo'lsa null (bunday qarzdorlar telefon bo'yicha birlashtirilmaydi).
 */
export function normalizePhone(phone: unknown): string | null {
  if (typeof phone !== 'string') return null
  const digits = phone.replace(/\D/g, '')
  if (!digits) return null
  if (digits.length === 9) return '998' + digits
  return digits
}
