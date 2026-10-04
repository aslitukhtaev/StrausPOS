/**
 * Qarzdorning qarzini to'lash (odam bo'yicha, `debtors.pay`): eng eski qarzdan boshlab yopiladi (FIFO).
 * Usul: Naqd / Karta / Terminal.
 */
import { useState } from 'react'
import type { Debtor, DebtPayMethod } from '@shared/types'
import { api } from '@/api'
import { Button, Icon, Modal, Money, Numpad, Segmented, formatMoney, toast } from '@/ui'
import { DEBT_PAY_OPTIONS } from '../checkout/methods'

export function DebtorPayDialog({ debtor, onClose, onPaid }: { debtor: Debtor; onClose: () => void; onPaid: () => void | Promise<unknown> }) {
  const [rest, setRest] = useState(debtor.balance)
  const [method, setMethod] = useState<DebtPayMethod>('cash')
  const [val, setVal] = useState('')
  const [busy, setBusy] = useState(false)
  const amount = Number(val || 0)
  const bad = amount <= 0 || amount > rest

  const pay = async () => {
    if (bad || busy) return
    setBusy(true)
    try {
      const d = await api.debtors.pay(debtor.id, method, amount)
      const left = Math.max(0, d.balance)
      toast.success(left === 0 ? "Qarz to'liq yopildi" : formatMoney(amount) + " so'm qabul qilindi", {
        description: left ? debtor.name + ': qolgan ' + formatMoney(left) + " so'm" : debtor.name
      })
      await onPaid()
      if (left === 0) return onClose()
      setRest(left)
      setVal('')
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
      dismissible={!busy && !val}
      title="Qarzni to'lash"
      subtitle={debtor.name + (debtor.phone ? ' · ' + debtor.phone : '')}
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={onClose} disabled={busy}>Yopish</Button>
          <Button variant="success" size="lg" icon="check" loading={busy} disabled={bad} onClick={() => void pay()} data-testid="debt-pay-submit">
            {amount > 0 && amount <= rest ? formatMoney(amount) + " so'm qabul qilish" : "To'lash"}
          </Button>
        </>
      }
    >
      <div className="debts-pay">
        <div className="debts-pay__left">
          <div className="debts-pay__rest">
            <div className="subtle">Qolgan qarz{debtor.debtsCount > 1 ? ' · ' + debtor.debtsCount + ' ta qarz' : ''}</div>
            <Money value={rest} size="3xl" tone="danger" />
          </div>
          <Segmented size="lg" block value={method} onChange={setMethod} options={DEBT_PAY_OPTIONS} />
          <div className="debts-pay__amount">
            <div className="subtle">To'lov summasi</div>
            <Money value={amount} size="2xl" tone={bad && amount > 0 ? 'danger' : 'accent'} />
            {amount > rest && <div className="t-danger t-xs">Qarzdan ko'p bo'lishi mumkin emas</div>}
          </div>
          <div className="debts-pay__quick">
            <Button variant="secondary" onClick={() => setVal(String(rest))}>Hammasi</Button>
            {rest >= 2 && <Button variant="secondary" onClick={() => setVal(String(Math.floor(rest / 2)))}>Yarmi</Button>}
          </div>
          <div className="debts-pay__fifo subtle">
            <Icon name="info" size={20} />
            <span>To'lov eng eski qarzdan boshlab yopiladi.</span>
          </div>
        </div>
        <div className="debts-pay__pad">
          <Numpad mode="amount" value={val} onChange={setVal} maxLength={10} onSubmit={() => void pay()} submitLabel="To'lash" submitDisabled={bad} />
        </div>
      </div>
    </Modal>
  )
}
