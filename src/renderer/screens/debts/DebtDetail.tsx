/** Bitta qarz: kimga, kim bergan, qaysi chek, nima olingan, qanday to'langan. */
import { useState } from 'react'
import type { DebtJournalRow } from '@shared/types'
import { Badge, Button, Modal, Money, formatDateTime, formatMoney } from '@/ui'
import { METHOD_LABEL } from '../checkout/methods'
import { ReceiptDialog } from '../history/ReceiptDialog'
import { leftOf } from './model'

export function DebtDetail({ debt, onClose, onDebtor }: { debt: DebtJournalRow; onClose: () => void; onDebtor: () => void }) {
  const [receipt, setReceipt] = useState(false)
  const left = leftOf(debt)
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={(debt.receiptNo != null ? 'Chek №' + debt.receiptNo + ' · ' : '') + debt.customerName}
      subtitle={debt.phone}
      footer={
        <>
          {debt.sessionId != null && <Button variant="ghost" icon="printer" onClick={() => setReceipt(true)} data-testid="debt-receipt">Chekni ko'rish</Button>}
          <span className="spacer" />
          <Button variant="secondary" onClick={onClose}>Yopish</Button>
          <Button variant="primary" icon="user" onClick={onDebtor} data-testid="debt-debtor">Qarzdor sahifasi</Button>
        </>
      }
    >
      <div className="hist-det" data-testid="debt-detail">
        <div className="hist-det__head">
          <span>Berilgan: <b className="num">{formatDateTime(debt.createdAt)}</b></span>
          <span>Kim bergan: <b>{debt.issuedByName || '—'}</b></span>
          <span>Qayerdan: <b>{debt.roomName || '—'}</b></span>
        </div>
        <div className="debts-sum">
          <div><div className="subtle t-xs">Qarz</div><Money value={debt.amount} size="lg" />
            {debt.sessionTotal > debt.amount && <div className="hist-sub">chek jami: {formatMoney(debt.sessionTotal)}</div>}</div>
          <div><div className="subtle t-xs">To'langan</div><Money value={debt.paid} size="lg" tone="success" /></div>
          <div><div className="subtle t-xs">Qoldiq</div><Money value={left} size="xl" tone={left > 0 ? 'danger' : 'success'} /></div>
        </div>

        <div>
          <h3 className="hist-h">Olingan narsalar</h3>
          {debt.items.length ? (
            <table className="hist-tbl">
              <thead><tr><th>Nomi</th><th className="r">Soni</th><th className="r">Narxi</th><th className="r">Summa</th></tr></thead>
              <tbody>
                {debt.items.map((i) => (
                  <tr key={i.name + i.unitPrice}><td className="hist-nm">{i.name}</td><td className="r num">{i.qty}</td><td className="r num">{formatMoney(i.unitPrice)}</td><td className="r num">{formatMoney(i.amount)}</td></tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="subtle">Mahsulot yo'q (faqat xona vaqti yoki eski yozuv)</div>
          )}
        </div>

        <div>
          <h3 className="hist-h">To'lovlar</h3>
          {debt.payments.length ? (
            <table className="hist-tbl">
              <thead><tr><th>Vaqt</th><th>Kim qabul qilgan</th><th>Usul</th><th className="r">Summa</th></tr></thead>
              <tbody>
                {debt.payments.map((p) => (
                  <tr key={p.id}><td className="num">{formatDateTime(p.at)}</td><td className="hist-who">{p.byName || '—'}</td>
                    <td><Badge tone={p.method === 'cash' ? 'success' : 'info'} size="sm">{METHOD_LABEL[p.method]}</Badge></td><td className="r num">{formatMoney(p.amount)}</td></tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="subtle">Hali to'lov qilinmagan</div>
          )}
        </div>
      </div>
      {receipt && debt.sessionId != null && <ReceiptDialog sessionId={debt.sessionId} onClose={() => setReceipt(false)} />}
    </Modal>
  )
}
