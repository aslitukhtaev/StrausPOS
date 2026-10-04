import { useState } from 'react'
import type { Department, ProductCategory } from '@shared/types'
import { api } from '@/api'
import { Button, Field, Input, Modal, Segmented, toast } from '@/ui'

export const DEPT_LABEL: Record<Department, string> = { bar: 'Bar', kitchen: 'Oshxona' }
export const DEPT_OPTIONS = [
  { value: 'bar' as Department, label: 'Bar', icon: 'bar' as const },
  { value: 'kitchen' as Department, label: 'Oshxona', icon: 'flame' as const }
]

export function CategoryDialog({ cat, onClose, onSaved }: { cat: Partial<ProductCategory>; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const [name, setName] = useState(cat.name || '')
  const [dept, setDept] = useState<Department>(cat.department || 'bar')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (!name.trim()) return toast.warning('Nomini kiriting')
    setBusy(true)
    try {
      await api.catalog.saveCategory({ ...cat, name: name.trim(), department: dept })
      toast.success('Saqlandi')
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
      size="sm"
      title={cat.id ? 'Kategoriyani tahrirlash' : 'Yangi kategoriya'}
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={onClose}>Bekor</Button>
          <Button variant="primary" size="lg" loading={busy} onClick={save}>Saqlash</Button>
        </>
      }
    >
      <div className="bar-form">
        <Field label="Nomi">
          <Input size="lg" data-autofocus value={name} placeholder={dept === 'kitchen' ? 'Masalan: Issiq taomlar' : 'Masalan: Ichimliklar'} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
        </Field>
        <Field as="div" label="Bo'lim" hint={dept === 'kitchen' ? "Oshxona mahsulotlari qo'shilganda oshxona cheki chiqadi va oshxona hisobiga kiradi" : 'Bar mahsulotlari (ichimlik, gazak)'}>
          <Segmented<Department> size="lg" block value={dept} onChange={setDept} options={DEPT_OPTIONS} />
        </Field>
      </div>
    </Modal>
  )
}
