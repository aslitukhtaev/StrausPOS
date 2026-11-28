/**
 * Delfin Sauna boti uchun jadvaldan o'qish (Google Apps Script). Jadvalga hech narsa YOZMAYDI.
 *
 * O'rnatish: jadval → Kengaytmalar (Extensions) → Apps Script → shu kodni qo'ying → KALIT ni almashtiring →
 * Deploy → New deployment → Web app → "Execute as: Me", "Who has access: Anyone" → havolani nusxalang.
 */
const KALIT = 'SHU_YERGA_MAXFIY_KALIT';

/** ?key=...&date=2026-11-29 → shu kunning QOLDI va TARQALADI (faqat musbatlari) yig'indisi */
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (KALIT === 'SHU_YERGA_MAXFIY_KALIT' || p.key !== KALIT) return javob({ ok: false, error: 'kalit' });
  const sana = String(p.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sana)) return javob({ ok: false, error: 'sana' });

  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName('Jurnal');
  if (!sh) return javob({ ok: false, error: 'Jurnal varagi topilmadi' });

  const tz = ss.getSpreadsheetTimeZone();
  const last = sh.getLastRow();
  const rows = last >= 5 ? sh.getRange(5, 1, last - 4, 16).getValues() : []; // A..P
  let qoldi = 0;
  let massaj = 0;
  rows.forEach(function (r) {
    const kun = r[15]; // P — Kun
    if (!(kun instanceof Date) || Utilities.formatDate(kun, tz, 'yyyy-MM-dd') !== sana) return;
    qoldi += Number(r[14]) || 0; // O — QOLDI
    const t = Number(r[13]) || 0; // N — TARQALADI
    if (t > 0) massaj += t;
  });
  return javob({ ok: true, date: sana, qoldi: qoldi, massaj: massaj });
}

function javob(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
