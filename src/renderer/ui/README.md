# Delfin Sauna UI — ekran agentlari uchun qo'llanma

Egasi: **ui-architect**. Ekran agentlari bu papkadagi fayllarni O'ZGARTIRMAYDI — faqat import qiladi.
Yangi komponent/ikon/token kerak bo'lsa: hisobotda "UI TAKLIF: ..." deb yozing.

Jonli namuna (barcha komponentlar): `npm run dev:web` → <http://localhost:5173/?gallery>

---

## 1. Ekran qanday qo'shiladi

1. Fayl: `src/renderer/screens/<id>/index.tsx` — **kichik harf**, `id` ∈ `rooms | bar | debts | reports | staff | settings`.
2. `export default function XScreen() { ... }` — props yo'q. Qobiq uni avtomatik topadi (`layout/routes.tsx`, `import.meta.glob`),
   hech qanday ro'yxatga qo'shish shart emas. Fayl bo'lmasa "tayyorlanmoqda" placeholder ko'rinadi.
3. Ekran `.shell__main` ichida chiziladi: padding (24px / ≥1600px da 32px) va vertikal skroll **qobiqda bor**.
   Ekran to'liq balandlikni boshqarmoqchi bo'lsa (masalan ikki ustunli, ichki skroll): ildiz elementga
   `style={{ height: '100%' }}` + `display:flex/grid` va ichki `overflow:auto` bering.
4. Ekran CSS'i: `screens/<id>/<id>.css` (ekranning `index.tsx` ida import qiling). Klass nomlariga ekran prefiksi qo'ying
   (`.rooms-…`, `.debts-…`) — `ui-*`, `shell*`, `side__*`, `topbar__*`, `lock-*`, `auth*`, `brand*`, `setup*` band.
   Ranglar/o'lchamlar faqat `var(--…)` tokenlar orqali (bo'lim 6).
5. Ekran sarlavhasi: `<PageHeader title=… icon=… actions=… />` (barcha ekranlarda bir xil).
6. Ruxsatlar bo'yicha nav (`routes.tsx`): rooms — hamma; bar `stock.manage`; debts `debt.manage`; reports `reports.view`;
   staff `staff.manage`; settings `settings.manage`. Ekran ichidagi tugmalarni `useCan(perm)` bilan yashiring/o'chiring.

## 2. Importlar

```ts
import { api } from '@/api'                        // PosApi (to'liq tipli). Har chaqiruv Promise; xato → Error.message (o'zbekcha)
import { Button, Modal, Money, Timer, toast, confirmDialog, useNow } from '@/ui'
import { useAuth, useCan, useStaff } from '@/store/auth'
import { useApp } from '@/store/app'               // settings, businessName, lock()
import { useNav } from '@/store/nav'               // go(screen, params)
import { guestElapsedMs, guestTimeAmount } from '@shared/billing'
```
(`@/` = `src/renderer/`, `@shared/` = `src/shared/`. Nisbiy import ham ishlaydi.)

## 3. Komponentlar

| Komponent | Asosiy props | Izoh |
|---|---|---|
| `Button` | `variant`: `primary` \| `secondary`(std) \| `success` \| `danger` \| `ghost`; `size`: `sm` 48 \| `md` 56(std) \| `lg` 68 \| `xl` 84; `icon`, `iconRight`, `block`, `loading`, `disabled` + barcha `<button>` atributlari | `primary` = oltin, ekranda bitta asosiy amal. `success` = to'lov/tasdiq. `danger` = yumshoq qizil; qattiq qizil uchun `className="is-solid"` |
| `IconButton` | `icon`, **`label`** (majburiy, tooltip+aria), `variant`, `size`, `badge?`, `loading` | Kvadrat |
| `Card` | `title?`, `subtitle?`, `actions?`, `padding`: `none`\|`sm`\|`md`(std)\|`lg`; `tone`: `default`\|`raised`\|`accent`\|`success`\|`warning`\|`danger`; `interactive`, `selected`, `disabled`, `onClick` | `interactive` → role=button, Enter/Space bilan bosiladi. Xona kartalari: `tone="success"` (bo'sh) / `"warning"` (band) / `"danger"` (tugayapti/qarz) |
| `Badge` | `tone`: `neutral`\|`accent`\|`success`\|`warning`\|`danger`\|`info`; `size`: `sm`\|`md`\|`lg`; `icon?` | Kichik yorliq |
| `StatusPill` | `status`: `free`\|`busy`\|`ending`\|`debt`\|`paused`\|`running`\|`finished`\|`closed`; `size`; `children?` (matnni almashtiradi) | Rangli nuqta + "Bo'sh/Band/Tugayapti/Qarz/Pauza/Ishlayapti/Tugadi/Yopilgan" |
| `Avatar` | `name`, `size` (px) | Bosh harflar, ismdan barqaror rang |
| `Modal` | `open`, `onClose`, `title?`, `subtitle?`, `headerExtra?`, `footer?`, `size`: `sm` 520\|`md` 620(std)\|`lg` 840\|`xl` 1100\|`full`; `dismissible` (std true), `flush` | Portal. Esc/fon bosish yopadi (`dismissible={false}` — o'chiriladi). Fokus tuzog'i; `data-autofocus` atributli element birinchi fokus oladi. Tana o'zi skroll qiladi, footer doim ko'rinadi |
| `ConfirmDialog` | `open`, `title`, `message?`, `confirmText`, `cancelText`, `danger`, `icon?`, `onConfirm` (async bo'lishi mumkin), `onCancel`, `onDone?` | `onConfirm` xato bersa — toast.error, oyna ochiq qoladi |
| `confirmDialog(opts)` | `{ title, message?, confirmText?, cancelText?, danger?, icon? }` → `Promise<boolean>` | Imperativ: `if (await confirmDialog({title:'O\'chirasizmi?', danger:true})) …` |
| `toast` | `toast.success(msg, {description?, duration?})`, `toast.error(e)`, `toast.info`, `toast.warning`; `errorMessage(e)` | `toast.error` Error obyektini ham qabul qiladi (`e.message` ko'rsatiladi). **Har bir API xatosini toast bilan ko'rsating** |
| `Numpad` | `value: string`, `onChange`, `mode`: `pin`\|`amount`\|`qty`; `maxLength`, `onSubmit?`, `submitLabel?`, `submitDisabled`, `keyboard` (std true), `disabled`, `size`: `md` 72\|`lg` 80 | Jismoniy klaviatura ham ishlaydi (input fokusda bo'lmasa; modal ichidagisi faqat eng yuqori modalda). `amount`: `[000][0][⌫]`, bosh nol yo'q; `Number(value \|\| 0)` |
| `PinDots` | `length`, `max`, `error` | PIN nuqtalari |
| `Stepper` | `value: number`, `onChange`, `min`, `max`, `step`, `size`: `md`\|`lg`, `suffix?` ("kishi") | [−] n [+] |
| `Segmented` | `value`, `onChange`, `options: {value,label,icon?,disabled?}[]`, `size`: `md`\|`lg`, `block` | Masalan to'lov usuli: Naqd/Karta/Qarz |
| `Tabs` | `value`, `onChange`, `items: {id,label,icon?,badge?,disabled?}[]` | Kontentni o'zingiz shartli chizasiz |
| `Field` | `label`, `hint?`, `error?`, `required`, `inline` | `<label>` o'rami |
| `Input` | `size`: `md` 56\|`lg` 68; `icon?`, `suffix?`, `invalid` + `<input>` atributlari | forwardRef |
| `MoneyInput` | `value: number`, `onChange(n: number)`, `max?`, `suffix` (std "so'm") | "1 250 000" ko'rinishida, faqat raqam |
| `Select` | `size`, `invalid` + `<select>` atributlari, `<option>` children | Nativ select, uslublangan |
| `TextArea` | `rows`, `invalid` + `<textarea>` atributlari | |
| `Money` | `value`, `size`: `sm`\|`md`\|`lg`\|`xl`\|`2xl`\|`3xl`; `tone`: `default`\|`muted`\|`accent`\|`success`\|`warning`\|`danger`; `currency` (std true), `sign`, `strike` | `formatMoney` + tabular-nums. Pulni HECH QACHON qo'lda formatlamang |
| `Timer` | `ms?` yoki `since?` (boshlanish vaqti, o'zi yangilanadi); `running`, `paused`, `size`: `sm`..`2xl`, `tone`, `showDot` | `hh:mm:ss` |
| `EmptyState` | `icon?`, `title`, `description?`, `action?`, `size`: `md`\|`lg` | Bo'sh ro'yxatlar uchun majburiy |
| `PageHeader` | `title`, `subtitle?`, `icon?`, `actions?` | Ekran tepasi |
| `Spinner` | `size` | Yuklanish |
| `ErrorBoundary` | `resetKey?` | Qobiq har ekranni allaqachon o'raydi |
| `Icon` | `name: IconName`, `size` (24), `strokeWidth` (2), `title?` | Ro'yxat: `ICON_NAMES` yoki `?gallery`. Asosiylari: rooms bar debts reports staff settings flame plus minus x check chevronLeft/Right/Down/Up arrowLeft/Right backspace search edit trash refresh swap undo clock play pause stop timer user userPlus users cash card wallet percent receipt printer box tag sparkles lock unlock logout key shield database download upload calendar phone info alert checkCircle xCircle dots menu eye inbox construction |
| `cx(...)` | klasslarni birlashtirish | |

### Format yordamchilari (`@/ui`)
`formatMoney(125000)` → `"125 000"` · `formatDuration(ms)` → `"01:05:09"` · `formatClock(ts)` → `"14:05"` ·
`formatDate(ts)` → `"1-oktabr, Payshanba"` · `formatDateTime(ts)` → `"01.10.2026 14:05"` · `formatDateShort(ts)` ·
`formatMinutes(95)` → `"1 soat 35 daq"` · `formatPhone('901234567')` → `"90 123 45 67"` · `initials(name)`.

## 4. Holat (store)

| Hook / funksiya | Nima beradi |
|---|---|
| `useNow()` | Jonli vaqt (ms), **har soniya** yangilanadi, server bilan sinxron. Jonli taymer: `guestElapsedMs(g.intervals, now)`. `getNow()` — React tashqarisida |
| `useAuth(s => s.staff)`, `useStaff()` | Joriy xodim (`Staff`) |
| `useCan('session.pay')` | Ruxsat (reaktiv). `useAuth.getState().can(p)` — tashqarida. Faqat ko'rinish uchun; haqiqiy tekshiruv backendda |
| `useApp(s => s.settings)` | `AppSettings \| null` (roundTo, chek, autoLock...) |
| `useApp.getState().setSettings(saved)` | **Sozlamalar ekrani** `api.settings.save()` dan keyin chaqiradi (biznes nomi, avto-qulf darhol yangilanadi) |
| `useApp(s => s.lock)()` | Qulflash (logout → qulf ekrani) |
| `useNav(s => s.go)('debts', {id: 5})`, `useNav(s => s.params)` | Ekranlar orasida o'tish |

Avtomatik qulf: `settings.lockEnabled && autoLockMinutes > 0` bo'lsa, hech narsa bosilmasa qobiq o'zi qulflaydi.

## 5. API va backendsiz ishlash

- `api` → Electron'da `window.api` (IPC), brauzerda `POST /rpc {method:"group.name", args:[...]}` → `{result}` / `{error}`.
- **Real backend bilan**: `npm run dev:server -- --demo` (5174) + `npm run dev:web` (5173) → <http://localhost:5173/>.
- **Mock**: <http://localhost:5173/?mock=1> — xotirada: auth, settings, rooms.list/board (6 ta bo'sh xona), staff.list,
  catalog (kategoriya/mahsulot/xizmat), debts.list. PINlar: Aziz (Ega) `1234`, Dilnoza (Admin) `1111`, Jasur (Kassir) `0000`,
  Malika (Kassir, provider) `2222`. `?mock=empty` — Setup ekrani. Qolgan metodlar xato beradi — ekranlarni real backend bilan tekshiring.
- Sessiya jonli hisob: serverdan kelgan `SessionView.computedAt` va `useNow()` bilan `billing.ts` funksiyalarini ishlating; summani UI da o'ylab topmang.

## 6. Dizayn tokenlari (`styles/tokens.css`)

| Guruh | Tokenlar |
|---|---|
| Fon/sirt | `--bg` `--bg-elev` `--surface` `--surface-2` `--surface-3` `--surface-4` `--overlay` |
| Chiziq | `--line-soft` `--line` `--line-strong` |
| Matn | `--text` `--text-2` (ikkilamchi) `--text-3` (izoh) `--text-disabled` |
| Aksent (aqua) | `--accent` `--accent-hover` `--accent-press` `--accent-fill` (to'liq bo'yalgan yuza) `--accent-ink` (aqua ustidagi matn) `--accent-soft` `--accent-line` `--accent-glow` |
| Holat | bo'sh `--free` `--free-soft` `--free-line` · band `--busy` `--busy-soft` `--busy-line` · tugayapti/qarz/xato `--danger` `--danger-soft` `--danger-line` · `--info*` · pauza `--paused` `--paused-soft` · taxalluslar `--success` `--warning` |
| Shrift | `--font` (Segoe UI → tizim), `--fs-xs` 15 · `--fs-sm` 16 · **`--fs-md` 18 (asosiy)** · `--fs-lg` 21 · `--fs-xl` 26 · `--fs-2xl` 32 · `--fs-3xl` 42 · `--fs-4xl` 56; `--fw-regular/medium/semibold/bold` |
| O'lcham | `--h-sm` 48 · `--h-md` 56 · `--h-lg` 68 · `--h-xl` 84; bo'shliq `--sp-1..12` (4..48); radius `--r-sm` 10 · `--r-md` 14 · `--r-lg` 18 · `--r-xl` 24 · `--r-full` |
| Soya | `--shadow-1` `--shadow-2` `--shadow-3` `--inset-hi` `--focus-ring` |
| Layout | `--sidebar-w` `--topbar-h` `--page-pad` |

Global yordamchi klasslar (`global.css`): `.num` (tabular raqam), `.muted` `.subtle`, `.t-xs…t-2xl`, `.t-bold`,
`.t-accent/.t-success/.t-warning/.t-danger`, `.row` `.col` `.grow` `.spacer` `.scroll` `.ellipsis` `.sr-only`.

## 7. Qoidalar (majburiy)

- **Chrome 108 CSS**: `:has()`, nesting, `color-mix()`, `oklch()`, subgrid, `text-wrap:balance`, `@starting-style`, `svh/lvh/dvh` — YO'Q.
  `backdrop-filter` ishlatmang. Og'ir animatsiya yo'q (faqat opacity/transform, ≤200ms).
- Minimal ekran 1366×768 — hamma narsa skrollsiz yoki ichki skroll bilan sig'sin. 1920×1080 da ham tekshiring.
- Matn ≥ 18px (izoh/yorliq 15–16px mumkin), bosiladigan element ≥ 48px (asosiy ≥ 56px). Raqamlar `.num` / `Money` / `Timer`.
- Tashqi resurs (CDN, shrift, rasm URL) YO'Q — offline. CSP: faqat `'self'`.
- Matnlar o'zbekcha (lotin). Xatolar `toast.error(e)`. Xavfli amallar `confirmDialog({danger:true})` orqali.
- Bo'sh holatlar `EmptyState`, yuklanish `Spinner`. Bitta ekranda bitta `primary` tugma.
