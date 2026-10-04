/**
 * Qarzdor tafsiloti: jami / to'langan / qoldiq, qarzlari tarixi (`debtors.debts`) va barcha to'lovlari
 * (`debts.payments` har bir qarz uchun). Ism/telefonni tuzatish (`debtors.rename`). "To'lash" — odam bo'yicha.
 */
import { useEffect, useState } from 'react'
import type { Debt, DebtPayment, Debtor } from '@shared/types'
import { api } from '@/api'
import {
  Avatar, Badge, Button, EmptyState, Field, Icon, Input, Modal, Money, Spinner, formatDateShort, formatDateTime, formatPhone, toast
} from '@/ui'
import { METHOD_ICON, METHOD_LABEL, phoneDigits } from '../checkout/methods'

type Pay = DebtPayment & { debtAt: number }

export function DebtorDialog({ debtor, version, canManage, onClose, onPay, onChanged }: {
  debtor: Debtor
  version: number
  canManage: boolean
  onClose: () => void
  onPay: () => void
  onChanged: () => void | Promise<unknown>
}) {
  const [data, setData] = useState<{ debts: Debt[]; pays: Pay[] } | null>(null)
  const [failed, setFailed] = useState(false)
  const [edit, setEdit] = useState(false)

  useEffect(() => {
    let alive = true
    setFailed(false)
    api.debtors
      .debts(debtor.id)
      .then(async (debts) => {
        const lists = await Promise.all(debts.map((d) => api.debts.payments(d.id)))
        const pays: Pay[] = []
        lists.forEach((l, i) => l.forEach((p) => pays.push({ ...p, debtAt: debts[i].createdAt })))
        pays.sort((a, b) => b.at - a.at)
        if (alive) setData({ debts: debts.slice().sort((a, b) => b.createdAt - a.createdAt), pays })
      })
      .catch((e) => {
        if (!alive) return
        toast.error(e)
        setFailed(true)
      })
    return () => {
      alive = false
    }
  }, [debtor.id, version])

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={
        <span className="debts-dlg__title">
          <Avatar name={debtor.name} size={40} />
          <span className="ellipsis">{debtor.name}</span>
        </span>
      }
      subtitle={(debtor.phone || 'Telefon yo\'q') + ' · ' + debtor.debtsCount + ' ta qarz'}
      footer={
        <>
          {canManage && (
            <Button variant="ghost" icon="edit" onClick={() => setEdit(true)} data-testid="debtor-edit">
              Ism / telefon
            </Button>
          )}
          <span className="spacer" />
          <Button variant="secondary" onClick={onClose}>Yopish</Button>
          {canManage && debtor.balance > 0 && (
            <Button variant="success" icon="cash" onClick={onPay} data-testid="debtor-pay">
              To'lash
            </Button>
          )}
        </>
      }
    >
      <div className="debts-sum">
        <div><div className="subtle t-xs">Jami olingan</div><Money value={debtor.total} size="lg" /></div>
        <div><div className="subtle t-xs">To'langan</div><Money value={debtor.paid} size="lg" tone="success" /></div>
        <div><div className="subtle t-xs">Qoldiq</div><Money value={debtor.balance} size="xl" tone={debtor.balance > 0 ? 'danger' : 'success'} /></div>
      </div>

      {!data && !failed && <div className="debts__loading"><Spinner size={36} /></div>}
      {failed && <EmptyState icon="alert" title="Tafsilotni yuklab bo'lmadi" />}
      {data && (
        <div className="debts-dlg">
          <section className="debts-panel">
            <div className="debts-panel__head">
              <span className="debts-panel__title">Qarzlar</span>
              <Badge tone="neutral" size="sm">{data.debts.length} ta</Badge>
            </div>
            {data.debts.length === 0 ? (
              <div className="subtle debts-hist__empty">Qarz yo'q</div>
            ) : (
              <div className="debts-panel__scroll">
                <table className="ui-table debts-mini" data-testid="debtor-debts">
                  <thead>
                    <tr><th>Sana</th><th className="r">Summa</th><th className="r">To'langan</th><th className="r">Qoldiq</th></tr>
                  </thead>
                  <tbody>
                    {data.debts.map((d) => {
                      const left = Math.max(0, d.amount - d.paid)
                      return (
                        <tr key={d.id}>
                          <td className="num nowrap">{formatDateTime(d.createdAt)}</td>
                          <td className="r"><Money value={d.amount} size="sm" currency={false} /></td>
                          <td className="r"><Money value={d.paid} size="sm" currency={false} tone={d.paid ? 'success' : 'muted'} /></td>
                          <td className="r">
                            {left > 0 ? <Money value={left} size="sm" currency={false} tone="danger" /> : <Badge tone="success" size="sm" icon="check">Yopilgan</Badge>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <section className="debts-panel">
            <div className="debts-panel__head">
              <span className="debts-panel__title">To'lovlar</span>
              <Badge tone="neutral" size="sm">{data.pays.length} ta</Badge>
            </div>
            {data.pays.length === 0 ? (
              <div className="subtle debts-hist__empty">Hali to'lov qilinmagan</div>
            ) : (
              <div className="debts-panel__scroll">
                <ul className="debts-pays" data-testid="debtor-pays">
                  {data.pays.map((p) => (
                    <li key={p.id} className="debts-pays__row">
                      <div className="debts-pays__main">
                        <span className="num">{formatDateTime(p.at)}</span>
                        <span className="subtle t-xs">{formatDateShort(p.debtAt)} dagi qarzga</span>
                      </div>
                      <Badge tone={p.method === 'cash' ? 'success' : 'info'} icon={METHOD_ICON[p.method]}>{METHOD_LABEL[p.method]}</Badge>
                      <Money value={p.amount} size="md" tone="success" />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </div>
      )}
      <div className="debts-dlg__note subtle">
        <Icon name="info" size={20} />
        <span>To'lov odam bo'yicha qabul qilinadi va eng eski qarzdan boshlab yopiladi.</span>
      </div>

      {edit && (
        <RenameDialog
          debtor={debtor}
          onClose={() => setEdit(false)}
          onSaved={async () => {
            setEdit(false)
            await onChanged()
          }}
        />
      )}
    </Modal>
  )
}

function RenameDialog({ debtor, onClose, onSaved }: { debtor: Debtor; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const [name, setName] = useState(debtor.name)
  const [phone, setPhone] = useState(phoneDigits(debtor.phone))
  const [busy, setBusy] = useState(false)
  const nameOk = !!name.trim()
  const phoneOk = phone.length === 9

  const save = async () => {
    if (!nameOk) return toast.warning('Ismni kiriting')
    if (!phoneOk) return toast.warning("Telefon raqamini to'liq kiriting (9 ta raqam)")
    setBusy(true)
    try {
      await api.debtors.rename(debtor.id, name.trim(), '+998 ' + formatPhone(phone))
      toast.success('Saqlandi')
      await onSaved()
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
      title="Qarzdor ma'lumotlari"
      dismissible={!busy}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Bekor</Button>
          <Button variant="primary" icon="check" loading={busy} disabled={!nameOk || !phoneOk} onClick={() => void save()} data-testid="debtor-rename-save">
            Saqlash
          </Button>
        </>
      }
    >
      <div className="debts-form">
        <Field label="Ism" required>
          <Input size="lg" icon="user" data-autofocus value={name} maxLength={80} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void save()} />
        </Field>
        <Field label="Telefon (+998)" required error={!phoneOk && phone ? '9 ta raqam: 90 123 45 67' : undefined}>
          <Input
            size="lg"
            icon="phone"
            inputMode="tel"
            value={phone.length === 9 ? formatPhone(phone) : phone}
            placeholder="90 123 45 67"
            onChange={(e) => setPhone(phoneDigits(e.target.value))}
            onKeyDown={(e) => e.key === 'Enter' && void save()}
          />
        </Field>
      </div>
    </Modal>
  )
}
