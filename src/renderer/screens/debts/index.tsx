import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Debt } from '@shared/types'
import { api } from '@/api'
import { useCan } from '@/store/auth'
import { Avatar, Badge, Button, DataRow, DataTable, EmptyState, Input, Money, PageHeader, Spinner, Tabs, cx, formatDateShort, formatPhone, toast } from '@/ui'
import { PayDialog } from './PayDialog'
import { HistoryDialog } from './HistoryDialog'
import './debts.css'

type Tab = 'open' | 'all'
export const remaining = (d: Debt) => Math.max(0, d.amount - d.paid)


/** Mijoz | Sana | Summa | To'langan | Qolgan | amallar */
const DEBT_COLS = 'minmax(0, 1.6fr) 112px 116px 116px 136px 280px'

export default function DebtsScreen() {
  const canManage = useCan('debt.manage')
  const [tab, setTab] = useState<Tab>('open')
  const [debts, setDebts] = useState<Debt[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [payDebt, setPayDebt] = useState<Debt | null>(null)
  const [histDebt, setHistDebt] = useState<Debt | null>(null)

  const load = useCallback(async () => {
    try {
      setDebts(await api.debts.list(false))
    } catch (e) {
      toast.error(e)
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const open = useMemo(() => debts.filter((d) => remaining(d) > 0), [debts])
  const total = open.reduce((s, d) => s + remaining(d), 0)

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    const digits = s.replace(/\D/g, '')
    return (tab === 'open' ? open : debts)
      .filter((d) => !s || d.customerName.toLowerCase().includes(s) || (digits && d.phone.replace(/\D/g, '').includes(digits)))
      .sort((a, b) => Number(remaining(b) > 0) - Number(remaining(a) > 0) || b.createdAt - a.createdAt)
  }, [debts, open, tab, q])

  const refreshed = async (id: number) => {
    await load()
    return id
  }

  return (
    <div className="debts">
      <PageHeader title="Qarzlar" icon="debts" subtitle="Mijozlar qarzi va to'lovlar" />

      <div className="debts-total">
        <div>
          <div className="debts-total__label">Jami qarz</div>
          <Money value={total} size="3xl" tone={total > 0 ? 'danger' : 'success'} />
        </div>
        <div className="debts-total__meta">
          <div className="num t-xl t-bold">{open.length}</div>
          <div className="subtle">ochiq qarz</div>
        </div>
      </div>

      <div className="debts-bar">
        <Tabs value={tab} onChange={setTab} items={[{ id: 'open', label: 'Ochiq', icon: 'wallet', badge: open.length }, { id: 'all', label: 'Barchasi', icon: 'receipt' }]} />
        <div className="debts-bar__search">
          <Input icon="search" placeholder="Ism yoki telefon bo'yicha qidirish…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <div className="debts__loading"><Spinner size={40} /></div>
      ) : shown.length === 0 ? (
        <EmptyState
          size="lg"
          icon={q ? 'search' : 'checkCircle'}
          title={q ? 'Hech narsa topilmadi' : tab === 'open' ? "Ochiq qarz yo'q" : "Qarzlar tarixi bo'sh"}
          description={q ? "Boshqa ism yoki raqam kiriting." : tab === 'open' ? "Hamma mijoz hisob-kitobni to'liq qilgan." : "To'lovda «Qarz» tanlansa, shu yerda paydo bo'ladi."}
        />
      ) : (
        <DataTable
          className="debts-list"
          columns={DEBT_COLS}
          header={['Mijoz', 'Sana', <span key="a" className="r">Summa</span>, <span key="p" className="r">To'langan</span>, <span key="q" className="r">Qolgan</span>, '']}
        >
          {shown.map((d) => {
            const rest = remaining(d)
            return (
              <DataRow key={d.id} className={cx('debts-row', rest === 0 && 'is-closed')} muted={rest === 0}>
                <div className="debts-cust">
                  <Avatar name={d.customerName} size={44} />
                  <div className="debts-cust__txt">
                    <div className="debts-cust__name ellipsis">{d.customerName}</div>
                    <div className="debts-cust__phone num">{d.phone ? formatPhone(d.phone) : '—'}</div>
                  </div>
                </div>
                <span className="num">{formatDateShort(d.createdAt)}</span>
                <span className="r"><Money value={d.amount} size="md" currency={false} /></span>
                <span className="r"><Money value={d.paid} size="md" currency={false} tone={d.paid ? 'success' : 'muted'} /></span>
                <span className="r">{rest > 0 ? <Money value={rest} size="lg" tone="danger" currency={false} /> : <Badge tone="success" icon="check">To'langan</Badge>}</span>
                <div className="ui-dt__tools debts-row__tools">
                  <Button variant="secondary" icon="clock" onClick={() => setHistDebt(d)}>Tarix</Button>
                  {canManage && rest > 0 && <Button variant="success" icon="cash" onClick={() => setPayDebt(d)}>To'lash</Button>}
                </div>
              </DataRow>
            )
          })}
        </DataTable>
      )}

      {payDebt && <PayDialog debt={payDebt} onClose={() => setPayDebt(null)} onPaid={refreshed} />}
      {histDebt && <HistoryDialog debt={histDebt} onClose={() => setHistDebt(null)} />}
    </div>
  )
}
