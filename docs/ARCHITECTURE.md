# StrausPOS — arxitektura (barcha agentlar uchun majburiy)

Sauna/shunga o'xshash bizneslar uchun **offline desktop POS**. Til: o'zbekcha (lotin). Pul: butun so'm.

## Texnologiya va ESKI WINDOWS cheklovi (muhim!)
Mijozlarda Windows 7/8/8.1 (va 32-bit) bo'lishi mumkin, shuning uchun:
- **Electron 22.3.27** (Chromium 108, Node 16) — o'zgartirilmaydi. O'rnatuvchi x64 + ia32.
- **React 18**, zustand, Vite 7 (build target chrome108/node16).
- DB: **sql.js** (WASM SQLite, native modul YO'Q). Fayl: `app.getPath('userData')/straus.db`. Har mutatsiyadan keyin
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

## Hisob-kitob qoidalari
- Har bir mehmon vaqti alohida (intervallar). Pauza = interval yopiladi. Davom = yangi interval (joriy xona narxi).
- Xona almashtirish: ishlayotgan mehmonlar intervali yopiladi, yangi xona narxi bilan yangisi ochiladi. Eski narx eski vaqtda qoladi.
- Vaqt: butun minutlar × tarif/60, `roundTo` ga yaxlitlanadi (standart 1000).
- Qator qaytarish (X): `returnedQty` oshadi, mahsulot omborga qaytadi, `ReturnRecord` yoziladi. Hisob = (qty − returnedQty) × narx.
- To'lov: naqd/karta/aralash/qarz. Σ to'lov = total. Qarz: ism+telefon majburiy, `Debt` yaratiladi.
- Xizmat: qat'iy narx, xodim (provider) yoziladi, ulush YO'Q.
- Guruh uchun bitta chek.

## Dizayn tamoyillari
Qorong'i, premium sauna uslubi: to'q ko'k-grafit fon, issiq oltin aksent, katta aniq yozuvlar. Xona holati rangda:
bo'sh=yashil, band=amber, tugayapti/qarz=qizil. Interfeys juda sodda: bosh ekranda hamma narsa 1–2 bosishda.
Dizayn tokenlari: `src/renderer/styles/tokens.css`. Komponentlar: `src/renderer/ui/`.

## Fayl egaligi (agentlar bir-birining fayliga tegmaydi)
- backend-engineer: `electron/**`, `scripts/**`, `tests/service/**`
- ui-architect: `src/renderer/{main.tsx,App.tsx,styles/**,ui/**,api/**,store/**,layout/**,screens/Lock*,screens/Setup*}`, `index.html`
- screen agents: faqat o'zlariga berilgan `src/renderer/screens/<nom>/**`
- qa-tester: `tests/**`, `playwright.config.ts` (kod xatosini topsa, fayl egasiga xabar beradi yoki minimal tuzatadi va hisobotda yozadi)
