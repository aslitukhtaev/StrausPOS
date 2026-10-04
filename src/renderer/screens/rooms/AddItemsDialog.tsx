/**
 * "+ Qo'shish" oynasi.
 *  - Bar va Oshxona tablari (kategoriya `department` bo'yicha): har plitada katta [−] son [+]; plitani bosish ham +1
 *    (faqat TANLASH — hech narsa darhol qo'shilmaydi). Pastda tanlanganlar xulosasi va bitta katta
 *    "Qo'shish (N ta · summa)" → lines.addProducts (oshxona cheki bitta bo'lib chiqadi).
 *  - Xizmatlar tabi avvalgidek: plitani bosish = darhol qo'shiladi (xizmat ko'rsatuvchi bilan).
 *  - Kim uchun: butun guruh yoki aniq mehmon.
 *  - Kim olib bordi: joriy xodim ofitsiant bo'lsa ko'rsatilmaydi (backend uni avtomatik yozadi);
 *    aks holda ixtiyoriy tanlov (standart "—" = ofitsiantsiz).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Department, GuestView, Id, Product, ProductCategory, ServiceItem, SessionView } from '@shared/types'
import { api } from '@/api'
import { useStaff } from '@/store/auth'
import {
  Button, EmptyState, Icon, Modal, Money, Segmented, Select, Spinner, Tabs, confirmDialog, cx, formatMoney, toast
} from '@/ui'
import { isWaiterStaff, refreshStaff, useStaffList } from './staffNames'

type Tab = Department | 'services'

interface Catalog {
  categories: ProductCategory[]
  products: Product[]
  services: ServiceItem[]
}

export function AddItemsDialog({
  sessionId, guests, onClose, onUpdate
}: { sessionId: number; guests: GuestView[]; onClose: () => void; onUpdate: (v: SessionView) => void }) {
  const me = useStaff()
  const iAmWaiter = isWaiterStaff(me)
  const staff = useStaffList()
  const [tab, setTab] = useState<Tab>('bar')
  const [cat, setCat] = useState<Record<Department, number>>({ bar: 0, kitchen: 0 })
  const [who, setWho] = useState<number>(0) // 0 = butun guruh
  const [provider, setProvider] = useState<number>(0)
  const [waiterId, setWaiterId] = useState<number>(0) // 0 = "—"
  const [data, setData] = useState<Catalog | null>(null)
  const [cart, setCart] = useState<Record<number, number>>({})
  const [adding, setAdding] = useState(false)
  const [svcBusy, setSvcBusy] = useState<number | null>(null)
  const [svcAdded, setSvcAdded] = useState<Record<string, number>>({})

  useEffect(() => {
    let alive = true
    refreshStaff().catch(() => undefined)
    Promise.all([api.catalog.categories(), api.catalog.products(), api.catalog.services()])
      .then(([categories, products, services]) => {
        if (!alive) return
        setData({ categories, products, services })
      })
      .catch((e) => {
        toast.error(e)
        if (alive) setData({ categories: [], products: [], services: [] })
      })
    return () => {
      alive = false
    }
  }, [])

  const providers = useMemo(() => (staff || []).filter((s) => s.active && s.isProvider), [staff])
  const waiters = useMemo(() => (staff || []).filter((s) => s.active && s.isWaiter), [staff])
  useEffect(() => {
    if (providers.length === 1 && provider === 0) setProvider(providers[0].id)
  }, [providers, provider])

  const refreshProducts = useCallback(() => {
    api.catalog
      .products()
      .then((products) => setData((d) => (d ? { ...d, products } : d)))
      .catch(() => undefined)
  }, [])

  const visibleGuests = guests.filter((g) => g.state !== 'finished')
  useEffect(() => {
    if (who !== 0 && !guests.some((g) => g.id === who)) setWho(0)
  }, [guests, who])

  // Kategoriya → bo'lim
  const deptOf = useMemo(() => {
    const m = new Map<Id, Department>()
    if (data) for (const c of data.categories) m.set(c.id, c.department === 'kitchen' ? 'kitchen' : 'bar')
    return m
  }, [data])
  const productDept = useCallback((p: Product): Department => deptOf.get(p.categoryId) ?? 'bar', [deptOf])
  const byId = useMemo(() => new Map((data ? data.products : []).map((p) => [p.id, p])), [data])

  const dept: Department | null = tab === 'services' ? null : tab
  const deptCats = useMemo(() => (data && dept ? data.categories.filter((c) => (c.department === 'kitchen' ? 'kitchen' : 'bar') === dept) : []), [data, dept])
  const curCat = dept ? cat[dept] : 0
  const products = useMemo(() => {
    if (!data || !dept) return []
    return data.products.filter((p) => productDept(p) === dept && (curCat === 0 || p.categoryId === curCat))
  }, [data, dept, curCat, productDept])

  // ── Savat ──
  const items = useMemo(
    () =>
      Object.keys(cart)
        .map(Number)
        .filter((id) => cart[id] > 0 && byId.has(id))
        .map((id) => ({ p: byId.get(id)!, qty: cart[id] })),
    [cart, byId]
  )
  const cartQty = items.reduce((s, x) => s + x.qty, 0)
  const cartSum = items.reduce((s, x) => s + x.qty * x.p.price, 0)
  const deptQty = (d: Department) => items.filter((x) => productDept(x.p) === d).reduce((s, x) => s + x.qty, 0)
  const maxQty = (p: Product) => (p.trackStock ? Math.max(0, p.stock) : 999)
  const setQty = (p: Product, q: number) => setCart((c) => ({ ...c, [p.id]: Math.max(0, Math.min(maxQty(p), q)) }))

  const guestId = who === 0 ? null : who
  const whoLabel = who === 0 ? 'Butun guruh' : guests.find((g) => g.id === who)?.label ?? ''

  const submit = async () => {
    if (adding || items.length === 0) return
    setAdding(true)
    const kitchen = items.some((x) => productDept(x.p) === 'kitchen')
    try {
      const v = await api.lines.addProducts(
        sessionId,
        items.map((x) => ({ productId: x.p.id, qty: x.qty })),
        guestId,
        iAmWaiter ? undefined : waiterId || null
      )
      onUpdate(v)
      toast.success(`Qo'shildi: ${cartQty} ta · ${formatMoney(cartSum)} so'm`, {
        description: whoLabel + (waiterId && !iAmWaiter ? ' · ' + (waiters.find((w) => w.id === waiterId)?.name ?? '') : '')
      })
      if (kitchen) toast.info('Oshxonaga chek yuborildi')
      setCart({})
      onClose()
    } catch (e) {
      toast.error(e)
      refreshProducts()
      setAdding(false)
    }
  }
  const submitRef = useRef(submit)
  submitRef.current = submit

  // Ctrl+Enter — qo'shish
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        void submitRef.current()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const requestClose = async () => {
    if (adding) return
    if (cartQty > 0) {
      const ok = await confirmDialog({
        title: "Tanlanganlar qo'shilmadi",
        message: `${cartQty} ta mahsulot tanlangan, lekin hisobga qo'shilmagan. Chiqsangiz tanlov o'chadi.`,
        confirmText: 'Chiqish',
        cancelText: 'Qolish',
        danger: true,
        icon: 'alert'
      })
      if (!ok) return
    }
    onClose()
  }

  const addService = async (s: ServiceItem) => {
    if (svcBusy != null) return
    setSvcBusy(s.id)
    try {
      const v = await api.lines.addService(sessionId, s.id, guestId, provider || null)
      onUpdate(v)
      const pn = providers.find((x) => x.id === provider)?.name
      toast.success(`${s.name} qo'shildi`, { description: [whoLabel, pn].filter(Boolean).join(' · ') })
      setSvcAdded((m) => ({ ...m, [s.id + ':' + who]: (m[s.id + ':' + who] || 0) + 1 }))
    } catch (e) {
      toast.error(e)
    } finally {
      setSvcBusy(null)
    }
  }

  const waiterPicker = !iAmWaiter && waiters.length > 0 && (
    <div className="rooms-add__waiter" data-testid="add-waiter">
      <span className="rooms-add__wholabel">Kim olib bordi:</span>
      {waiters.length <= 3 ? (
        <div className="rooms-add__whoscroll">
          <button type="button" className={cx('rooms-chip', waiterId === 0 && 'is-active')} onClick={() => setWaiterId(0)} aria-pressed={waiterId === 0}>
            —
          </button>
          {waiters.map((w) => (
            <button
              key={w.id}
              type="button"
              className={cx('rooms-chip', waiterId === w.id && 'is-active')}
              onClick={() => setWaiterId(waiterId === w.id ? 0 : w.id)}
              aria-pressed={waiterId === w.id}
              data-waiter={w.name}
            >
              <Icon name="user" size={18} /> {w.name}
            </button>
          ))}
        </div>
      ) : (
        <Select value={String(waiterId)} onChange={(e) => setWaiterId(Number(e.target.value))} className="rooms-add__waitersel" aria-label="Kim olib bordi">
          <option value="0">— (ofitsiantsiz)</option>
          {waiters.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </Select>
      )}
    </div>
  )

  return (
    <Modal
      open
      onClose={() => void requestClose()}
      title="Buyurtma qo'shish"
      subtitle={tab === 'services' ? 'Xizmatni bosing — darhol qo\'shiladi' : "Miqdorni − / + bilan tanlang, so'ng «Qo'shish»"}
      size="xl"
      flush
      className="rooms-add-modal"
      footer={
        <>
          <div className="rooms-add__summary" data-testid="add-summary">
            {cartQty === 0 ? (
              <span className="muted">Hali hech narsa tanlanmagan</span>
            ) : (
              <>
                <span className="rooms-add__summarytext ellipsis">
                  {items.slice(0, 4).map((x) => `${x.p.name} ×${x.qty}`).join(', ')}
                  {items.length > 4 ? ` va yana ${items.length - 4}` : ''}
                </span>
                <Button size="sm" variant="ghost" icon="trash" onClick={() => setCart({})} disabled={adding} className="rooms-add__clear">
                  Tozalash
                </Button>
              </>
            )}
          </div>
          <Button variant="ghost" size="lg" onClick={() => void requestClose()} disabled={adding}>
            Yopish
          </Button>
          <Button
            variant="primary"
            size="lg"
            icon="check"
            onClick={() => void submit()}
            disabled={cartQty === 0}
            loading={adding}
            className="rooms-add__submit"
            data-testid="add-submit"
          >
            {cartQty === 0 ? "Qo'shish" : `Qo'shish (${cartQty} ta · ${formatMoney(cartSum)})`}
          </Button>
        </>
      }
    >
      <div className="rooms-add">
        <div className="rooms-add__top">
          <div className="rooms-add__tabsrow">
            <Tabs<Tab>
              value={tab}
              onChange={setTab}
              items={[
                { id: 'bar', label: 'Bar', icon: 'bar', badge: deptQty('bar') || undefined },
                { id: 'kitchen', label: 'Oshxona', icon: 'flame', badge: deptQty('kitchen') || undefined },
                { id: 'services', label: 'Xizmatlar', icon: 'sparkles' }
              ]}
            />
            {dept && waiterPicker}
          </div>
          <div className="rooms-add__who">
            <span className="rooms-add__wholabel">Kim uchun:</span>
            <div className="rooms-add__whoscroll">
              <button type="button" className={cx('rooms-chip', who === 0 && 'is-active')} onClick={() => setWho(0)}>
                <Icon name="users" size={20} /> Butun guruh
              </button>
              {visibleGuests.map((g) => (
                <button key={g.id} type="button" className={cx('rooms-chip', who === g.id && 'is-active')} onClick={() => setWho(g.id)}>
                  {g.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {!data ? (
          <div className="rooms-loading"><Spinner size={40} /></div>
        ) : dept ? (
          <div className="rooms-add__body">
            {deptCats.length > 1 && (
              <div className="rooms-add__cats">
                <button type="button" className={cx('rooms-chip', curCat === 0 && 'is-active')} onClick={() => setCat((c) => ({ ...c, [dept]: 0 }))}>
                  Hammasi
                </button>
                {deptCats.map((c) => (
                  <button key={c.id} type="button" className={cx('rooms-chip', curCat === c.id && 'is-active')} onClick={() => setCat((x) => ({ ...x, [dept]: c.id }))}>
                    {c.name}
                  </button>
                ))}
              </div>
            )}
            {products.length === 0 ? (
              <EmptyState
                icon={dept === 'kitchen' ? 'flame' : 'box'}
                title={dept === 'kitchen' ? "Oshxona taomlari yo'q" : "Mahsulot yo'q"}
                description={dept === 'kitchen' ? "Bar bo'limida «Oshxona» kategoriyasiga taom qo'shing." : "Bu kategoriyada sotuvdagi mahsulot yo'q."}
              />
            ) : (
              <div className="rooms-add__grid">
                {products.map((p) => (
                  <ProductTile key={p.id} p={p} qty={cart[p.id] || 0} max={maxQty(p)} onQty={(q) => setQty(p, q)} disabled={adding} />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="rooms-add__body">
            <div className="rooms-add__prov">
              <span className="rooms-add__wholabel">Xizmat ko'rsatuvchi:</span>
              {providers.length === 0 ? (
                <span className="muted">Xodimlar ro'yxatida xizmat ko'rsatuvchi yo'q</span>
              ) : (
                <Segmented<number>
                  value={provider}
                  onChange={setProvider}
                  options={[{ value: 0, label: 'Tanlanmagan' }, ...providers.map((s) => ({ value: s.id, label: s.name, icon: 'user' as const }))]}
                />
              )}
            </div>
            {data.services.length === 0 ? (
              <EmptyState icon="sparkles" title="Xizmatlar yo'q" description="Bar bo'limida xizmat (massaj va h.k.) qo'shing." />
            ) : (
              <div className="rooms-add__grid">
                {data.services.map((s) => {
                  const n = svcAdded[s.id + ':' + who] || 0
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className={cx('rooms-tilebtn', 'rooms-tilebtn--service', svcBusy === s.id && 'is-pending', n > 0 && 'is-added')}
                      onClick={() => void addService(s)}
                      disabled={svcBusy != null && svcBusy !== s.id}
                      data-service={s.name}
                    >
                      {n > 0 && <span className="rooms-tilebtn__count num">+{n}</span>}
                      <span className="rooms-tilebtn__name">{s.name}</span>
                      <span className="rooms-tilebtn__foot">
                        <Money value={s.price} size="lg" currency={false} />
                        {s.durationMin ? (
                          <span className="rooms-tilebtn__stock">
                            <Icon name="clock" size={16} /> {s.durationMin} daq
                          </span>
                        ) : null}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
            <div className="rooms-add__hint">
              Xizmat qat'iy narxda, har bosishda alohida qator bo'lib darhol qo'shiladi
              {provider && providers.length ? ' · ' + (providers.find((x) => x.id === provider)?.name ?? '') : ''}.
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

function ProductTile({ p, qty, max, onQty, disabled }: { p: Product; qty: number; max: number; onQty: (q: number) => void; disabled: boolean }) {
  const out = p.trackStock && p.stock <= 0
  const low = p.trackStock && !out && p.stock <= p.lowStockAt
  const atMax = qty >= max
  return (
    <div className={cx('rooms-ptile', out && 'is-out', qty > 0 && 'is-selected')} data-product={p.name}>
      <button
        type="button"
        className="rooms-ptile__main"
        onClick={() => !atMax && onQty(qty + 1)}
        disabled={out || disabled}
        aria-label={`${p.name}: +1`}
      >
        <span className="rooms-ptile__name">{p.name}</span>
        <span className="rooms-tilebtn__foot">
          <Money value={p.price} size="lg" currency={false} />
          {p.trackStock && (
            <span className={cx('rooms-tilebtn__stock', out && 'is-out', low && 'is-low')}>{out ? 'Tugagan' : `${p.stock} ta`}</span>
          )}
        </span>
      </button>
      <div className="rooms-ptile__qty">
        <button type="button" className="rooms-ptile__btn" onClick={() => onQty(qty - 1)} disabled={qty <= 0 || disabled} aria-label={`${p.name}: −1`} data-act="minus">
          <Icon name="minus" size={26} strokeWidth={2.6} />
        </button>
        <span className={cx('rooms-ptile__n', 'num', qty > 0 && 'is-on')} data-testid="qty">{qty}</span>
        <button type="button" className="rooms-ptile__btn is-plus" onClick={() => onQty(qty + 1)} disabled={out || atMax || disabled} aria-label={`${p.name}: +1`} data-act="plus">
          <Icon name="plus" size={26} strokeWidth={2.6} />
        </button>
      </div>
    </div>
  )
}
