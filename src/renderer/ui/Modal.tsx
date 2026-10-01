/**
 * Modal — katta dialog oyna (portal orqali body ga).
 *
 *   <Modal open={open} onClose={() => setOpen(false)} title="To'lov" size="lg"
 *          footer={<><Button onClick={close}>Bekor</Button><Button variant="primary">To'lash</Button></>}>
 *     ...kontent...
 *   </Modal>
 *
 * - Esc va fonni bosish yopadi (`dismissible={false}` bilan o'chiriladi — masalan to'lov jarayonida).
 * - Ochilganda birinchi fokuslanadigan elementga (yoki `[data-autofocus]` ga) fokus; Tab ichkarida aylanadi;
 *   yopilganda fokus avvalgi elementga qaytadi.
 * size: 'sm' 440px | 'md' 600px (standart) | 'lg' 820px | 'xl' 1080px | 'full' (ekran − 48px)
 * Kontent uzun bo'lsa tanasi o'zi skroll qiladi; footer har doim ko'rinadi.
 */
import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cx } from './cx'
import { IconButton } from './IconButton'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  subtitle?: ReactNode
  /** Sarlavha yonidagi qo'shimcha (masalan Badge) */
  headerExtra?: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  dismissible?: boolean
  /** Tana ichki padding'ini olib tashlash (o'z layoutingiz uchun) */
  flush?: boolean
  className?: string
  children?: ReactNode
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

let openCount = 0

export function Modal({
  open, onClose, title, subtitle, headerExtra, footer, size = 'md', dismissible = true, flush, className, children
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const dismissRef = useRef(dismissible)
  dismissRef.current = dismissible

  useEffect(() => {
    if (!open) return
    openCount++
    const prev = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    const t = setTimeout(() => {
      if (!panel) return
      const auto = panel.querySelector<HTMLElement>('[data-autofocus]')
      const body = panel.querySelector<HTMLElement>('.ui-modal__body')
      const first = auto || (body && body.querySelector<HTMLElement>(FOCUSABLE)) || panel
      first.focus()
    }, 20)
    const onKey = (e: KeyboardEvent) => {
      if (!panel) return
      // Faqat eng yuqoridagi modal javob beradi
      const all = document.querySelectorAll('.ui-modal')
      if (all[all.length - 1] !== panel) return
      if (e.key === 'Escape' && dismissRef.current) {
        e.stopPropagation()
        onCloseRef.current()
      } else if (e.key === 'Tab') {
        const items = Array.prototype.slice.call(panel.querySelectorAll<HTMLElement>(FOCUSABLE)) as HTMLElement[]
        if (items.length === 0) return
        const first = items[0]
        const last = items[items.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      openCount--
      clearTimeout(t)
      document.removeEventListener('keydown', onKey)
      if (prev && typeof prev.focus === 'function' && document.body.contains(prev)) prev.focus()
    }
  }, [open])

  if (!open) return null
  return createPortal(
    <div
      className="ui-modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && dismissible) onClose()
      }}
    >
      <div
        ref={panelRef}
        className={cx('ui-modal', 'ui-modal--' + size, className)}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
      >
        {!title && dismissible && (
          <IconButton icon="x" label="Yopish" variant="ghost" onClick={onClose} className="ui-modal__close" />
        )}
        {title && (
          <div className="ui-modal__head">
            <div className="ui-modal__titles">
              {title && <h2 className="ui-modal__title">{title}</h2>}
              {subtitle && <div className="ui-modal__subtitle">{subtitle}</div>}
            </div>
            {headerExtra}
            {dismissible && <IconButton icon="x" label="Yopish" variant="ghost" onClick={onClose} />}
          </div>
        )}
        <div className={cx('ui-modal__body', flush && 'is-flush')}>{children}</div>
        {footer && <div className="ui-modal__foot">{footer}</div>}
      </div>
    </div>,
    document.body
  )
}

/** Hozir biror modal ochiqmi (masalan global klaviatura yorliqlarini o'chirish uchun) */
export function isAnyModalOpen(): boolean {
  return openCount > 0
}
