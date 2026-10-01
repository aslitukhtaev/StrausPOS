import { describe, it, expect } from 'vitest'
import {
  MS_MIN,
  intervalMs,
  guestElapsedMs,
  guestTimeRaw,
  roundAmount,
  guestTimeAmount,
  lineActiveQty,
  lineAmount,
  buildGuestView,
  buildLineView,
  computeTotals,
  formatMoney,
  formatDuration
} from '../../src/shared/billing'
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
const guest = (id: number, intervals: TimeInterval[], state: Guest['state'] = 'finished'): Guest => ({
  id,
  sessionId: 1,
  label: `Mehmon ${id}`,
  state,
  intervals
})
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

describe('guestTimeRaw', () => {
  it('0 vaqt -> 0 so\'m', () => {
    expect(guestTimeRaw([], m(10))).toBe(0)
    expect(guestTimeRaw([iv(70000, 3, 3)], m(10))).toBe(0)
  })
  it('1 soat = tarif', () => {
    expect(guestTimeRaw([iv(70000, 0, 60)], m(60))).toBe(70000)
  })
  it('bitta minutdan kam vaqt = 0 (pastga)', () => {
    expect(guestTimeRaw([iv(70000, 0, 0)].map((x) => ({ ...x, end: s(59) })), m(60))).toBe(0)
  })
  it('butun minut pastga: 1 daq 59 son = 1 daq', () => {
    const x: TimeInterval = { roomId: 1, rate: 60000, start: 0, end: s(119) }
    expect(guestTimeRaw([x], 0)).toBe(1000)
  })
  it('bir xil tarifli kichik intervallar yig\'indisidan minut yo\'qolmaydi (59s x 5 = 295s = 4 min)', () => {
    const ivs: TimeInterval[] = Array.from({ length: 5 }, (_, i) => ({
      roomId: 1,
      rate: 60000,
      start: i * m(10),
      end: i * m(10) + s(59)
    }))
    // interval-darajasida floor bo'lganda 0 chiqardi
    expect(guestTimeRaw(ivs, m(100))).toBe(4000)
  })
  it('30s + 30s (pauza/davom) = 1 to\'liq minut', () => {
    const ivs: TimeInterval[] = [
      { roomId: 1, rate: 60000, start: 0, end: s(30) },
      { roomId: 1, rate: 60000, start: m(5), end: m(5) + s(30) }
    ]
    expect(guestTimeRaw(ivs, m(10))).toBe(1000)
  })
  it('ochiq interval hozirgi vaqt bilan o\'sadi', () => {
    const ivs = [iv(60000, 0, null)]
    expect(guestTimeRaw(ivs, m(10))).toBe(10000)
    expect(guestTimeRaw(ivs, m(11))).toBe(11000)
  })
  it('bir nechta tarif: har intervalga o\'z narxi', () => {
    // 60 daq @70k + 30 daq @90k
    expect(guestTimeRaw([iv(70000, 0, 60), iv(90000, 60, 90)], m(90))).toBe(70000 + 45000)
  })
  it('intervallar tartibi natijaga ta\'sir qilmaydi', () => {
    const a = iv(70000, 0, 20), b = iv(90000, 20, 50), c = iv(70000, 60, 85)
    const x = guestTimeRaw([a, b, c], m(100))
    expect(guestTimeRaw([c, b, a], m(100))).toBeCloseTo(x, 6)
    expect(guestTimeRaw([b, a, c], m(100))).toBeCloseTo(x, 6)
  })
  it('qo\'shni bo\'lmagan bir xil tarif intervallari birlashtiriladi (70k->90k->70k)', () => {
    const ivs: TimeInterval[] = [
      { roomId: 1, rate: 70000, start: 0, end: m(20) + s(30) },
      { roomId: 2, rate: 90000, start: m(21), end: m(31) },
      { roomId: 1, rate: 70000, start: m(40), end: m(60) + s(30) }
    ]
    // 70k guruh: 41 daq (20:30 + 20:30), 90k guruh: 10 daq
    expect(guestTimeRaw(ivs, m(100))).toBeCloseTo((41 * 70000) / 60 + (10 * 90000) / 60, 6)
  })
  it('tarif almashganda minut yo\'qolmaydi: 30:30@70k + 30:30@90k = jami 61 daq', () => {
    const ivs: TimeInterval[] = [
      { roomId: 1, rate: 70000, start: 0, end: m(30) + s(30) },
      { roomId: 2, rate: 90000, start: m(31), end: m(61) + s(30) }
    ]
    // Jami 61 daq butun minutga kesiladi, har interval o'z tarifi bilan: 30.5*70000/60 + 30.5*90000/60
    expect(guestTimeRaw(ivs, m(100))).toBeCloseTo((30.5 * 70000) / 60 + (30.5 * 90000) / 60, 6)
  })
  it('qayta ishlatilgan intervallar massivi o\'zgarmaydi (toza funksiya)', () => {
    const ivs = [iv(70000, 0, null)]
    const copy = JSON.stringify(ivs)
    guestTimeRaw(ivs, m(50))
    expect(JSON.stringify(ivs)).toBe(copy)
  })
  it('BILLING NOTE: kesishuvchi intervallar ikki marta sanaladi (dedup yo\'q)', () => {
    expect(guestTimeRaw([iv(60000, 0, 10), iv(60000, 5, 15)], m(20))).toBe(20000)
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
  it('yaxlitlash bilan', () => {
    // 25 daq @70k = 29166.67
    expect(guestTimeAmount([iv(70000, 0, 25)], m(25), 1000)).toBe(29000)
    expect(guestTimeAmount([iv(70000, 0, 25)], m(25), 1)).toBe(29167)
    expect(guestTimeAmount([iv(70000, 0, 25)], m(25), 500)).toBe(29000)
  })
  it('117 daq @70k = 136500 -> roundTo 1000 yarim chegarada 137000', () => {
    expect(guestTimeAmount([iv(70000, 0, 117)], m(117), 1000)).toBe(137000)
    expect(guestTimeAmount([iv(70000, 0, 117)], m(117), 500)).toBe(136500)
  })
  it('hech vaqt o\'tmagan -> 0', () => {
    expect(guestTimeAmount([iv(70000, 0, null)], 0, 1000)).toBe(0)
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
  it('ishlayotgan mehmon: runningRate = ochiq interval tarifi', () => {
    const g = guest(1, [iv(70000, 0, 10), iv(90000, 10, null)], 'running')
    const v = buildGuestView(g, [], m(70), 1000)
    expect(v.runningRate).toBe(90000)
    expect(v.elapsedMs).toBe(m(70))
    expect(v.timeAmount).toBe(guestTimeAmount(g.intervals, m(70), 1000))
  })
  it('pauzadagi mehmon: runningRate = 0', () => {
    const g = guest(1, [iv(70000, 0, 10)], 'paused')
    expect(buildGuestView(g, [], m(70), 1000).runningRate).toBe(0)
  })
  it('state=finished lekin ochiq interval (nomuvofiq) -> runningRate 0', () => {
    const g = guest(1, [iv(70000, 0, null)], 'finished')
    expect(buildGuestView(g, [], m(10), 1).runningRate).toBe(0)
  })
  it('state=running, ochiq interval yo\'q -> runningRate 0 va xato yo\'q', () => {
    const g = guest(1, [iv(70000, 0, 10)], 'running')
    expect(buildGuestView(g, [], m(10), 1).runningRate).toBe(0)
  })
  it('linesAmount faqat shu mehmon qatorlari, qaytarish hisobga olingan, umumiy (null) qator kirmaydi', () => {
    const g = guest(1, [])
    const lines = [
      line({ id: 1, guestId: 1, qty: 2, returnedQty: 1, unitPrice: 10000 }), // 10000
      line({ id: 2, guestId: 1, qty: 1, unitPrice: 5000 }), // 5000
      line({ id: 3, guestId: 2, qty: 5, unitPrice: 1000 }), // boshqa mehmon
      line({ id: 4, guestId: null, qty: 1, unitPrice: 99000 }) // guruh
    ]
    expect(buildGuestView(g, lines, 0, 1).linesAmount).toBe(15000)
  })
  it('asl mehmon maydonlarini saqlaydi', () => {
    const g = guest(7, [])
    const v = buildGuestView(g, [], 0, 1)
    expect(v.id).toBe(7)
    expect(v.label).toBe('Mehmon 7')
  })
  it('buildLineView: activeQty, amount, providerName', () => {
    const v = buildLineView(line({ qty: 4, returnedQty: 1, unitPrice: 2500, kind: 'service' }), 'Dilnoza')
    expect(v.activeQty).toBe(3)
    expect(v.amount).toBe(7500)
    expect(v.providerName).toBe('Dilnoza')
    expect(buildLineView(line(), null).providerName).toBeNull()
  })
})

describe('computeTotals', () => {
  const gv = (timeAmount: number) => ({ ...buildGuestView(guest(1, []), [], 0, 1), timeAmount })
  const lv = (amount: number) => ({ ...buildLineView(line(), null), amount })

  it('oddiy yig\'indi', () => {
    expect(computeTotals([gv(100000), gv(50000)], [lv(20000)], 0)).toEqual({
      timeTotal: 150000,
      linesTotal: 20000,
      discount: 0,
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
    expect(computeTotals([], [], 5000)).toEqual({ timeTotal: 0, linesTotal: 0, discount: 0, total: 0 })
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

describe('Real senariylar (qo\'lda hisoblangan)', () => {
  const RATE = 70000
  const NOW = m(127) // 2 soat 7 daqiqa
  // A: 25 daqiqada chiqadi; B: 40-daqiqadan 10 daqiqa pauza; C, D: to'liq
  const A = guest(1, [iv(RATE, 0, 25)])
  const B = guest(2, [iv(RATE, 0, 40), iv(RATE, 50, 127)])
  const C = guest(3, [iv(RATE, 0, 127)])
  const D = guest(4, [iv(RATE, 0, 127)])
  const all = [A, B, C, D]

  it('har bir mehmonning vaqti (ms)', () => {
    expect(all.map((g) => guestElapsedMs(g.intervals, NOW))).toEqual([m(25), m(117), m(127), m(127)])
  })
  it('roundTo=1: 29167 + 136500 + 148167 + 148167 = 462001', () => {
    // 25*70000/60 = 29166.67; 117*70000/60 = 136500; 127*70000/60 = 148166.67
    const amounts = all.map((g) => guestTimeAmount(g.intervals, NOW, 1))
    expect(amounts).toEqual([29167, 136500, 148167, 148167])
    expect(amounts.reduce((a, b) => a + b, 0)).toBe(462001)
  })
  it('roundTo=1000: 29000 + 137000 (136500 yarim -> yuqoriga) + 148000 + 148000 = 462000', () => {
    const amounts = all.map((g) => guestTimeAmount(g.intervals, NOW, 1000))
    expect(amounts).toEqual([29000, 137000, 148000, 148000])
    expect(amounts.reduce((a, b) => a + b, 0)).toBe(462000)
  })
  it('roundTo=500: 29000 + 136500 + 148000 + 148000 = 461500', () => {
    // 29166.67/500 = 58.33 -> 58 -> 29000; 148166.67/500 = 296.33 -> 296 -> 148000
    const amounts = all.map((g) => guestTimeAmount(g.intervals, NOW, 500))
    expect(amounts).toEqual([29000, 136500, 148000, 148000])
  })
  it('to\'liq hisob: vaqt + mahsulot + chegirma', () => {
    const lines = [
      line({ id: 1, guestId: 1, qty: 2, returnedQty: 1, unitPrice: 10000 }), // A: 10000
      line({ id: 2, guestId: 3, qty: 1, unitPrice: 25000 }), // C: 25000
      line({ id: 3, guestId: null, kind: 'service', qty: 1, unitPrice: 150000, providerId: 5 }) // guruh: 150000
    ]
    const gvs = all.map((g) => buildGuestView(g, lines, NOW, 1000))
    const lvs = lines.map((l) => buildLineView(l, null))
    expect(gvs.map((g) => g.linesAmount)).toEqual([10000, 0, 25000, 0])
    const t = computeTotals(gvs, lvs, 20000)
    expect(t.timeTotal).toBe(462000)
    expect(t.linesTotal).toBe(185000)
    expect(t.discount).toBe(20000)
    expect(t.total).toBe(462000 + 185000 - 20000)
  })
  it('B hozir pauzadan keyin ishlayapti (ochiq interval): runningRate va vaqt', () => {
    const Bopen = guest(2, [iv(RATE, 0, 40), iv(RATE, 50, null)], 'running')
    const v = buildGuestView(Bopen, [], NOW, 1000)
    expect(v.elapsedMs).toBe(m(117))
    expect(v.timeAmount).toBe(137000)
    expect(v.runningRate).toBe(RATE)
  })
  it('B hozir pauzada (50-daqiqagacha): pauza vaqti hisoblanmaydi, soat o\'tsa ham o\'zgarmaydi', () => {
    const Bp = guest(2, [iv(RATE, 0, 40)], 'paused')
    expect(buildGuestView(Bp, [], m(45), 1).timeAmount).toBe(buildGuestView(Bp, [], m(500), 1).timeAmount)
    expect(buildGuestView(Bp, [], m(45), 1).timeAmount).toBe(46667) // 40*70000/60 = 46666.67
  })

  describe('xona almashtirish 70k -> 90k', () => {
    it('eski intervalda eski narx qoladi, yangisida yangi', () => {
      // 60 daq @70k, keyin 30 daq @90k
      const g = guest(1, [iv(70000, 0, 60, 1), iv(90000, 60, 90, 2)])
      expect(guestTimeRaw(g.intervals, m(90))).toBe(70000 + 45000)
      // butun vaqtga 90k qo'llanganda 135000 bo'lardi
      expect(guestTimeRaw(g.intervals, m(90))).not.toBe(135000)
    })
    it('narx keyin o\'zgarsa eski yopiq interval hisobi o\'zgarmaydi (faqat ochiq interval yangi tarifda)', () => {
      const before = guestTimeRaw([iv(70000, 0, 60)], m(60))
      const after = guestTimeRaw([iv(70000, 0, 60), iv(90000, 60, null)], m(60))
      expect(after).toBe(before) // yangi interval hali 0 daq
      expect(guestTimeRaw([iv(70000, 0, 60), iv(90000, 60, null)], m(80))).toBe(70000 + 30000)
    })
    it('pauza + xona almashtirish: B 30 daq @70k, pauza, 70-daqiqadan @90k', () => {
      const B2 = guest(2, [iv(70000, 0, 30, 1), iv(90000, 70, 90, 2)])
      expect(guestTimeRaw(B2.intervals, m(90))).toBe(35000 + 30000)
    })
    it('A (ishlayapti) va B (pauzada) almashtirishda: faqat ishlayotganning yangi intervali ochiladi', () => {
      const Ar = guest(1, [iv(70000, 0, 60, 1), iv(90000, 60, null, 2)], 'running')
      const Bp = guest(2, [iv(70000, 0, 45, 1)], 'paused')
      const va = buildGuestView(Ar, [], m(90), 1)
      const vb = buildGuestView(Bp, [], m(90), 1)
      expect(va.runningRate).toBe(90000)
      expect(va.timeAmount).toBe(115000)
      expect(vb.runningRate).toBe(0)
      expect(vb.timeAmount).toBe(52500) // 45 * 70000/60
    })
    it('almashtirish chegarasida soniyalar: 60:40@70k + 29:20@90k -> minut yo\'qolmaydi', () => {
      const g = [
        { roomId: 1, rate: 70000, start: 0, end: m(60) + s(40) },
        { roomId: 2, rate: 90000, start: m(60) + s(40), end: m(90) }
      ] as TimeInterval[]
      expect(guestElapsedMs(g, m(90))).toBe(m(90))
      // 90 daq to'liq hisoblanadi: (60+40/60)*70000/60 + (29+20/60)*90000/60
      expect(guestTimeRaw(g, m(90))).toBeCloseTo(((60 + 40 / 60) * 70000) / 60 + ((29 + 20 / 60) * 90000) / 60, 6)
    })
  })
})
