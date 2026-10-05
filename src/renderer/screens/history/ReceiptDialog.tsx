/** Chek oldindan ko'rish (checkout.receipt) + "Chop etish" (system.printReceipt) — ro'yxatdan turib. */
import { useCallback, useEffect, useState } from 'react'
import type { ReceiptData } from '@shared/types'
import { api } from '@/api'
import { Button, EmptyState, Modal, Spinner, errorMessage, toast } from '@/ui'
import { ReceiptPreview } from '../checkout/ReceiptPreview'

export function ReceiptDialog({ sessionId, onClose }: { sessionId: number; onClose: () => void }) {
  const [r, setR] = useState<ReceiptData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [printing, setPrinting] = useState(false)

  const load = useCallback(() => {
    setR(null)
    setError(null)
    api.checkout
      .receipt(sessionId)
      .then(setR)
      .catch((e: unknown) => {
        setError(errorMessage(e))
        toast.error(e)
      })
  }, [sessionId])
  useEffect(load, [load])

  const print = async () => {
    if (!r || printing) return
    setPrinting(true)
    try {
      await api.system.printReceipt(r)
      toast.success('Chek chop etildi', { description: '№' + r.receiptNo })
    } catch (e) {
      toast.error(e, { description: "Printerni tekshirib, qayta urinib ko'ring." })
    } finally {
      setPrinting(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={r ? 'Chek №' + r.receiptNo : 'Chek'}
      footer={
        <>
          <Button variant="ghost" size="lg" onClick={onClose}>Yopish</Button>
          <div className="spacer" />
          <Button variant="primary" size="lg" icon="printer" onClick={() => void print()} loading={printing} disabled={!r} data-testid="hist-print">
            Chop etish
          </Button>
        </>
      }
    >
      <div className="hist-receipt" data-testid="hist-receipt">
        {error ? (
          <EmptyState icon="alert" title="Chekni yuklab bo'lmadi" description={error} action={<Button icon="refresh" onClick={load}>Qayta urinish</Button>} />
        ) : !r ? (
          <div className="hist-center"><Spinner size={40} /></div>
        ) : (
          <ReceiptPreview data={r} />
        )}
      </div>
    </Modal>
  )
}
