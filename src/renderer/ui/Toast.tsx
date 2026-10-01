/**
 * ToastViewport — bildirishnomalar ko'rsatgichi (App.tsx da bir marta o'rnatilgan).
 * Chaqirish: `toast.success("...")`, `toast.error(e)`, `toast.info`, `toast.warning` (`@/ui` dan import).
 * O'ng-past burchakda, avtomatik yopiladi; bosilsa darhol yopiladi.
 */
import { useToastStore, type ToastKind } from '../store/toast'
import { Icon, type IconName } from './Icon'

const ICON: Record<ToastKind, IconName> = { success: 'checkCircle', error: 'xCircle', info: 'info', warning: 'alert' }

export function ToastViewport() {
  const items = useToastStore((s) => s.items)
  const dismiss = useToastStore((s) => s.dismiss)
  return (
    <div className="ui-toasts" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={'ui-toast ui-toast--' + t.kind} role={t.kind === 'error' ? 'alert' : 'status'} onClick={() => dismiss(t.id)}>
          <Icon name={ICON[t.kind]} size={28} className="ui-toast__icon" />
          <div className="ui-toast__text">
            <div className="ui-toast__title">{t.title}</div>
            {t.description && <div className="ui-toast__desc">{t.description}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}
