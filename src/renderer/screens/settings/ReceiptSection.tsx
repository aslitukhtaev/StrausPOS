/// <reference types="vite/client" />
import { Component, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react'
import type { ReceiptData, ReceiptSettings } from '@shared/types'
import { api } from '@/api'
import { Button, Field, Input, Segmented, Select, Spinner, Switch, TextArea, toast } from '@/ui'
import { useStaff } from '@/store/auth'
import { Note, SaveBar, SectionHead, jsonEqual, useReportDirty, type SectionProps } from './common'

// ── Jonli namuna: checkout moduli (boshqa agent) bo'lsa — uning ReceiptPreview komponenti, aks holda iframe ──
type CheckoutModule = {
  ReceiptPreview?: ComponentType<{ data: ReceiptData; className?: string }>
  sampleReceiptData?: ReceiptData | ((settings: ReceiptSettings) => ReceiptData)
}
const checkoutMods = import.meta.glob<CheckoutModule>('../checkout/index.tsx', { eager: true })
const checkout: CheckoutModule | undefined = checkoutMods['../checkout/index.tsx']

/** O'zimizning namunaviy chek (checkout moduli bo'lmasa). */
function ownSample(settings: ReceiptSettings, cashier: string): ReceiptData {
  const closedAt = new Date()
  closedAt.setSeconds(0, 0)
  const closed = closedAt.getTime()
  const opened = closed - (97 * 60_000)
  return {
    settings,
    receiptNo: 128,
    roomName: 'VIP-1',
    openedAt: opened,
    closedAt: closed,
    cashier: cashier || 'Kassir',
    guests: [
      { label: 'Mehmon 1', elapsedMs: 97 * 60_000, timeAmount: 113_000 },
      { label: 'Mehmon 2', elapsedMs: 62 * 60_000, timeAmount: 72_000 }
    ],
    lines: [
      { name: 'Choy (choynak)', qty: 2, unitPrice: 15_000, amount: 30_000, guestLabel: null, providerName: null },
      { name: 'Coca-Cola 0,5 l', qty: 1, unitPrice: 12_000, amount: 12_000, guestLabel: 'Mehmon 2', providerName: null },
      { name: 'Klassik massaj', qty: 1, unitPrice: 150_000, amount: 150_000, guestLabel: 'Mehmon 1', providerName: 'Malika' }
    ],
    timeTotal: 185_000,
    linesTotal: 192_000,
    discount: 7_000,
    total: 370_000,
    payments: [
      { method: 'cash', amount: 200_000 },
      { method: 'card', amount: 170_000 }
    ],
    debtor: null
  }
}

function sampleFor(settings: ReceiptSettings, cashier: string): ReceiptData {
  const s = checkout?.sampleReceiptData
  try {
    if (typeof s === 'function') return { ...s(settings), settings }
    if (s && typeof s === 'object') return { ...s, settings }
  } catch {
    /* o'zimiznikiga qaytamiz */
  }
  return ownSample(settings, cashier)
}

/** checkout dagi ReceiptPreview yiqilsa — iframe namunasiga qaytadi. */
class PreviewBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

function IframePreview({ data }: { data: ReceiptData }) {
  const [html, setHtml] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [height, setHeight] = useState(600)
  const ref = useRef<HTMLIFrameElement>(null)
  const key = JSON.stringify(data)

  useEffect(() => {
    let alive = true
    const t = setTimeout(() => {
      api.system
        .receiptHtml(data)
        .then((h) => alive && (setHtml(h), setErr(null)))
        .catch((e: unknown) => alive && setErr(e instanceof Error ? e.message : String(e)))
    }, 250)
    return () => {
      alive = false
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const measure = () => {
    try {
      const doc = ref.current?.contentDocument
      if (doc) setHeight(Math.max(200, doc.documentElement.scrollHeight + 4))
    } catch {
      /* ignore */
    }
  }

  if (err) return <div className="set-preview__err">Namunani yuklab bo'lmadi: {err}</div>
  if (html == null) return <div className="set-center"><Spinner size={36} /></div>
  const widthPx = Math.round((data.settings.paperWidth === 58 ? 58 : 80) * 96 / 25.4)
  return (
    <iframe
      ref={ref}
      title="Chek namunasi"
      className="set-preview__frame"
      sandbox="allow-same-origin"
      srcDoc={html}
      onLoad={measure}
      style={{ width: widthPx, height }}
      data-testid="receipt-iframe"
    />
  )
}

const SHOW_OPTIONS: { key: 'showGuestBreakdown' | 'showStaff' | 'showTimes'; title: string; desc: string }[] = [
  { key: 'showGuestBreakdown', title: "Mehmonlar bo'yicha", desc: 'Har bir mehmonning vaqti va summasi alohida' },
  { key: 'showStaff', title: 'Xodim', desc: 'Kassir va xizmat ko\'rsatgan xodim ismi' },
  { key: 'showTimes', title: 'Vaqtlar', desc: 'Kirish va chiqish sanasi/soati' }
]

export function ReceiptSection({ settings, save, onDirty }: SectionProps) {
  const staff = useStaff()
  const [draft, setDraft] = useState<ReceiptSettings>(settings.receipt)
  const [saving, setSaving] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [printers, setPrinters] = useState<{ name: string; displayName: string; isDefault: boolean }[] | null>(null)

  useEffect(() => setDraft(settings.receipt), [settings.receipt])
  useEffect(() => {
    api.system.listPrinters().then(setPrinters).catch(() => setPrinters([]))
  }, [])

  const dirty = !jsonEqual(draft, settings.receipt)
  useReportDirty(dirty, onDirty)
  const patch = (p: Partial<ReceiptSettings>) => setDraft((d) => ({ ...d, ...p }))

  const sample = useMemo(() => sampleFor(draft, staff?.name || ''), [draft, staff?.name])

  const onSave = async () => {
    setSaving(true)
    await save({ ...settings, receipt: draft }, 'Chek sozlamalari saqlandi')
    setSaving(false)
  }

  const testPrint = async () => {
    setPrinting(true)
    try {
      await api.system.printReceipt(sample)
      toast.success('Sinov cheki printerga yuborildi', {
        description: draft.printerName ? 'Printer: ' + draft.printerName : 'Standart printer'
      })
    } catch (e) {
      toast.error(e)
    } finally {
      setPrinting(false)
    }
  }

  const Preview = checkout?.ReceiptPreview
  const iframe = (
    <div className="set-preview__paper">
      <IframePreview data={sample} />
    </div>
  )
  const printerKnown = !draft.printerName || (printers || []).some((p) => p.name === draft.printerName)

  return (
    <div className="set-section">
      <SectionHead
        icon="receipt"
        title="Chek"
        description="Chekda nima yozilishi va qaysi printerga chiqishi"
        actions={
          <Button icon="printer" onClick={() => void testPrint()} loading={printing} data-testid="receipt-test">
            Sinov cheki chop etish
          </Button>
        }
      />
      <div className="set-receipt">
        <div className="set-receipt__form set-section__body">
          <div className="set-group">
            <div className="set-group__title">Biznes ma'lumotlari</div>
            <Field label="Biznes nomi" hint="Chek tepasida va qulf ekranida ko'rinadi">
              <Input size="lg" value={draft.businessName} maxLength={100} onChange={(e) => patch({ businessName: e.target.value })} data-testid="rc-name" />
            </Field>
            <Field label="Manzil">
              <Input value={draft.address} maxLength={200} placeholder="Masalan: Toshkent, Chilonzor 5" onChange={(e) => patch({ address: e.target.value })} />
            </Field>
            <Field label="Telefon">
              <Input value={draft.phone} maxLength={50} icon="phone" placeholder="+998 90 123 45 67" onChange={(e) => patch({ phone: e.target.value })} />
            </Field>
            <Field label="Pastki yozuv" hint="Chek oxirida chiqadi">
              <TextArea rows={2} value={draft.footer} maxLength={300} onChange={(e) => patch({ footer: e.target.value })} />
            </Field>
          </div>

          <div className="set-group">
            <div className="set-group__title">Ko'rinish</div>
            <Field as="div" label="Qog'oz kengligi">
              <Segmented
                block
                value={draft.paperWidth}
                onChange={(v) => patch({ paperWidth: v })}
                options={[
                  { value: 58, label: '58 mm' },
                  { value: 80, label: '80 mm' }
                ]}
              />
            </Field>
            <div className="set-switches">
              {SHOW_OPTIONS.map((o) => (
                <Switch key={o.key} checked={draft[o.key]} onChange={(v) => patch({ [o.key]: v })} label={o.title} description={o.desc} />
              ))}
            </div>
          </div>

          <div className="set-group">
            <div className="set-group__title">Chop etish</div>
            <Switch
              checked={draft.autoPrintOnPay}
              onChange={(v) => patch({ autoPrintOnPay: v })}
              label="To'lovdan keyin avtomatik chop etish"
              description="Hisob yopilishi bilan chek o'zi chiqadi"
              data-testid="rc-autoprint"
            />
            <Field
              label="Printer"
              hint={printers && printers.length === 0 ? "Printerlar ro'yxati faqat dastur (Windows) ichida ko'rinadi. Bo'sh = standart printer." : "Bo'sh qoldirilsa — Windows'ning standart printeri"}
            >
              <Select value={draft.printerName} onChange={(e) => patch({ printerName: e.target.value })} data-testid="rc-printer">
                <option value="">Standart printer</option>
                {(printers || []).map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.displayName || p.name}{p.isDefault ? ' (standart)' : ''}
                  </option>
                ))}
                {!printerKnown && <option value={draft.printerName}>{draft.printerName} (topilmadi)</option>}
              </Select>
            </Field>
          </div>
        </div>

        <aside className="set-preview">
          <div className="set-preview__label">Jonli namuna · {draft.paperWidth} mm</div>
          <div className="set-preview__holder" data-testid="receipt-preview">
            {Preview ? (
              <PreviewBoundary fallback={iframe}>
                <Preview data={sample} className="set-preview__ext" />
              </PreviewBoundary>
            ) : (
              iframe
            )}
          </div>
          <Note>Namuna — o'ylab topilgan hisob. Haqiqiy chekda xona va summalar o'zingizniki bo'ladi.</Note>
        </aside>
      </div>
      <SaveBar dirty={dirty} saving={saving} onSave={() => void onSave()} onReset={() => setDraft(settings.receipt)} />
    </div>
  )
}
