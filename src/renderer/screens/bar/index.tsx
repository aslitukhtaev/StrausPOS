import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Department, Product, ProductCategory, ServiceItem } from '@shared/types'
import { api } from '@/api'
import { useCan } from '@/store/auth'
import { Badge, Button, DataRow, DataTable, EmptyState, Icon, IconButton, Input, Money, PageHeader, Segmented, Spinner, Tabs, cx, confirmDialog, formatMoney, toast } from '@/ui'
import { ProductDialog } from './ProductDialog'
import { StockDialog } from './StockDialog'
import { CategoryDialog, DEPT_LABEL } from './CategoryDialog'
import { ServicesTab } from './ServicesTab'
import './bar.css'

type Tab = 'products' | 'services'

export function isLow(p: Product): boolean {
  return p.trackStock && p.stock <= p.lowStockAt
}


/** Nomi | Narxi | Qoldiq | amallar */
const BAR_COLS = 'minmax(0, 1fr) 130px 250px 184px'

export default function BarScreen() {
  const canEdit = useCan('stock.manage')
  const [tab, setTab] = useState<Tab>('products')
  const [cats, setCats] = useState<ProductCategory[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [services, setServices] = useState<ServiceItem[]>([])
  const [loading, setLoading] = useState(true)
  const [cat, setCat] = useState<number | 'all'>('all')
  const [dept, setDept] = useState<Department | 'all'>('all')
  const [q, setQ] = useState('')
  const [lowOnly, setLowOnly] = useState(false)
  const [showInactive, setShowInactive] = useState(false)
  const [prodDlg, setProdDlg] = useState<Partial<Product> | null>(null)
  const [stockDlg, setStockDlg] = useState<{ p: Product; sign: 1 | -1 } | null>(null)
  const [catDlg, setCatDlg] = useState<Partial<ProductCategory> | null>(null)
  const [svcDlg, setSvcDlg] = useState<Partial<ServiceItem> | null>(null)

  const load = useCallback(async () => {
    try {
      const [c, p, s] = await Promise.all([api.catalog.categories(), api.catalog.products(true), api.catalog.services(true)])
      setCats(c)
      setProducts(p)
      setServices(s)
    } catch (e) {
      toast.error(e)
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const catName = useMemo(() => {
    const m: Record<number, string> = {}
    cats.forEach((c) => (m[c.id] = c.name))
    return m
  }, [cats])

  const catDept = useMemo(() => {
    const m: Record<number, Department> = {}
    cats.forEach((c) => (m[c.id] = c.department || 'bar'))
    return m
  }, [cats])
  const deptCats = useMemo(() => cats.filter((c) => dept === 'all' || (c.department || 'bar') === dept), [cats, dept])
  const inDept = (p: Product) => dept === 'all' || catDept[p.categoryId] === dept

  const counts = useMemo(() => {
    const m: Record<number, number> = {}
    products.forEach((p) => {
      if (p.active || showInactive) m[p.categoryId] = (m[p.categoryId] || 0) + 1
    })
    return m
  }, [products, showInactive])

  const lowCount = products.filter((p) => p.active && isLow(p)).length

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return products
      .filter((p) => (showInactive || p.active) && inDept(p) && (cat === 'all' || p.categoryId === cat) && (!lowOnly || isLow(p)) && (!s || p.name.toLowerCase().includes(s)))
      .sort((a, b) => a.name.localeCompare(b.name))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, cat, q, lowOnly, showInactive, dept, catDept])

  const removeCat = async (c: ProductCategory) => {
    const n = products.filter((p) => p.categoryId === c.id).length
    const ok = await confirmDialog({
      title: `"${c.name}" kategoriyasini o'chirasizmi?`,
      message: n ? `Ichida ${n} ta mahsulot bor. Avval ularni boshqa kategoriyaga o'tkazing.` : undefined,
      confirmText: "O'chirish",
      danger: true
    })
    if (!ok) return
    try {
      await api.catalog.removeCategory(c.id)
      if (cat === c.id) setCat('all')
      toast.success("Kategoriya o'chirildi")
      await load()
    } catch (e) {
      toast.error(e)
    }
  }

  const removeProduct = async (p: Product) => {
    if (!(await confirmDialog({ title: `"${p.name}" ni o'chirasizmi?`, message: "Mahsulot ro'yxatdan olib tashlanadi.", confirmText: "O'chirish", danger: true }))) return
    try {
      await api.catalog.removeProduct(p.id)
      toast.success("Mahsulot o'chirildi")
      await load()
    } catch (e) {
      toast.error(e)
    }
  }

  const toggleActive = async (p: Product) => {
    try {
      await api.catalog.saveProduct({ ...p, active: !p.active })
      await load()
    } catch (e) {
      toast.error(e)
    }
  }

  const actions = canEdit ? (
    tab === 'products' ? (
      <Button variant="primary" icon="plus" onClick={() => setProdDlg({ categoryId: cat === 'all' ? (deptCats[0] || cats[0])?.id : cat })} disabled={!cats.length}>
        Mahsulot qo'shish
      </Button>
    ) : (
      <Button variant="primary" icon="plus" onClick={() => setSvcDlg({})}>
        Xizmat qo'shish
      </Button>
    )
  ) : (
    <Badge tone="neutral" icon="eye" size="lg">Faqat ko'rish</Badge>
  )

  return (
    <div className="bar">
      <PageHeader title="Bar" icon="bar" subtitle="Bar va oshxona mahsulotlari, ombor qoldig'i va xizmatlar" actions={actions} />
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { id: 'products', label: 'Mahsulotlar', icon: 'box' },
          { id: 'services', label: 'Xizmatlar', icon: 'sparkles' }
        ]}
      />
      {loading ? (
        <div className="bar__loading"><Spinner size={40} /></div>
      ) : tab === 'services' ? (
        <ServicesTab services={services} canEdit={canEdit} dlg={svcDlg} setDlg={setSvcDlg} reload={load} />
      ) : (
        <div className="bar__body">
          <aside className="bar-cats">
            <Segmented<Department | 'all'>
              block
              className="bar-dept"
              value={dept}
              onChange={(v) => {
                setDept(v)
                setCat('all')
              }}
              options={[
                { value: 'all', label: 'Hammasi' },
                { value: 'bar', label: 'Bar' },
                { value: 'kitchen', label: 'Oshxona' }
              ]}
            />
            <button type="button" className={cx('bar-cat', cat === 'all' && 'is-active')} onClick={() => setCat('all')}>
              <span className="bar-cat__name">{dept === 'all' ? 'Barcha mahsulotlar' : dept === 'bar' ? 'Barcha bar' : 'Barcha oshxona'}</span>
              <span className="bar-cat__n num">{products.filter((p) => (p.active || showInactive) && inDept(p)).length}</span>
            </button>
            {deptCats.map((c) => (
              <div key={c.id} className={cx('bar-cat', cat === c.id && 'is-active')} data-dept={c.department || 'bar'}>
                <button type="button" className="bar-cat__main" onClick={() => setCat(c.id)}>
                  <span className={cx('bar-cat__dept', (c.department || 'bar') === 'kitchen' && 'is-kitchen')} title={DEPT_LABEL[c.department || 'bar']}>
                    <Icon name={(c.department || 'bar') === 'kitchen' ? 'flame' : 'bar'} size={18} />
                  </span>
                  <span className="bar-cat__name ellipsis">{c.name}</span>
                  <span className="bar-cat__n num">{counts[c.id] || 0}</span>
                </button>
                {canEdit && cat === c.id && (
                  <span className="bar-cat__tools">
                    <IconButton icon="edit" label="Tahrirlash" variant="ghost" size="sm" onClick={() => setCatDlg(c)} />
                    <IconButton icon="trash" label="O'chirish" variant="ghost" size="sm" onClick={() => removeCat(c)} />
                  </span>
                )}
              </div>
            ))}
            {canEdit && (
              <Button variant="secondary" icon="plus" block onClick={() => setCatDlg({ department: dept === 'all' ? 'bar' : dept })}>
                Kategoriya
              </Button>
            )}
          </aside>

          <section className="bar-main">
            <div className="bar-toolbar">
              <div className="bar-toolbar__search">
                <Input icon="search" placeholder="Mahsulot qidirish…" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <Button variant={lowOnly ? 'primary' : 'secondary'} icon="alert" onClick={() => setLowOnly(!lowOnly)}>
                Kam qolganlar{lowCount ? ` (${lowCount})` : ''}
              </Button>
              <Button variant={showInactive ? 'primary' : 'secondary'} icon="eye" onClick={() => setShowInactive(!showInactive)}>
                Nofaollar
              </Button>
            </div>

            {shown.length === 0 ? (
              <EmptyState
                size="lg"
                icon={products.length === 0 ? 'box' : 'search'}
                title={products.length === 0 ? "Hali mahsulot yo'q" : lowOnly ? "Kam qolgan mahsulot yo'q" : 'Hech narsa topilmadi'}
                description={products.length === 0 ? (cats.length ? "Birinchi mahsulotni qo'shing." : "Avval kategoriya yarating, so'ng mahsulot qo'shing.") : "Qidiruv yoki filtrni o'zgartirib ko'ring."}
                action={
                  canEdit && products.length === 0 ? (
                    cats.length ? (
                      <Button variant="primary" icon="plus" onClick={() => setProdDlg({ categoryId: cats[0].id })}>Mahsulot qo'shish</Button>
                    ) : (
                      <Button variant="primary" icon="plus" onClick={() => setCatDlg({})}>Kategoriya qo'shish</Button>
                    )
                  ) : undefined
                }
              />
            ) : (
              <DataTable className="bar-list" columns={BAR_COLS} header={['Nomi', <span key="p" className="r">Narxi</span>, <span key="q" className="c">Qoldiq</span>, '']}>
                {shown.map((p) => {
                  const low = p.active && isLow(p)
                  return (
                    <DataRow key={p.id} className={cx('bar-row', !p.active && 'is-off', low && 'is-low')} muted={!p.active} tone={low ? 'danger' : undefined}>
                      <div className="bar-row__name">
                        <div className="bar-row__title ellipsis">{p.name}</div>
                        <div className="bar-row__sub ellipsis">
                          {catDept[p.categoryId] === 'kitchen' && <Icon name="flame" size={16} className="bar-row__kicon" title="Oshxona" />}
                          {catName[p.categoryId] || '—'}
                          {!p.active && <Badge tone="neutral" size="sm">Nofaol</Badge>}
                        </div>
                        {p.costPrice > 0 && (
                          <div className="bar-row__cost ellipsis" data-testid="bar-cost">
                            Tannarx {formatMoney(p.costPrice)} · marja {p.price > 0 ? Math.round(((p.price - p.costPrice) / p.price) * 100) : 0}%
                          </div>
                        )}
                      </div>
                      <Money value={p.price} size="lg" className="r" />
                      <div className="bar-stock">
                        {p.trackStock ? (
                          <>
                            {canEdit && (
                              <button type="button" className="bar-stock__btn" aria-label="Kamaytirish" onClick={() => setStockDlg({ p, sign: -1 })}>
                                <Icon name="minus" size={26} />
                              </button>
                            )}
                            <div className="bar-stock__val">
                              <span className={cx('bar-stock__n num', low && 'is-low')}>{p.stock}</span>
                              {low && <Badge tone="danger" size="sm" icon="alert">{p.stock <= 0 ? 'Tugagan' : 'Kam qoldi'}</Badge>}
                            </div>
                            {canEdit && (
                              <button type="button" className="bar-stock__btn is-plus" aria-label="To'ldirish" onClick={() => setStockDlg({ p, sign: 1 })}>
                                <Icon name="plus" size={26} />
                              </button>
                            )}
                          </>
                        ) : (
                          <span className="subtle">Kuzatilmaydi</span>
                        )}
                      </div>
                      <div className="ui-dt__tools bar-row__tools">
                        {canEdit && (
                          <>
                            <IconButton icon="edit" label="Tahrirlash" variant="secondary" onClick={() => setProdDlg(p)} />
                            <IconButton icon={p.active ? 'eye' : 'lock'} label={p.active ? 'Nofaol qilish' : 'Faollashtirish'} variant="ghost" onClick={() => toggleActive(p)} />
                            <IconButton icon="trash" label="O'chirish" variant="ghost" onClick={() => removeProduct(p)} />
                          </>
                        )}
                      </div>
                    </DataRow>
                  )
                })}
              </DataTable>
            )}
          </section>
        </div>
      )}

      {prodDlg && <ProductDialog product={prodDlg} cats={cats} onClose={() => setProdDlg(null)} onSaved={load} />}
      {stockDlg && <StockDialog product={stockDlg.p} sign={stockDlg.sign} onClose={() => setStockDlg(null)} onSaved={load} />}
      {catDlg && <CategoryDialog cat={catDlg} onClose={() => setCatDlg(null)} onSaved={load} />}
    </div>
  )
}
