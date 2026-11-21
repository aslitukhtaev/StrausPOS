/** Yopilgan hisobni bekor qilish: parol + (ixtiyoriy) sabab. Parol serverda tekshiriladi (sessions.void). */
import { useState } from 'react'
import type { SessionHistoryRow } from '@shared/types'
import { api } from '@/api'
import { Button, Field, Input, Modal, formatMoney, toast } from '@/ui'
import { roomLabel } from './common'

export function VoidDialog({ row, onClose, onDone }: { row: SessionHistoryRow; onClose: () => void; onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (busy || !password) return
    setBusy(true)
    try {
      await api.sessions.void(row.sessionId, password, reason)
      toast.success('Hisob bekor qilindi', { description: row.receiptNo != null ? 'Chek №' + row.receiptNo : undefined })
      onDone()
    } catch (e) {
      toast.error(e)
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Hisobni bekor qilish"
      subtitle={`${row.receiptNo != null ? '№' + row.receiptNo + ' · ' : ''}${roomLabel(row)} · ${formatMoney(row.total)} so'm`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Yo'q</Button>
          <div className="spacer" />
          <Button variant="danger" icon="xCircle" loading={busy} disabled={!password} onClick={() => void submit()} data-testid="void-confirm">
            Bekor qilish
          </Button>
        </>
      }
    >
      <div className="hist-void">
        <p className="subtle">
          Hisob hisobotlardan chiqadi, sotilgan mahsulotlar omborga qaytadi, to'langan pul «Qaytarilgan pul» sifatida yoziladi.
        </p>
        <Field label="Bekor qilish paroli" required>
          <Input
            size="lg" type="password" autoFocus autoComplete="off" value={password} data-testid="void-password"
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void submit() }}
          />
        </Field>
        <Field label="Sabab (ixtiyoriy)">
          <Input size="lg" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} data-testid="void-reason" />
        </Field>
      </div>
    </Modal>
  )
}
