import { useEffect, useState } from 'react'
import type { Expense, ExpenseCategory } from '@shared/types'
import { api } from '@/api'
import { Button, Field, Input, Modal, Numpad, TextArea, formatMoney, getNow, toast } from '@/ui'
import { toInput } from './range'

/** Tezkor xarajat qo'shish / tahrirlash */
export function ExpenseDialog({
  expense, cats, onClose, onSaved, onManageCats
}: { expense: Expense | null; cats: ExpenseCategory[]; onClose: () => void; onSaved: () => void | Promise<void>; onManageCats: () => void }) {
  const today = toInput(getNow())
  const usable = cats.filter((c) => c.active || (expense && c.id === expense.categoryId))
  const [day, setDay] = useState(expense ? expense.day : today)
  const [categoryId, setCategoryId] = useState<number>(expense ? expense.categoryId : 0)
  const [amountStr, setAmountStr] = useState(expense ? String(expense.amount) : '')
  const [note, setNote] = useState(expense ? expense.note : '')
  const [busy, setBusy] = useState(false)
  const amount = Number(amountStr || 0)

  useEffect(() => {
    if (!categoryId && usable.length) setCategoryId(usable[0].id)
  }, [categoryId, usable])

  const save = async () => {
    if (!day) return toast.warning('Sanani kiriting')
    if (day > today) return toast.warning("Kelajak sanasiga xarajat yozib bo'lmaydi")
    if (!categoryId) return toast.warning('Kategoriyani tanlang')
    if (amount <= 0) return toast.warning('Summani kiriting')
    setBusy(true)
    try {
      await api.expenses.save({ id: expense ? expense.id : undefined, day, categoryId, amount, note: note.trim() })
      toast.success(expense ? 'Xarajat yangilandi' : "Xarajat qo'shildi")
      await onSaved()
      onClose()
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
      title={expense ? 'Xarajatni tahrirlash' : "Xarajat qo'shish"}
      footer={
        <>
          <Button variant="ghost" size="lg" onClick={onManageCats} data-testid="exp-manage-cats">Kategoriyalar</Button>
          <span className="spacer" />
          <Button variant="secondary" size="lg" onClick={onClose}>Bekor</Button>
          <Button variant="primary" size="lg" loading={busy} disabled={amount <= 0} onClick={save} data-testid="exp-save">Saqlash</Button>
        </>
      }
    >
      <div className="exp-form">
        <div className="exp-form__left">
          <Field label="Sana">
            <Input size="lg" type="date" value={day} max={today} onChange={(e) => setDay(e.target.value)} data-testid="exp-day" />
          </Field>
          <Field as="div" label="Kategoriya">
            <div className="exp-chips" role="radiogroup" aria-label="Kategoriya">
              {usable.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={categoryId === c.id}
                  className={'exp-chip' + (categoryId === c.id ? ' is-on' : '')}
                  onClick={() => setCategoryId(c.id)}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Izoh">
            <TextArea rows={2} value={note} placeholder="Masalan: oktabr oyi ijarasi" onChange={(e) => setNote(e.target.value)} data-testid="exp-note" />
          </Field>
        </div>
        <div className="exp-form__right">
          <div className="exp-amount" data-testid="exp-amount">
            <span className="exp-amount__label">Summa</span>
            <span className="exp-amount__val num">{formatMoney(amount)}</span>
            <span className="exp-amount__cur">so'm</span>
          </div>
          <Numpad mode="amount" value={amountStr} onChange={setAmountStr} maxLength={11} onSubmit={save} submitLabel="Saqlash" submitDisabled={amount <= 0} keyboard />
        </div>
      </div>
    </Modal>
  )
}
