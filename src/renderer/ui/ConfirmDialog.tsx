/**
 * ConfirmDialog — tasdiqlash oynasi (deklarativ). Imperativ variant: `confirmDialog({...})` (Promise<boolean>).
 *
 *   <ConfirmDialog open={open} title="Qatorni qaytarasizmi?" message="1 × Coca-Cola omborga qaytadi"
 *     danger confirmText="Qaytarish" onConfirm={async () => { await api.lines.returnLine(...) }}
 *     onCancel={() => setOpen(false)} />
 *
 * onConfirm Promise qaytarsa — tugma "loading" bo'ladi; xato bo'lsa toast.error va oyna ochiq qoladi;
 * muvaffaqiyatda onCancel EMAS, `onDone` (ixtiyoriy) chaqiriladi — yopishni o'zingiz boshqarasiz (odatda open=false).
 */
import { useState, type ReactNode } from 'react'
import { Modal } from './Modal'
import { Button } from './Button'
import { Icon, type IconName } from './Icon'
import { toast } from '../store/toast'
import { useConfirmStore } from '../store/confirm'

export interface ConfirmDialogProps {
  open: boolean
  title: ReactNode
  message?: ReactNode
  confirmText?: string
  cancelText?: string
  danger?: boolean
  icon?: IconName
  onConfirm: () => void | Promise<unknown>
  onCancel: () => void
  onDone?: () => void
}

export function ConfirmDialog({
  open, title, message, confirmText = 'Tasdiqlash', cancelText = 'Bekor qilish', danger, icon,
  onConfirm, onCancel, onDone
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true)
    try {
      await onConfirm()
      onDone?.()
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(false)
    }
  }
  const ic: IconName = icon ?? (danger ? 'alert' : 'info')
  return (
    <Modal open={open} onClose={onCancel} size="sm" dismissible={!busy}>
      <div className="ui-confirm">
        <div className={'ui-confirm__icon' + (danger ? ' is-danger' : '')}>
          <Icon name={ic} size={34} />
        </div>
        <div className="ui-confirm__title">{title}</div>
        {message && <div className="ui-confirm__msg">{message}</div>}
        <div className="ui-confirm__actions">
          <Button size="lg" onClick={onCancel} disabled={busy}>{cancelText}</Button>
          <Button size="lg" variant={danger ? 'danger' : 'primary'} className={danger ? 'is-solid' : undefined} onClick={run} loading={busy} data-autofocus>
            {confirmText}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/** App.tsx da bir marta: `confirmDialog()` chaqiruvlarini ko'rsatadi. */
export function ConfirmHost() {
  const current = useConfirmStore((s) => s.current)
  const close = useConfirmStore((s) => s.close)
  return (
    <ConfirmDialog
      open={!!current}
      title={current?.title ?? ''}
      message={current?.message}
      confirmText={current?.confirmText}
      cancelText={current?.cancelText}
      danger={current?.danger}
      icon={current?.icon}
      onConfirm={() => close(true)}
      onCancel={() => close(false)}
    />
  )
}
