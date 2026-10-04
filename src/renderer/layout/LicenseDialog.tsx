/**
 * Aktivatsiya oynasi — global (App.tsx), `useLicense.getState().openDialog()` bilan ochiladi:
 * muddat tugagan banner tugmasi, tepa paneldagi sinov belgisi, Qulf ekranidagi havola. Login talab qilinmaydi.
 */
import { Button, Modal } from '../ui'
import { useLicense } from '../store/license'
import { useApp } from '../store/app'
import { LicensePanel } from './LicensePanel'

export function LicenseDialog() {
  const open = useLicense((s) => s.dialogOpen)
  const close = useLicense((s) => s.closeDialog)
  // Terminalda aktivatsiya yo'q — litsenziya asosiy kompyuterda
  const isTerminal = useApp((s) => s.mode === 'terminal')
  if (isTerminal) return null
  return (
    <Modal
      open={open}
      onClose={close}
      title="Dasturni faollashtirish"
      subtitle="Delfin Sauna litsenziyasi — internet kerak emas"
      size="xl"
      footer={<Button size="lg" onClick={close}>Yopish</Button>}
    >
      <LicensePanel />
    </Modal>
  )
}
