import { useState } from 'react'
import type { Product, ProductCategory } from '@shared/types'
import { api } from '@/api'
import { Button, Field, Input, Modal, MoneyInput, Segmented, Select, toast } from '@/ui'

export function ProductDialog({ product, cats, onClose, onSaved }: { product: Partial<Product>; cats: ProductCategory[]; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const isNew = !product.id
  const [name, setName] = useState(product.name || '')
  const [categoryId, setCategoryId] = useState<number>(product.categoryId ?? cats[0]?.id ?? 0)
  const [price, setPrice] = useState(product.price ?? 0)
  const [trackStock, setTrackStock] = useState(product.trackStock ?? true)
  const [stock, setStock] = useState(product.stock ?? 0)
  const [lowStockAt, setLowStockAt] = useState(product.lowStockAt ?? 5)
  const [active, setActive] = useState(product.active ?? true)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!name.trim()) return toast.warning('Mahsulot nomini kiriting')
    if (price <= 0) return toast.warning('Narxni kiriting')
    setBusy(true)
    try {
      await api.catalog.saveProduct({
        ...product,
        name: name.trim(),
        categoryId,
        price,
        trackStock,
        stock: trackStock ? stock : 0,
        lowStockAt: trackStock ? lowStockAt : 0,
        active
      })
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
      title={isNew ? "Yangi mahsulot" : 'Mahsulotni tahrirlash'}
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={onClose}>Bekor</Button>
          <Button variant="primary" size="lg" loading={busy} onClick={save}>Saqlash</Button>
        </>
      }
    >
      <div className="bar-form">
        <Field label="Nomi" required>
          <Input size="lg" data-autofocus value={name} placeholder="Masalan: Coca-Cola 0.5" onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="bar-form__2">
          <Field label="Kategoriya">
            <Select size="lg" value={categoryId} onChange={(e) => setCategoryId(Number(e.target.value))}>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}{c.department === 'kitchen' ? ' · Oshxona' : ''}</option>)}
            </Select>
          </Field>
          <Field label="Narxi" required>
            <MoneyInput value={price} onChange={setPrice} />
          </Field>
        </div>
        <Field as="div" label="Ombor qoldig'ini kuzatish">
          <Segmented size="lg" block value={trackStock ? 'y' : 'n'} onChange={(v) => setTrackStock(v === 'y')} options={[{ value: 'y', label: 'Ha, kuzatish', icon: 'box' }, { value: 'n', label: "Yo'q", icon: 'x' }]} />
        </Field>
        {trackStock && (
          <div className="bar-form__2">
            {isNew && (
              <Field label="Boshlang'ich qoldiq">
                <Input size="md" inputMode="numeric" value={String(stock)} onChange={(e) => setStock(Math.max(0, Number(e.target.value.replace(/\D/g, '')) || 0))} suffix="dona" />
              </Field>
            )}
            <Field label="Kam qoldiq chegarasi" hint="Shundan oz qolsa — ogohlantiriladi">
              <Input size="md" inputMode="numeric" value={String(lowStockAt)} onChange={(e) => setLowStockAt(Math.max(0, Number(e.target.value.replace(/\D/g, '')) || 0))} suffix="dona" />
            </Field>
          </div>
        )}
        <Field as="div" label="Holati">
          <Segmented size="lg" block value={active ? 'y' : 'n'} onChange={(v) => setActive(v === 'y')} options={[{ value: 'y', label: 'Faol', icon: 'check' }, { value: 'n', label: 'Nofaol', icon: 'lock' }]} />
        </Field>
      </div>
    </Modal>
  )
}
