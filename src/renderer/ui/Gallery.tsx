/**
 * Gallery — barcha UI komponentlarining jonli namunasi (faqat ishlab chiqish uchun).
 * Ochish: http://localhost:5173/?gallery  (yoki ?mock&gallery)
 */
import { useState } from 'react'
import {
  Badge, Button, Card, EmptyState, Field, Icon, ICON_NAMES, IconButton, Input, Logo, Modal, Money, MoneyInput, Numpad,
  PageHeader, PinDots, Segmented, Select, StatusPill, Stepper, Tabs, Timer, confirmDialog, toast
} from './index'
import { useApp } from '../store/app'

export default function Gallery() {
  const [tab, setTab] = useState('a')
  const [seg, setSeg] = useState<'cash' | 'card' | 'debt'>('cash')
  const [qty, setQty] = useState(2)
  const [pin, setPin] = useState('12')
  const [sum, setSum] = useState('125000')
  const [money, setMoney] = useState(85000)
  const [open, setOpen] = useState(false)
  return (
    <div style={{ height: '100%', overflow: 'auto', padding: 32 }}>
      <PageHeader
        icon="sparkles"
        title="UI to'plami"
        subtitle="Delfin Sauna komponentlari"
        actions={
          <>
            <Button icon="sun" onClick={() => void useApp.getState().toggleTheme()}>Rejim</Button>
            <Button variant="primary" icon="plus">Asosiy amal</Button>
          </>
        }
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(520px, 1fr))', gap: 20 }}>
        <Card title="Logotip" subtitle="mark / full / glyph">
          <div className="row" style={{ flexWrap: 'wrap', gap: 24 }}>
            <Logo size={72} />
            <Logo size={44} variant="full" />
            <Logo size={24} />
            <span className="t-accent"><Logo size={64} variant="glyph" /></span>
          </div>
        </Card>
        <Card title="Holat ranglari" subtitle="bo'sh / band / tugayapti / pauza">
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <StatusPill status="free" size="lg" />
            <StatusPill status="busy" size="lg" />
            <StatusPill status="ending" size="lg" />
            <StatusPill status="paused" size="lg" />
            <Badge tone="info">Xizmat</Badge>
          </div>
        </Card>
        <Card title="Tugmalar" subtitle="primary / secondary / success / danger / ghost">
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <Button variant="primary" icon="play">Ochish</Button>
            <Button icon="pause">Pauza</Button>
            <Button variant="success" icon="cash">To'lash</Button>
            <Button variant="danger" icon="trash">O'chirish</Button>
            <Button variant="ghost">Bekor</Button>
            <Button loading>Saqlash</Button>
          </div>
          <div className="row" style={{ marginTop: 12, flexWrap: 'wrap' }}>
            <Button size="sm">Kichik</Button>
            <Button size="lg" variant="primary">Katta</Button>
            <IconButton icon="edit" label="Tahrirlash" />
            <IconButton icon="printer" label="Chop etish" variant="ghost" />
            <IconButton icon="receipt" label="Chek" size="lg" badge={3} />
          </div>
        </Card>
        <Card title="Holatlar">
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <StatusPill status="free" />
            <StatusPill status="busy" />
            <StatusPill status="ending" />
            <StatusPill status="debt" />
            <StatusPill status="paused" />
            <StatusPill status="running" />
            <StatusPill status="busy" size="lg">Band · 4 kishi</StatusPill>
          </div>
          <div className="row" style={{ marginTop: 12, flexWrap: 'wrap' }}>
            <Badge>Oddiy</Badge>
            <Badge tone="accent">VIP</Badge>
            <Badge tone="danger" icon="alert">Kam qoldi</Badge>
            <Badge tone="info" size="sm">Yangi</Badge>
          </div>
          <div className="row" style={{ marginTop: 16, gap: 24, flexWrap: 'wrap' }}>
            <Money value={1250000} size="2xl" tone="accent" />
            <Money value={-15000} sign tone="danger" />
            <Timer ms={5025000} running size="xl" />
            <Timer ms={1800000} paused size="lg" />
          </div>
        </Card>
        <Card title="Forma">
          <div className="col" style={{ gap: 16 }}>
            <Field label="Xona nomi" hint="Masalan: VIP-1">
              <Input icon="rooms" placeholder="Nomi" />
            </Field>
            <Field label="Narx (soatiga)">
              <MoneyInput value={money} onChange={setMoney} />
            </Field>
            <Field label="Rol" error="Rolni tanlang">
              <Select defaultValue="cashier" invalid>
                <option value="owner">Ega</option>
                <option value="cashier">Kassir</option>
              </Select>
            </Field>
          </div>
        </Card>
        <Card title="Tanlash">
          <Tabs value={tab} onChange={setTab} items={[{ id: 'a', label: 'Mahsulotlar', icon: 'box', badge: 12 }, { id: 'b', label: 'Xizmatlar', icon: 'sparkles' }]} />
          <div style={{ marginTop: 16 }}>
            <Segmented value={seg} onChange={setSeg} block size="lg" options={[
              { value: 'cash', label: 'Naqd', icon: 'cash' },
              { value: 'card', label: 'Karta', icon: 'card' },
              { value: 'debt', label: 'Qarz', icon: 'wallet' }
            ]} />
          </div>
          <div className="row" style={{ marginTop: 16 }}>
            <Stepper value={qty} onChange={setQty} min={1} max={10} />
            <Stepper value={qty} onChange={setQty} min={1} max={10} size="lg" suffix="kishi" />
          </div>
        </Card>
        <Card title="Numpad (PIN va summa)">
          <div className="row" style={{ alignItems: 'flex-start', gap: 24 }}>
            <div className="col" style={{ alignItems: 'center', flex: 1 }}>
              <PinDots length={pin.length} max={6} />
              <Numpad mode="pin" value={pin} onChange={setPin} onSubmit={() => toast.success('PIN: ' + pin)} keyboard={false} />
            </div>
            <div className="col" style={{ alignItems: 'center', flex: 1 }}>
              <Money value={Number(sum || 0)} size="xl" />
              <Numpad mode="amount" value={sum} onChange={setSum} keyboard={false} />
            </div>
          </div>
        </Card>
        <Card title="Oyna va bildirishnoma">
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <Button onClick={() => setOpen(true)} icon="eye">Modal</Button>
            <Button onClick={() => void confirmDialog({ title: "Sessiyani bekor qilasizmi?", message: "Bu amalni qaytarib bo'lmaydi.", danger: true, confirmText: 'Bekor qilish', cancelText: 'Yopish' })}>Tasdiqlash</Button>
            <Button onClick={() => toast.success('Xona ochildi', { description: 'VIP-1 · 4 kishi' })}>Toast ✓</Button>
            <Button onClick={() => toast.error(new Error("PIN noto'g'ri"))}>Toast ✗</Button>
          </div>
          <EmptyState icon="inbox" title="Qarzlar yo'q" description="Barcha hisoblar to'langan" />
        </Card>
        <Card title="Ikonlar" padding="md">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: 8 }}>
            {ICON_NAMES.map((n) => (
              <div key={n} className="col" style={{ alignItems: 'center', gap: 6, padding: 8, color: 'var(--text-2)' }}>
                <Icon name={n} size={28} />
                <span className="t-xs subtle">{n}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="To'lov"
        subtitle="VIP-1 · 3 mehmon"
        size="lg"
        footer={<><Button onClick={() => setOpen(false)}>Bekor qilish</Button><Button variant="success" icon="check">To'lash</Button></>}
      >
        <div className="col" style={{ gap: 16 }}>
          <div className="row"><span className="grow muted">Vaqt</span><Money value={360000} size="lg" /></div>
          <div className="row"><span className="grow muted">Bar</span><Money value={46000} size="lg" /></div>
          <div className="row"><span className="grow t-lg t-semibold">Jami</span><Money value={406000} size="3xl" tone="accent" /></div>
          <Segmented value={seg} onChange={setSeg} block size="lg" options={[
            { value: 'cash', label: 'Naqd', icon: 'cash' },
            { value: 'card', label: 'Karta', icon: 'card' },
            { value: 'debt', label: 'Qarz', icon: 'wallet' }
          ]} />
        </div>
      </Modal>
    </div>
  )
}
