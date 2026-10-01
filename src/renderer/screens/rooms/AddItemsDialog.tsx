/**
 * "+ Qo'shish" paneli: Bar (kategoriyalar bo'yicha mahsulot plitalari, qoldiq) va Xizmatlar (xizmat ko'rsatuvchi xodim bilan).
 * Kim uchun: butun guruh yoki aniq mehmon. Plitani bosish = +1 (darhol API), qayta bosish = yana +1.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { GuestView, Product, ProductCategory, ServiceItem, SessionView, Staff } from '@shared/types'
import { api } from '@/api'
import { Button, EmptyState, Icon, Modal, Money, Segmented, Spinner, Tabs, cx, toast } from '@/ui'

type Tab = 'bar' | 'services'

interface Catalog {
  categories: ProductCategory[]
  products: Product[]
  services: ServiceItem[]
  providers: Staff[]
}

interface Added {
  key: string
  name: string
  qty: number
  amount: number
}

export function AddItemsDialog({
  sessionId, guests, onClose, onUpdate
}: { sessionId: number; guests: GuestView[]; onClose: () => void; onUpdate: (v: SessionView) => void }) {
  const [tab, setTab] = useState<Tab>('bar')
  const [cat, setCat] = useState<number | 0>(0)
  const [who, setWho] = useState<number>(0) // 0 = butun guruh
  const [provider, setProvider] = useState<number>(0)
  const [data, setData] = useState<Catalog | null>(null)
  const [pending, setPending] = useState<Record<string, number>>({})
  const [added, setAdded] = useState<Added[]>([])

  useEffect(() => {
    let alive = true
    Promise.all([api.catalog.categories(), api.catalog.products(), api.catalog.services(), api.staff.list()])
      .then(([categories, products, services, staff]) => {
        if (!alive) return
        const providers = staff.filter((s) => s.active && s.isProvider)
        setData({ categories, products, services, providers })
        if (providers.length === 1) setProvider(providers[0].id)
      })
      .catch((e) => {
        toast.error(e)
        if (alive) setData({ categories: [], products: [], services: [], providers: [] })
      })
    return () => {
      alive = false
    }
  }, [])

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

  const products = useMemo(() => {
    if (!data) return []
    return cat === 0 ? data.products : data.products.filter((p) => p.categoryId === cat)
  }, [data, cat])

  const bump = (key: string, d: number) => setPending((p) => ({ ...p, [key]: Math.max(0, (p[key] || 0) + d) }))
  const record = (key: string, name: string, amount: number) =>
    setAdded((list) => {
      const i = list.findIndex((a) => a.key === key)
      if (i < 0) return [{ key, name, qty: 1, amount }, ...list]
      const copy = list.slice()
      copy[i] = { ...copy[i], qty: copy[i].qty + 1, amount: copy[i].amount + amount }
      return copy
    })

  const guestId = who === 0 ? null : who
  const whoLabel = who === 0 ? 'Butun guruh' : guests.find((g) => g.id === who)?.label ?? ''

  const addProduct = async (p: Product) => {
    const key = 'p' + p.id + ':' + who
    bump(key, 1)
    try {
      const v = await api.lines.addProduct(sessionId, p.id, 1, guestId)
      onUpdate(v)
      record(key, p.name + (who ? ' — ' + whoLabel : ''), p.price)
      if (p.trackStock) refreshProducts()
    } catch (e) {
      toast.error(e)
      refreshProducts()
    } finally {
      bump(key, -1)
    }
  }

  const addService = async (s: ServiceItem) => {
    const key = 's' + s.id + ':' + who + ':' + provider
    bump(key, 1)
    try {
      const v = await api.lines.addService(sessionId, s.id, guestId, provider || null)
      onUpdate(v)
      const pn = data?.providers.find((x) => x.id === provider)?.name
      record(key, s.name + (pn ? ' · ' + pn : '') + (who ? ' — ' + whoLabel : ''), s.price)
    } catch (e) {
      toast.error(e)
    } finally {
      bump(key, -1)
    }
  }

  const addedQty = added.reduce((s, a) => s + a.qty, 0)
  const addedSum = added.reduce((s, a) => s + a.amount, 0)
  const countFor = (prefix: string) => added.filter((a) => a.key.indexOf(prefix) === 0).reduce((s, a) => s + a.qty, 0)

  return (
    <Modal
      open
      onClose={onClose}
      title="Bar va xizmat qo'shish"
      subtitle="Plitani bosing — darhol +1 qo'shiladi"
      size="xl"
      flush
      className="rooms-add-modal"
      footer={
        <>
          <div className="rooms-add__summary">
            {addedQty === 0 ? (
              <span className="muted">Hali hech narsa qo'shilmadi</span>
            ) : (
              <>
                <Icon name="checkCircle" size={22} />
                <span className="rooms-add__summarytext ellipsis">
                  Qo'shildi: {added.slice(0, 3).map((a) => `${a.name} ×${a.qty}`).join(', ')}
                  {added.length > 3 ? ` va yana ${added.length - 3}` : ''}
                </span>
                <Money value={addedSum} size="lg" tone="success" />
              </>
            )}
          </div>
          <Button variant="primary" size="lg" icon="check" onClick={onClose}>
            Tayyor
          </Button>
        </>
      }
    >
      <div className="rooms-add">
        <div className="rooms-add__top">
          <Tabs<Tab>
            value={tab}
            onChange={setTab}
            items={[
              { id: 'bar', label: 'Bar', icon: 'bar', badge: countFor('p') || undefined },
              { id: 'services', label: 'Xizmatlar', icon: 'sparkles', badge: countFor('s') || undefined }
            ]}
          />
          <div className="rooms-add__who">
            <span className="rooms-add__wholabel">Kim uchun:</span>
            <div className="rooms-add__whoscroll">
              <button type="button" className={cx('rooms-chip', 'rooms-chip--lg', who === 0 && 'is-active')} onClick={() => setWho(0)}>
                <Icon name="users" size={20} /> Butun guruh
              </button>
              {visibleGuests.map((g) => (
                <button key={g.id} type="button" className={cx('rooms-chip', 'rooms-chip--lg', who === g.id && 'is-active')} onClick={() => setWho(g.id)}>
                  {g.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {!data ? (
          <div className="rooms-loading"><Spinner size={40} /></div>
        ) : tab === 'bar' ? (
          <div className="rooms-add__body">
            <div className="rooms-add__cats">
              <button type="button" className={cx('rooms-chip', cat === 0 && 'is-active')} onClick={() => setCat(0)}>
                Hammasi
              </button>
              {data.categories.map((c) => (
                <button key={c.id} type="button" className={cx('rooms-chip', cat === c.id && 'is-active')} onClick={() => setCat(c.id)}>
                  {c.name}
                </button>
              ))}
            </div>
            {products.length === 0 ? (
              <EmptyState icon="box" title="Mahsulot yo'q" description="Bu kategoriyada sotuvdagi mahsulot yo'q." />
            ) : (
              <div className="rooms-add__grid">
                {products.map((p) => {
                  const out = p.trackStock && p.stock <= 0
                  const low = p.trackStock && !out && p.stock <= p.lowStockAt
                  const n = countFor('p' + p.id + ':' + who)
                  const isPending = (pending['p' + p.id + ':' + who] || 0) > 0
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={cx('rooms-tilebtn', out && 'is-out', isPending && 'is-pending', n > 0 && 'is-added')}
                      disabled={out}
                      onClick={() => void addProduct(p)}
                      data-product={p.name}
                    >
                      {n > 0 && <span className="rooms-tilebtn__count num">+{n}</span>}
                      <span className="rooms-tilebtn__name">{p.name}</span>
                      <span className="rooms-tilebtn__foot">
                        <Money value={p.price} size="lg" currency={false} />
                        {p.trackStock && (
                          <span className={cx('rooms-tilebtn__stock', out && 'is-out', low && 'is-low')}>
                            {out ? 'Tugagan' : `${p.stock} ta`}
                          </span>
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="rooms-add__body">
            <div className="rooms-add__prov">
              <span className="rooms-add__wholabel">Xizmat ko'rsatuvchi:</span>
              {data.providers.length === 0 ? (
                <span className="muted">Xodimlar ro'yxatida xizmat ko'rsatuvchi yo'q</span>
              ) : (
                <Segmented<number>
                  value={provider}
                  onChange={setProvider}
                  options={[{ value: 0, label: 'Tanlanmagan' }, ...data.providers.map((s) => ({ value: s.id, label: s.name, icon: 'user' as const }))]}
                />
              )}
            </div>
            {data.services.length === 0 ? (
              <EmptyState icon="sparkles" title="Xizmatlar yo'q" description="Sozlamalarda xizmat (massaj va h.k.) qo'shing." />
            ) : (
              <div className="rooms-add__grid">
                {data.services.map((s) => {
                  const n = countFor('s' + s.id + ':' + who + ':')
                  const isPending = Object.keys(pending).some((k) => k.indexOf('s' + s.id + ':' + who + ':') === 0 && pending[k] > 0)
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className={cx('rooms-tilebtn', 'rooms-tilebtn--service', isPending && 'is-pending', n > 0 && 'is-added')}
                      onClick={() => void addService(s)}
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
              Xizmat qat'iy narxda, har bosishda alohida qator bo'lib qo'shiladi
              {provider && data.providers.length ? ' · ' + (data.providers.find((x) => x.id === provider)?.name ?? '') : ''}.
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
