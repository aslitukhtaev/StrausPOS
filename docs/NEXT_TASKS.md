# Keyingi vazifalar (agent uchun)

Repo: aslitukhtaev/strauspos, branch: `claude/busy-ptolemy-y2cv6b`. Loyiha "Delfin Sauna" (Electron + React + sql.js, oflayn POS, interfeys o'zbek tilida).

Boshlashdan oldin `docs/ARCHITECTURE.md`, `src/shared/types.ts`, `src/shared/api.ts`, `src/shared/billing.ts`, `docs/SCREEN_RULES.md` ni o'qing. Avval shartnomani (turlar va API) yangilang, keyin backend, keyin ekranlar. Node 16 / Electron 22 mosligi saqlansin (`npm run check:compat`). Yangi ustun/jadval kerak bo'lsa migratsiya yozing, eski ma'lumot buzilmasin, migratsiya testi bo'lsin.

## 1) Obsluga (xizmat haqi) 10%
- Umumiy hisobdan (vaqt + buyurtmalar − chegirma) 10% obsluga hisoblanadi va hisobga qo'shiladi. Foiz Sozlamalar → Chek yoki Hisob-kitob bo'limida o'zgartiriladi (standart 10, 0 = o'chiq).
- Sessiya yopilganda summa sessiyada muzlatiladi (foiz keyin o'zgarsa, eski cheklar o'zgarmasin).
- Chekda alohida qator ("Obsluga 10%: ..."), JAMI ga kiradi; oraliq chekda ham ko'rinadi; to'lov oynasi, sessiya oynasi (Jami), xona kartasi summasi, to'lov summasi tekshiruvi (Σ to'lovlar = jami) va qarz hisobi yangi jamidan ishlasin.
- Hisobotda alohida ko'rsatkich "Obsluga"; ofitsiant haqi va oshxona ulushi obslugadan HISOBLANMAYDI.
- Bar savdosida (xonasiz) obsluga yo'q.
- Chegirma bilan tartibi: obsluga chegirmadan KEYINGI summadan olinadi. Boshqa qaror qilsangiz, hujjatga yozing.

## 2) Vaqt ko'rsatish (taymer)
- Hozir olingan vaqt tugagach "+00:01:00", "+00:02:00" ko'rsatiladi. Kerak: tugagandan keyin jami o'tirilgan vaqt ko'rsatilsin: 1 soat olingan bo'lsa 01:01:00, 01:02:00, 01:03:00 ... (qizil rang bilan). Qolgan vaqt rejimida (hali tugamagan) orqaga sanash avvalgidek.
- Hamma joyda bir xil: mehmon kartasi, sessiya sarlavhasi ("Eng kam qolgan"/"Vaqt oshdi"), xona kartasi, oraliq chek va chekdagi mehmon vaqti. Pastdagi izoh ("+00:01:00 oshdi · 1 daq qo'shildi") ham yangi ko'rinishga mos bo'lsin.
- `formatCountdown` testlarini va e2e dagi kutilgan matnlarni yangilang. Hisob-kitob (daqiqalik) o'zgarmaydi.

## 3) Ruxsatlar
- Kassir va ofitsiant: qaytarish (`line.return`) ruxsati BOR. Kassir: chegirma berish (`discount.apply`) BOR. Ofitsiantda chegirma YO'Q.
- Ruxsatlar matritsasi, PosService tekshiruvlari, UI tugmalari (X, Chegirma) va testlarni (service + e2e `c-permissions`) yangilang; server ham rad etsin.
- Bar savdosida to'lanmagan savatdan olib tashlash ruxsati (`session.manage`) avvalgidek qolsin.

## 4) Sessiyalar tarixi
- Yangi ekran "Tarix" (`routes.tsx`, ruxsat: `reports.view`, Hisobotdan keyin): yopilgan sessiyalar ro'yxati — xona (yoki "Bar"), ochilgan/yopilgan vaqt, mehmonlar soni, jami, to'lov usullari, kassir. Filtrlar: sana oralig'i (bugun/kecha/hafta/oy/oraliq), xona, kassir, qidiruv (chek raqami).
- Qatorni bosganda tafsilot: mehmonlar va vaqtlari (olingan/o'tirgan/hisoblangan), AYNAN NIMA sotilgani (mahsulot/xizmat, soni, narxi, kim qo'shdi, ofitsiant, qachon), qaytarishlar (kim, sabab), chegirma, obsluga, to'lovlar, qarz; "Chekni qayta chop etish" tugmasi.
- Ochiq sessiya oynasida ham har qatorda kim va qachon qo'shgani ko'rinsin, qaytarilganlari ham tarixda (chizilgan holda) tursin.
- API: `sessions.history(filter)` va `sessions.detail(id)` (o'qish ruxsati); LAN terminal allowlist/guard ga mos qo'shing.

## 5) QR kod (Instagram)
- Sozlamalar → Chek bo'limida "QR kod" yuklash joyi: rasm tanlash (PNG/JPG, ≤ 500 KB, kerak bo'lsa kichraytirish), ko'rinish, "O'chirish". Yuklash joyining TAGIDA "Bizning Instagram" yozuvi turadi. Rasm sozlamalarda saqlanadi, zaxira nusxaga kiradi.
- Chek pastiga QR + "Bizning Instagram" chop etiladi (58 va 80 mm uchun to'g'ri o'lcham), chek oldindan ko'rishda ham ko'rinadi. "Chekda QR ko'rsatish" switch bo'lsin (yoqilgan).
- Oshxona cheki va oraliq chekda QR kerak emas.

## Talablar
- Har bir punkt uchun service testlari (qo'lda hisoblangan summalar) va kerakli joylarga e2e (`tests/e2e/*`) yozing/yangilang. Oxirida hammasi yashil: `npx vitest run`, `npx tsc --noEmit -p tsconfig.json`, `npm run check:compat`, `npm run e2e`.
- UI: mavjud tokenlar (kunduzgi/tungi), 1366×768 da qulay, brauzerda (`dev-server --demo`) ishlatib ko'rib skrinshot bilan tekshiring.
- Kichik commitlar; hammasi yashil bo'lgach branch ga push qiling. PR ochmang. `git stash` dagi "resetData" yozuviga tegmang.
- Oxirida qisqa hisobot: nima qilindi, qanday qarorlar qabul qilindi (ayniqsa obsluga tartibi), nima sinalmadi.
