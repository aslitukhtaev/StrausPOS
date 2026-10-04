/**
 * "Bar savdo" — xonaga bog'lanmagan oddiy kassa (barSales.*).
 *
 * Chapda: kategoriya tablari, qidiruv va katta mahsulot plitalari (bosish = +1).
 * O'ngda: savat (ochiq savdolar tablari, qatorlar, X, JAMI, "To'lash" → CheckoutDialog).
 * Savdo birinchi mahsulot qo'shilganda yaratiladi (bo'sh savdo yaratilmaydi); oxirgi mahsulot olib tashlansa — bekor qilinadi.
 * Ofitsiant ulushi bu savdolarda hisoblanmaydi (backend). Mantiq yo'q — faqat PosApi.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LineView, Product, ProductCategory, ReceiptData, SessionView } from '@shared/types'
import { api } from '@/api'
import { useApp } from '@/store/app'
import { useCan } from '@/store/auth'
import { CheckoutDialog } from '@/screens/checkout'
import {
  Button, EmptyState, Icon, IconButton, Input, Money, PageHeader, Spinner, confirmDialog, cx, formatClock, formatMoney, toast
} from '@/ui'
import { RemoveDialog } from './RemoveDialog'
import { HistoryDialog } from './HistoryDialog'
import './sale.css'

const byOpened = (a: SessionView, b: SessionView) => a.session.openedAt - b.session.openedAt || a.session.id - b.session.id

export default function SaleScreen() {
  const readOnly = useApp((s) => s.readOnly)
  const canOpen = useCan('session.open')
  const canPay = useCan('session.pay')
  const canReturn = useCan('line.return')

  // ── Katalog ──
  const [categories, setCategories] = useState<ProductCategory[] | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [cat, setCat] = useState(0)
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  // ── Savdolar ──
  const [sales, setSales] = useState<SessionView[] | null>(null)
  const [activeId, setActiveIdState] = useState<number | null>(null)
  const activeRef = useRef<number | null>(null)
  const creating = useRef<Promise<number> | null>(null)
  const reqSeq = useRef(0)
  const applied = useRef<Record<number, number>>({})
  const [pending, setPending] = useState<Record<number, number>>({})
  const [busy, setBusy] = useState(false)

  // ── Dialoglar ──
  const [payId, setPayId] = useState<number | null>(null)
  const [removing, setRemoving] = useState<LineView | null>(null)
  const [history, setHistory] = useState(false)

  const setActive = (id: number | null) => {
    activeRef.current = id
    setActiveIdState(id)
  }

  const upsert = useCallback((v: SessionView) => {
    setSales((list) => {
      const rest = (list || []).filter((x) => x.session.id !== v.session.id)
      return v.session.status === 'open' ? rest.concat(v).sort(byOpened) : rest
    })
  }, [])
  const drop = useCallback((id: number) => setSales((list) => (list || []).filter((x) => x.session.id !== id)), [])

  /** Javoblar tartibsiz kelsa eski holat yangisini bosib ketmasin */
  const apply = (v: SessionView, seq: number) => {
    const id = v.session.id
    if ((applied.current[id] || 0) > seq) return
    applied.current[id] = seq
    upsert(v)
  }

  const refreshProducts = useCallback(() => {
    api.catalog
      .products()
      .then(setProducts)
      .catch(() => undefined)
  }, [])
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
    refreshTimer.current = setTimeout(refreshProducts, 250)
  }, [refreshProducts])
  useEffect(() => () => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
  }, [])

  // ── Yuklash: katalog + to'lanmagan savdolar (qayta ochilganda tiklanadi) ──
  const loadAll = useCallback(() => {
    Promise.all([api.catalog.categories(), api.catalog.products()])
      .then(([c, p]) => {
        setCategories(c)
        setProducts(p)
      })
      .catch((e) => {
        toast.error(e)
        setCategories([])
      })
    api.barSales
      .openList()
      .then((list) => {
        setSales(list.slice().sort(byOpened))
        // eng yangisi birinchi keladi
        setActive(list.length ? list[0].session.id : null)
      })
      .catch((e) => {
        toast.error(e)
        setSales([])
      })
  }, [])
  useEffect(() => {
    if (!readOnly) loadAll()
  }, [loadAll, readOnly])

  const active = useMemo(() => (sales && activeId != null ? sales.find((s) => s.session.id === activeId) ?? null : null), [sales, activeId])
  const lines = active ? active.lines.filter((l) => l.activeQty > 0) : []
  const itemCount = lines.reduce((a, l) => a + l.activeQty, 0)
  const total = active ? active.total : 0

  // Faol savdo ro'yxatdan chiqib ketsa (to'landi/bekor) — yangi savdo holatiga
  useEffect(() => {
    if (sales && activeId != null && !sales.some((s) => s.session.id === activeId)) setActive(null)
  }, [sales, activeId])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q) return products.filter((p) => p.name.toLowerCase().indexOf(q) >= 0)
    return cat === 0 ? products : products.filter((p) => p.categoryId === cat)
  }, [products, cat, query])

  const qtyInCart = useMemo(() => {
    const m: Record<number, number> = {}
    for (const l of lines) m[l.refId] = (m[l.refId] || 0) + l.activeQty
    return m
  }, [lines])

  // ── Amallar ──
  const ensureSale = (): Promise<number> => {
    if (activeRef.current != null) return Promise.resolve(activeRef.current)
    if (!creating.current) {
      creating.current = api.barSales
        .open()
        .then((v) => {
          applied.current[v.session.id] = 0
          upsert(v)
          setActive(v.session.id)
          return v.session.id
        })
        .finally(() => {
          creating.current = null
        })
    }
    return creating.current
  }

  const bump = (id: number, d: number) => setPending((p) => ({ ...p, [id]: Math.max(0, (p[id] || 0) + d) }))

  const addProduct = async (productId: number) => {
    bump(productId, 1)
    try {
      const sid = await ensureSale()
      const seq = ++reqSeq.current
      const v = await api.lines.addProduct(sid, productId, 1, null)
      apply(v, seq)
    } catch (e) {
      toast.error(e)
    } finally {
      bump(productId, -1)
      scheduleRefresh()
    }
  }

  /** Savdo bo'shab qolsa (hamma narsa olib tashlangan) — bekor qilinadi, savat yangi savdoga tayyor */
  const dropIfEmpty = async (v: SessionView) => {
    if (v.lines.some((l) => l.activeQty > 0) || v.payments.length > 0) return
    try {
      await api.sessions.cancel(v.session.id)
      drop(v.session.id)
      if (activeRef.current === v.session.id) setActive(null)
    } catch {
      /* bekor bo'lmasa — bo'sh savdo ro'yxatda qoladi, "Bekor qilish" bilan yopiladi */
    }
  }

  const removeLine = async (l: LineView, qty: number) => {
    const seq = ++reqSeq.current
    try {
      const v = await api.lines.returnLine(l.id, qty, 'Savatdan olib tashlandi')
      apply(v, seq)
      setRemoving(null)
      await dropIfEmpty(v)
    } catch (e) {
      toast.error(e)
    } finally {
      scheduleRefresh()
    }
  }

  const onX = (l: LineView) => {
    if (l.activeQty > 1) setRemoving(l)
    else void removeLine(l, 1)
  }

  const cancelSale = async () => {
    if (!active) return
    const n = itemCount
    const ok = await confirmDialog({
      title: 'Savdoni bekor qilasizmi?',
      message: n > 0 ? `Savatdagi ${n} ta mahsulot omborga qaytariladi, savdo yopiladi.` : "Bo'sh savdo yopiladi.",
      confirmText: 'Ha, bekor qilish',
      cancelText: "Yo'q",
      danger: true,
      icon: 'trash'
    })
    if (!ok) return
    const id = active.session.id
    setBusy(true)
    try {
      for (const l of active.lines) {
        if (l.activeQty > 0) apply(await api.lines.returnLine(l.id, l.activeQty, 'Savdo bekor qilindi'), ++reqSeq.current)
      }
      await api.sessions.cancel(id)
      drop(id)
      setActive(null)
      toast.success('Savdo bekor qilindi')
    } catch (e) {
      toast.error(e)
      api.sessions.get(id).then((v) => apply(v, ++reqSeq.current)).catch(() => undefined)
    } finally {
      setBusy(false)
      scheduleRefresh()
    }
  }

  const onPaid = (_r: ReceiptData) => {
    if (payId != null) drop(payId)
    setPayId(null)
    setActive(null)
    setQuery('')
    refreshProducts()
  }

  const onPayClose = () => {
    const id = payId
    setPayId(null)
    if (id != null) api.sessions.get(id).then((v) => apply(v, ++reqSeq.current)).catch(() => undefined)
  }

  const newSale = () => {
    setActive(null)
    setQuery('')
  }

  // ── Ko'rinish ──
  if (readOnly || !canOpen) {
    return <EmptyState size="lg" icon="lock" title="Bar savdo mavjud emas" description="Bu bo'lim faqat kassa kompyuterida ishlaydi." />
  }

  const noProducts = categories !== null && products.length === 0
  const canX = canReturn
  const canCancel = !!active && (itemCount === 0 || canReturn)

  return (
    <div className="sale">
      <PageHeader
        title="Bar savdo"
        icon="receipt"
        subtitle={
          <span className="sale-sub">
            <Icon name="info" size={18} /> Xonasiz savdo — ofitsiant ulushi hisoblanmaydi
          </span>
        }
        actions={
          canPay ? (
            <Button variant="secondary" icon="calendar" onClick={() => setHistory(true)} data-testid="sale-history">
              Bugungi savdolar
            </Button>
          ) : undefined
        }
      />

      <div className="sale__body">
        {/* ───── Katalog ───── */}
        <section className="sale-cat" aria-label="Mahsulotlar">
          <div className="sale-cat__bar">
            <Input
              ref={searchRef}
              className="sale-cat__search"
              icon="search"
              placeholder="Qidirish…"
              aria-label="Mahsulot qidirish"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && shown.length === 1) {
                  const p = shown[0]
                  if (!(p.trackStock && p.stock <= 0)) void addProduct(p.id)
                } else if (e.key === 'Escape') setQuery('')
              }}
              suffix={
                query ? (
                  <button type="button" className="sale-cat__clear" aria-label="Tozalash" onClick={() => setQuery('')}>
                    <Icon name="x" size={20} />
                  </button>
                ) : undefined
              }
            />
            <div className="sale-cat__chips" role="tablist" aria-label="Kategoriyalar">
              <button
                type="button"
                role="tab"
                aria-selected={!query && cat === 0}
                className={cx('sale-chip', !query && cat === 0 && 'is-active')}
                onClick={() => {
                  setCat(0)
                  setQuery('')
                }}
              >
                Hammasi
              </button>
              {(categories || []).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="tab"
                  aria-selected={!query && cat === c.id}
                  className={cx('sale-chip', !query && cat === c.id && 'is-active')}
                  onClick={() => {
                    setCat(c.id)
                    setQuery('')
                  }}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          <div className="sale-cat__scroll">
            {categories === null ? (
              <div className="sale-center"><Spinner size={40} /></div>
            ) : noProducts ? (
              <EmptyState icon="box" title="Mahsulotlar yo'q" description="Bar bo'limida mahsulot qo'shing." />
            ) : shown.length === 0 ? (
              <EmptyState
                icon="search"
                title={query ? 'Topilmadi' : "Bu kategoriyada mahsulot yo'q"}
                description={query ? '«' + query.trim() + '» bo\'yicha mahsulot yo\'q.' : undefined}
                action={query ? <Button onClick={() => setQuery('')}>Qidiruvni tozalash</Button> : undefined}
              />
            ) : (
              <div className="sale-grid">
                {shown.map((p) => {
                  const out = p.trackStock && p.stock <= 0
                  const low = p.trackStock && !out && p.stock <= p.lowStockAt
                  const inCart = qtyInCart[p.id] || 0
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={cx('sale-tile', out && 'is-out', inCart > 0 && 'is-added', (pending[p.id] || 0) > 0 && 'is-pending')}
                      disabled={out}
                      onClick={() => void addProduct(p.id)}
                      data-product={p.name}
                    >
                      {inCart > 0 && <span className="sale-tile__count num">{inCart}</span>}
                      <span className="sale-tile__name">{p.name}</span>
                      <span className="sale-tile__foot">
                        <Money value={p.price} size="lg" currency={false} />
                        {p.trackStock && (
                          <span className={cx('sale-tile__stock', out && 'is-out', low && 'is-low')}>{out ? 'Tugagan' : p.stock + ' ta'}</span>
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </section>

        {/* ───── Savat ───── */}
        <section className="sale-cart" aria-label="Savat" data-testid="sale-cart">
          <div className="sale-cart__head">
            {sales && sales.length > 0 ? (
              <div className="sale-tabs__scroll" role="tablist" aria-label="Ochiq savdolar">
                {sales.map((s, i) => (
                  <button
                    key={s.session.id}
                    type="button"
                    role="tab"
                    aria-selected={s.session.id === activeId}
                    className={cx('sale-tab', s.session.id === activeId && 'is-active')}
                    onClick={() => setActive(s.session.id)}
                    title={'Ochilgan: ' + formatClock(s.session.openedAt)}
                  >
                    <span className="sale-tab__name">Savdo {i + 1}</span>
                    <span className="sale-tab__sum num">{formatMoney(s.total)}</span>
                  </button>
                ))}
                {activeId === null && (
                  <span className="sale-tab is-active is-draft" role="tab" aria-selected>
                    <span className="sale-tab__name">Yangi</span>
                  </span>
                )}
              </div>
            ) : (
              <div className="sale-cart__title">
                <Icon name="receipt" size={24} />
                <span>Yangi savdo</span>
              </div>
            )}
            {sales && sales.length > 0 && (
              <Button size="sm" variant="ghost" icon="plus" onClick={newSale} disabled={activeId === null} className="sale-cart__new">
                Yangi savdo
              </Button>
            )}
          </div>

          <div className="sale-cart__lines">
            {sales === null ? (
              <div className="sale-center"><Spinner size={32} /></div>
            ) : lines.length === 0 ? (
              <EmptyState icon="inbox" title="Savat bo'sh" description="Mahsulot plitasini bosing — savatga qo'shiladi." />
            ) : (
              lines.map((l) => (
                <div key={l.id} className="sale-line" data-line={l.name}>
                  <div className="sale-line__main">
                    <div className="sale-line__name">{l.name}</div>
                    <div className="sale-line__meta num">
                      {formatMoney(l.unitPrice)} so'm
                    </div>
                  </div>
                  <span className="sale-line__qty num" aria-label="Miqdor">×{l.activeQty}</span>
                  <Money value={l.amount} size="lg" currency={false} className="sale-line__sum" />
                  <IconButton
                    icon="x"
                    label={canX ? 'Olib tashlash' : "Olib tashlash uchun administrator ruxsati kerak"}
                    variant="danger"
                    size="sm"
                    className="sale-line__x"
                    disabled={!canX}
                    onClick={() => onX(l)}
                  />
                </div>
              ))
            )}
          </div>

          <div className="sale-cart__foot">
            <div className="sale-total">
              <span className="sale-total__label">
                JAMI
                {itemCount > 0 && <span className="sale-total__n num"> · {itemCount} ta</span>}
              </span>
              <Money value={total} size="3xl" tone={total > 0 ? 'accent' : 'muted'} className="sale-total__sum" />
            </div>
            <div className="sale-cart__actions">
              {active && (
                <IconButton
                  icon="trash"
                  variant="danger"
                  size="lg"
                  label={canCancel ? 'Savdoni bekor qilish' : 'Bekor qilish uchun administrator kerak (mahsulotlarni qaytarish ruxsati)'}
                  onClick={() => void cancelSale()}
                  disabled={!canCancel || busy}
                  data-testid="sale-cancel"
                />
              )}
              <Button
                variant="success"
                size="lg"
                block
                icon="check"
                disabled={!active || total <= 0 || !canPay || busy}
                onClick={() => active && setPayId(active.session.id)}
                data-testid="sale-pay"
              >
                To'lash
              </Button>
            </div>
            {!canPay && <div className="sale-cart__hint">To'lovni kassir qabul qiladi</div>}
          </div>
        </section>
      </div>

      {payId != null && <CheckoutDialog sessionId={payId} onClose={onPayClose} onPaid={onPaid} />}
      {removing && (
        <RemoveDialog line={removing} onClose={() => setRemoving(null)} onRemove={(qty) => removeLine(removing, qty)} />
      )}
      {history && <HistoryDialog onClose={() => setHistory(false)} />}
    </div>
  )
}
