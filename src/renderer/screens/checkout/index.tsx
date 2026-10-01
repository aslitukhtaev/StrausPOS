/**
 * To'lov moduli (navigatsiyada alohida ekran EMAS).
 *
 *   import { CheckoutDialog, ReceiptPreview, sampleReceiptData } from '@/screens/checkout'
 *
 * - CheckoutDialog  { sessionId, onClose, onPaid(receipt) } — to'lov oynasi + chek (xonalar ekrani uchun)
 * - ReceiptPreview  { data, width?: 58|80, scale?, maxHeight? } — chek namunasi (sozlamalar ekrani uchun)
 * - sampleReceiptData(settings) — namunaviy ReceiptData (chek sozlamalarida jonli ko'rinish)
 *
 * `export default` — faqat layout registri `screens/* /index.tsx` ni glob qilgani uchun oddiy placeholder.
 */
import { EmptyState } from '@/ui'

export { CheckoutDialog, type CheckoutDialogProps } from './CheckoutDialog'
export { ReceiptPreview, type ReceiptPreviewProps } from './ReceiptPreview'
export { sampleReceiptData } from './sample'

export default function CheckoutPlaceholder() {
  return <EmptyState icon="receipt" title="To'lov" description="To'lov oynasi xonalar ekranidan ochiladi." />
}
