import { useEffect, useState } from 'react'
import type { DebtPayment } from '@shared/types'
import { api } from '@/api'
import { Badge, Money, Spinner, formatDateTime, toast } from '@/ui'

let staffNames: Record<number, string> | null = null
async function names(): Promise<Record<number, string>> {
  if (staffNames) return staffNames
  try {
    const m: Record<number, string> = {}
    ;(await api.auth.listLoginStaff()).forEach((s) => (m[s.id] = s.name))
    staffNames = m
  } catch {
    staffNames = {}
  }
  return staffNames
}

export function PaymentsList({ debtId, version }: { debtId: number; version?: number }) {
  const [items, setItems] = useState<DebtPayment[] | null>(null)
  const [who, setWho] = useState<Record<number, string>>({})
  useEffect(() => {
    let live = true
    Promise.all([api.debts.payments(debtId), names()])
      .then(([p, n]) => {
        if (!live) return
        setItems(p.slice().sort((a, b) => b.at - a.at))
        setWho(n)
      })
      .catch((e) => {
        toast.error(e)
        if (live) setItems([])
      })
    return () => {
      live = false
    }
  }, [debtId, version])

  if (!items) return <div style={{ padding: 16, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
  if (!items.length) return <div className="subtle debts-hist__empty">Hali to'lov qilinmagan</div>
  return (
    <div className="debts-hist">
      {items.map((p) => (
        <div key={p.id} className="debts-hist__row">
          <div>
            <div className="num t-sm">{formatDateTime(p.at)}</div>
            <div className="subtle t-xs">{who[p.by] || ''}</div>
          </div>
          <Badge tone={p.method === 'cash' ? 'success' : 'info'} icon={p.method === 'cash' ? 'cash' : 'card'}>{p.method === 'cash' ? 'Naqd' : 'Karta'}</Badge>
          <Money value={p.amount} size="md" tone="success" />
        </div>
      ))}
    </div>
  )
}
