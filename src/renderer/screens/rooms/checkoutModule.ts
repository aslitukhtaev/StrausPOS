/// <reference types="vite/client" />
/**
 * To'lov oynasi boshqa agent papkasida (`screens/checkout`). U hali bo'lmasligi mumkin — shuning uchun
 * statik import o'rniga `import.meta.glob` bilan olamiz; topilmasa `null` (UI "To'lov moduli tayyor emas" deydi).
 */
import type { ComponentType } from 'react'
import type { ReceiptData } from '@shared/types'

export interface CheckoutDialogProps {
  sessionId: number
  onClose: () => void
  onPaid: (receipt: ReceiptData) => void
}

const mods = import.meta.glob<{ CheckoutDialog?: ComponentType<CheckoutDialogProps> }>('../checkout/index.tsx', { eager: true })
const mod = mods['../checkout/index.tsx']

export const CheckoutDialog: ComponentType<CheckoutDialogProps> | null = (mod && mod.CheckoutDialog) || null
