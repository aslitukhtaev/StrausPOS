import { useState } from 'react'
import type { Product } from '@shared/types'
import { api } from '@/api'
import { Button, Icon, Input, Modal, Segmented, cx, toast } from '@/ui'

const REASONS_IN = ['Yangi kirim', 'Inventarizatsiya', 'Boshqa']
const REASONS_OUT = ['Buzilgan / yaroqsiz', 'Inventarizatsiya', 'Xodim uchun', 'Boshqa']

export function StockDialog({ product, sign: s0, onClose, onSaved }: { product: Product; sign: 1 | -1; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const [sign, setSign] = useState<1 | -1>(s0)
  const [qty, setQty] = useState(s0 === 1 ? 10 : 1)
  const [reason, setReason] = useState(s0 === 1 ? REASONS_IN[0] : REASONS_OUT[0])
  const [custom, setCustom] = useState('')
  const [busy, setBusy] = useState(false)
  const reasons = sign === 1 ? REASONS_IN : REASONS_OUT
  const next = product.stock + sign * qty

  const pick = (v: 1 | -1) => {
    setSign(v)
    setReason((v === 1 ? REASONS_IN : REASONS_OUT)[0])
  }
  const save = async () => {
    if (qty <= 0) return toast.warning('Miqdorni kiriting')
    if (next < 0) return toast.warning(`Omborda faqat ${product.stock} dona bor`)
    const r = reason === 'Boshqa' ? custom.trim() || 'Boshqa' : reason
    setBusy(true)
    try {
      await api.catalog.adjustStock(product.id, sign * qty, r)
      toast.success(sign === 1 ? `+${qty} qo'shildi` : `−${qty} kamaytirildi`)
      await onSaved()
      onClose()
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={product.name}
      subtitle="Ombor qoldig'ini o'zgartirish"
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={onClose}>Bekor</Button>
          <Button variant={sign === 1 ? 'success' : 'danger'} size="lg" loading={busy} disabled={next < 0 || qty <= 0} onClick={save} className={sign === -1 ? 'is-solid' : undefined}>
            {sign === 1 ? "Qo'shish" : 'Kamaytirish'}
          </Button>
        </>
      }
    >
      <div className="bar-stockdlg">
        <Segmented size="lg" block value={sign} onChange={pick} options={[{ value: 1, label: "To'ldirish", icon: 'plus' }, { value: -1, label: 'Kamaytirish', icon: 'minus' }]} />
        <div className="bar-stockdlg__calc">
          <button type="button" className="bar-bigbtn" aria-label="Kamroq" onClick={() => setQty(Math.max(1, qty - 1))}><Icon name="minus" size={36} /></button>
          <div className="bar-stockdlg__qty">
            <div className={cx('num bar-stockdlg__n', sign === 1 ? 't-success' : 't-danger')}>{sign === 1 ? '+' : '−'}{qty}</div>
            <div className="subtle">Hozir: <b className="num">{product.stock}</b> → Bo'ladi: <b className={cx('num', next < 0 && 't-danger')}>{next}</b></div>
          </div>
          <button type="button" className="bar-bigbtn" aria-label="Ko'proq" onClick={() => setQty(qty + 1)}><Icon name="plus" size={36} /></button>
        </div>
        <div className="bar-chips">
          {[1, 5, 10, 24, 50].map((n) => (
            <button key={n} type="button" className="bar-chip num" onClick={() => setQty(qty + n)}>+{n}</button>
          ))}
          <button type="button" className="bar-chip" onClick={() => setQty(1)}>Tozalash</button>
        </div>
        <div>
          <div className="bar-label">Sabab</div>
          <div className="bar-chips">
            {reasons.map((r) => (
              <button key={r} type="button" className={cx('bar-chip', reason === r && 'is-active')} onClick={() => setReason(r)}>{r}</button>
            ))}
          </div>
          {reason === 'Boshqa' && <div style={{ marginTop: 12 }}><Input placeholder="Sababni yozing" value={custom} onChange={(e) => setCustom(e.target.value)} /></div>}
        </div>
      </div>
    </Modal>
  )
}
