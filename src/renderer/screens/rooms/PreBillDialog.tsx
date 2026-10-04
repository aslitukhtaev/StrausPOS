/**
 * Oraliq chek (checkout.preBill): sessiya YOPILMAYDI — mehmonga "hozirgacha qancha" ko'rsatish yoki chop etib berish uchun.
 * Chek ko'rinishi — to'lov modulining ReceiptPreview komponenti; "Chop etish" — system.printReceipt.
 */
import { useCallback, useEffect, useState } from 'react'
import type { ReceiptData } from '@shared/types'
import { api } from '@/api'
import { Button, EmptyState, Modal, Spinner, errorMessage, formatMoney, toast } from '@/ui'
import { ReceiptPreview } from '@/screens/checkout'

export function PreBillDialog({ sessionId, onClose }: { sessionId: number; onClose: () => void }) {
  const [data, setData] = useState<ReceiptData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [printing, setPrinting] = useState(false)

  const load = useCallback(() => {
    setError(null)
    setData(null)
    api.checkout
      .preBill(sessionId)
      .then(setData)
      .catch((e: unknown) => {
        setError(errorMessage(e))
        toast.error(e)
      })
  }, [sessionId])

  useEffect(() => {
    load()
  }, [load])

  const print = async () => {
    if (!data || printing) return
    setPrinting(true)
    try {
      await api.system.printReceipt(data)
      toast.success('Oraliq chek chop etildi', { description: 'Hisob ochiq qoladi.' })
      onClose()
    } catch (e) {
      toast.error(e, { description: 'Printerni tekshirib, qayta urinib ko\'ring.' })
    } finally {
      setPrinting(false)
    }
  }

  return (
    <Modal
      open
      onClose={printing ? () => undefined : onClose}
      title="Oraliq chek"
      subtitle={data ? `${data.roomName} · jami ${formatMoney(data.total)} so'm · hisob yopilmaydi` : 'Hisob yopilmaydi'}
      size="md"
      className="rooms-prebill-modal"
      footer={
        <>
          <Button variant="ghost" size="lg" onClick={onClose} disabled={printing}>
            Yopish
          </Button>
          <div className="spacer" />
          <Button
            variant="primary"
            size="lg"
            icon="printer"
            onClick={() => void print()}
            loading={printing}
            disabled={!data}
            data-autofocus
            data-testid="prebill-print"
          >
            Chop etish
          </Button>
        </>
      }
    >
      <div className="rooms-prebill" data-testid="prebill-dialog">
        {error ? (
          <EmptyState icon="alert" title="Chekni tayyorlab bo'lmadi" description={error} action={<Button icon="refresh" onClick={load}>Qayta urinish</Button>} />
        ) : !data ? (
          <div className="rooms-loading"><Spinner size={40} /></div>
        ) : (
          <ReceiptPreview data={data} scale={1.15} />
        )}
      </div>
    </Modal>
  )
}
