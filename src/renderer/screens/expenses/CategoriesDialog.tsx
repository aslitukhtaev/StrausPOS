import { useState } from 'react'
import type { ExpenseCategory } from '@shared/types'
import { api } from '@/api'
import { Badge, Button, Input, Modal, toast } from '@/ui'

/** Xarajat kategoriyalari: qo'shish, nomini o'zgartirish, nofaol qilish */
export function CategoriesDialog({ cats, onClose, onChanged }: { cats: ExpenseCategory[]; onClose: () => void; onChanged: () => void | Promise<void> }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true)
    try {
      await fn()
      toast.success(ok)
      await onChanged()
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(false)
    }
  }
  const add = async () => {
    const n = name.trim()
    if (!n) return toast.warning('Kategoriya nomini kiriting')
    await run(() => api.expenses.saveCategory({ name: n, active: true }), "Kategoriya qo'shildi")
    setName('')
  }

  return (
    <Modal open onClose={onClose} title="Xarajat kategoriyalari" size="md" footer={<Button variant="secondary" size="lg" onClick={onClose}>Yopish</Button>}>
      <div className="exp-cats">
        <div className="exp-cats__add">
          <Input size="lg" value={name} placeholder="Yangi kategoriya" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} data-testid="exp-cat-name" />
          <Button variant="primary" size="lg" icon="plus" loading={busy} onClick={add} data-testid="exp-cat-add">Qo'shish</Button>
        </div>
        {cats.map((c) => (
          <div key={c.id} className="exp-cats__row" data-testid="exp-cat-row">
            <span className={'exp-cats__name' + (c.active ? '' : ' is-off')}>{c.name}</span>
            {!c.active && <Badge tone="neutral">Nofaol</Badge>}
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => run(() => api.expenses.saveCategory({ id: c.id, name: c.name, active: !c.active }), c.active ? 'Nofaol qilindi' : 'Faollashtirildi')}
            >
              {c.active ? 'Nofaol qilish' : 'Faollashtirish'}
            </Button>
          </div>
        ))}
      </div>
    </Modal>
  )
}
