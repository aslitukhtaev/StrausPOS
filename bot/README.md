# Delfin Sauna — Telegram bot (oddiy PHP, cron)

Bot serverda (hosting) ishlaydi. Kassa dasturi o'zi serverga ma'lumot yuboradi, bot esa Telegramda javob beradi va
**smena yopilganda hisobotni o'zi yuboradi**. Dastur ichidagi hech narsa serverdan ochilmaydi — faqat dastur → server yo'nalishida.

## Nima ko'rsatadi
- 📊 **Joriy smena** — kim ochgan, jami tushum, naqd/Click/terminal/qarz, chegirma, xarajat, **kassada bo'lishi kerak naqd**
- 🕒 **Smenalar** — oxirgi 4 ta smena (kassir, vaqt, tushum, topshirilishi kerak pul)
- 🚪 **Xonalar** — qaysi xona ochiq, necha kishi, qancha vaqt, hisob, ofitsiant
- 🍺 **Ostatka** — bar qoldig'i (kam qolganlar birinchi)
- 📈 **Bugun** — kunlik hisobot: Naqd (kassadagi bugungi naqd to'lovlar + jadvaldagi QOLDI), Click va Terminal (hozircha «-»),
  Massaj (jadvaldagi tarqatiladigan), Ilhom, Uborka, Prachka. Jadvalni ulash: `sheets/hisobot.gs` boshidagi ko'rsatma,
  keyin `config.php` da `sheet_url` va `sheet_key`.
- Smena **ochilganda va yopilganda** avtomatik xabar: kassir ismi, vaqt, tushum, kassada bo'lishi kerak naqd, topshirilishi kerak pul

## O'rnatish (5 qadam)
1. **Papkani yuklang.** `bot/` papkasini hostingga yuklang (masalan `https://sizning-sayt.uz/bot/`). Kerakli: PHP 7.2+, ixtiyoriy curl.
2. **Sozlama.** `config.example.php` ni `config.php` deb nusxalang va to'ldiring:
   - `token` — @BotFather bergan bot tokeni
   - `secret` — uzun tasodifiy kalit (`php -r "echo bin2hex(random_bytes(24));"`)
   - `pair_code` — botga ulanish kodi (6 raqam)
3. **Cron** (har daqiqada). Hosting panelidagi Cron Jobs ga:
   ```
   * * * * * php /to'liq/yo'l/bot/cron.php >/dev/null 2>&1
   ```
   CLI mavjud bo'lmasa — `https://sizning-sayt.uz/bot/cron.php?key=KALIT` ni har daqiqada chaqiring
   (`config.php` da `cron_key` ni to'ldiring).
4. **Kassa dasturida:** Sozlamalar → **Telegram bot** → server manzili `https://sizning-sayt.uz/bot/receive.php`,
   maxfiy kalit (config.php dagi `secret` bilan bir xil) → «Saqlash» → «Tekshirish». «Aloqa yaxshi» chiqishi kerak.
5. **Botga ulaning.** Telegramda botni oching, `/start` bosing va `pair_code` dagi kodni yuboring.
   Xohlagancha odam (ega, boshqaruvchi) shu kod bilan ulanadi. Chiqish: `/chiqish`. Kodni almashtirsangiz yangi odamlar yangi kod bilan ulanadi.

## Xavfsizlik
- `config.php` va `data/` ga veb orqali kirish `.htaccess` bilan yopilgan (Apache). Nginx bo'lsa shu papkalarni `location` bilan yoping
  yoki `data_dir` ni veb-ildizdan tashqariga ko'chiring.
- Tokenni hech kimga bermang, GitHub'ga yuklamang (`config.php` .gitignore da). Token oshkor bo'lsa @BotFather → `/revoke`.
- Dastur serverga **faqat HTTPS** orqali yuborsin (maxfiy kalit sarlavhada ketadi).
- Ma'lumot kechikishi: dastur har daqiqada yuboradi. Dastur o'chiq/internetsiz bo'lsa, bot «ma'lumot N daqiqa oldingi» deb ogohlantiradi,
  smena xabarlari esa aloqa tiklangach yetkaziladi.

## Tekshirish (internetsiz)
`php bot/selftest.php` — bot mantig'ini soxta Telegram bilan tekshiradi (tokenga ehtiyoj yo'q).
