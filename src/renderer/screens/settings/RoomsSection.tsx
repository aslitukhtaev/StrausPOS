import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Id, Room } from '@shared/types'
import { api } from '@/api'
import {
  Badge, Button, EmptyState, Field, IconButton, Input, Modal, Money, MoneyInput, Spinner, Stepper,
  confirmDialog, toast, Switch
} from '@/ui'
import { Note, SectionHead, jsonEqual } from './common'

interface Draft {
  id?: Id
  name: string
  pricePerHour: number
  capacity: number
  active: boolean
  sortOrder: number
}

export function RoomsSection() {
  const [rooms, setRooms] = useState<Room[] | null>(null)
  const [busy, setBusy] = useState<Set<Id>>(new Set())
  const [edit, setEdit] = useState<{ initial: Draft; draft: Draft } | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const [list, board] = await Promise.all([api.rooms.list(), api.rooms.board().catch(() => [])])
      setRooms(list)
      setBusy(new Set(board.filter((c) => c.session).map((c) => c.room.id)))
    } catch (e) {
      toast.error(e)
      setRooms((r) => r || [])
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const openNew = () => {
    const maxSort = (rooms || []).reduce((m, r) => Math.max(m, r.sortOrder), 0)
    const d: Draft = { name: '', pricePerHour: 0, capacity: 4, active: true, sortOrder: maxSort + 1 }
    setEdit({ initial: d, draft: d })
  }
  const openEdit = (r: Room) => {
    const d: Draft = { id: r.id, name: r.name, pricePerHour: r.pricePerHour, capacity: r.capacity, active: r.active, sortOrder: r.sortOrder }
    setEdit({ initial: d, draft: d })
  }
  const patch = (p: Partial<Draft>) => setEdit((e) => (e ? { ...e, draft: { ...e.draft, ...p } } : e))

  const dirty = !!edit && !jsonEqual(edit.initial, edit.draft)
  const nameErr = edit && dirty && !edit.draft.name.trim() ? 'Xona nomini kiriting' : null
  const isNew = !!edit && edit.draft.id == null
  const priceChanged = !!edit && !isNew && edit.draft.pricePerHour !== edit.initial.pricePerHour

  const submit = async () => {
    if (!edit || !dirty || !edit.draft.name.trim()) return
    setSaving(true)
    try {
      const d = edit.draft
      const saved = await api.rooms.save({ ...d, name: d.name.trim() })
      toast.success(isNew ? `"${saved.name}" xonasi qo'shildi` : `"${saved.name}" saqlandi`)
      setEdit(null)
      await load()
    } catch (e) {
      toast.error(e)
    } finally {
      setSaving(false)
    }
  }

  const remove = async (r: Pick<Room, 'id' | 'name'>) => {
    const ok = await confirmDialog({
      title: `"${r.name}" xonasini o'chirasizmi?`,
      message: "Xona ro'yxatdan olib tashlanadi. Eski hisobotlardagi ma'lumotlar saqlanib qoladi. Band xonani o'chirib bo'lmaydi.",
      confirmText: "O'chirish",
      danger: true,
      icon: 'trash'
    })
    if (!ok) return
    try {
      await api.rooms.remove(r.id)
      toast.success(`"${r.name}" o'chirildi`)
      setEdit(null)
      await load()
    } catch (e) {
      toast.error(e)
    }
  }

  const sorted = useMemo(() => (rooms ? [...rooms].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id) : null), [rooms])

  return (
    <div className="set-section">
      <SectionHead
        icon="rooms"
        title="Xonalar"
        description="Xona nomi, narxi va sig'imi. Bosh ekrandagi tartib shu yerdagi tartib raqami bo'yicha."
        actions={
          <Button variant="primary" icon="plus" onClick={openNew} data-testid="room-add">
            Xona qo'shish
          </Button>
        }
      />
      <div className="set-section__body">
        <Note>
          Narxni o'zgartirsangiz, u faqat <b>yangi boshlanadigan vaqtga</b> ta'sir qiladi. Hozir ishlayotgan mehmonlarning
          oldingi vaqti eski narx bilan hisoblanadi.
        </Note>

        {!sorted ? (
          <div className="set-center"><Spinner size={40} /></div>
        ) : sorted.length === 0 ? (
          <EmptyState
            icon="rooms"
            title="Hali xona yo'q"
            description="Birinchi xonani qo'shing — u bosh ekranda paydo bo'ladi."
            action={<Button variant="primary" icon="plus" onClick={openNew}>Xona qo'shish</Button>}
          />
        ) : (
          <div className="set-rooms" data-testid="room-list">
            <div className="set-rooms__head">
              <span>№</span>
              <span>Xona</span>
              <span className="set-r">1 kishi / 1 soat</span>
              <span className="set-c">Sig'im</span>
              <span>Holat</span>
              <span />
            </div>
            {sorted.map((r) => (
              <div key={r.id} className={'set-rooms__row' + (r.active ? '' : ' is-off')}>
                <span className="set-rooms__order num">{r.sortOrder}</span>
                <button type="button" className="set-rooms__name" onClick={() => openEdit(r)}>
                  {r.name}
                </button>
                <span className="set-r"><Money value={r.pricePerHour} size="md" /></span>
                <span className="set-c num">{r.capacity} kishi</span>
                <span className="set-rooms__badges">
                  {busy.has(r.id) ? (
                    <Badge tone="warning">Band</Badge>
                  ) : r.active ? (
                    <Badge tone="success">Faol</Badge>
                  ) : (
                    <Badge tone="neutral">O'chiq</Badge>
                  )}
                </span>
                <span className="set-rooms__acts">
                  <IconButton icon="edit" label="Tahrirlash" onClick={() => openEdit(r)} />
                  <IconButton icon="trash" label="O'chirish" variant="danger" onClick={() => void remove(r)} />
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={!!edit}
        onClose={() => !saving && setEdit(null)}
        title={isNew ? 'Yangi xona' : 'Xonani tahrirlash'}
        subtitle={isNew ? undefined : edit?.initial.name}
        size="md"
        footer={
          <>
            {!isNew && edit && (
              <Button variant="danger" icon="trash" onClick={() => void remove({ id: edit.draft.id!, name: edit.initial.name })}>
                O'chirish
              </Button>
            )}
            <span className="spacer" />
            <Button variant="ghost" onClick={() => setEdit(null)} disabled={saving}>Bekor qilish</Button>
            <Button variant="primary" icon="check" onClick={() => void submit()} disabled={!dirty || !!nameErr} loading={saving} data-testid="room-save">
              Saqlash
            </Button>
          </>
        }
      >
        {edit && (
          <form className="set-form" onSubmit={(e) => { e.preventDefault(); void submit() }}>
            <Field label="Xona nomi" required error={nameErr}>
              <Input
                size="lg"
                value={edit.draft.name}
                maxLength={60}
                placeholder="Masalan: VIP-1"
                onChange={(e) => patch({ name: e.target.value })}
                data-autofocus
                data-testid="room-name"
              />
            </Field>
            <Field
              label="Narx: 1 kishi uchun 1 soat"
              hint="Daqiqa bo'yicha hisoblanadi: narx × daqiqa / 60"
            >
              <MoneyInput size="lg" value={edit.draft.pricePerHour} onChange={(v) => patch({ pricePerHour: v })} data-testid="room-price" />
            </Field>
            {priceChanged && (
              <Note tone="warning" icon="alert">
                Yangi narx faqat bundan keyin boshlanadigan vaqtga qo'llanadi. Hozir ochiq hisoblardagi o'tgan vaqt eski narxda qoladi.
              </Note>
            )}
            <div className="set-form__row">
              <Field as="div" label="Maksimal odam soni">
                <Stepper value={edit.draft.capacity} onChange={(v) => patch({ capacity: v })} min={1} max={100} size="lg" suffix="kishi" />
              </Field>
              <Field as="div" label="Tartib raqami" hint="Kichik raqam — oldinda">
                <Stepper value={edit.draft.sortOrder} onChange={(v) => patch({ sortOrder: v })} min={0} max={999} size="lg" />
              </Field>
            </div>
            <Switch
              checked={edit.draft.active}
              onChange={(v) => patch({ active: v })}
              label="Xona faol"
              description="O'chiq xona bosh ekranda ko'rinmaydi va ochib bo'lmaydi"
            />
          </form>
        )}
      </Modal>
    </div>
  )
}
