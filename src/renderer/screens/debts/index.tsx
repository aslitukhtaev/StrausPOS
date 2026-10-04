/**
 * Qarzlar — odam bo'yicha (bitta qarzdor = bitta yozuv): `debtors.list` (jami / to'langan / qoldiq, qarzlar soni).
 * Qatorni bosish → qarzdor tafsiloti (qarzlari tarixi, har qarzning to'lovlari, ism/telefonni tuzatish).
 * "To'lash" odam bo'yicha (`debtors.pay`) — eng eski qarzdan boshlab yopiladi (FIFO).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Debtor } from '@shared/types'
import { api } from '@/api'
import { useCan } from '@/store/auth'
import { useApp } from '@/store/app'
import { Avatar, Badge, Button, DataRow, DataTable, EmptyState, Icon, Input, Money, PageHeader, Spinner, Tabs, cx, formatDateShort, toast } from '@/ui'
import { DebtorPayDialog } from './PayDialog'
import { DebtorDialog } from './DebtorDialog'
import './debts.css'

type Tab = 'open' | 'all'

/** Qarzdor | Qarzlar | Jami | To'langan | Qoldiq | Oxirgi | amallar */
const DEBT_COLS = 'minmax(0, 1fr) 76px 112px 112px 132px 108px 172px'

export function matchDebtor(d: Debtor, q: string): boolean {
  const s = q.trim().toLowerCase()
  if (!s) return true
  const digits = s.replace(/\D/g, '')
  return d.name.toLowerCase().indexOf(s) >= 0 || (!!digits && d.phone.replace(/\D/g, '').indexOf(digits) >= 0)
}

export default function DebtsScreen() {
  const readOnly = useApp((st) => st.readOnly)
  const canManage = useCan('debt.manage') && !readOnly
  const [tab, setTab] = useState<Tab>('open')
  const [list, setList] = useState<Debtor[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [q, setQ] = useState('')
  const [payFor, setPayFor] = useState<Debtor | null>(null)
  const [openId, setOpenId] = useState<number | null>(null)
  const [ver, setVer] = useState(0)

  const load = useCallback(async () => {
    try {
      setList(await api.debtors.list(false))
      setFailed(false)
    } catch (e) {
      toast.error(e)
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const open = useMemo(() => list.filter((d) => d.balance > 0), [list])
  const total = open.reduce((s, d) => s + d.balance, 0)

  const shown = useMemo(
    () =>
      (tab === 'open' ? open : list)
        .filter((d) => matchDebtor(d, q))
        .sort((a, b) => Number(b.balance > 0) - Number(a.balance > 0) || b.lastAt - a.lastAt),
    [list, open, tab, q]
  )

  const opened = list.find((d) => d.id === openId) || null

  const changed = async () => {
    setVer((v) => v + 1)
    await load()
  }

  return (
    <div className="debts">
      <PageHeader title="Qarzlar" icon="debts" subtitle="Qarzdorlar, ularning qarzlari va to'lovlar" />

      <div className="debts-total">
        <div>
          <div className="debts-total__label">Jami qarz</div>
          <Money value={total} size="3xl" tone={total > 0 ? 'danger' : 'success'} />
        </div>
        <div className="debts-total__meta">
          <div className="num t-xl t-bold" data-testid="debts-open-count">{open.length}</div>
          <div className="subtle">qarzdor</div>
        </div>
      </div>

      <div className="debts-bar">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { id: 'open', label: 'Qarzi borlar', icon: 'wallet', badge: open.length },
            { id: 'all', label: 'Barchasi', icon: 'users' }
          ]}
        />
        <div className="debts-bar__search">
          <Input icon="search" placeholder="Ism yoki telefon bo'yicha qidirish…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="debts-search" />
        </div>
      </div>

      {loading ? (
        <div className="debts__loading"><Spinner size={40} /></div>
      ) : failed && list.length === 0 ? (
        <EmptyState
          size="lg"
          icon="alert"
          title="Qarzlarni yuklab bo'lmadi"
          action={<Button variant="primary" icon="refresh" onClick={() => { setLoading(true); void load() }}>Qayta urinish</Button>}
        />
      ) : shown.length === 0 ? (
        <EmptyState
          size="lg"
          icon={q ? 'search' : 'checkCircle'}
          title={q ? 'Hech kim topilmadi' : tab === 'open' ? "Qarzdor yo'q" : "Qarzlar tarixi bo'sh"}
          description={
            q
              ? 'Boshqa ism yoki raqam kiriting.'
              : tab === 'open'
                ? "Hamma mijoz hisob-kitobni to'liq qilgan."
                : "To'lovda «Qarz» tanlansa, qarzdor shu yerda paydo bo'ladi."
          }
        />
      ) : (
        <DataTable
          className="debts-list"
          columns={DEBT_COLS}
          header={[
            'Qarzdor',
            <span key="n" className="r">Qarzlar</span>,
            <span key="a" className="r">Jami</span>,
            <span key="p" className="r">To'langan</span>,
            <span key="q" className="r">Qoldiq</span>,
            'Oxirgi',
            ''
          ]}
        >
          {shown.map((d) => (
            <DataRow
              key={d.id}
              className={cx('debts-row', d.balance === 0 && 'is-closed')}
              muted={d.balance === 0}
              tabIndex={0}
              onClick={() => setOpenId(d.id)}
              onKeyDown={(e) => {
                if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault()
                  setOpenId(d.id)
                }
              }}
              data-testid={'debtor-row-' + d.id}
            >
              <div className="debts-cust">
                <Avatar name={d.name} size={44} />
                <div className="debts-cust__txt">
                  <div className="debts-cust__name ellipsis">{d.name}</div>
                  <div className="debts-cust__phone num">{d.phone || '—'}</div>
                </div>
              </div>
              <span className="r num t-lg">{d.debtsCount}</span>
              <span className="r"><Money value={d.total} size="md" currency={false} /></span>
              <span className="r"><Money value={d.paid} size="md" currency={false} tone={d.paid ? 'success' : 'muted'} /></span>
              <span className="r">
                {d.balance > 0 ? <Money value={d.balance} size="lg" tone="danger" currency={false} /> : <Badge tone="success" icon="check">To'langan</Badge>}
              </span>
              <span className="num">{d.lastAt ? formatDateShort(d.lastAt) : '—'}</span>
              <div className="ui-dt__tools debts-row__tools">
                {canManage && d.balance > 0 && (
                  <Button
                    variant="success"
                    icon="cash"
                    onClick={(e) => {
                      e.stopPropagation()
                      setPayFor(d)
                    }}
                  >
                    To'lash
                  </Button>
                )}
                <Icon name="chevronRight" size={24} className="debts-row__chev" />
              </div>
            </DataRow>
          ))}
        </DataTable>
      )}

      {opened && (
        <DebtorDialog
          debtor={opened}
          version={ver}
          canManage={canManage}
          onClose={() => setOpenId(null)}
          onPay={() => setPayFor(opened)}
          onChanged={changed}
        />
      )}
      {payFor && <DebtorPayDialog debtor={payFor} onClose={() => setPayFor(null)} onPaid={changed} />}
    </div>
  )
}
