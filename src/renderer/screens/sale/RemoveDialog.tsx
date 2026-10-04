/**
 * Savatdan olib tashlash (X) — faqat miqdor > 1 bo'lganda: nechtasi? (1 ta bo'lsa X darhol olib tashlaydi.)
 */
import { useState } from 'react'
import type { LineView } from '@shared/types'
import { Button, Modal, Money, Stepper } from '@/ui'

export function RemoveDialog({ line, onClose, onRemove }: { line: LineView; onClose: () => void; onRemove: (qty: number) => Promise<void> }) {
  const [qty, setQty] = useState(1)
  const [busy, setBusy] = useState(false)
  const run = async (n: number) => {
    if (busy) return
    setBusy(true)
    try {
      await onRemove(n)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Nechtasini olib tashlaysiz?"
      subtitle={line.name + ' · savatda ' + line.activeQty + ' ta'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Bekor
          </Button>
          <div className="spacer" />
          <Button variant="danger" className="is-solid" icon="x" loading={busy} onClick={() => void run(qty)} data-autofocus data-testid="sale-remove-ok">
            Olib tashlash
          </Button>
        </>
      }
    >
      <div className="sale-rm">
        <div className="sale-rm__row">
          <Stepper value={qty} onChange={setQty} min={1} max={line.activeQty} size="lg" suffix="ta" />
          <Button variant="secondary" onClick={() => void run(line.activeQty)} disabled={busy} data-testid="sale-remove-all">
            Hammasi ({line.activeQty})
          </Button>
        </div>
        <div className="sale-rm__hint">
          Savatdan ayriladi: <Money value={qty * line.unitPrice} size="sm" /> · mahsulot omborga qaytadi
        </div>
      </div>
    </Modal>
  )
}
