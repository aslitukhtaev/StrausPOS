# Ekran agentlari uchun umumiy qoidalar
1. O'qing: `docs/ARCHITECTURE.md`, `src/shared/{types,api,permissions,billing}.ts`, `src/renderer/ui/README.md`, `src/renderer/layout/routes.tsx`.
2. Faqat o'z papkangizda ishlang: `src/renderer/screens/<nom>/` (papka nomi KICHIK harfda; kirish nuqtasi `index.tsx`, `export default`).
   Boshqa papkalarga (ui/, shared/, electron/) tegmang. `ui/` da yetishmayotgan narsa bo'lsa — o'z papkangizda lokal komponent yarating
   va hisobotda "UI TAKLIFI" deb yozing.
3. Mantiq yozmang: faqat `api` (store/api orqali `PosApi`), jonli vaqt uchun `useNow` + `billing.ts`. Ruxsat: `useCan('...')`.
4. Eski Windows: Chrome 108 CSS (ARCHITECTURE.md), tashqi shrift/CDN yo'q, ≥1366×768, katta tugmalar (≥56px), asosiy matn ≥18px.
5. Hamma matn o'zbekcha (lotin). Pul `<Money/>`/`formatMoney`. Bo'sh holat (EmptyState), yuklanish, xato (toast) — hammasi ko'rsatilsin.
   Halokatli amallar (o'chirish, qaytarish, bekor qilish) — tasdiqlash bilan.
6. Tekshiruv: `npm run dev:server -- --demo` (port 5174) va `npm run dev:web` (5173) ni fonda ishga tushiring; Playwright
   (`playwright-core`, Chromium `/opt/pw-browsers`, `executablePath` bilan) orqali haqiqiy oqimni o'tkazing, 1366×768 va 1920×1080
   skrinshotlarini `screenshots/` ga oling va O'ZINGIZ Read bilan ko'rib tanqidiy baholang; kamida 2 iteratsiya sayqal bering.
   Dev-server test endpointlari: `POST /__test/reset {setup:true, login:'owner'}`, `POST /__test/clock`. PINlar: Ega 1234, Admin 2222, Kassir 3333, Massajchi 4444.
   Ishga tushirilgan jarayonlarni oxirida to'xtating (portlar boshqa agentlar bilan to'qnashmasligi uchun o'zingizga alohida portlar oling:
   server `PORT` env bo'lsa shuni, bo'lmasa kod orqali tekshirib, kerak bo'lsa `vite --port` va proxy uchun `--config` nusxasini scratch papkada ishlating).
7. `npx tsc --noEmit -p tsconfig.json` va `npx vite build --config vite.web.config.ts` o'tishi shart.
8. Commit: faqat o'z fayllaringiz; xabar oxiriga
   `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` va `Claude-Session: https://claude.ai/code/session_01HegfFBHJB3XQB9b1Mg45fF`.
   Keyin `git pull --rebase origin claude/busy-ptolemy-y2cv6b` va `git push origin claude/busy-ptolemy-y2cv6b` (konflikt bo'lsa o'zingiz hal qiling, o'zgalar ishini buzmang).
9. Qisqa hisobot: nima qilindi, nima ishlamayapti, shartnoma/UI takliflari.
