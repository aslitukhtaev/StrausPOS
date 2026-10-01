import { useState } from 'react'
import type { ServiceItem } from '@shared/types'
import { api } from '@/api'
import { Badge, Button, EmptyState, Field, IconButton, Input, Modal, Money, MoneyInput, Segmented, cx, confirmDialog, formatMinutes, toast } from '@/ui'

interface Props {
  services: ServiceItem[]
  canEdit: boolean
  dlg: Partial<ServiceItem> | null
  setDlg: (s: Partial<ServiceItem> | null) => void
  reload: () => void | Promise<void>
}

export function ServicesTab({ services, canEdit, dlg, setDlg, reload }: Props) {
  const remove = async (s: ServiceItem) => {
    if (!(await confirmDialog({ title: `"${s.name}" xizmatini o'chirasizmi?`, confirmText: "O'chirish", danger: true }))) return
    try {
      await api.catalog.removeService(s.id)
      toast.success("Xizmat o'chirildi")
      await reload()
    } catch (e) {
      toast.error(e)
    }
  }
  const toggle = async (s: ServiceItem) => {
    try {
      await api.catalog.saveService({ ...s, active: !s.active })
      await reload()
    } catch (e) {
      toast.error(e)
    }
  }
  return (
    <div className="bar-svc">
      {services.length === 0 ? (
        <EmptyState
          size="lg"
          icon="sparkles"
          title="Hali xizmat yo'q"
          description="Massaj, venik va boshqa xizmatlarni shu yerda qo'shing."
          action={canEdit ? <Button variant="primary" icon="plus" onClick={() => setDlg({})}>Xizmat qo'shish</Button> : undefined}
        />
      ) : (
        <div className="bar-list">
          <div className="bar-row bar-row--svc bar-row--head">
            <span>Nomi</span>
            <span>Narxi</span>
            <span>Davomiyligi</span>
            <span />
          </div>
          {services.map((s) => (
            <div key={s.id} className={cx('bar-row bar-row--svc', !s.active && 'is-off')}>
              <div className="bar-row__name">
                <div className="bar-row__title ellipsis">{s.name}</div>
                {!s.active && <div className="bar-row__sub"><Badge tone="neutral" size="sm">Nofaol</Badge></div>}
              </div>
              <Money value={s.price} size="md" />
              <span className={s.durationMin ? '' : 'subtle'}>{s.durationMin ? formatMinutes(s.durationMin) : '—'}</span>
              <div className="bar-row__tools">
                {canEdit && (
                  <>
                    <IconButton icon="edit" label="Tahrirlash" variant="secondary" onClick={() => setDlg(s)} />
                    <IconButton icon={s.active ? 'eye' : 'lock'} label={s.active ? 'Nofaol qilish' : 'Faollashtirish'} variant="ghost" onClick={() => toggle(s)} />
                    <IconButton icon="trash" label="O'chirish" variant="ghost" onClick={() => remove(s)} />
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {dlg && <ServiceDialog svc={dlg} onClose={() => setDlg(null)} onSaved={reload} />}
    </div>
  )
}

function ServiceDialog({ svc, onClose, onSaved }: { svc: Partial<ServiceItem>; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const [name, setName] = useState(svc.name || '')
  const [price, setPrice] = useState(svc.price ?? 0)
  const [dur, setDur] = useState(svc.durationMin ? String(svc.durationMin) : '')
  const [active, setActive] = useState(svc.active ?? true)
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (!name.trim()) return toast.warning('Xizmat nomini kiriting')
    if (price <= 0) return toast.warning('Narxni kiriting')
    setBusy(true)
    try {
      await api.catalog.saveService({ ...svc, name: name.trim(), price, durationMin: Number(dur) > 0 ? Number(dur) : null, active })
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
      title={svc.id ? 'Xizmatni tahrirlash' : 'Yangi xizmat'}
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={onClose}>Bekor</Button>
          <Button variant="primary" size="lg" loading={busy} onClick={save}>Saqlash</Button>
        </>
      }
    >
      <div className="bar-form">
        <Field label="Nomi" required>
          <Input size="lg" data-autofocus value={name} placeholder="Masalan: Massaj" onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="bar-form__2">
          <Field label="Narxi" required><MoneyInput value={price} onChange={setPrice} /></Field>
          <Field label="Davomiyligi (ixtiyoriy)">
            <Input inputMode="numeric" value={dur} placeholder="—" suffix="daqiqa" onChange={(e) => setDur(e.target.value.replace(/\D/g, '').slice(0, 4))} />
          </Field>
        </div>
        <Field as="div" label="Holati">
          <Segmented size="lg" block value={active ? 'y' : 'n'} onChange={(v) => setActive(v === 'y')} options={[{ value: 'y', label: 'Faol', icon: 'check' }, { value: 'n', label: 'Nofaol', icon: 'lock' }]} />
        </Field>
      </div>
    </Modal>
  )
}
