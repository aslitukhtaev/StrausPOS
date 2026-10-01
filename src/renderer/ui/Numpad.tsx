/**
 * Numpad — katta raqamli klaviatura (PIN, summa, miqdor). Qiymat — satr (string) holida.
 *
 *   const [pin, setPin] = useState('')
 *   <PinDots length={pin.length} max={6} error={wrong} />
 *   <Numpad mode="pin" value={pin} onChange={setPin} maxLength={6} onSubmit={login} />
 *
 *   const [sum, setSum] = useState('')
 *   <Numpad mode="amount" value={sum} onChange={setSum} maxLength={9} />   // Number(sum || 0)
 *
 * mode:
 *   'pin'    — 1..9, [⌫] [0] [✓] (onSubmit bo'lsa) yoki [C] [0] [⌫]
 *   'amount' — 1..9, [000] [0] [⌫]   (bosh nol qo'yilmaydi)
 *   'qty'    — 1..9, [C] [0] [⌫]
 * keyboard (standart true): jismoniy klaviatura raqamlari, Backspace, Enter (onSubmit), Delete/Esc (tozalash).
 *   Input/textarea fokusda bo'lsa yoki boshqa modal ustida bo'lsa e'tiborsiz qoldiriladi.
 * size: 'md' (68px tugma) | 'lg' (80px) ; disabled ; submitLabel (✓ o'rniga matn).
 */
import { useEffect, useRef, type ReactNode } from 'react'
import { cx } from './cx'
import { Icon } from './Icon'

export interface NumpadProps {
  value: string
  onChange: (v: string) => void
  mode?: 'pin' | 'amount' | 'qty'
  maxLength?: number
  onSubmit?: () => void
  submitLabel?: string
  submitDisabled?: boolean
  keyboard?: boolean
  disabled?: boolean
  size?: 'md' | 'lg'
  className?: string
}

type Key = { k: string; label?: ReactNode; tone?: 'muted' | 'accent'; aria?: string }

export function Numpad({
  value, onChange, mode = 'pin', maxLength = mode === 'pin' ? 6 : 9, onSubmit, submitLabel, submitDisabled,
  keyboard = true, disabled, size = 'md', className
}: NumpadProps) {
  const ref = useRef<HTMLDivElement>(null)
  const st = useRef({ value, onChange, onSubmit, disabled, submitDisabled, maxLength, mode })
  st.current = { value, onChange, onSubmit, disabled, submitDisabled, maxLength, mode }

  const press = (k: string) => {
    const s = st.current
    if (s.disabled) return
    const v = s.value
    if (k === 'back') return s.onChange(v.slice(0, -1))
    if (k === 'clear') return s.onChange('')
    if (k === 'ok') {
      if (!s.submitDisabled) s.onSubmit?.()
      return
    }
    let next = v + k
    if (s.mode !== 'pin') next = next.replace(/^0+(?=\d)/, '')
    if (s.mode !== 'pin' && next === '0' && k !== '0') next = k
    if (next.length > s.maxLength) return
    s.onChange(next)
  }

  useEffect(() => {
    if (!keyboard) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      // Ustida boshqa modal bo'lsa, faqat o'sha modal ichidagi numpad javob beradi
      const modals = document.querySelectorAll('.ui-modal')
      if (modals.length && ref.current && !modals[modals.length - 1].contains(ref.current)) return
      if (e.ctrlKey || e.altKey || e.metaKey) return
      if (/^[0-9]$/.test(e.key)) { press(e.key); e.preventDefault() }
      else if (e.key === 'Backspace') { press('back'); e.preventDefault() }
      else if (e.key === 'Delete') { press('clear'); e.preventDefault() }
      else if (e.key === 'Enter' && st.current.onSubmit) { press('ok'); e.preventDefault() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [keyboard])

  const backKey: Key = { k: 'back', label: <Icon name="backspace" size={30} />, tone: 'muted', aria: "O'chirish" }
  const clearKey: Key = { k: 'clear', label: 'C', tone: 'muted', aria: 'Tozalash' }
  const last: Key[] =
    mode === 'amount'
      ? [{ k: '000', label: '000', tone: 'muted' }, { k: '0' }, backKey]
      : mode === 'pin' && onSubmit
        ? [backKey, { k: '0' }, { k: 'ok', label: submitLabel ?? <Icon name="check" size={32} strokeWidth={2.6} />, tone: 'accent', aria: 'Tasdiqlash' }]
        : [clearKey, { k: '0' }, backKey]
  const keys: Key[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => ({ k })).concat(last)

  return (
    <div ref={ref} className={cx('ui-numpad', 'ui-numpad--' + size, className)}>
      {keys.map((key) => (
        <button
          key={key.k}
          type="button"
          className={cx('ui-numpad__key', key.tone && 'is-' + key.tone)}
          onClick={() => press(key.k)}
          disabled={disabled || (key.k === 'ok' && submitDisabled)}
          aria-label={key.aria ?? key.k}
          tabIndex={-1}
        >
          {key.label ?? key.k}
        </button>
      ))}
    </div>
  )
}

/**
 * PinDots — PIN kiritilgan belgilar soni (nuqtalar).
 *   <PinDots length={pin.length} max={6} error={shake} />   // error=true → qizil + silkinish
 */
export function PinDots({ length, max = 6, error, className }: { length: number; max?: number; error?: boolean; className?: string }) {
  const n = Math.max(max, length)
  return (
    <div className={cx('ui-pindots', error && 'is-error', className)} aria-label={length + ' ta raqam kiritildi'}>
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className={cx('ui-pindots__dot', i < length && 'is-on')} />
      ))}
    </div>
  )
}
