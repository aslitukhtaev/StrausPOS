import { useState } from 'react'
import type { Debt } from '@shared/types'
import { api } from '@/api'
import { Button, Modal, Money, Numpad, Segmented, formatMoney, toast } from '@/ui'
import { PaymentsList } from './PaymentsList'

export function PayDialog({ debt, onClose, onPaid }: { debt: Debt; onClose: () => void; onPaid: (id: number) => void | Promise<unknown> }) {
  const [rest, setRest] = useState(Math.max(0, debt.amount - debt.paid))
  const [method, setMethod] = useState<'cash' | 'card'>('cash')
  const [val, setVal] = useState('')
  const [busy, setBusy] = useState(false)
  const [ver, setVer] = useState(0)
  const amount = Number(val || 0)
  const bad = amount <= 0 || amount > rest

  const pay = async () => {
    if (bad) return
    setBusy(true)
    try {
      const d = await api.debts.pay(debt.id, method, amount)
      const left = Math.max(0, d.amount - d.paid)
      toast.success(left === 0 ? "Qarz to'liq yopildi" : `${formatMoney(amount)} so'm qabul qilindi`, { description: left ? `Qolgan: ${formatMoney(left)} so'm` : undefined })
      await onPaid(debt.id)
      if (left === 0) return onClose()
      setRest(left)
      setVal('')
      setVer(ver + 1)
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Qarzni to'lash"
      subtitle={`${debt.customerName}${debt.phone ? ' · ' + debt.phone : ''}`}
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={onClose}>Yopish</Button>
          <Button variant="success" size="lg" icon="check" loading={busy} disabled={bad} onClick={pay}>
            {amount > 0 && amount <= rest ? `${formatMoney(amount)} so'm qabul qilish` : "To'lash"}
          </Button>
        </>
      }
    >
      <div className="debts-pay">
        <div className="debts-pay__left">
          <div className="debts-pay__rest">
            <div className="subtle">Qolgan qarz</div>
            <Money value={rest} size="3xl" tone="danger" />
          </div>
          <Segmented size="lg" block value={method} onChange={setMethod} options={[{ value: 'cash', label: 'Naqd', icon: 'cash' }, { value: 'card', label: 'Karta', icon: 'card' }]} />
          <div className="debts-pay__amount">
            <div className="subtle">To'lov summasi</div>
            <Money value={amount} size="2xl" tone={bad && amount > 0 ? 'danger' : 'accent'} />
            {amount > rest && <div className="t-danger t-xs">Qarzdan ko'p bo'lishi mumkin emas</div>}
          </div>
          <div className="debts-pay__quick">
            <Button variant="secondary" onClick={() => setVal(String(rest))}>Hammasi</Button>
            {rest >= 2 && <Button variant="secondary" onClick={() => setVal(String(Math.floor(rest / 2)))}>Yarmi</Button>}
          </div>
          <div className="debts-pay__hist">
            <div className="subtle t-xs" style={{ marginBottom: 6 }}>To'lovlar tarixi</div>
            <PaymentsList debtId={debt.id} version={ver} />
          </div>
        </div>
        <div className="debts-pay__pad">
          <Numpad mode="amount" value={val} onChange={setVal} maxLength={10} onSubmit={pay} submitLabel="To'lash" submitDisabled={bad} />
        </div>
      </div>
    </Modal>
  )
}
