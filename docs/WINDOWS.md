# StrausPOS — Windows'da o'rnatish va ishlatish

StrausPOS **Electron 22.3.27** (Chromium 108, Node 16.17) asosida qurilgan. Bu Windows 7/8/8.1 ni rasman
qo'llab-quvvatlaydigan **oxirgi** Electron versiyasi (Electron 23 dan boshlab Windows 7/8 olib tashlangan).
Shu sababli Electron versiyasi ko'tarilmaydi.

## Qo'llab-quvvatlanadigan Windows versiyalari

| Windows | Holat | Eslatma |
|---|---|---|
| Windows 10 / 11 (x64) | ✅ To'liq | Tavsiya etiladi |
| Windows 10 (32-bit) | ✅ To'liq | `ia32` o'rnatuvchi |
| Windows 8.1 (32/64-bit) | ✅ Ishlaydi | Barcha Windows Update yangilanishlari o'rnatilgan bo'lsin |
| Windows 8 | ⚠️ Ishlashi kerak | Iloji bo'lsa 8.1 ga yangilang |
| Windows 7 **SP1** (32/64-bit) | ⚠️ Ishlaydi, shartlar bilan | Pastdagi "Windows 7 talablari"ga qarang |
| Windows 7 SP1 siz, Vista, XP | ❌ Ishlamaydi | Chromium 108 ular uchun qurilmagan |

**Apparat minimumi:** 2 yadroli protsessor (SSE3), 2 GB RAM (4 GB tavsiya), 300 MB bo'sh joy, ekran ≥ 1366×768.

### Windows 7 talablari
1. **Service Pack 1** o'rnatilgan bo'lishi shart (`winver` → "Service Pack 1").
2. Windows Update orqali barcha muhim yangilanishlar. Eng muhimlari (topilmasa Microsoft Update Catalog'dan qo'lda):
   - **KB2533623** — xavfsiz DLL yuklash (Chromium talab qiladi);
   - **KB2999226** — Universal C Runtime;
   - **KB4474419** va **KB4490628** — SHA-2 imzolarini tekshirish (imzolangan o'rnatuvchilar uchun).
3. Agar ilova oq/qora oyna bilan ochilsa yoki darhol yopilsa — videokarta drayverini yangilang. Bu yordam bermasa,
   yorliq xususiyatlarida "Объект/Target" oxiriga `--disable-gpu` qo'shing.
4. Eslatma: Microsoft Windows 7/8.1 ni endi yangilamaydi — bu kompyuterlarni internetga ochiq qoldirmang.
   StrausPOS internetsiz ishlaydi, unga internet umuman kerak emas.

## 32-bit yoki 64-bit?
`Win + Pause` (yoki "Kompyuter → Xususiyatlar") → **Tizim turi**:
- "64-разрядная / 64-bit" → `StrausPOS-Setup-<versiya>-x64.exe`
- "32-разрядная / 32-bit" → `StrausPOS-Setup-<versiya>-ia32.exe`
- Bilmasangiz → `StrausPOS-Setup-<versiya>.exe` (universal: o'zi to'g'ri variantni tanlaydi, hajmi kattaroq).

32-bit tizimda 2–3 GB RAM bo'lsa ham ishlaydi, lekin boshqa og'ir dasturlarni yopib qo'ying.

## O'rnatish
1. O'rnatuvchini ishga tushiring. Kod imzosi bo'lmagani uchun **SmartScreen** "Windows protected your PC" deyishi mumkin →
   **More info → Run anyway** ("Подробнее → Выполнить в любом случае").
2. O'rnatish joyini tanlang (standart: `%LOCALAPPDATA%\Programs\StrausPOS`, administrator huquqi kerak emas).
   Hamma foydalanuvchilar uchun `C:\Program Files` ni tanlasangiz, Windows administrator parolini so'raydi.
3. Ish stolida va Pusk menyusida **StrausPOS** yorlig'i paydo bo'ladi.
4. Birinchi ishga tushirishda: biznes nomi, ega ismi va PIN kod kiritiladi.

Antivirus (ayniqsa eski Kaspersky/ESET/360) o'rnatuvchini to'xtatsa — StrausPOS papkasini istisnolarga qo'shing.

## Ma'lumotlar qayerda saqlanadi
- Baza: **`%APPDATA%\StrausPOS\straus.db`** (masalan `C:\Users\<foydalanuvchi>\AppData\Roaming\StrausPOS\straus.db`).
  Explorer manzil satriga `%APPDATA%\StrausPOS` yozib oching.
- Har bir o'zgarishdan keyin baza atomik yoziladi (vaqtinchalik fayl → almashtirish), elektr o'chsa ham buzilmaydi.
- Tiklashdan oldingi avtomatik nusxalar: `%APPDATA%\StrausPOS\backups\`.
- Dasturni o'chirib tashlash (uninstall) ma'lumotlarni **o'chirmaydi**. Qayta o'rnatsangiz, hammasi joyida qoladi.

## Zaxira (backup)
- **Sozlamalar → Zaxira → Nusxa olish**: `.db` faylni flesh-diskka yoki boshqa diskka saqlang.
  Tavsiya: har kuni yopilishda yoki kamida haftada bir marta, flesh-diskka.
- **Tiklash**: Sozlamalar → Zaxira → Tiklash → `.db` faylni tanlang. Joriy holat oldin `backups\` ga saqlanadi.
- Qo'lda: dastur yopiq paytda `%APPDATA%\StrausPOS\straus.db` faylini nusxalash ham to'g'ri zaxira.
- Yangi kompyuterga ko'chirish: StrausPOS ni o'rnating → bir marta ochib yoping → `straus.db` ni
  `%APPDATA%\StrausPOS\` ga almashtiring (yoki dastur ichidan "Tiklash").

## Chek printeri (58/80 mm termal)
1. Printer drayverini ishlab chiqaruvchi saytidan o'rnating (XPrinter, Rongta, HPRT, Epson TM va h.k.).
   Windows 7 uchun drayverning Windows 7 versiyasini oling. Drayversiz "Generic / Text Only" printer **ishlamaydi**.
2. Windows "Устройства и принтеры" da printerdan **sinov sahifasi** chiqaring.
3. Drayver xususiyatlarida qog'oz o'lchamini tekshiring: 80 mm (72 mm bosiladigan) yoki 58 mm (48 mm).
   Ko'p drayverlarda "Paper: 80(72) x 3276 mm" yoki shunga o'xshash rulon o'lchami bor — shuni tanlang.
4. StrausPOS: **Sozlamalar → Chek** → Printer ro'yxatidan printerni tanlang va qog'oz kengligini (58/80) belgilang.
   Printer tanlanmasa — Windows'dagi **standart printer** ishlatiladi.
5. "Chek namunasi"ni chop etib tekshiring. Chek jim (dialog oynasisiz) chop etiladi.

### Printer muammolari
| Xabar | Sabab / yechim |
|---|---|
| "Kompyuterda printer topilmadi" | Drayver o'rnatilmagan yoki printer o'chirilgan. Drayverni o'rnating. |
| "… printeri topilmadi" | Printer nomi o'zgargan (USB port almashgan). Sozlamalar → Chek da qayta tanlang. |
| "Standart printer tanlanmagan" | Sozlamalarda printerni aniq tanlang. |
| "Printer javob bermadi (vaqt tugadi)" | Printer band/qog'oz tugagan/oflayn. Windows chop etish navbatini tozalang. |
| Chek kesilgan yoki juda kichik | Drayverda qog'oz o'lchami noto'g'ri, yoki 58/80 sozlamasi mos emas. |
| Chek o'rniga A4 varaq chiqadi | Oddiy ofis printeri standart bo'lib qolgan. Chek printerini tanlang. |

## Boshqa muammolar
- **Dastur ochilmaydi / oq ekran**: videokarta drayverini yangilang; yorliqqa `--disable-gpu` qo'shing.
- **"StrausPOS ishga tushmadi" + "sql-wasm.wasm topilmadi"**: o'rnatish buzilgan (ko'pincha antivirus fayl o'chirgan).
  Antivirusga istisno qo'shib, qayta o'rnating — ma'lumotlar saqlanib qoladi.
- **Ikkinchi nusxa ochilmaydi**: bu atayin — bir vaqtda faqat bitta oyna ishlaydi (baza buzilmasligi uchun).
- **Vaqt noto'g'ri hisoblanmoqda**: Windows soati va vaqt mintaqasini tekshiring (BIOS batareyasi eskirgan bo'lishi mumkin).
- **Shrift juda katta/kichik**: Windows "Масштаб" (DPI) 100–125% bo'lsin; minimal ekran 1366×768.

## Qurish (dasturchilar uchun)
- Windows'da: `npm ci && npm run dist` → `release\` da 3 ta o'rnatuvchi (universal, x64, ia32).
- Faqat bittasi: `npm run dist:x64` yoki `npm run dist:ia32`. Papka (o'rnatuvchisiz): `npm run dist:dir`.
- Linux'da `release/win-unpacked` qurish mumkin, lekin NSIS o'rnatuvchini yakunlash uchun `wine` kerak —
  shuning uchun o'rnatuvchilar GitHub Actions'da (`.github/workflows/build-windows.yml`, windows-latest) quriladi.
- Ikonka: `python3 scripts/make-icon.py` → `build/icon.ico` (16–256 px).
- Kod imzosi hozircha yo'q. Sertifikat olinsa `CSC_LINK` va `CSC_KEY_PASSWORD` orqali beriladi (SHA-256 imzo
  Windows 7 da KB4474419 ni talab qiladi).
