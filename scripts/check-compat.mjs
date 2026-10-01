#!/usr/bin/env node
/**
 * Moslik tekshiruvi: Electron 22.3.27 = Chromium 108 (renderer) + Node 16.17 (main/preload).
 *
 *   npm run check:compat            → manba + build (out/**) tekshiruvi (build oldindan bo'lishi kerak)
 *   node scripts/check-compat.mjs --src-only
 *
 * 1) JS sintaksisi: out/**\/*.{js,cjs,mjs} acorn bilan ecmaVersion 2022 da parse qilinadi
 *    (Chrome 108 va Node 16 ikkalasi ES2022 ni to'liq qo'llaydi; ES2023+ sintaksis = xato).
 * 2) JS API: manba (src/**, electron/**) va main/preload build'i regex ro'yxati bo'yicha.
 *    Renderer uchun faqat Chrome 108 da YO'Q API'lar; main/preload/shared uchun qo'shimcha Node 16 da yo'q API'lar.
 *    (Renderer bundle'i regex bilan tekshirilmaydi: React kabi kutubxonalar feature-detect qiladi → yolg'on signal.)
 * 3) CSS: postcss bilan parse; nesting, :has(), color-mix(), oklch() va boshqa Chrome 108+ xususiyatlar.
 *    Manba (src/renderer/**\/*.css, tsx inline style satrlari) va build (out/renderer/**\/*.css).
 *
 * Istisno: satr oxirida `compat-ok` izohi bo'lsa, o'sha satr o'tkazib yuboriladi.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as acorn from 'acorn'
import postcss from 'postcss'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC_ONLY = process.argv.includes('--src-only')

/** @type {{level:'error'|'warn', file:string, line:number, msg:string}[]} */
const findings = []
const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/')
const add = (level, file, line, msg) => findings.push({ level, file: rel(file), line, msg })

function walk(dir, exts, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === 'dist' || ent.name.startsWith('.')) continue
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) walk(p, exts, out)
    else if (exts.some((e) => ent.name.endsWith(e))) out.push(p)
  }
  return out
}

/** Izohlarni (// va /* *\/) bo'sh joy bilan almashtiradi, satr raqamlari saqlanadi. Satrlar ichidagi `//` ga tegmaydi. */
function stripJsComments(code) {
  let out = ''
  let i = 0
  let q = null
  while (i < code.length) {
    const c = code[i]
    const n = code[i + 1]
    if (q) {
      out += c
      if (c === '\\') { out += n ?? ''; i += 2; continue }
      if (c === q) q = null
      i++
      continue
    }
    if (c === '"' || c === "'" || c === '`') { q = c; out += c; i++; continue }
    if (c === '/' && n === '/') { while (i < code.length && code[i] !== '\n') { out += ' '; i++ } continue }
    if (c === '/' && n === '*') {
      i += 2; out += '  '
      while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) { out += code[i] === '\n' ? '\n' : ' '; i++ }
      i += 2; out += '  '
      continue
    }
    out += c
    i++
  }
  return out
}

// ───────────────────────── JS API ro'yxatlari ─────────────────────────
/** Chrome 108 da yo'q (renderer + main uchun ham). */
const CHROME_MISSING = [
  [/\.(toSorted|toReversed|toSpliced)\s*\(/, 'Array.prototype.toSorted/toReversed/toSpliced — Chrome 110+'],
  [/\.with\s*\(\s*-?\d/, 'Array.prototype.with — Chrome 110+'],
  [/\b(Object|Map)\.groupBy\b/, 'Object.groupBy/Map.groupBy — Chrome 117+'],
  [/\bPromise\.withResolvers\b/, 'Promise.withResolvers — Chrome 119+'],
  [/\bURL\.canParse\b/, 'URL.canParse — Chrome 120+'],
  [/\bURL\.parse\s*\(/, 'URL.parse — Chrome 126+'],
  [/\.(isWellFormed|toWellFormed)\s*\(/, 'String.prototype.isWellFormed/toWellFormed — Chrome 111+'],
  [/\bArray\.fromAsync\b/, 'Array.fromAsync — Chrome 121+'],
  [/\bAbortSignal\.any\b/, 'AbortSignal.any — Chrome 116+'],
  [/\.(union|intersection|symmetricDifference|isSubsetOf|isSupersetOf|isDisjointFrom)\s*\(/, 'Set metodlari (union/intersection…) — Chrome 122+'],
  [/\.(transferToFixedLength|transfer)\s*\(\s*\)/, 'ArrayBuffer.prototype.transfer — Chrome 114+'],
  [/\bIterator\.from\b|\.values\(\)\s*\.(map|filter|take|drop|toArray|reduce)\s*\(/, 'Iterator helpers — Chrome 122+'],
  [/\bshowPopover\b|\bhidePopover\b|\btogglePopover\b|\bpopover\s*=/, 'Popover API — Chrome 114+'],
  [/\bscheduler\.(yield|postTask)\b/, 'scheduler.yield/postTask (yield: Chrome 129+)'],
  [/\bdocument\.startViewTransition\b/, 'View Transitions — Chrome 111+'],
  [/\bRegExp\.escape\b/, 'RegExp.escape — Chrome 136+'],
  [/\bPromise\.try\b/, 'Promise.try — Chrome 128+']
]
/** Node 16.17 (main/preload/shared) da qo'shimcha yo'q. */
const NODE16_MISSING = [
  [/\bstructuredClone\s*\(/, 'structuredClone — Node 17+ (main da yo\'q)'],
  [/\.(findLast|findLastIndex)\s*\(/, 'Array.prototype.findLast — Node 18+'],
  [/(^|[^.\w])fetch\s*\(/, 'global fetch — Node 18+ (main da yo\'q)'],
  [/\bAbortSignal\.timeout\b/, 'AbortSignal.timeout — Node 17.3+'],
  [/(^|[^.\w])(Blob|File|FormData|Headers|Request|Response|WebSocket)\s*\(|new\s+(Blob|File|FormData|Headers|Request|Response|WebSocket)\b/, 'Web global (Blob/File/FormData/Response…) — Node 16 da global emas'],
  [/(^|[^.\w])crypto\.(randomUUID|getRandomValues|subtle)\b/, "global crypto — Node 19+ (import crypto from 'crypto' qiling)"],
  [/\bglobalThis\.crypto\b/, 'globalThis.crypto — Node 19+'],
  [/\bnode:test\b/, 'node:test — Node 18+'],
  [/\b(fs|fsp|promises)\.(cp|cpSync)\s*\(/, 'fs.cp — Node 16.7+ (eksperimental) — ehtiyot bo\'ling'],
  [/\butil\.parseArgs\b|\bparseArgs\s*\(/, 'util.parseArgs — Node 18.3+'],
  [/\bprocess\.getBuiltinModule\b/, 'process.getBuiltinModule — Node 22+'],
  [/\bimport\.meta\.(dirname|filename|resolve)\b/, 'import.meta.dirname/filename — Node 20+']
]

function scanJs(file, rules) {
  const raw = fs.readFileSync(file, 'utf8')
  const lines = stripJsComments(raw).split('\n')
  const rawLines = raw.split('\n')
  // `crypto` modul import qilingan bo'lsa, crypto.* — global emas
  const importsCrypto = /from\s+['"](node:)?crypto['"]|require\(\s*['"](node:)?crypto['"]\s*\)/.test(raw)
  lines.forEach((ln, i) => {
    if (/compat-ok/.test(rawLines[i] ?? '')) return
    for (const [re, msg] of rules) {
      if (importsCrypto && msg.startsWith('global crypto')) continue
      if (re.test(ln)) add('error', file, i + 1, msg)
    }
  })
}

// ───────────────────────── CSS ─────────────────────────
const CSS_VALUE_RULES = [
  [/\bcolor-mix\s*\(/i, 'color-mix() — Chrome 111+'],
  [/\b(oklch|oklab|lch|lab)\s*\(/i, 'oklch()/oklab()/lch()/lab() — Chrome 111+'],
  [/(^|[^-\w])color\s*\(\s*(display-p3|srgb|rec2020|xyz)/i, 'color() — Chrome 111+'],
  [/\blight-dark\s*\(/i, 'light-dark() — Chrome 123+'],
  [/\b(round|mod|rem)\s*\(\s*(up|down|nearest|to-zero|[-\d.])/i, 'round()/mod()/rem() — Chrome 125+'],
  [/\b(sin|cos|tan|asin|acos|atan|atan2|pow|sqrt|hypot|log|exp|abs|sign)\s*\(/i, 'CSS trig/exp/abs/sign funksiyalari — Chrome 111+'],
  [/\banchor\s*\(|\banchor-size\s*\(/i, 'anchor() — Chrome 125+'],
  [/[\d.](svh|svw|lvh|lvw|dvh|dvw|svmin|svmax|lvmin|lvmax|dvmin|dvmax)\b/i, 'svh/lvh/dvh birliklari — loyiha qoidasi bo\'yicha taqiqlangan (vh ishlating)'],
  [/[\d.](lh|rlh|cap|rcap|rex|rch|ric)\b/, 'lh/rlh/cap birliklari — Chrome 109+'],
  [/(^|[^-\w])image-set\s*\(/i, 'image-set() prefikssiz — Chrome 113+ (-webkit-image-set ishlating)'],
  [/\bsubgrid\b/i, 'subgrid — Chrome 117+'],
  [/\bcalc-size\s*\(/i, 'calc-size() — Chrome 129+']
]
const CSS_PROP_RULES = [
  [/^text-wrap(-mode|-style)?$/i, 'text-wrap — Chrome 114+'],
  [/^white-space-collapse$/i, 'white-space-collapse — Chrome 114+'],
  [/^scrollbar-(width|color)$/i, 'scrollbar-width/color — Chrome 121+ (::-webkit-scrollbar ishlating)', 'warn'],
  [/^(mask|mask-image|mask-size|mask-position|mask-repeat|mask-mode|mask-composite)$/i, 'mask* prefikssiz — Chrome 120+ (-webkit-mask* ham yozing)', 'maskcheck'],
  [/^(animation-timeline|view-timeline.*|scroll-timeline.*|animation-range.*)$/i, 'Scroll-driven animations — Chrome 115+'],
  [/^transition-behavior$/i, 'transition-behavior — Chrome 117+'],
  [/^interpolate-size$/i, 'interpolate-size — Chrome 129+'],
  [/^field-sizing$/i, 'field-sizing — Chrome 123+'],
  [/^(anchor-name|position-anchor|position-area|position-try.*|inset-area)$/i, 'Anchor positioning — Chrome 125+'],
  [/^view-transition-name$/i, 'View transitions — Chrome 111+'],
  [/^initial-letter$/i, 'initial-letter — Chrome 110+'],
  [/^font-size-adjust$/i, 'font-size-adjust — Chrome 127+'],
  [/^text-box(-trim|-edge)?$/i, 'text-box-trim — Chrome 133+'],
  [/^reading-flow$/i, 'reading-flow — Chrome 137+'],
  [/^backdrop-filter$/i, 'backdrop-filter — eski videokartalarda sekin; fallback background bo\'lishi shart', 'info']
]
const CSS_SELECTOR_RULES = [
  [/:has\(/i, ':has() — loyiha qoidasi bo\'yicha taqiqlangan'],
  [/:nth-(last-)?child\([^)]*\bof\b/i, ':nth-child(… of S) — Chrome 111+'],
  [/:(user-invalid|user-valid)\b/i, ':user-invalid/:user-valid — Chrome 119+'],
  [/:popover-open\b|::backdrop\b(?=.*popover)/i, 'Popover — Chrome 114+'],
  [/:state\(/i, ':state() — Chrome 125+'],
  [/::details-content|::picker\(|::scroll-marker/i, 'Yangi pseudo-elementlar — Chrome 131+'],
  [/(^|[\s,(])&/, 'CSS nesting (&) — Chrome 112+']
]
const CSS_AT_RULES = {
  'starting-style': '@starting-style — Chrome 117+',
  scope: '@scope — Chrome 118+',
  'position-try': '@position-try — Chrome 125+',
  'view-transition': '@view-transition — Chrome 126+',
  'custom-media': '@custom-media — qo\'llab-quvvatlanmaydi'
}

function checkCssText(file, css, lineOffset = 0) {
  let root
  try {
    root = postcss.parse(css, { from: file })
  } catch (e) {
    add('error', file, (e.line ?? 0) + lineOffset, 'CSS parse xatosi: ' + e.reason)
    return
  }
  const rawLines = css.split('\n')
  const ok = (node) => /compat-ok/.test(rawLines[(node.source?.start?.line ?? 1) - 1] ?? '')
  const line = (node) => (node.source?.start?.line ?? 0) + lineOffset
  root.walkAtRules((at) => {
    if (ok(at)) return
    const name = at.name.toLowerCase()
    if (CSS_AT_RULES[name]) add('error', file, line(at), CSS_AT_RULES[name])
    if (name === 'media' || name === 'container' || name === 'supports') {
      for (const [re, msg] of CSS_VALUE_RULES) if (re.test(at.params)) add('error', file, line(at), msg)
    }
  })
  root.walkRules((rule) => {
    if (ok(rule)) return
    // Nesting: qoida (rule) ichida boshqa qoida (keyframes ichidagi 'from/to' bundan mustasno)
    const parent = rule.parent
    if (parent && parent.type === 'rule') add('error', file, line(rule), 'CSS nesting — Chrome 112+')
    if (parent && parent.type === 'atrule' && /keyframes$/i.test(parent.name)) return
    for (const [re, msg] of CSS_SELECTOR_RULES) if (re.test(rule.selector)) add('error', file, line(rule), `${msg}: ${rule.selector.slice(0, 60)}`)
  })
  root.walkDecls((decl) => {
    if (ok(decl)) return
    const prop = decl.prop
    if (prop.startsWith('--')) {
      // custom property qiymati ham haqiqiy qiymat bo'lib ishlatiladi
      for (const [re, msg] of CSS_VALUE_RULES) if (re.test(decl.value)) add('error', file, line(decl), `${msg} (${prop})`)
      return
    }
    for (const [re, msg, kind] of CSS_PROP_RULES) {
      if (!re.test(prop)) continue
      if (kind === 'info') continue // faqat hujjat uchun
      if (kind === 'maskcheck') {
        const siblings = decl.parent?.nodes ?? []
        const hasPrefixed = siblings.some((n) => n.type === 'decl' && n.prop.toLowerCase() === '-webkit-' + prop.toLowerCase())
        if (!hasPrefixed) add('error', file, line(decl), msg)
        continue
      }
      add(kind === 'warn' ? 'warn' : 'error', file, line(decl), msg)
    }
    for (const [re, msg] of CSS_VALUE_RULES) if (re.test(decl.value)) add('error', file, line(decl), `${msg} (${prop}: ${decl.value.slice(0, 50)})`)
  })
}

/** TSX/TS ichidagi inline style satrlarida taqiqlangan CSS qiymatlari. */
function scanInlineCss(file) {
  const raw = fs.readFileSync(file, 'utf8')
  const lines = stripJsComments(raw).split('\n')
  const rawLines = raw.split('\n')
  const rules = [
    [/\bcolor-mix\s*\(/i, 'color-mix() (inline style) — Chrome 111+'],
    [/\b(oklch|oklab)\s*\(/i, 'oklch()/oklab() (inline style) — Chrome 111+'],
    [/['"`][^'"`]*\d(svh|lvh|dvh|svw|lvw|dvw)\b/, 'svh/lvh/dvh (inline style) — taqiqlangan'],
    [/\btextWrap\s*:/, 'textWrap (inline style) — Chrome 114+'],
    [/\b(scrollbarWidth|scrollbarColor)\s*:/, 'scrollbarWidth/Color — Chrome 121+']
  ]
  lines.forEach((ln, i) => {
    if (/compat-ok/.test(rawLines[i] ?? '')) return
    for (const [re, msg] of rules) if (re.test(ln)) add('error', file, i + 1, msg)
  })
}

// ───────────────────────── JS sintaksis (build) ─────────────────────────
function parseEs2022(file) {
  const code = fs.readFileSync(file, 'utf8')
  const sourceType = file.endsWith('.cjs') ? 'script' : 'module'
  try {
    acorn.parse(code, { ecmaVersion: 2022, sourceType, allowHashBang: true, allowReturnOutsideFunction: sourceType === 'script' })
  } catch (e) {
    const loc = e.loc ? e.loc.line : 0
    const snippet = e.pos != null ? code.slice(Math.max(0, e.pos - 40), e.pos + 40).replace(/\s+/g, ' ') : ''
    add('error', file, loc, `ES2022 dan yangi sintaksis (Chrome 108/Node 16 da ishlamasligi mumkin): ${e.message} … ${snippet}`)
  }
}

// ───────────────────────── ishga tushirish ─────────────────────────
const tsExts = ['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs']
const rendererFiles = walk(path.join(ROOT, 'src/renderer'), tsExts)
const sharedFiles = walk(path.join(ROOT, 'src/shared'), tsExts)
const mainFiles = walk(path.join(ROOT, 'electron'), tsExts)

for (const f of rendererFiles) {
  // Brauzer uchun dev adapter (rpc.ts) fetch ishlatadi — renderer'da fetch bor, OK.
  scanJs(f, CHROME_MISSING)
  if (f.endsWith('.tsx') || f.endsWith('.ts')) scanInlineCss(f)
}
for (const f of [...sharedFiles, ...mainFiles]) scanJs(f, [...CHROME_MISSING, ...NODE16_MISSING])
for (const f of walk(path.join(ROOT, 'src/renderer'), ['.css'])) checkCssText(f, fs.readFileSync(f, 'utf8'))
const indexHtml = path.join(ROOT, 'src/renderer/index.html')
if (fs.existsSync(indexHtml)) {
  const html = fs.readFileSync(indexHtml, 'utf8')
  const m = /<style[^>]*>([\s\S]*?)<\/style>/gi
  let r
  while ((r = m.exec(html))) checkCssText(indexHtml, r[1], html.slice(0, r.index).split('\n').length - 1)
  if (/<script[^>]+src=["']https?:|<link[^>]+href=["']https?:/i.test(html)) add('error', indexHtml, 0, 'Tashqi resurs (CDN) — ilova oflayn ishlashi kerak')
}

let builtCount = 0
if (!SRC_ONLY) {
  const outDir = path.join(ROOT, 'out')
  if (!fs.existsSync(outDir)) {
    add('error', outDir, 0, "out/ topilmadi — avval `npx electron-vite build` qiling (yoki --src-only)")
  } else {
    const jsOut = walk(outDir, ['.js', '.cjs', '.mjs'])
    builtCount = jsOut.length
    for (const f of jsOut) parseEs2022(f)
    for (const f of walk(path.join(outDir, 'main'), ['.js', '.cjs', '.mjs'])) scanJs(f, NODE16_MISSING.filter(([, m]) => !/Web global|global crypto/.test(m ?? '')))
    for (const f of walk(path.join(outDir, 'preload'), ['.js', '.cjs', '.mjs'])) scanJs(f, NODE16_MISSING.filter(([, m]) => !/Web global|global crypto/.test(m ?? '')))
    for (const f of walk(path.join(outDir, 'renderer'), ['.css'])) checkCssText(f, fs.readFileSync(f, 'utf8'))
    // Oflayn: build qilingan renderer tashqi URL'larni yuklamasligi kerak
    for (const f of walk(path.join(outDir, 'renderer'), ['.html', '.css'])) {
      const txt = fs.readFileSync(f, 'utf8')
      const m = txt.match(/(src|href)=["']https?:\/\/[^"']+|@import\s+url\(["']?https?:[^)]+|url\(["']?https?:\/\/[^)]+/i)
      if (m) add('error', f, 0, 'Tashqi resurs (oflayn ishlamaydi): ' + m[0].slice(0, 80))
    }
  }
}

const errors = findings.filter((f) => f.level === 'error')
const warns = findings.filter((f) => f.level === 'warn')
for (const f of findings) console.log(`${f.level === 'error' ? 'XATO ' : 'OGOH '} ${f.file}:${f.line}  ${f.msg}`)
console.log(
  `\ncheck:compat — ${rendererFiles.length + sharedFiles.length + mainFiles.length} manba fayl` +
    (SRC_ONLY ? '' : `, ${builtCount} build JS fayl`) +
    ` — ${errors.length} xato, ${warns.length} ogohlantirish (maqsad: Chromium 108 / Node 16.17)`
)
process.exit(errors.length ? 1 : 0)
