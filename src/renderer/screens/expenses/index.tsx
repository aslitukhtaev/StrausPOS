/**
 * Xarajatlar — davr bo'yicha xarajatlar jadvali, kategoriya jamlanmasi, tezkor "Xarajat qo'shish".
 * Hisob backendda (`expenses.*`); yozish tugmalari faqat `expense.manage` va readOnly/terminal bo'lmaganda.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Expense, ExpenseCategory, ReportRange } from '@shared/types'
import { api } from '@/api'
import { useApp } from '@/store/app'
import { useCan } from '@/store/auth'
import { Button, Card, DataRow, DataTable, EmptyState, IconButton, Money, PageHeader, Spinner, confirmDialog, toast } from '@/ui'
import { CategoriesDialog } from './CategoriesDialog'
import { ExpenseDialog } from './ExpenseDialog'
import { RangePicker, initialRange } from './RangePicker'
import { CAT_COLORS, dayDMY } from './range'
import './expenses.css'

const COLS = '130px 200px minmax(0,1fr) 170px 160px 120px'

export default function ExpensesScreen() {
  const readOnly = useApp((s) => s.readOnly)
  const mode = useApp((s) => s.mode)
  const canWrite = useCan('expense.manage') && !readOnly && mode !== 'terminal'
  const [range, setRange] = useState<ReportRange>(() => initialRange('month'))
  const [rows, setRows] = useState<Expense[] | null>(null)
  const [cats, setCats] = useState<ExpenseCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [dlg, setDlg] = useState<{ expense: Expense | null } | null>(null)
  const [catDlg, setCatDlg] = useState(false)
  const seq = useRef(0)

  const loadCats = useCallback(async () => {
    try {
      setCats(await api.expenses.categories())
    } catch (e) {
      toast.error(e)
    }
  }, [])
  const load = useCallback((r: ReportRange) => {
    const my = ++seq.current
    setLoading(true)
    api.expenses
      .list(r)
      .then((x) => {
        if (my !== seq.current) return
        setRows(x)
        setLoading(false)
      })
      .catch((e) => {
        if (my !== seq.current) return
        toast.error(e)
        setRows((p) => p || [])
        setLoading(false)
      })
  }, [])
  useEffect(() => load(range), [range, load])
  useEffect(() => { loadCats() }, [loadCats])

  const sorted = useMemo(() => (rows || []).slice().sort((a, b) => (a.day === b.day ? b.createdAt - a.createdAt : a.day < b.day ? 1 : -1)), [rows])
  const total = useMemo(() => sorted.reduce((s, r) => s + r.amount, 0), [sorted])
  const byCat = useMemo(() => {
    const m = new Map<number, { id: number; name: string; amount: number }>()
    for (const r of sorted) {
      const c = m.get(r.categoryId) || { id: r.categoryId, name: r.categoryName, amount: 0 }
      c.amount += r.amount
      m.set(r.categoryId, c)
    }
    return Array.from(m.values()).sort((a, b) => b.amount - a.amount)
  }, [sorted])
  const top = byCat[0]

  const refresh = async () => load(range)
  const remove = async (e: Expense) => {
    const ok = await confirmDialog({
      title: "Xarajat o'chirilsinmi?",
      message: e.categoryName + ' · ' + dayDMY(e.day) + ' · ' + e.amount.toLocaleString('ru-RU').replace(/ /g, ' ') + " so'm",
      confirmText: "O'chirish",
      danger: true
    })
    if (!ok) return
    try {
      await api.expenses.remove(e.id)
      toast.success("Xarajat o'chirildi")
      load(range)
    } catch (err) {
      toast.error(err)
    }
  }

  return (
    <div className="exp">
      <PageHeader
        title="Xarajatlar"
        icon="wallet"
        subtitle="Ijara, kommunal, maosh va boshqa xarajatlar"
        actions={canWrite ? <Button variant="primary" size="lg" icon="plus" onClick={() => setDlg({ expense: null })} data-testid="exp-add">Xarajat qo'shish</Button> : undefined}
      />
      <RangePicker initial="month" onChange={setRange} />

      <div className={'exp__content' + (loading && rows ? ' is-loading' : '')}>
        {!rows ? (
          <div className="exp-center"><Spinner size={40} /></div>
        ) : (
          <>
            <div className="exp-kpis">
              <Card tone="accent" padding="lg" data-testid="exp-total">
                <div className="exp-kpi__label">Jami xarajat</div>
                <Money value={total} size="3xl" />
                <div className="exp-kpi__note">{sorted.length} ta yozuv</div>
              </Card>
              <Card padding="lg">
                <div className="exp-kpi__label">Eng katta kategoriya</div>
                {top ? (
                  <>
                    <div className="exp-kpi__name">{top.name}</div>
                    <Money value={top.amount} size="xl" />
                    <div className="exp-kpi__note">{total > 0 ? Math.round((top.amount / total) * 100) : 0}% jami xarajatdan</div>
                  </>
                ) : (
                  <div className="exp-kpi__note">Ma'lumot yo'q</div>
                )}
              </Card>
              <Card padding="lg" title="Kategoriya bo'yicha">
                {byCat.length === 0 ? (
                  <div className="exp-kpi__note">Ma'lumot yo'q</div>
                ) : (
                  <div className="exp-bars" data-testid="exp-bars">
                    {byCat.map((c, i) => (
                      <div key={c.id} className="exp-bar">
                        <div className="exp-bar__head">
                          <span className="exp-bar__name ellipsis">{c.name}</span>
                          <Money value={c.amount} size="sm" />
                        </div>
                        <div className="exp-bar__track">
                          <div className="exp-bar__fill" style={{ width: Math.max(2, (c.amount / (top ? top.amount : 1)) * 100) + '%', background: CAT_COLORS[i % CAT_COLORS.length] }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            <Card padding="none">
              {sorted.length === 0 ? (
                <EmptyState
                  size="lg"
                  icon="wallet"
                  title="Bu davrda xarajat yo'q"
                  description={canWrite ? "Birinchi xarajatni qo'shing — sof foyda to'g'ri hisoblanadi." : "Davrni o'zgartirib ko'ring."}
                  action={canWrite ? <Button variant="primary" icon="plus" onClick={() => setDlg({ expense: null })}>Xarajat qo'shish</Button> : undefined}
                />
              ) : (
                <DataTable
                  className="exp-table"
                  columns={canWrite ? COLS : '130px 200px minmax(0,1fr) 170px 160px'}
                  header={['Sana', 'Kategoriya', 'Izoh', <span key="a" className="r">Summa</span>, 'Kim kiritdi', ...(canWrite ? [''] : [])]}
                  data-testid="exp-table"
                >
                  {sorted.map((r) => (
                    <DataRow key={r.id} data-testid="exp-row">
                      <div className="num">{dayDMY(r.day)}</div>
                      <div className="ellipsis">{r.categoryName}</div>
                      <div className="exp-note ellipsis">{r.note || '—'}</div>
                      <Money value={r.amount} size="lg" className="r" />
                      <div className="ellipsis exp-by">{r.createdBy}</div>
                      {canWrite && (
                        <div className="ui-dt__tools">
                          <IconButton icon="edit" label="Tahrirlash" variant="ghost" onClick={() => setDlg({ expense: r })} />
                          <IconButton icon="trash" label="O'chirish" variant="ghost" onClick={() => remove(r)} />
                        </div>
                      )}
                    </DataRow>
                  ))}
                </DataTable>
              )}
            </Card>
          </>
        )}
      </div>

      {dlg && canWrite && (
        <ExpenseDialog
          expense={dlg.expense}
          cats={cats}
          onClose={() => setDlg(null)}
          onSaved={refresh}
          onManageCats={() => setCatDlg(true)}
        />
      )}
      {catDlg && <CategoriesDialog cats={cats} onClose={() => setCatDlg(false)} onChanged={loadCats} />}
    </div>
  )
}
