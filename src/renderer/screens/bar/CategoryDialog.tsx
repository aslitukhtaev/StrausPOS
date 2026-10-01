import { useState } from 'react'
import type { ProductCategory } from '@shared/types'
import { api } from '@/api'
import { Button, Field, Input, Modal, toast } from '@/ui'

export function CategoryDialog({ cat, onClose, onSaved }: { cat: Partial<ProductCategory>; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const [name, setName] = useState(cat.name || '')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (!name.trim()) return toast.warning('Nomini kiriting')
    setBusy(true)
    try {
      await api.catalog.saveCategory({ ...cat, name: name.trim() })
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
      title={cat.id ? "Kategoriya nomini o'zgartirish" : 'Yangi kategoriya'}
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={onClose}>Bekor</Button>
          <Button variant="primary" size="lg" loading={busy} onClick={save}>Saqlash</Button>
        </>
      }
    >
      <Field label="Nomi">
        <Input size="lg" data-autofocus value={name} placeholder="Masalan: Ichimliklar" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
      </Field>
    </Modal>
  )
}
