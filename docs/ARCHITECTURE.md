# Delfin Sauna — arxitektura (barcha agentlar uchun majburiy)

Sauna/shunga o'xshash bizneslar uchun **offline desktop POS**. Til: o'zbekcha (lotin). Pul: butun so'm.

## Texnologiya va ESKI WINDOWS cheklovi (muhim!)
Mijozlarda Windows 7/8/8.1 (va 32-bit) bo'lishi mumkin, shuning uchun:
- **Electron 22.3.27** (Chromium 108, Node 16) — o'zgartirilmaydi. O'rnatuvchi x64 + ia32.
- **React 18**, zustand, Vite 7 (build target chrome108/node16).
- DB: **sql.js** (WASM SQLite, native modul YO'Q). Fayl: `app.getPath('userData')/delfin.db`. Har mutatsiyadan keyin
  atomik yoziladi (temp fayl + rename). Node 16 da ishlaydigan kod yozing (`structuredClone` YO'Q, `Array.prototype.at` bor, `fetch` main'da yo'q).
- **CSS faqat Chrome 108 darajasida**: `:has()`, CSS nesting, `color-mix()`, `oklch()`, subgrid, `text-wrap:balance`,
  `@starting-style`, `100svh/lvh` ISHLATILMAYDI. Flex/grid, custom properties, `clamp()`, `aspect-ratio`, `gap`, `@container` (105+) mumkin.
  `backdrop-filter` ni ehtiyotkorlik bilan (eski videokartalarda sekin) — fallback fon bo'lsin. Og'ir animatsiyalar yo'q (past quvvatli PClar).
- Minimal ekran: 1366×768 (eski noutbuk). Kichik shriftlar yo'q: asosiy matn ≥ 18px, tugmalar balandligi ≥ 56px, sensorli ekranga mos.

## Qatlamlar
```
src/shared/      types.ts, permissions.ts, billing.ts (toza), api.ts (PosApi shartnomasi)  ← main va renderer umumiy
electron/main/   db (sql.js), PosService (barcha biznes mantiq + ruxsat tekshiruvi), ipc, print, backup
electron/preload contextBridge: window.api: PosApi
scripts/         dev-server.ts: PosService ni HTTP /rpc orqali beradi (brauzerda test uchun)
src/renderer/    React UI. Faqat PosApi orqali ishlaydi (window.api yoki /rpc adapter)
tests/           vitest (mantiq), tests/e2e playwright (UI)
```
**Qoida:** biznes mantiq (hisob, ruxsat, ombor, to'lov tekshiruvi) FAQAT `PosService` va `shared/billing.ts` da. UI mantiq yozmaydi,
faqat ko'rsatadi va API chaqiradi. Soat: UI har soniya `computedAt` + `billing.ts` bilan lokal yangilaydi.

## Shartnomalar (o'zgartirish faqat orchestrator orqali)
`src/shared/types.ts`, `src/shared/api.ts`, `src/shared/permissions.ts`, `src/shared/billing.ts`.
Agar shartnoma yetarli bo'lmasa — o'zgartirmang; hisobotingizda "SHARTNOMA TAKLIFI: ..." deb yozing.

## Hisob-kitob qoidalari ("qattiq" tizim)
- Xona ochilganda har mehmonga vaqt OLINADI: 1/2/3... soat (`Guest.paidMinutes`). Taymer ORQAGA sanaydi.
- Mehmon 5 daqiqa o'tirsa ham olingan vaqt to'liq to'lanadi. Oshib ketsa `graceMinutes` dan keyin har boshlangan
  `blockMinutes` (standart 1 = aynan o'tirilgan daqiqa) qo'shiladi. "+1 soat" bilan oldindan uzaytirish mumkin (`extendGuest/extendAll`).
- Har bir mehmon vaqti alohida (intervallar). Pauza = taymer to'xtaydi. Tugatish = mehmon chiqdi (olingan vaqt baribir to'lanadi).
- Xona almashtirish: eski narx eski vaqtda qoladi; qolgan (oldindan olingan) daqiqalar yangi xona narxida.
- `warnBeforeMinutes` qolganda xona kartasi va mehmon taymeri qizaradi, ovozli/vizual ogohlantirish.
- Qator qaytarish (X): `returnedQty` oshadi, mahsulot omborga qaytadi, `ReturnRecord` yoziladi.
- To'lov: naqd/karta/aralash/qarz. Σ to'lov = total. Qarz: ism+telefon majburiy.
- Xizmat (massaj): qat'iy narx, provider yoziladi, ulush YO'Q.
- **Ofitsiant**: xonaga BIRIKTIRILMAYDI (qarang: "2026-10 o'zgarishlari"). Haqi = o'zi qo'shgan bar va oshxona
  mahsulotlari qatorlari (qaytarishlar ayirilgan; xizmatlar va vaqt KIRMAYDI) × qatorda muzlatilgan `waiterPct`%.
  Oylik hisob: `waiters.monthly`, berilgan pullar `waiters.payout`.
- Guruh uchun bitta chek.
- **Xonasiz bar savdosi** (`barSales.*`): kind='bar' sessiya — faqat mahsulotlar, to'lov va chek odatdagidek; ofitsiant haqi YO'Q;
  hisobotda umumiy tushumga kiradi va alohida `barSales` ko'rsatkichi; xonalar panelida ko'rinmaydi.
- Bekor qilish: biror mehmon ≥1 daqiqa o'tirgan bo'lsa faqat `discount.apply` ruxsati bilan (xato ochilgan xonani kassir darhol bekor qila oladi).

## Tarmoq: ikkinchi kompyuter — FAQAT KO'RISH
- Asosiy kompyuter (baza shu yerda) Sozlamalar → Tarmoq'da ruxsat bersa, Electron main LAN'da HTTP server ochadi
  (standart port 47321) va UDP broadcast orqali o'zini e'lon qiladi. Har so'rov `X-Delfin-Code` (6 raqamli kod) bilan.
- Server faqat O'QISH metodlarini bajaradi (qat'iy allowlist: rooms.board/list, sessions.get, catalog.* ro'yxatlari,
  debts.list/payments, reports.*, waiters.monthly/sessions/payouts/list, settings.get, system.now/receiptHtml, staff.list).
  Ular alohida PosService konteksti (sintetik ko'ruvchi, ruxsat: reports.view) bilan, asosiy kompyuterdagi login
  holatiga TA'SIR QILMASDAN bajariladi. Har qanday yozish rad etiladi — xavfsizlik serverda, UI'da emas.
- Ko'ruvchi kompyuter: o'sha ilova, `connection.connectViewer` bilan rejim lokal konfiguratsiyaga (`userData/connection.json`)
  yoziladi; main jarayon DB ochmaydi, IPC chaqiruvlarini HTTP orqali asosiyga yo'naltiradi (Node 16: `http` moduli).
  UI `readOnly` rejimida: login yo'q, barcha o'zgartirish tugmalari yashirin, tepada "Faqat ko'rish · <asosiy nomi>" belgisi,
  aloqa uzilsa aniq banner va avtomatik qayta ulanish.

## 2026-10 o'zgarishlari (mijoz talabi)
- **Vaqt oshsa** — aynan o'tirilgan daqiqa uchun (blockMinutes standart 1): 1 soat olingan, 01:01:00 → 61 daq.
- **Ofitsiant xonaga biriktirilmaydi.** Har bir ofitsiant o'z PIN'i bilan kirib istalgan xonaga buyurtma qo'shadi;
  qator `waiterId`/`waiterPct` ni oladi. Haq = (bar + OSHXONA mahsulotlari qatorlari, qaytarish ayirilgan) × foiz; xizmat yo'q.
  Kassir qo'shganda "kim olib bordi" ixtiyoriy. Xonasiz bar savdosida haq yo'q.
- Oshxona printeri nomi bo'sh bo'lsa — tizimning standart printeriga chiqadi.
- **Oshxona bo'limi** bardan alohida (kategoriya `department`). Oshxona mahsuloti qo'shilganda asosiy kompyuterdagi
  oshxona printeriga avtomatik oshxona cheki (xona, mahsulotlar, miqdor, ofitsiant, vaqt; qaytarishda "BEKOR" cheki).
  Oshxona kunlik hisobi: savdo × `kitchen.sharePct`% = oshxonaga beriladigan, kunlik pul berish (`kitchen.*`).
- **To'lov usullari**: Naqd · Karta · Terminal · Qarz; Aralash — to'rttasi ham (qarz ham).
- **Qarzdorlar** bitta odam = bitta yozuv (telefon bo'yicha). Qarz yozishda qidirib tanlanadi; to'lov FIFO.
- **Oraliq chek** — sessiya yopilmasdan (`checkout.preBill`), "Qo'shish" tugmasi yonida.
- **Qo'shish oynasi** — mahsulot −/+ bilan tanlanadi, bitta "Qo'shish" bilan (`lines.addProducts`).
- **Terminal rejimi** (ko'rish rejimi o'rniga): ikkinchi kompyuter TO'LIQ ishlaydi, o'z login'i bilan; baza bitta (asosiyda).
  Server har bir terminal uchun alohida login konteksti saqlaydi (token). Eski 'viewer' konfiguratsiyasi terminal deb o'qiladi.

## Dizayn tamoyillari
Brend: **Delfin Sauna**, logotip — delfin. Ranglar rasmdagi suvdan: yorqin moviy-feruza (aqua/cyan), oq ko'pik,
chuqur dengiz ko'ki. **Ikki rejim**: kunduzgi (yorug', oq-moviy) va tungi (chuqur dengiz). `data-theme` = light|dark,
`AppSettings.theme` (auto = tizimga qarab), tepa panelda tezkor almashtirgich. Barcha ranglar FAQAT tokenlar orqali
(`var(--...)`), ekran CSS'larida qattiq rang yozilmaydi. Katta aniq yozuvlar. Xona holati: bo'sh=yashil,
band=moviy/feruza, vaqt tugayapti/oshdi=qizil. Tokenlar: `src/renderer/styles/tokens.css`. Komponentlar: `src/renderer/ui/`.

## Fayl egaligi (agentlar bir-birining fayliga tegmaydi)
- backend-engineer: `electron/**`, `scripts/**`, `tests/service/**`
- ui-architect: `src/renderer/{main.tsx,App.tsx,styles/**,ui/**,api/**,store/**,layout/**,screens/Lock*,screens/Setup*}`, `index.html`
- screen agents: faqat o'zlariga berilgan `src/renderer/screens/<nom>/**`
- qa-tester: `tests/**`, `playwright.config.ts` (kod xatosini topsa, fayl egasiga xabar beradi yoki minimal tuzatadi va hisobotda yozadi)
