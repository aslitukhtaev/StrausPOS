/**
 * "Bugungi savdolar" — bugun yopilgan bar savdolari (barSales.history). Qatorni bosish → chek (checkout.receipt)
 * ko'rinishi va qayta chop etish.
 */
import { useEffect, useRef, useState } from 'react'
import type { BarSaleRow, ReceiptData } from '@shared/types'
import { api } from '@/api'
import { ReceiptPreview } from '@/screens/checkout'
import { Button, EmptyState, Icon, Modal, Money, Spinner, cx, errorMessage, formatClock, formatDate, formatMoney, getNow, toast } from '@/ui'

function todayRange(now: number): { from: number; to: number } {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  const from = d.getTime()
  d.setDate(d.getDate() + 1)
  return { from, to: d.getTime() }
}

export function HistoryDialog({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<BarSaleRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [sel, setSel] = useState<number | null>(null)
  const [receipt, setReceipt] = useState<ReceiptData | null>(null)
  const [rLoading, setRLoading] = useState(false)
  const [printing, setPrinting] = useState(false)
  const reqRef = useRef(0)

  const load = () => {
    setFailed(false)
    setRows(null)
    api.barSales
      .history(todayRange(getNow()))
      .then((r) => {
        setRows(r)
        if (r.length) void open(r[0].sessionId)
      })
      .catch((e) => {
        toast.error(e)
        setFailed(true)
        setRows([])
      })
  }
  useEffect(load, []) // eslint-disable-line react-hooks/exhaustive-deps

  const open = async (sessionId: number) => {
    const my = ++reqRef.current
    setSel(sessionId)
    setRLoading(true)
    try {
      const r = await api.checkout.receipt(sessionId)
      if (my === reqRef.current) setReceipt(r)
    } catch (e) {
      if (my === reqRef.current) setReceipt(null)
      toast.error(e)
    } finally {
      if (my === reqRef.current) setRLoading(false)
    }
  }

  const print = async () => {
    if (!receipt || printing) return
    setPrinting(true)
    try {
      await api.system.printReceipt(receipt)
      toast.success('Chek chop etildi', { description: '№ ' + receipt.receiptNo })
    } catch (e) {
      toast.error(errorMessage(e), { description: 'Printerni tekshirib, qayta urining.' })
    } finally {
      setPrinting(false)
    }
  }

  const sum = (rows || []).reduce((a, r) => a + r.total, 0)

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      flush
      className="sale-hist-modal"
      title="Bugungi savdolar"
      subtitle={
        formatDate(getNow()) + (rows && rows.length ? ' · ' + rows.length + ' ta savdo · jami ' + formatMoney(sum) + " so'm" : '')
      }
      footer={
        <>
          <Button size="lg" variant="secondary" icon="printer" onClick={() => void print()} disabled={!receipt || rLoading} loading={printing} data-testid="sale-reprint">
            Qayta chop etish
          </Button>
          <div className="spacer" />
          <Button size="lg" variant="primary" icon="check" onClick={onClose}>
            Yopish
          </Button>
        </>
      }
    >
      {rows === null ? (
        <div className="sale-center sale-hist__loading"><Spinner size={40} /></div>
      ) : rows.length === 0 ? (
        <div className="sale-hist__empty">
          <EmptyState
            icon={failed ? 'alert' : 'receipt'}
            title={failed ? "Ro'yxatni yuklab bo'lmadi" : "Bugun bar savdosi bo'lmagan"}
            description={failed ? undefined : "To'langan xonasiz savdolar shu yerda ko'rinadi."}
            action={failed ? <Button icon="refresh" onClick={load}>Qayta urinish</Button> : undefined}
          />
        </div>
      ) : (
        <div className="sale-hist">
          <div className="sale-hist__list" role="listbox" aria-label="Savdolar">
            {rows.map((r) => (
              <button
                key={r.sessionId}
                type="button"
                role="option"
                aria-selected={sel === r.sessionId}
                className={cx('sale-hist__row', sel === r.sessionId && 'is-active')}
                onClick={() => void open(r.sessionId)}
                data-testid="sale-hist-row"
              >
                <span className="sale-hist__no num">{r.receiptNo != null ? '№ ' + r.receiptNo : '—'}</span>
                <span className="sale-hist__mid">
                  <span className="sale-hist__time num">
                    <Icon name="clock" size={18} /> {formatClock(r.closedAt)}
                  </span>
                  <span className="sale-hist__meta ellipsis">
                    {r.items} ta mahsulot{r.cashier ? ' · ' + r.cashier : ''}
                  </span>
                </span>
                <Money value={r.total} size="lg" currency={false} />
              </button>
            ))}
          </div>
          <div className="sale-hist__paper">
            {rLoading && !receipt ? (
              <div className="sale-center"><Spinner size={36} /></div>
            ) : receipt ? (
              <ReceiptPreview data={receipt} scale={1.1} />
            ) : (
              <EmptyState icon="receipt" title="Chekni tanlang" description="Chapdagi savdoni bosing." />
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
