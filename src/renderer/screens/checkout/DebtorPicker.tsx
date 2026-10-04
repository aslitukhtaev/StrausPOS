/**
 * DebtorPicker — qarzdor maydoni: ism + telefon, yozilganda `debtors.search` bilan taklif ro'yxati.
 * Mavjud odam tanlansa — qarz shu odamga qo'shiladi (`DebtorInput.debtorId`), aks holda "Yangi qarzdor".
 */
import { useEffect, useRef, useState } from 'react'
import type { Debtor } from '@shared/types'
import { api } from '@/api'
import { Avatar, Badge, Field, Icon, IconButton, Input, Money, Spinner, cx, formatPhone, toast } from '@/ui'
import { phoneDigits } from './methods'

export interface DebtorPickerProps {
  name: string
  /** Faqat raqamlar (9 ta) */
  phone: string
  selected: Debtor | null
  onName: (v: string) => void
  onPhone: (digits: string) => void
  onSelect: (d: Debtor | null) => void
  showErrors: boolean
  autoFocus?: boolean
}

/** Yozish paytida: 90 123 45 67 ko'rinishiga bosqichma-bosqich */
function phoneTyping(d: string): string {
  if (d.length === 9) return formatPhone(d)
  return [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean).join(' ')
}

export function DebtorPicker({ name, phone, selected, onName, onPhone, onSelect, showErrors, autoFocus }: DebtorPickerProps) {
  const [last, setLast] = useState<'name' | 'phone'>('name')
  const [results, setResults] = useState<Debtor[]>([])
  const [loading, setLoading] = useState(false)
  const [hidden, setHidden] = useState(false)
  const errShown = useRef(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Paydo bo'lganda (aralash to'lovda qarz kiritilganda) — ko'rinadigan joyga suramiz
  useEffect(() => {
    const el = rootRef.current
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' })
  }, [])

  const query = selected ? '' : last === 'phone' && phone.length >= 3 ? phone : name.trim().length >= 2 ? name.trim() : phone.length >= 3 ? phone : ''

  useEffect(() => {
    if (!query) {
      setResults([])
      setLoading(false)
      return
    }
    let alive = true
    setLoading(true)
    const t = setTimeout(() => {
      api.debtors
        .search(query)
        .then((r) => {
          if (!alive) return
          setResults(r.slice(0, 5))
          setLoading(false)
        })
        .catch((e: unknown) => {
          if (!alive) return
          setLoading(false)
          setResults([])
          if (!errShown.current) {
            errShown.current = true
            toast.error(e)
          }
        })
    }, 250)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [query])

  const resultsKey = results.map((r) => r.id).join(',')
  useEffect(() => {
    const el = listRef.current
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' })
  }, [resultsKey, hidden])

  if (selected) {
    return (
      <div className="checkout-debtor-sel" data-testid="debtor-selected" ref={rootRef}>
        <Avatar name={selected.name} size={48} />
        <div className="checkout-debtor-sel__txt">
          <div className="checkout-debtor-sel__label">Mavjud qarzdor</div>
          <div className="checkout-debtor-sel__name ellipsis">{selected.name}</div>
          <div className="checkout-debtor-sel__meta num">{selected.phone}</div>
          <div className="checkout-debtor-sel__meta">
            {selected.balance > 0 ? (
              <span className="checkout-debtor-sel__bal">
                Hozirgi qarzi: <Money value={selected.balance} tone="danger" />
              </span>
            ) : (
              <span className="t-success">Hozir qarzi yo'q</span>
            )}
          </div>
        </div>
        <IconButton
          icon="x"
          size="sm"
          variant="ghost"
          label="Boshqa odamni tanlash"
          className="checkout-debtor-sel__clear"
          onClick={() => {
            onSelect(null)
            onName('')
            onPhone('')
            setHidden(false)
          }}
        />
      </div>
    )
  }

  const nameErr = showErrors && !name.trim()
  const phoneErr = showErrors && phone.length !== 9
  const isNew = !!name.trim() && phone.length === 9
  const exact = phone.length === 9 ? results.find((d) => phoneDigits(d.phone) === phone) : undefined
  const showList = !hidden && results.length > 0

  return (
    <div className="checkout-debtor" ref={rootRef}>
      <div className="checkout-debtor__fields">
        <Field label="Qarzdor ismi" required error={nameErr ? 'Ismni kiriting' : undefined}>
          <Input
            icon="user"
            value={name}
            maxLength={80}
            placeholder="Ism yoki telefon yozing"
            invalid={nameErr}
            autoComplete="off"
            onChange={(e) => {
              setLast('name')
              setHidden(false)
              onName(e.target.value)
            }}
            data-autofocus={autoFocus || undefined}
            data-testid="debtor-name"
          />
        </Field>
        <Field label="Telefon (+998)" required error={phoneErr ? '9 ta raqam: 90 123 45 67' : undefined}>
          <Input
            icon="phone"
            inputMode="tel"
            autoComplete="off"
            value={phoneTyping(phone)}
            placeholder="90 123 45 67"
            invalid={phoneErr}
            onChange={(e) => {
              setLast('phone')
              setHidden(false)
              onPhone(phoneDigits(e.target.value))
            }}
            data-testid="debtor-phone"
          />
        </Field>
      </div>

      {showList && (
        <div className="checkout-sugg" role="listbox" aria-label="Mavjud qarzdorlar" data-testid="debtor-suggest" ref={listRef}>
          <div className="checkout-sugg__head">
            <Icon name="search" size={18} />
            <span>{exact ? 'Bu raqam bilan qarzdor bor — tanlang' : 'Mavjud qarzdorlar'}</span>
            <button type="button" className="checkout-sugg__close" aria-label="Yopish" onClick={() => setHidden(true)}>
              <Icon name="x" size={18} />
            </button>
          </div>
          {results.map((d) => (
            <button
              key={d.id}
              type="button"
              role="option"
              aria-selected={false}
              className={cx('checkout-sugg__item', exact && exact.id === d.id && 'is-exact')}
              onClick={() => onSelect(d)}
            >
              <Avatar name={d.name} size={40} />
              <span className="checkout-sugg__txt">
                <span className="checkout-sugg__name ellipsis">{d.name}</span>
                <span className="checkout-sugg__phone num">{d.phone}</span>
              </span>
              <span className="checkout-sugg__bal">
                {d.balance > 0 ? <Money value={d.balance} tone="danger" currency={false} /> : <span className="subtle">qarzi yo'q</span>}
              </span>
              <Icon name="chevronRight" size={20} />
            </button>
          ))}
        </div>
      )}

      <div className="checkout-debtor__status">
        {loading ? (
          <span className="subtle"><Spinner size={16} /> Qidirilmoqda…</span>
        ) : isNew && !exact ? (
          <Badge tone="info" icon="userPlus">Yangi qarzdor</Badge>
        ) : null}
      </div>
    </div>
  )
}
