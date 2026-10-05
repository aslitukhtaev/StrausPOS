/**
 * Xodimlar ekrani: kartalar (Hammasi / Ofitsiantlar), qo'shish/tahrirlash (ofitsiant foizi bilan), PIN o'zgartirish,
 * nofaol qilish, rol ruxsatlari jadvali.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Permission, Role, Staff } from '@shared/types'
import { ROLE_LABELS, ROLE_PERMISSIONS } from '@shared/permissions'
import { api } from '../../api'
import { useAuth, useCan } from '../../store/auth'
import { useNav } from '../../store/nav'
import {
  Switch, Avatar, Badge, Button, Card, EmptyState, Field, Icon, Input, Modal, Numpad, PageHeader, PinDots, Segmented, Spinner,
  Tabs, confirmDialog, formatMoney, toast, cx
} from '../../ui'
import './staff.css'

const PIN_MIN = 4
const PIN_MAX = 6

const ROLES: Role[] = ['owner', 'admin', 'cashier', 'waiter']
const PCT_PRESETS = [5, 10, 12, 15]
const DEFAULT_PCT = 10

/** "10" / "12,5" — foizni ko'rsatish */
export function pctText(p: number): string {
  return String(Math.round(p * 100) / 100).replace('.', ',')
}
const ROLE_TONE: Record<Role, 'accent' | 'info' | 'neutral' | 'success'> = { owner: 'accent', admin: 'info', cashier: 'neutral', waiter: 'success' }
const ROLE_ICON: Record<Role, 'key' | 'shield' | 'user' | 'bar'> = { owner: 'key', admin: 'shield', cashier: 'user', waiter: 'bar' }
const ROLE_HINT: Record<Role, string> = {
  owner: "Hamma narsa, shu jumladan xodimlar, sozlamalar va zaxira",
  admin: "Kundalik boshqaruv: bar, hisobot, qaytarish, chegirma",
  cashier: "Xonalarni ochish, vaqt, to'lov va qarz",
  waiter: "Xonani ochish va bar buyurtmalari (to'lovsiz). Bar savdosidan foiz oladi"
}

const PERM_LABELS: { perm: Permission; label: string; hint: string }[] = [
  { perm: 'session.open', label: 'Xonani ochish', hint: 'Yangi mehmonlar guruhini boshlash' },
  { perm: 'session.manage', label: 'Sessiyani boshqarish', hint: "Pauza, tugatish, xona almashtirish, mahsulot qo'shish" },
  { perm: 'session.pay', label: "To'lov qabul qilish", hint: 'Hisobni yopish va chek' },
  { perm: 'line.return', label: 'Qaytarish (X)', hint: "Qo'shilgan mahsulot/xizmatni qaytarish" },
  { perm: 'discount.apply', label: 'Chegirma berish', hint: 'Hisobga umumiy chegirma' },
  { perm: 'price.override', label: "Narxni o'zgartirish", hint: 'Joyida narxni qo\'lda belgilash' },
  { perm: 'debt.manage', label: 'Qarzlar', hint: "Qarzni ko'rish va qabul qilish" },
  { perm: 'stock.manage', label: 'Bar va ombor', hint: "Mahsulot qoldig'ini boshqarish" },
  { perm: 'reports.view', label: "Hisobotlarni ko'rish", hint: 'Tushum, qaytarishlar va h.k.' },
  { perm: 'settings.manage', label: 'Sozlamalar', hint: 'Xonalar, narxlar, mahsulotlar, chek' },
  { perm: 'staff.manage', label: 'Xodimlarni boshqarish', hint: "Qo'shish, PIN, nofaol qilish" },
  { perm: 'backup.manage', label: 'Zaxira nusxa', hint: 'Saqlash va tiklash' }
]

type EditTarget = { mode: 'new'; waiter?: boolean } | { mode: 'edit'; staff: Staff }

export default function StaffScreen() {
  const me = useAuth((s) => s.staff)
  const canManage = useCan('staff.manage')
  const [list, setList] = useState<Staff[] | null>(null)
  const go = useNav((s) => s.go)
  const canReports = useCan('waiters.view')
  const [tab, setTab] = useState<'all' | 'waiters' | 'perms'>('all')
  const [edit, setEdit] = useState<EditTarget | null>(null)
  const [pinFor, setPinFor] = useState<Staff | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)

  const load = useCallback(() => {
    api.staff.list().then(setList).catch((e) => {
      toast.error(e)
      setList((l) => l ?? [])
    })
  }, [])
  useEffect(load, [load])

  const activeCount = useMemo(() => (list ?? []).filter((s) => s.active).length, [list])
  const waiterCount = useMemo(() => (list ?? []).filter((s) => s.isWaiter).length, [list])
  const shown = useMemo(() => (list ?? []).filter((s) => tab !== 'waiters' || s.isWaiter), [list, tab])

  const toggleActive = async (s: Staff) => {
    if (s.active) {
      const ok = await confirmDialog({
        title: s.name + ' nofaol qilinsinmi?',
        message: "U tizimga kira olmaydi. Tarixiy hisobotlarda ismi saqlanadi. Keyin istalgan paytda qayta faollashtirish mumkin.",
        confirmText: 'Nofaol qilish',
        danger: true,
        icon: 'lock'
      })
      if (!ok) return
    }
    setBusyId(s.id)
    try {
      await api.staff.save({ ...s, pin: '', active: !s.active })
      toast.success(s.active ? s.name + ' nofaol qilindi' : s.name + ' faollashtirildi')
      load()
    } catch (e) {
      toast.error(e)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="staff">
      <PageHeader
        title="Xodimlar"
        icon="staff"
        subtitle={list ? activeCount + ' ta faol, jami ' + list.length + ' ta xodim' : undefined}
        actions={
          canManage && (
            <Button variant="primary" icon="userPlus" onClick={() => setEdit({ mode: 'new', waiter: tab === 'waiters' })}>
              {tab === 'waiters' ? "Ofitsiant qo'shish" : "Xodim qo'shish"}
            </Button>
          )
        }
      />

      <Tabs
        value={tab}
        onChange={(v) => setTab(v as 'all' | 'waiters' | 'perms')}
        items={[
          { id: 'all', label: 'Hammasi', icon: 'users', badge: list ? list.length : undefined },
          { id: 'waiters', label: 'Ofitsiantlar', icon: 'bar', badge: list ? waiterCount : undefined },
          { id: 'perms', label: 'Kim nima qila oladi', icon: 'shield' }
        ]}
      />

      {tab !== 'perms' && (
        <div className="staff__body">
          {list === null ? (
            <div className="staff__loading"><Spinner size={36} /></div>
          ) : tab === 'waiters' && shown.length === 0 ? (
            <EmptyState
              size="lg"
              icon="bar"
              title="Ofitsiantlar yo'q"
              description="Ofitsiant xonaga biriktiriladi va shu xonada sotilgan bar mahsulotlaridan foiz oladi (xizmatlardan emas)."
              action={canManage ? <Button variant="primary" icon="userPlus" onClick={() => setEdit({ mode: 'new', waiter: true })}>Ofitsiant qo'shish</Button> : undefined}
            />
          ) : list.length === 0 ? (
            <EmptyState
              size="lg"
              icon="users"
              title="Xodimlar yo'q"
              description="Kassir va administratorlarni qo'shing — har biri o'z PIN-kodi bilan kiradi."
              action={<Button variant="primary" icon="userPlus" onClick={() => setEdit({ mode: 'new' })}>Xodim qo'shish</Button>}
            />
          ) : (
            <div className="staff__grid">
              {shown.map((s) => {
                const isMe = me?.id === s.id
                return (
                  <Card key={s.id} className={cx('staff-card', !s.active && 'is-inactive')} tone={s.active ? 'default' : 'default'} padding="md">
                    <div className="staff-card__top">
                      <Avatar name={s.name} size={64} />
                      <div className="staff-card__who">
                        <div className="staff-card__name ellipsis">{s.name}</div>
                        <div className="staff-card__badges">
                          {s.role !== 'waiter' && (
                            <Badge tone={ROLE_TONE[s.role]} size="md" icon={ROLE_ICON[s.role]}>
                              {ROLE_LABELS[s.role]}
                            </Badge>
                          )}
                          {s.isWaiter && (
                            <Badge tone="success" size="md" icon="bar" className="staff-waiter-badge">
                              {ROLE_LABELS.waiter} · {pctText(s.commissionPct)}%
                            </Badge>
                          )}
                          {s.isProvider && <Badge tone="success" size="md" icon="sparkles">Xizmat ko'rsatuvchi</Badge>}
                          {isMe && <Badge tone="neutral" size="md">Siz</Badge>}
                        </div>
                      </div>
                    </div>
                    <div className="staff-card__status">
                      <span className={cx('staff-dot', s.active ? 'is-on' : 'is-off')} />
                      {s.active ? 'Faol' : 'Nofaol'}
                    </div>
                    {canManage && (
                      <div className="staff-card__actions">
                        <Button variant="secondary" size="sm" icon="edit" onClick={() => setEdit({ mode: 'edit', staff: s })}>
                          Tahrirlash
                        </Button>
                        <Button variant="secondary" size="sm" icon="key" onClick={() => setPinFor(s)}>
                          PIN
                        </Button>
                        {s.isWaiter && canReports && (
                          <Button variant="secondary" size="sm" icon="cash" onClick={() => go('waiters', { staffId: s.id })}>
                            Hisob
                          </Button>
                        )}
                        <Button
                          variant={s.active ? 'danger' : 'success'}
                          size="sm"
                          icon={s.active ? 'lock' : 'unlock'}
                          loading={busyId === s.id}
                          disabled={isMe && s.active}
                          title={isMe && s.active ? "O'zingizni nofaol qila olmaysiz" : undefined}
                          onClick={() => toggleActive(s)}
                        >
                          {s.active ? 'Nofaol qilish' : 'Faollashtirish'}
                        </Button>
                      </div>
                    )}
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'perms' && <PermissionsTable />}

      {edit && (
        <EditDialog
          target={edit}
          isMe={edit.mode === 'edit' && edit.staff.id === me?.id}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null)
            load()
          }}
        />
      )}
      {pinFor && <PinDialog staff={pinFor} onClose={() => setPinFor(null)} />}
    </div>
  )
}

/* ───────────── Rol ruxsatlari (faqat o'qish) ───────────── */
function PermissionsTable() {
  return (
    <Card padding="none" className="staff-perms">
      <div className="staff-perms__scroll">
        <table className="ui-table staff-table">
          <thead>
            <tr>
              <th className="staff-table__perm">Amal</th>
              {ROLES.map((r) => (
                <th key={r} className="staff-table__role">
                  <Badge tone={ROLE_TONE[r]} size="md">{ROLE_LABELS[r]}</Badge>
                  <div className="staff-table__rolehint">{ROLE_HINT[r]}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERM_LABELS.map((p) => (
              <tr key={p.perm}>
                <td className="staff-table__perm">
                  <div className="t-bold">{p.label}</div>
                  <div className="subtle">{p.hint}</div>
                </td>
                {ROLES.map((r) => {
                  const yes = ROLE_PERMISSIONS[r].indexOf(p.perm) >= 0
                  return (
                    <td key={r} className="staff-table__cell">
                      {yes ? (
                        <span className="staff-yes" aria-label="Mumkin"><Icon name="check" size={22} strokeWidth={3} /></span>
                      ) : (
                        <span className="staff-no" aria-label="Mumkin emas">—</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="staff-perms__note subtle">Ruxsatlar rolga bog'liq va o'zgartirilmaydi. Bu jadval faqat ma'lumot uchun.</div>
    </Card>
  )
}

/* ───────────── Qo'shish / tahrirlash ───────────── */
function EditDialog({ target, isMe, onClose, onSaved }: {
  target: EditTarget; isMe: boolean; onClose: () => void; onSaved: () => void
}) {
  const cur = target.mode === 'edit' ? target.staff : null
  const [name, setName] = useState(cur?.name ?? '')
  const newWaiter = target.mode === 'new' && !!target.waiter
  const [role, setRole] = useState<Role>(cur?.role ?? (newWaiter ? 'waiter' : 'cashier'))
  const [isProvider, setIsProvider] = useState(cur?.isProvider ?? false)
  const [isWaiter, setIsWaiter] = useState(cur ? cur.isWaiter || cur.role === 'waiter' : newWaiter)
  const [pctStr, setPctStr] = useState(() => pctText(cur && (cur.isWaiter || cur.commissionPct > 0) ? cur.commissionPct : DEFAULT_PCT))
  const [active, setActive] = useState(cur?.active ?? true)
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [tried, setTried] = useState(false)

  const nameErr = name.trim() === '' ? 'Ismni kiriting' : null
  const pinErr = !cur && pin.length < PIN_MIN ? 'PIN kamida ' + PIN_MIN + ' ta raqam' : null
  const waiterOn = role === 'waiter' || isWaiter
  const pct = pctStr.trim() === '' ? NaN : Number(pctStr.replace(',', '.'))
  const pctErr = waiterOn && !(pct >= 0 && pct <= 100) ? "Foiz 0 dan 100 gacha bo'lishi kerak" : null

  const pickRole = (r: Role) => {
    setRole(r)
    if (r === 'waiter') setIsWaiter(true)
  }
  const onPctInput = (v: string) => {
    const clean = v.replace(/[^0-9.,]/g, '').replace('.', ',')
    if (/^\d{0,3}(,\d{0,2})?$/.test(clean)) setPctStr(clean)
  }

  const save = async () => {
    setTried(true)
    if (nameErr || pinErr || pctErr || busy) return
    setBusy(true)
    try {
      await api.staff.save({ ...(cur ?? {}), name: name.trim(), role, pin: cur ? '' : pin, isProvider, isWaiter: waiterOn, commissionPct: waiterOn ? pct : (cur?.commissionPct ?? 0), active })
      toast.success(cur ? 'Saqlandi' : name.trim() + " qo'shildi")
      onSaved()
    } catch (e) {
      toast.error(e)
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size={cur ? 'md' : 'lg'}
      title={cur ? 'Xodimni tahrirlash' : "Yangi xodim"}
      dismissible={!busy}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Bekor qilish</Button>
          <Button variant="primary" icon="check" loading={busy} onClick={save}>Saqlash</Button>
        </>
      }
    >
      <div className={cx('staff-form', !cur && 'has-pin')}>
        <div className="staff-form__main">
          <Field label="Ism" required error={tried ? nameErr : null}>
            <Input
              data-autofocus
              value={name}
              maxLength={60}
              invalid={tried && !!nameErr}
              placeholder="Masalan: Jasur"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') save() }}
            />
          </Field>
          <Field as="div" label="Lavozim" hint={ROLE_HINT[role]}>
            <Segmented
              block
              value={role}
              onChange={(v) => pickRole(v as Role)}
              options={ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r], disabled: isMe && r !== role }))}
            />
          </Field>
          {isMe && <div className="subtle">O'z lavozimingizni o'zgartira olmaysiz.</div>}
          <Switch
            checked={waiterOn}
            onChange={setIsWaiter}
            disabled={role === 'waiter'}
            label="Ofitsiant (xonaga biriktiriladi)"
            description={role === 'waiter' ? 'Ofitsiant lavozimida doim yoqilgan' : 'Xona ochilganda tanlanadi va bar savdosidan foiz oladi'}
            data-testid="staff-waiter-switch"
          />
          {waiterOn && (
            <div className="staff-pct">
              <Field as="div" label="Ofitsiant foizi" required error={tried ? pctErr : null} hint="Faqat bar mahsulotlaridan; xizmatlar va xona vaqti kirmaydi">
                <div className="staff-pct__row">
                <Input
                  size="lg"
                  inputMode="decimal"
                  className="staff-pct__input"
                  value={pctStr}
                  invalid={tried && !!pctErr}
                  suffix="%"
                  onChange={(e) => onPctInput(e.target.value)}
                  data-testid="staff-pct"
                  aria-label="Ofitsiant foizi"
                />
              <div className="staff-pct__presets" role="group" aria-label="Tezkor foiz">
                {PCT_PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={cx('staff-pct__chip', pct === p && 'is-active')}
                    onClick={() => setPctStr(String(p))}
                  >
                    {p}%
                  </button>
                ))}
              </div>
                </div>
              </Field>
              {pct > 0 && pct <= 100 && (
                <div className="staff-pct__example subtle">
                  Misol: xonada <b>200 000 so'mlik</b> bar mahsuloti sotilsa — haq <b>{formatMoney(Math.round(200000 * pct / 100))} so'm</b>
                </div>
              )}
            </div>
          )}
          <Switch
            checked={isProvider}
            onChange={setIsProvider}
            label="Xizmat ko'rsatuvchi"
            description="Massaj kabi xizmatlarda xodim sifatida tanlanadi"
          />
          <Switch
            checked={active}
            onChange={setActive}
            disabled={isMe}
            label="Faol"
            description={isMe ? "O'zingizni nofaol qila olmaysiz" : 'Nofaol xodim tizimga kira olmaydi'}
          />
          {cur && <div className="subtle">PIN-kodni o'zgartirish uchun kartadagi «PIN» tugmasini bosing.</div>}
        </div>
        {!cur && (
          <div className="staff-form__pin">
            <div className="staff-form__pinlabel">PIN-kod ({PIN_MIN}–{PIN_MAX} raqam)</div>
            <PinDots length={pin.length} max={PIN_MAX} error={tried && !!pinErr} />
            <Numpad mode="pin" value={pin} onChange={setPin} maxLength={PIN_MAX} />
            {tried && pinErr && <div className="staff-form__err">{pinErr}</div>}
          </div>
        )}
      </div>
    </Modal>
  )
}

/* ───────────── PIN o'zgartirish ───────────── */
function PinDialog({ staff, onClose }: { staff: Staff; onClose: () => void }) {
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)

  const submit = async () => {
    if (busy) return
    if (pin.length < PIN_MIN) {
      setErr(true)
      return
    }
    setBusy(true)
    try {
      await api.staff.changePin(staff.id, pin)
      toast.success(staff.name + ' uchun yangi PIN saqlandi')
      onClose()
    } catch (e) {
      toast.error(e)
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="PIN o'zgartirish"
      subtitle={staff.name}
      dismissible={!busy}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Bekor qilish</Button>
          <Button variant="primary" icon="check" loading={busy} disabled={pin.length < PIN_MIN} onClick={submit}>Saqlash</Button>
        </>
      }
    >
      <div className="staff-pin">
        <div className="staff-form__pinlabel">Yangi PIN ({PIN_MIN}–{PIN_MAX} raqam)</div>
        <PinDots length={pin.length} max={PIN_MAX} error={err && pin.length < PIN_MIN} />
        <Numpad mode="pin" value={pin} onChange={(v) => { setErr(false); setPin(v) }} maxLength={PIN_MAX} onSubmit={submit} />
      </div>
    </Modal>
  )
}
