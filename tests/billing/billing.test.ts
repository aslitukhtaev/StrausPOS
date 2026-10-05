import { describe, it, expect } from 'vitest'
/**
 * Delfin Sauna hisob-kitob qoidalari ("qattiq" tizim, docs/ARCHITECTURE.md):
 *  - olingan vaqt (paidMinutes) kamroq o'tirilsa ham to'liq to'lanadi;
 *  - oshsa — graceMinutes dan keyin har boshlangan blockMinutes to'liq qo'shiladi;
 *  - summa intervallar bo'ylab xronologik (har birining o'z tarifi), ishlatilmagan daqiqalar oxirgi tarifda.
 */
import {
  MS_MIN,
  MS_HOUR,
  DEFAULT_BILLING,
  intervalMs,
  guestElapsedMs,
  billedMinutes,
  remainingMs,
  guestTimeRaw,
  roundAmount,
  guestTimeAmount,
  lineActiveQty,
  lineAmount,
  buildGuestView,
  buildLineView,
  computeTotals,
  waiterProductSales,
  waiterCommission,
  formatMoney,
  formatDuration,
  formatCountdown,
  formatTimeShown,
  formatHours
} from '../../src/shared/billing'
import type { BillingOptions } from '../../src/shared/billing'
import type { Guest, OrderLine, TimeInterval } from '../../src/shared/types'

const m = (min: number) => min * MS_MIN
const s = (sec: number) => sec * 1000
/** interval: boshlanish/tugash minutda (end=null -> ochiq) */
const iv = (rate: number, startMin: number, endMin: number | null, roomId = 1): TimeInterval => ({
  roomId,
  rate,
  start: m(startMin),
  end: endMin === null ? null : m(endMin)
})
const guest = (id: number, intervals: TimeInterval[], state: Guest['state'] = 'finished', paidMinutes = 60): Guest => ({
  id,
  sessionId: 1,
  label: `Mehmon ${id}`,
  state,
  intervals,
  paidMinutes
})
/**
 * Blok mexanizmi testlari: yaxlitlash 1000, blok 60, imtiyoz 0 (shared DEFAULT_BILLING).
 * DIQQAT: 2026-10 dan ilova standarti blockMinutes=1 (PosService DEFAULT_SETTINGS) — pastdagi "daqiqalik" bo'limi.
 */
const OPT: BillingOptions = { ...DEFAULT_BILLING, blockMinutes: 60 }
/** 2026-10 ilova standarti: aynan o'tirilgan daqiqa uchun (1 soat olingan, 01:01:00 → 61 daq) */
const PER_MIN: BillingOptions = { ...DEFAULT_BILLING, blockMinutes: 1 }
const opt = (o: Partial<BillingOptions> = {}): BillingOptions => ({ ...OPT, ...o })
const line = (o: Partial<OrderLine> = {}): OrderLine => ({
  id: 1,
  sessionId: 1,
  guestId: null,
  kind: 'product',
  refId: 1,
  name: 'Cola',
  unitPrice: 10000,
  qty: 1,
  returnedQty: 0,
  providerId: null,
  createdAt: 0,
  createdBy: 1,
  department: 'bar',
  waiterId: null,
  waiterPct: 0,
  ...o
})

describe('intervalMs', () => {
  it('yopiq interval davomiyligi', () => {
    expect(intervalMs(iv(70000, 0, 25), m(999))).toBe(m(25))
  })
  it('ochiq interval now gacha', () => {
    expect(intervalMs(iv(70000, 10, null), m(40))).toBe(m(30))
  })
  it('nol uzunlik = 0', () => {
    expect(intervalMs(iv(70000, 5, 5), m(100))).toBe(0)
  })
  it('end < start (buzilgan ma\'lumot) manfiy bermaydi', () => {
    expect(intervalMs(iv(70000, 10, 5), m(100))).toBe(0)
  })
  it('ochiq interval, now < start (soat orqaga ketdi) -> 0', () => {
    expect(intervalMs(iv(70000, 10, null), m(5))).toBe(0)
  })
  it('yopiq intervalga now ta\'sir qilmaydi', () => {
    const x = iv(70000, 0, 10)
    expect(intervalMs(x, 0)).toBe(intervalMs(x, m(1e6)))
  })
})

describe('guestElapsedMs', () => {
  it('intervallar yo\'q -> 0', () => {
    expect(guestElapsedMs([], m(10))).toBe(0)
  })
  it('pauza oralig\'i hisobga olinmaydi', () => {
    expect(guestElapsedMs([iv(70000, 0, 40), iv(70000, 50, 127)], m(127))).toBe(m(117))
  })
  it('ochiq interval bilan yig\'indi', () => {
    expect(guestElapsedMs([iv(70000, 0, 10), iv(70000, 20, null)], m(35))).toBe(m(25))
  })
})

describe('billedMinutes (blok qoidasi)', () => {
  const B = { blockMinutes: 60, graceMinutes: 0 }
  it('5 daqiqa o‘tirsa ham olingan 1 soat to‘liq', () => {
    expect(billedMinutes(m(5), 60, B)).toBe(60)
    expect(billedMinutes(0, 60, B)).toBe(60)
  })
  it('aynan olingan vaqt — qo‘shimcha blok yo‘q', () => {
    expect(billedMinutes(m(60), 60, B)).toBe(60)
    expect(billedMinutes(m(120), 120, B)).toBe(120)
  })
  it('1 soniya oshsa ham keyingi blok to‘liq (qattiq)', () => {
    expect(billedMinutes(m(60) + s(1), 60, B)).toBe(120)
  })
  it('61 daqiqa, olingan 60 → 2 soat; 121 → 3 soat', () => {
    expect(billedMinutes(m(61), 60, B)).toBe(120)
    expect(billedMinutes(m(121), 60, B)).toBe(180)
    expect(billedMinutes(m(180), 60, B)).toBe(180)
  })
  it('graceMinutes: imtiyoz ichida qo‘shilmaydi, undan oshsa butun blok', () => {
    const G = { blockMinutes: 60, graceMinutes: 10 }
    expect(billedMinutes(m(70), 60, G)).toBe(60)
    expect(billedMinutes(m(70) + s(1), 60, G)).toBe(120)
    // imtiyoz faqat birinchi oshishga: 125 daqiqa → 60 + 2 blok
    expect(billedMinutes(m(125), 60, G)).toBe(180)
  })
  it('blockMinutes=30: oshgan vaqt 30 daqiqalik bloklar bilan', () => {
    const H = { blockMinutes: 30, graceMinutes: 0 }
    expect(billedMinutes(m(61), 60, H)).toBe(90)
    expect(billedMinutes(m(91), 60, H)).toBe(120)
  })
  it('blockMinutes noto‘g‘ri (0) bo‘lsa 1 daqiqalik blok, cheksiz sikl yo‘q', () => {
    expect(billedMinutes(m(62) + s(10), 60, { blockMinutes: 0, graceMinutes: 0 })).toBe(63)
  })
  it('paidMinutes=0 (eski sessiyalar): boshlangan har soat', () => {
    expect(billedMinutes(0, 0, B)).toBe(0)
    expect(billedMinutes(s(1), 0, B)).toBe(60)
    expect(billedMinutes(m(61), 0, B)).toBe(120)
  })
  it('manfiy/NaN paidMinutes 0 deb olinadi', () => {
    expect(billedMinutes(m(10), -30, B)).toBe(60)
    expect(billedMinutes(m(10), NaN, B)).toBe(60)
  })
  it('suzuvchi nuqta: 3 soat aniq — ortiqcha blok yo‘q', () => {
    expect(billedMinutes(3 * MS_HOUR, 60, B)).toBe(180)
  })
})

describe('remainingMs', () => {
  it('qolgan vaqt orqaga sanaydi, oshsa manfiy', () => {
    expect(remainingMs([iv(60000, 0, null)], 60, m(15))).toBe(m(45))
    expect(remainingMs([iv(60000, 0, null)], 60, m(60))).toBe(0)
    expect(remainingMs([iv(60000, 0, null)], 60, m(65))).toBe(-m(5))
  })
  it('pauza vaqti sanalmaydi', () => {
    expect(remainingMs([iv(60000, 0, 20), iv(60000, 50, null)], 60, m(60))).toBe(m(30))
  })
})

describe('guestTimeRaw (hisoblanadigan daqiqalar taqsimoti)', () => {
  it('intervallar yo‘q yoki 0 daqiqa → 0', () => {
    expect(guestTimeRaw([], 60, m(10))).toBe(0)
    expect(guestTimeRaw([iv(60000, 0, 10)], 0, m(10))).toBe(0)
  })
  it('ishlatilmagan (oldindan olingan) daqiqalar oxirgi tarifda', () => {
    // 5 daq o'tirdi, 60 daq to'lanadi
    expect(guestTimeRaw([iv(60000, 0, 5)], 60, m(100))).toBe(60000)
  })
  it('xona almashtirish: eski narx eski vaqtda, qolgan daqiqalar yangi narxda', () => {
    // 2 soat olingan: 30 daq @60k, keyin 10 daq @120k (hozir), qolgan 80 daq @120k
    const ivs = [iv(60000, 0, 30, 1), iv(120000, 30, null, 2)]
    expect(guestTimeRaw(ivs, 120, m(40))).toBe(30000 + 180000)
  })
  it('tartib natijaga ta‘sir qilmaydi (xronologik saralanadi)', () => {
    const a = iv(60000, 0, 20), b = iv(90000, 20, 50), c = iv(120000, 60, 85)
    const x = guestTimeRaw([a, b, c], 120, m(100))
    expect(guestTimeRaw([c, b, a], 120, m(100))).toBeCloseTo(x, 6)
    // 20@60k + 30@90k + 25@120k + qolgan 45@120k (oxirgi = eng kech boshlangan)
    expect(x).toBeCloseTo(20000 + 45000 + 50000 + 90000, 6)
  })
  it('hisoblanadigan daqiqalar o‘tirilgandan kam (imtiyoz) — xronologik kesiladi', () => {
    // 65 daq o'tirdi, imtiyoz bilan 60 daq hisoblanadi: 40@60k + 20@120k
    expect(guestTimeRaw([iv(60000, 0, 40), iv(120000, 40, 65)], 60, m(65))).toBeCloseTo(40000 + 40000, 6)
  })
  it('toza funksiya: kirish massivi o‘zgarmaydi', () => {
    const ivs = [iv(70000, 10, null), iv(50000, 0, 10)]
    const copy = JSON.stringify(ivs)
    guestTimeRaw(ivs, 60, m(50))
    expect(JSON.stringify(ivs)).toBe(copy)
  })
})

describe('roundAmount', () => {
  it('roundTo=1: oddiy yaxlitlash', () => {
    expect(roundAmount(29166.67, 1)).toBe(29167)
    expect(roundAmount(29166.4, 1)).toBe(29166)
  })
  it('roundTo=1: yarim chegara yuqoriga (0.5 -> 1, 1.5 -> 2, 2.5 -> 3)', () => {
    expect(roundAmount(0.5, 1)).toBe(1)
    expect(roundAmount(1.5, 1)).toBe(2)
    expect(roundAmount(2.5, 1)).toBe(3)
  })
  it('roundTo=0 va manfiy roundTo yaxlitlamaydi (yaxlit butun)', () => {
    expect(roundAmount(1234.6, 0)).toBe(1235)
    expect(roundAmount(1234.4, -5)).toBe(1234)
  })
  it('roundTo=500: eng yaqin 500', () => {
    expect(roundAmount(1249, 500)).toBe(1000)
    expect(roundAmount(1250, 500)).toBe(1500) // yarim -> yuqoriga
    expect(roundAmount(1251, 500)).toBe(1500)
    expect(roundAmount(249, 500)).toBe(0)
    expect(roundAmount(250, 500)).toBe(500)
  })
  it('roundTo=1000: yarim chegaralar', () => {
    expect(roundAmount(499, 1000)).toBe(0)
    expect(roundAmount(500, 1000)).toBe(1000)
    expect(roundAmount(1499, 1000)).toBe(1000)
    expect(roundAmount(1500, 1000)).toBe(2000)
    expect(roundAmount(2500, 1000)).toBe(3000) // bankir emas
  })
  it('0 -> 0', () => {
    expect(roundAmount(0, 1000)).toBe(0)
  })
  it('manfiy summa yarim chegarada nolga (yuqoriga) yaxlitlanadi, -0 bo\'lsa ham qiymati 0', () => {
    expect(roundAmount(-500, 1000) === 0).toBe(true)
    expect(roundAmount(-1500, 1000)).toBe(-1000)
  })
})

describe('guestTimeAmount', () => {
  it('5 daqiqa → 1 soat to‘liq', () => {
    expect(guestTimeAmount([iv(50000, 0, 5)], 60, m(5), OPT)).toBe(50000)
  })
  it('61 daqiqa (olingan 60) → 2 soat', () => {
    expect(guestTimeAmount([iv(50000, 0, null)], 60, m(61), OPT)).toBe(100000)
  })
  it('grace', () => {
    expect(guestTimeAmount([iv(50000, 0, null)], 60, m(65), opt({ graceMinutes: 5 }))).toBe(50000)
    expect(guestTimeAmount([iv(50000, 0, null)], 60, m(66), opt({ graceMinutes: 5 }))).toBe(100000)
  })
  it('yaxlitlash: 7 daqiqa olingan @50k = 5833.33', () => {
    expect(guestTimeAmount([iv(50000, 0, 7)], 7, m(7), opt({ roundTo: 1000 }))).toBe(6000)
    expect(guestTimeAmount([iv(50000, 0, 7)], 7, m(7), opt({ roundTo: 1 }))).toBe(5833)
    expect(guestTimeAmount([iv(50000, 0, 7)], 7, m(7), opt({ roundTo: 500 }))).toBe(6000)
  })
  it('hech qanday interval yo‘q → 0', () => {
    expect(guestTimeAmount([], 60, m(10), OPT)).toBe(0)
  })
})

describe('lineAmount / qaytarish', () => {
  it('oddiy qator', () => {
    expect(lineAmount({ qty: 3, returnedQty: 0, unitPrice: 12000 })).toBe(36000)
  })
  it('qisman qaytarish', () => {
    expect(lineActiveQty({ qty: 3, returnedQty: 1 })).toBe(2)
    expect(lineAmount({ qty: 3, returnedQty: 1, unitPrice: 12000 })).toBe(24000)
  })
  it('to\'liq qaytarish = 0', () => {
    expect(lineAmount({ qty: 2, returnedQty: 2, unitPrice: 50000 })).toBe(0)
  })
  it('BILLING XATO (tuzatildi): returnedQty > qty bo\'lsa manfiy summa chiqadi (0 ga cheklanmagan)', () => {
    // Reproduksiya: lineAmount({qty:1, returnedQty:3, unitPrice:10000}) === -20000, kutilgan: 0
    expect(lineAmount({ qty: 1, returnedQty: 3, unitPrice: 10000 })).toBeGreaterThanOrEqual(0)
  })
})

describe('buildGuestView / buildLineView', () => {
  it('ishlayotgan mehmon: runningRate, remainingMs, billedMinutes, timeAmount', () => {
    const g = guest(1, [iv(70000, 0, 10), iv(90000, 10, null)], 'running', 120)
    const v = buildGuestView(g, [], m(70), OPT)
    expect(v.runningRate).toBe(90000)
    expect(v.elapsedMs).toBe(m(70))
    expect(v.remainingMs).toBe(m(50))
    expect(v.billedMinutes).toBe(120)
    expect(v.paidMinutes).toBe(120)
    // 10@70k + 110@90k = 11666.67 + 165000 → 177000
    expect(v.timeAmount).toBe(177000)
    expect(v.timeAmount).toBe(guestTimeAmount(g.intervals, 120, m(70), OPT))
  })
  it('oshib ketgan mehmon: remainingMs manfiy', () => {
    const v = buildGuestView(guest(1, [iv(60000, 0, null)], 'running', 60), [], m(75), OPT)
    expect(v.remainingMs).toBe(-m(15))
    expect(v.billedMinutes).toBe(120)
    expect(v.timeAmount).toBe(120000)
  })
  it('pauzadagi mehmon: runningRate = 0, vaqt o‘tsa ham summa o‘zgarmaydi', () => {
    const g = guest(1, [iv(70000, 0, 10)], 'paused')
    expect(buildGuestView(g, [], m(70), OPT).runningRate).toBe(0)
    expect(buildGuestView(g, [], m(70), OPT).timeAmount).toBe(buildGuestView(g, [], m(500), OPT).timeAmount)
  })
  it('erta chiqib ketgan (finished) — olingan vaqt baribir to‘lanadi', () => {
    const v = buildGuestView(guest(1, [iv(60000, 0, 10)], 'finished', 120), [], m(500), OPT)
    expect(v.timeAmount).toBe(120000)
    expect(v.remainingMs).toBe(m(110))
  })
  it('state=finished lekin ochiq interval (nomuvofiq) → runningRate 0', () => {
    expect(buildGuestView(guest(1, [iv(70000, 0, null)], 'finished'), [], m(10), OPT).runningRate).toBe(0)
  })
  it('linesAmount faqat shu mehmon qatorlari, qaytarish hisobga olingan', () => {
    const g = guest(1, [])
    const lines = [
      line({ id: 1, guestId: 1, qty: 2, returnedQty: 1, unitPrice: 10000 }),
      line({ id: 2, guestId: 1, qty: 1, unitPrice: 5000 }),
      line({ id: 3, guestId: 2, qty: 5, unitPrice: 1000 }),
      line({ id: 4, guestId: null, qty: 1, unitPrice: 99000 })
    ]
    expect(buildGuestView(g, lines, 0, OPT).linesAmount).toBe(15000)
  })
  it('buildLineView: activeQty, amount, providerName', () => {
    const v = buildLineView(line({ qty: 4, returnedQty: 1, unitPrice: 2500, kind: 'service' }), 'Dilnoza')
    expect(v).toMatchObject({ activeQty: 3, amount: 7500, providerName: 'Dilnoza' })
    expect(buildLineView(line(), null).providerName).toBeNull()
  })
})

describe('ofitsiant haqi', () => {
  const lines = [
    line({ id: 1, kind: 'product', qty: 3, returnedQty: 1, unitPrice: 20000 }), // 40 000
    line({ id: 2, kind: 'product', qty: 1, unitPrice: 15000, guestId: 2 }), // 15 000
    line({ id: 3, kind: 'service', qty: 1, unitPrice: 150000, providerId: 9 }), // xizmat — kirmaydi
    line({ id: 4, kind: 'product', qty: 2, returnedQty: 2, unitPrice: 9000 }) // to'liq qaytarilgan
  ]
  it('waiterProductSales: faqat mahsulotlar, qaytarishlar ayirilgan', () => {
    expect(waiterProductSales(lines)).toBe(55000)
    expect(waiterProductSales([])).toBe(0)
    expect(waiterProductSales([lines[2]])).toBe(0)
  })
  it('waiterCommission: foiz, yaxlitlash, chegaralar', () => {
    expect(waiterCommission(55000, 10)).toBe(5500)
    expect(waiterCommission(12000, 7.5)).toBe(900)
    expect(waiterCommission(333, 10)).toBe(33)
    expect(waiterCommission(55000, 0)).toBe(0)
    expect(waiterCommission(55000, 150)).toBe(55000)
    expect(waiterCommission(55000, -5)).toBe(0)
    expect(waiterCommission(55000, NaN)).toBe(0)
  })
})

describe('obsluga (serviceChargeAmount / computeTotals pct)', () => {
  const gv = (timeAmount: number) => ({ ...buildGuestView(guest(1, []), [], 0, DEFAULT_BILLING), timeAmount })
  const lv = (amount: number) => ({ ...buildLineView(line(), null), amount })
  it('chegirmadan KEYIN: (100000+20000-30000)=90000 × 10% = 9000', () => {
    const t = computeTotals([gv(100000)], [lv(20000)], 30000, 10)
    expect(t).toEqual({ timeTotal: 100000, linesTotal: 20000, discount: 30000, serviceCharge: 9000, total: 99000 })
  })
  it('yaxlitlash butun so\'m: 12345 × 10% = 1234.5 → 1235', () => {
    expect(computeTotals([gv(12345)], [], 0, 10).serviceCharge).toBe(1235)
  })
  it('pct=0 yoki noto\'g\'ri → 0', () => {
    expect(computeTotals([gv(50000)], [], 0, 0).serviceCharge).toBe(0)
    expect(computeTotals([gv(50000)], [], 0, NaN).serviceCharge).toBe(0)
  })
})

describe('computeTotals', () => {
  const gv = (timeAmount: number) => ({ ...buildGuestView(guest(1, []), [], 0, OPT), timeAmount })
  const lv = (amount: number) => ({ ...buildLineView(line(), null), amount })

  it('oddiy yig\'indi', () => {
    expect(computeTotals([gv(100000), gv(50000)], [lv(20000)], 0)).toEqual({
      timeTotal: 150000,
      linesTotal: 20000,
      discount: 0,
      serviceCharge: 0,
      total: 170000
    })
  })
  it('chegirma jami ga qo\'llanadi', () => {
    expect(computeTotals([gv(100000)], [lv(20000)], 30000).total).toBe(90000)
  })
  it('chegirma > jami: chegirma jami bilan cheklanadi, total=0', () => {
    const t = computeTotals([gv(10000)], [lv(5000)], 999999)
    expect(t.discount).toBe(15000)
    expect(t.total).toBe(0)
  })
  it('chegirma == jami -> total 0', () => {
    expect(computeTotals([gv(10000)], [], 10000).total).toBe(0)
  })
  it('manfiy chegirma 0 deb olinadi (jami oshmaydi)', () => {
    const t = computeTotals([gv(10000)], [], -5000)
    expect(t.discount).toBe(0)
    expect(t.total).toBe(10000)
  })
  it('bo\'sh hisob', () => {
    expect(computeTotals([], [], 5000)).toEqual({ timeTotal: 0, linesTotal: 0, discount: 0, serviceCharge: 0, total: 0 })
  })
  it('BILLING XATO (tuzatildi): NaN chegirma total ni NaN qiladi', () => {
    // Reproduksiya: computeTotals([gv(10000)], [], NaN).total -> NaN (kutilgan: 10000 yoki xato)
    expect(Number.isFinite(computeTotals([gv(10000)], [], NaN).total)).toBe(true)
  })
  it('BILLING XATO (tuzatildi): manfiy qator yig\'indisi (qaytarish > qty) bo\'lsa discount manfiy bo\'ladi', () => {
    // linesTotal=-5000, time=0, discount=0 -> d = min(0, -5000) = -5000, total = 0 (jami -5000 "yo'qoladi")
    const t = computeTotals([], [lv(-5000)], 0)
    expect(t.discount).toBeGreaterThanOrEqual(0)
  })
})

describe('formatMoney', () => {
  it('0', () => expect(formatMoney(0)).toBe('0'))
  it('1000 ajratgichlar', () => {
    expect(formatMoney(999)).toBe('999')
    expect(formatMoney(1000)).toBe('1 000')
    expect(formatMoney(1234567)).toBe('1 234 567')
    expect(formatMoney(100000)).toBe('100 000')
  })
  it('manfiy: belgi ajratgichdan keyin chiqmaydi', () => {
    expect(formatMoney(-999)).toBe('-999')
    expect(formatMoney(-1234)).toBe('-1 234')
    expect(formatMoney(-1234567)).toBe('-1 234 567')
  })
  it('-0 va -0.4 -> "0"', () => {
    expect(formatMoney(-0)).toBe('0')
    expect(formatMoney(-0.4)).toBe('0')
  })
  it('kasr yaxlitlanadi', () => {
    expect(formatMoney(1234.5)).toBe('1 235')
    expect(formatMoney(999.4)).toBe('999')
  })
  it('katta son', () => {
    expect(formatMoney(1_000_000_000_000)).toBe('1 000 000 000 000')
  })
})

describe('formatDuration', () => {
  it('0', () => expect(formatDuration(0)).toBe('00:00:00'))
  it('soniya qismi tashlanadi', () => expect(formatDuration(59_999)).toBe('00:00:59'))
  it('1 daq, 1 soat', () => {
    expect(formatDuration(m(1))).toBe('00:01:00')
    expect(formatDuration(3_600_000)).toBe('01:00:00')
  })
  it('2 soat 7 daqiqa 5 soniya', () => expect(formatDuration(m(127) + s(5))).toBe('02:07:05'))
  it('24 soatdan ortiq: soat 24 dan keyin o\'ramaydi', () => {
    expect(formatDuration(25 * 3_600_000 + m(1) + s(1))).toBe('25:01:01')
    expect(formatDuration(100 * 3_600_000 + s(1))).toBe('100:00:01')
  })
  it('BILLING XATO (tuzatildi): manfiy davomiylik "-1:-1:-1" kabi buzuq satr beradi', () => {
    // Reproduksiya: formatDuration(-1000) === "-1:-1:-1"; kutilgan "00:00:00"
    expect(formatDuration(-1000)).toMatch(/^\d{2,}:\d{2}:\d{2}$/)
  })
})

describe('formatMoney', () => {
  it('0', () => expect(formatMoney(0)).toBe('0'))
  it('1000 ajratgichlar', () => {
    expect(formatMoney(999)).toBe('999')
    expect(formatMoney(1000)).toBe('1 000')
    expect(formatMoney(1234567)).toBe('1 234 567')
    expect(formatMoney(100000)).toBe('100 000')
  })
  it('manfiy: belgi ajratgichdan keyin chiqmaydi', () => {
    expect(formatMoney(-999)).toBe('-999')
    expect(formatMoney(-1234)).toBe('-1 234')
    expect(formatMoney(-1234567)).toBe('-1 234 567')
  })
  it('-0 va -0.4 -> "0"', () => {
    expect(formatMoney(-0)).toBe('0')
    expect(formatMoney(-0.4)).toBe('0')
  })
  it('kasr yaxlitlanadi', () => {
    expect(formatMoney(1234.5)).toBe('1 235')
    expect(formatMoney(999.4)).toBe('999')
  })
  it('katta son', () => {
    expect(formatMoney(1_000_000_000_000)).toBe('1 000 000 000 000')
  })
})

describe('formatDuration', () => {
  it('0', () => expect(formatDuration(0)).toBe('00:00:00'))
  it('soniya qismi tashlanadi', () => expect(formatDuration(59_999)).toBe('00:00:59'))
  it('1 daq, 1 soat', () => {
    expect(formatDuration(m(1))).toBe('00:01:00')
    expect(formatDuration(3_600_000)).toBe('01:00:00')
  })
  it('2 soat 7 daqiqa 5 soniya', () => expect(formatDuration(m(127) + s(5))).toBe('02:07:05'))
  it('24 soatdan ortiq: soat 24 dan keyin o\'ramaydi', () => {
    expect(formatDuration(25 * 3_600_000 + m(1) + s(1))).toBe('25:01:01')
    expect(formatDuration(100 * 3_600_000 + s(1))).toBe('100:00:01')
  })
  it('BILLING XATO (tuzatildi): manfiy davomiylik "-1:-1:-1" kabi buzuq satr beradi', () => {
    // Reproduksiya: formatDuration(-1000) === "-1:-1:-1"; kutilgan "00:00:00"
    expect(formatDuration(-1000)).toMatch(/^\d{2,}:\d{2}:\d{2}$/)
  })
})

describe('formatCountdown / formatHours', () => {
  it('qolgan vaqt yuqoriga soniyagacha', () => {
    expect(formatCountdown(m(60))).toBe('01:00:00')
    expect(formatCountdown(m(59) + 1)).toBe('00:59:01')
    expect(formatCountdown(0)).toBe('00:00:00')
  })
  it('oshib ketgan: + belgisi', () => {
    expect(formatCountdown(-m(5) - s(12))).toBe('+00:05:12')
  })
  it('formatHours', () => {
    expect(formatHours(60)).toBe('1 soat')
    expect(formatHours(150)).toBe('2 soat 30 daq')
    expect(formatHours(45)).toBe('45 daq')
  })
})

describe('Real senariylar (qo‘lda hisoblangan)', () => {
  const RATE = 60000
  it('4 mehmon, har biriga 1 soat: erta chiqqan, pauzali, oshib ketgan', () => {
    const NOW = m(127)
    const A = guest(1, [iv(RATE, 0, 25)]) // 25 daq → 1 soat
    const B = guest(2, [iv(RATE, 0, 40), iv(RATE, 50, null)], 'running') // 117 daq → 2 soat
    const C = guest(3, [iv(RATE, 0, null)], 'running') // 127 daq → 3 soat
    const D = guest(4, [iv(RATE, 0, null)], 'running', 180) // 3 soat olingan → 3 soat
    const gvs = [A, B, C, D].map((g) => buildGuestView(g, [], NOW, OPT))
    expect(gvs.map((g) => g.billedMinutes)).toEqual([60, 120, 180, 180])
    expect(gvs.map((g) => g.timeAmount)).toEqual([60000, 120000, 180000, 180000])
    expect(gvs.map((g) => g.remainingMs)).toEqual([m(35), -m(57), -m(67), m(53)])
    const lines = [
      line({ id: 1, guestId: 1, qty: 2, returnedQty: 1, unitPrice: 10000 }),
      line({ id: 2, kind: 'service', qty: 1, unitPrice: 150000, providerId: 5 })
    ]
    const t = computeTotals(gvs, lines.map((l) => buildLineView(l, null)), 20000)
    expect(t).toEqual({ timeTotal: 540000, linesTotal: 160000, discount: 20000, serviceCharge: 0, total: 680000 })
    expect(waiterCommission(waiterProductSales(lines), 10)).toBe(1000)
  })

  it('xona almashtirish 50k → 100k, 2 soat olingan: 60 daqiqada ko‘chdi', () => {
    const g = guest(1, [iv(50000, 0, 60, 1), iv(100000, 60, null, 2)], 'running', 120)
    // Ko'chgan zahoti: 60@50k + qolgan 60@100k
    expect(buildGuestView(g, [], m(60), OPT).timeAmount).toBe(150000)
    // 2 soat ichida o'zgarmaydi
    expect(buildGuestView(g, [], m(120), OPT).timeAmount).toBe(150000)
    // Oshdi: keyingi blok yangi narxda
    expect(buildGuestView(g, [], m(121), OPT).timeAmount).toBe(250000)
  })

  it('xona almashtirish: erta ko‘chish (10 daqiqa) — qolgan 50 daqiqa yangi narxda', () => {
    const g = guest(1, [iv(60000, 0, 10, 1), iv(120000, 10, null, 2)], 'running', 60)
    expect(buildGuestView(g, [], m(10), OPT).timeAmount).toBe(10000 + 100000)
  })

  it('uzaytirish (+1 soat) oshib ketishdan oldin — qo‘shimcha jarima bloki yo‘q', () => {
    const ivs = [iv(RATE, 0, null)]
    // 50-daqiqada +60 → paidMinutes 120; 100-daqiqada hisob 2 soat
    expect(guestTimeAmount(ivs, 120, m(100), OPT)).toBe(120000)
    // uzaytirilmaganda 100 daqiqa ham 2 soat (blok), 121 da farq: 3 soat
    expect(guestTimeAmount(ivs, 60, m(100), OPT)).toBe(120000)
    expect(guestTimeAmount(ivs, 120, m(121), OPT)).toBe(180000)
  })
})

describe('2026-10: daqiqalik ortiqcha vaqt (blockMinutes=1 — ilova standarti)', () => {
  const RATE = 60000 // 1 000 so'm/daqiqa
  it('1 soat olingan, 01:01:00 → 61 daqiqa (avtomatik 2 soat EMAS)', () => {
    expect(billedMinutes(m(61), 60, PER_MIN)).toBe(61)
    expect(guestTimeAmount([iv(RATE, 0, null)], 60, m(61), PER_MIN)).toBe(61000)
  })
  it('olingan vaqt ichida — to‘liq soat (5 daqiqa ham 60 daqiqa)', () => {
    expect(billedMinutes(m(5), 60, PER_MIN)).toBe(60)
    expect(guestTimeAmount([iv(RATE, 0, null)], 60, m(5), PER_MIN)).toBe(60000)
  })
  it('boshlangan daqiqa to‘liq: 01:00:01 → 61 daq; 01:30:59 → 91 daq', () => {
    expect(billedMinutes(m(60) + s(1), 60, PER_MIN)).toBe(61)
    expect(billedMinutes(m(90) + s(59), 60, PER_MIN)).toBe(91)
    expect(billedMinutes(m(120), 60, PER_MIN)).toBe(120)
  })
  it('imtiyoz bilan: 10 daqiqagacha qo‘shilmaydi, 71-daqiqada 71 daq', () => {
    const G = { ...PER_MIN, graceMinutes: 10 }
    expect(billedMinutes(m(70), 60, G)).toBe(60)
    expect(billedMinutes(m(70) + s(1), 60, G)).toBe(71)
  })
  it('summa: 50 000/soat, 75 daqiqa → 62 500 → yaxlitlash 1000 bilan 63 000; roundTo=1 → 62 500', () => {
    expect(guestTimeAmount([iv(50000, 0, 75)], 60, m(80), PER_MIN)).toBe(63000)
    expect(guestTimeAmount([iv(50000, 0, 75)], 60, m(80), { ...PER_MIN, roundTo: 1 })).toBe(62500)
  })
  it('xona almashtirish: 60@50k + 61 daq @100k (oshgan daqiqa yangi narxda)', () => {
    const g = guest(1, [iv(50000, 0, 60, 1), iv(100000, 60, null, 2)], 'running', 120)
    // 121 daq: 60 × 50k/60 + 61 × 100k/60 = 50 000 + 101 666.7 = 151 666.7 → 152 000
    expect(buildGuestView(g, [], m(121), PER_MIN).timeAmount).toBe(152000)
    expect(buildGuestView(g, [], m(121), PER_MIN).billedMinutes).toBe(121)
  })
  it('paidMinutes=0 (eski sessiya): aynan o‘tirilgan daqiqa', () => {
    expect(billedMinutes(m(30), 0, PER_MIN)).toBe(30)
    expect(guestTimeAmount([iv(30000, 0, 30)], 0, m(30), PER_MIN)).toBe(15000)
  })
  it('4 mehmon (yuqoridagi real senariy) daqiqalik hisobda', () => {
    const NOW = m(127)
    const gs = [
      guest(1, [iv(RATE, 0, 25)]), // 25 daq → 60
      guest(2, [iv(RATE, 0, 40), iv(RATE, 50, null)], 'running'), // 117 daq
      guest(3, [iv(RATE, 0, null)], 'running'), // 127 daq
      guest(4, [iv(RATE, 0, null)], 'running', 180) // 180 olingan
    ].map((g) => buildGuestView(g, [], NOW, PER_MIN))
    expect(gs.map((g) => g.billedMinutes)).toEqual([60, 117, 127, 180])
    expect(gs.map((g) => g.timeAmount)).toEqual([60000, 117000, 127000, 180000])
  })
})

describe('formatTimeShown', () => {
  it('qolgan vaqt va oshganda jami o‘tirilgan vaqt', () => {
    expect(formatTimeShown(m(59), 60)).toBe('00:59:00')
    expect(formatTimeShown(-m(1), 60)).toBe('01:01:00')
    expect(formatTimeShown(-m(2), 60)).toBe('01:02:00')
  })
})
