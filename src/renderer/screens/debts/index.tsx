/**
 * Qarzlar. Uch ko'rinish, bitta filtr paneli:
 *  - Qarzdorlar — odam bo'yicha (kim bergan, jami / to'langan / qoldiq);
 *  - Jurnal — har bir qarz alohida (sana, chek №, kimga, kim bergan, nima olingan);
 *  - Hisobot — kim qancha qarzga bergan, kimga, kunlar bo'yicha, to'lovlarni kim qabul qilgan.
 * Filtrlar: davr, holat, kim bergan, qayerdan (xona/bar), ism/telefon, chek raqami.
 * "To'lash" odam bo'yicha (`debtors.pay`) — eng eski qarzdan boshlab yopiladi (FIFO).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DebtJournalRow, Debtor, ReportRange } from '@shared/types'
import { api } from '@/api'
import { useCan } from '@/store/auth'
import { useApp } from '@/store/app'
import { Avatar, Badge, Button, DataRow, DataTable, EmptyState, Icon, Input, Money, PageHeader, Segmented, Select, Spinner, Tabs, cx, formatDateShort, toast } from '@/ui'
import { DateFilter } from '../history/DateFilter'
import { ALL_TIME } from '../history/common'
import '../history/history.css'
import { DebtorPayDialog } from './PayDialog'
import { DebtorDialog } from './DebtorDialog'
import { DebtDetail } from './DebtDetail'
import { JournalTab } from './JournalTab'
import { ReportTab } from './ReportTab'
import { byDebtor, collections, filterDebts, leftOf, receiptDigits, type DebtFilter, type DebtStatus } from './model'
import './debts.css'

type Tab = 'people' | 'journal' | 'report'

/** Qarzdor | Kim bergan | Qarzlar | Jami | To'langan | Qoldiq | Oxirgi | amallar */
const DEBT_COLS = 'minmax(190px, 1.4fr) minmax(0, 0.8fr) 56px 86px 86px 104px 90px 150px'

export default function DebtsScreen() {
  const readOnly = useApp((st) => st.readOnly)
  const canManage = useCan('debt.manage') && !readOnly
  const [tab, setTab] = useState<Tab>('people')
  const [list, setList] = useState<Debtor[]>([])
  const [rows, setRows] = useState<DebtJournalRow[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  const [range, setRange] = useState<ReportRange>(ALL_TIME)
  const [status, setStatus] = useState<DebtStatus>('open')
  const [staffId, setStaffId] = useState('all')
  const [source, setSource] = useState<DebtFilter['source']>('all')
  const [q, setQ] = useState('')
  const [receipt, setReceipt] = useState('')
  /** Filtrlarni tozalashda davr tugmalarini ham boshlang'ich holatga qaytarish uchun */
  const [filterKey, setFilterKey] = useState(0)

  const [payFor, setPayFor] = useState<Debtor | null>(null)
  const [openId, setOpenId] = useState<number | null>(null)
  const [debtId, setDebtId] = useState<number | null>(null)

  const load = useCallback(async () => {
    try {
      const [people, journal] = await Promise.all([api.debtors.list(false), api.debts.journal()])
      setList(people)
      setRows(journal)
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

  const filter: DebtFilter = { range, status, staffId: staffId === 'all' ? null : Number(staffId), source, q, receipt }
  /* eslint-disable react-hooks/exhaustive-deps */
  const shown = useMemo(() => filterDebts(rows, filter), [rows, range, status, staffId, source, q, receipt])
  // Hisobotda holat filtri qo'llanmaydi — "berilgan / qaytgan / qoldiq" to'liq ko'rinsin
  const reportRows = useMemo(() => filterDebts(rows, { ...filter, status: 'all' }), [rows, range, staffId, source, q, receipt])
  const pays = useMemo(() => collections(rows, filter), [rows, range, staffId, source, q, receipt])
  /* eslint-enable react-hooks/exhaustive-deps */
  const people = useMemo(() => byDebtor(shown).sort((a, b) => Number(b.left > 0) - Number(a.left > 0) || b.lastAt - a.lastAt), [shown])

  const issuers = useMemo(() => {
    const m = new Map<number, string>()
    for (const d of rows) if (d.issuedById != null) m.set(d.issuedById, d.issuedByName)
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [rows])

  // Yuqoridagi umumiy ko'rsatkich — filtrdan qat'i nazar hozirgi qarz
  const openPeople = list.filter((d) => d.balance > 0)
  const total = openPeople.reduce((s, d) => s + d.balance, 0)

  const byReceipt = !!receiptDigits(receipt)
  const filtered = byReceipt || status !== 'open' || staffId !== 'all' || source !== 'all' || !!q.trim() || range.from !== ALL_TIME.from || range.to !== ALL_TIME.to
  const shownLeft = shown.reduce((a, d) => a + leftOf(d), 0)

  const reset = () => {
    setRange(ALL_TIME)
    setStatus('open')
    setStaffId('all')
    setSource('all')
    setQ('')
    setReceipt('')
    setFilterKey((k) => k + 1)
  }

  const opened = list.find((d) => d.id === openId) || null
  const openedDebt = rows.find((d) => d.id === debtId) || null

  return (
    <div className="debts">
      <PageHeader title="Qarzlar" icon="debts" subtitle="Qarzdorlar, kim qarzga bergani, to'lovlar va hisobot" />

      <div className="debts-total">
        <div>
          <div className="debts-total__label">Jami qarz</div>
          <Money value={total} size="2xl" tone={total > 0 ? 'danger' : 'success'} />
        </div>
        {filtered && !failed && (
          <div>
            <div className="debts-total__label">Filtr bo'yicha qoldiq ({shown.length} ta qarz)</div>
            <Money value={shownLeft} size="xl" tone={shownLeft > 0 ? 'danger' : 'success'} />
          </div>
        )}
        <div className="debts-total__meta">
          <div className="num t-xl t-bold" data-testid="debts-open-count">{openPeople.length}</div>
          <div className="subtle">qarzdor</div>
        </div>
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { id: 'people', label: 'Qarzdorlar', icon: 'users' },
          { id: 'journal', label: 'Qarzlar jurnali', icon: 'wallet' },
          { id: 'report', label: 'Hisobot', icon: 'reports' }
        ]}
      />

      <div className="debts-filters" key={filterKey}>
        <div className="hist-filters"><DateFilter initial="all" allowAll onChange={setRange} /></div>
        <div className="hist-filters">
          {tab !== 'report' && (
            <Segmented<DebtStatus>
              size="lg" value={status} onChange={setStatus}
              options={[
                { value: 'open', label: 'Qarzi borlar' },
                { value: 'paid', label: "To'langan" },
                { value: 'all', label: 'Barchasi' }
              ]}
            />
          )}
          <div className="hist-sel"><Select size="lg" value={staffId} onChange={(e) => setStaffId(e.target.value)} aria-label="Kim bergan" data-testid="debts-staff">
            <option value="all">Kim bergan: hammasi</option>
            {issuers.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
          </Select></div>
          <div className="hist-sel"><Select size="lg" value={source} onChange={(e) => setSource(e.target.value as DebtFilter['source'])} aria-label="Qayerdan" data-testid="debts-source">
            <option value="all">Xona va bar</option>
            <option value="room">Faqat xonalar</option>
            <option value="bar">Faqat bar savdosi</option>
          </Select></div>
        </div>
        <div className="hist-filters">
          <div className="hist-search">
            <Input size="lg" icon="search" placeholder="Ism yoki telefon bo'yicha qidirish…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="debts-search" />
          </div>
          <div className="debts-receipt">
            <Input size="lg" icon="search" inputMode="numeric" placeholder="Chek №" value={receipt} onChange={(e) => setReceipt(receiptDigits(e.target.value))} data-testid="debts-receipt" />
          </div>
          {filtered && <Button size="lg" variant="ghost" icon="x" onClick={reset} data-testid="debts-reset">Filtrni tozalash</Button>}
        </div>
        {byReceipt && <div className="subtle">Chek raqami bo'yicha qidirilmoqda — boshqa filtrlar hisobga olinmaydi.</div>}
      </div>

      {loading ? (
        <div className="debts__loading"><Spinner size={40} /></div>
      ) : failed && rows.length === 0 ? (
        <EmptyState
          size="lg"
          icon="alert"
          title="Qarzlarni yuklab bo'lmadi"
          action={<Button variant="primary" icon="refresh" onClick={() => { setLoading(true); void load() }}>Qayta urinish</Button>}
        />
      ) : tab === 'report' ? (
        <ReportTab
          rows={reportRows}
          pays={pays}
          onStaff={(id) => { setStaffId(String(id)); setStatus('all'); setTab('journal') }}
          onDebtor={setOpenId}
        />
      ) : shown.length === 0 ? (
        <EmptyState
          size="lg"
          icon={filtered ? 'search' : 'checkCircle'}
          title={byReceipt ? 'Bu raqamli chekda qarz yo\'q' : filtered ? 'Hech narsa topilmadi' : "Qarzdor yo'q"}
          description={filtered ? "Filtrni o'zgartirib ko'ring." : "To'lovda «Qarz» tanlansa, qarzdor shu yerda paydo bo'ladi."}
        />
      ) : tab === 'journal' ? (
        <JournalTab rows={shown} onOpen={(d) => setDebtId(d.id)} />
      ) : (
        <DataTable
          className="debts-list"
          columns={DEBT_COLS}
          header={[
            'Qarzdor',
            'Kim bergan',
            <span key="n" className="r">Qarzlar</span>,
            <span key="a" className="r">Jami</span>,
            <span key="p" className="r">To'langan</span>,
            <span key="q" className="r">Qoldiq</span>,
            'Oxirgi',
            ''
          ]}
        >
          {people.map((g) => {
            const person = list.find((d) => d.id === g.key)
            return (
              <DataRow
                key={g.key}
                className={cx('debts-row', g.left === 0 && 'is-closed')}
                muted={g.left === 0}
                tabIndex={0}
                onClick={() => setOpenId(g.key)}
                onKeyDown={(e) => {
                  if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault()
                    setOpenId(g.key)
                  }
                }}
                data-testid={'debtor-row-' + g.key}
              >
                <div className="debts-cust">
                  <Avatar name={g.name} size={44} />
                  <div className="debts-cust__txt">
                    <div className="debts-cust__name ellipsis">{g.name}</div>
                    <div className="debts-cust__phone num">{g.phone || '—'}</div>
                  </div>
                </div>
                <span className="debts-by ellipsis" title={g.issuers.join(', ')} data-testid="debtor-by">{g.issuers.join(', ') || '—'}</span>
                <span className="r num t-lg">{g.count}</span>
                <span className="r"><Money value={g.amount} size="md" currency={false} /></span>
                <span className="r"><Money value={g.paid} size="md" currency={false} tone={g.paid ? 'success' : 'muted'} /></span>
                <span className="r">
                  {g.left > 0 ? <Money value={g.left} size="lg" tone="danger" currency={false} /> : <Badge tone="success" icon="check">To'langan</Badge>}
                </span>
                <span className="num">{formatDateShort(g.lastAt)}</span>
                <div className="ui-dt__tools debts-row__tools">
                  {canManage && person && person.balance > 0 && (
                    <Button
                      variant="success"
                      icon="cash"
                      onClick={(e) => {
                        e.stopPropagation()
                        setPayFor(person)
                      }}
                    >
                      To'lash
                    </Button>
                  )}
                  <Icon name="chevronRight" size={24} className="debts-row__chev" />
                </div>
              </DataRow>
            )
          })}
        </DataTable>
      )}

      {openedDebt && (
        <DebtDetail debt={openedDebt} onClose={() => setDebtId(null)} onDebtor={() => { setDebtId(null); setOpenId(openedDebt.debtorId) }} />
      )}
      {opened && (
        <DebtorDialog
          debtor={opened}
          debts={rows.filter((d) => d.debtorId === opened.id)}
          canManage={canManage}
          onClose={() => setOpenId(null)}
          onPay={() => setPayFor(opened)}
          onChanged={load}
        />
      )}
      {payFor && <DebtorPayDialog debtor={payFor} onClose={() => setPayFor(null)} onPaid={load} />}
    </div>
  )
}
