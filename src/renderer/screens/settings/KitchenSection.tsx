/**
 * Sozlamalar → Oshxona: ulush foizi (oshxona savdosidan oshxonaga beriladigan qism), oshxona printeri,
 * qog'oz kengligi, avtomatik oshxona cheki, sinov cheki.
 */
import { useEffect, useMemo, useState } from 'react'
import type { AppSettings, ReceiptData } from '@shared/types'
import { api } from '@/api'
import { Button, Field, Input, Money, Segmented, Select, Switch, cx, formatMoney, toast } from '@/ui'
import { Note, SaveBar, SectionHead, jsonEqual, useReportDirty, type SectionProps } from './common'
import './kitchen.css'

type Kitchen = AppSettings['kitchen']
const DEFAULT_KITCHEN: Kitchen = { sharePct: 100, printerName: '', paperWidth: 80, autoPrint: true }
const PCTS = [100, 50, 40, 30]
const EXAMPLE_SALES = 1_000_000

const pick = (s: AppSettings): Kitchen => ({ ...DEFAULT_KITCHEN, ...(s.kitchen || {}) })

export function KitchenSection({ settings, save, onDirty }: SectionProps) {
  const base = useMemo(() => pick(settings), [settings])
  const [d, setD] = useState<Kitchen>(base)
  const [pctText, setPctText] = useState(String(base.sharePct))
  const [saving, setSaving] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [printers, setPrinters] = useState<{ name: string; displayName: string; isDefault: boolean }[] | null>(null)

  useEffect(() => {
    setD(base)
    setPctText(String(base.sharePct))
  }, [base])
  useEffect(() => {
    api.system.listPrinters().then(setPrinters).catch(() => setPrinters([]))
  }, [])

  const dirty = !jsonEqual(d, base)
  useReportDirty(dirty, onDirty)
  const patch = (p: Partial<Kitchen>) => setD((x) => ({ ...x, ...p }))
  const pctValid = /^\d{1,3}$/.test(pctText) && Number(pctText) <= 100

  const setPct = (v: number) => {
    setPctText(String(v))
    patch({ sharePct: v })
  }

  const onSave = async () => {
    if (!pctValid) return toast.warning("Ulush foizi 0 dan 100 gacha bo'lishi kerak")
    setSaving(true)
    await save({ ...settings, kitchen: d }, 'Oshxona sozlamalari saqlandi')
    setSaving(false)
  }

  const testPrint = async () => {
    setPrinting(true)
    const now = Date.now()
    const data: ReceiptData = {
      settings: {
        ...settings.receipt,
        businessName: 'OSHXONA — SINOV CHEKI',
        address: '',
        phone: '',
        footer: 'Oshxona printeri ishlayapti',
        paperWidth: d.paperWidth,
        printerName: d.printerName,
        showGuestBreakdown: false,
        showStaff: true,
        showTimes: true
      },
      receiptNo: 0,
      roomName: 'Sinov',
      openedAt: now,
      closedAt: now,
      cashier: 'Sinov',
      guests: [],
      lines: [
        { name: 'Shashlik (sinov)', qty: 2, unitPrice: 0, amount: 0, guestLabel: null, providerName: null },
        { name: 'Salat (sinov)', qty: 1, unitPrice: 0, amount: 0, guestLabel: null, providerName: null }
      ],
      timeTotal: 0,
      linesTotal: 0,
      discount: 0,
      serviceCharge: { pct: 0, amount: 0 },
      total: 0,
      payments: [],
      debtor: null,
      provisional: true
    }
    try {
      await api.system.printReceipt(data)
      toast.success('Sinov cheki oshxona printeriga yuborildi', { description: d.printerName ? 'Printer: ' + d.printerName : 'Standart printer' })
    } catch (e) {
      toast.error(e)
    } finally {
      setPrinting(false)
    }
  }

  const printerKnown = !d.printerName || (printers || []).some((p) => p.name === d.printerName)
  const exampleDue = pctValid ? Math.round((EXAMPLE_SALES * Number(pctText)) / 100) : 0

  return (
    <div className="set-section">
      <SectionHead
        icon="flame"
        title="Oshxona"
        description="Oshxona ulushi, oshxona printeri va avtomatik oshxona cheki"
        actions={
          <Button icon="printer" onClick={() => void testPrint()} loading={printing} data-testid="kitchen-test">
            Sinov cheki
          </Button>
        }
      />
      <div className="set-section__body">
        <div className="set-group">
          <div className="set-group__title">Ulush</div>
          <Field
            as="div"
            label="Oshxonaga beriladigan ulush"
            hint="Oshxona mahsulotlari savdosining necha foizi oshxona jamoasiga beriladi (kunlik hisobda «Oshxonaga tegishli»)"
            error={pctValid ? undefined : '0 dan 100 gacha butun son'}
          >
            <div className="set-kitchen__pct">
              <Segmented
                value={PCTS.indexOf(d.sharePct) >= 0 && pctValid ? d.sharePct : -1}
                onChange={(v) => setPct(v)}
                options={PCTS.map((v) => ({ value: v, label: v + '%' }))}
              />
              <Input
                className={cx('set-kitchen__pctin')}
                inputMode="numeric"
                value={pctText}
                maxLength={3}
                suffix="%"
                invalid={!pctValid}
                onChange={(e) => {
                  const t = e.target.value.replace(/\D/g, '').slice(0, 3)
                  setPctText(t)
                  if (/^\d{1,3}$/.test(t) && Number(t) <= 100) patch({ sharePct: Number(t) })
                }}
                aria-label="Ulush foizi"
                data-testid="kitchen-pct"
              />
            </div>
          </Field>
          <div className="set-kitchen__example">
            Misol: kunlik oshxona savdosi {formatMoney(EXAMPLE_SALES)} so'm bo'lsa, oshxonaga <Money value={exampleDue} tone="accent" /> beriladi.
          </div>
        </div>

        <div className="set-group">
          <div className="set-group__title">Oshxona cheki</div>
          <Switch
            checked={d.autoPrint}
            onChange={(v) => patch({ autoPrint: v })}
            label="Avtomatik oshxona cheki"
            description="Oshxona mahsuloti qo'shilganda chek oshxona printeriga o'zi chiqadi (qaytarishda «BEKOR» cheki)"
            data-testid="kitchen-autoprint"
          />
          <Field
            label="Oshxona printeri"
            hint={
              printers && printers.length === 0
                ? "Printerlar ro'yxati faqat dastur (Windows) ichida ko'rinadi. Bo'sh = standart printer."
                : 'Asosiy kompyuterga ulangan oshxona printeri. Terminallardan qo\'shilgan buyurtmalar ham shu printerga chiqadi.'
            }
          >
            <Select value={d.printerName} onChange={(e) => patch({ printerName: e.target.value })} data-testid="kitchen-printer">
              <option value="">Standart printer</option>
              {(printers || []).map((p) => (
                <option key={p.name} value={p.name}>
                  {p.displayName || p.name}{p.isDefault ? ' (standart)' : ''}
                </option>
              ))}
              {!printerKnown && <option value={d.printerName}>{d.printerName} (topilmadi)</option>}
            </Select>
          </Field>
          <Field as="div" label="Qog'oz kengligi">
            <Segmented
              block
              value={d.paperWidth}
              onChange={(v) => patch({ paperWidth: v })}
              options={[
                { value: 58, label: '58 mm' },
                { value: 80, label: '80 mm' }
              ]}
            />
          </Field>
        </div>
        <Note>Oshxona mahsulotlari — Bar bo'limida «Oshxona» bo'limiga tegishli kategoriyalardagi mahsulotlar.</Note>
      </div>
      <SaveBar
        dirty={dirty}
        saving={saving}
        onSave={() => void onSave()}
        onReset={() => {
          setD(base)
          setPctText(String(base.sharePct))
        }}
      />
    </div>
  )
}
