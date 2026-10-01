import type { Debt } from '@shared/types'
import { Button, Modal, Money } from '@/ui'
import { PaymentsList } from './PaymentsList'

export function HistoryDialog({ debt, onClose }: { debt: Debt; onClose: () => void }) {
  return (
    <Modal open onClose={onClose} size="md" title="To'lovlar tarixi" subtitle={debt.customerName} footer={<Button variant="secondary" size="lg" onClick={onClose}>Yopish</Button>}>
      <div className="debts-sum">
        <div><div className="subtle t-xs">Summa</div><Money value={debt.amount} size="md" /></div>
        <div><div className="subtle t-xs">To'langan</div><Money value={debt.paid} size="md" tone="success" /></div>
        <div><div className="subtle t-xs">Qolgan</div><Money value={Math.max(0, debt.amount - debt.paid)} size="md" tone="danger" /></div>
      </div>
      <PaymentsList debtId={debt.id} />
    </Modal>
  )
}
