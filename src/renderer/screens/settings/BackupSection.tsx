import { useState } from 'react'
import { api } from '@/api'
import { Button, Icon, confirmDialog, formatDateTime, toast } from '@/ui'
import { useApp } from '@/store/app'
import { Note, SectionHead } from './common'

const LAST_KEY = 'straus.lastBackupAt'

function readLast(): number | null {
  try {
    const v = Number(localStorage.getItem(LAST_KEY))
    return v > 0 ? v : null
  } catch {
    return null
  }
}

function daysAgo(ts: number): number {
  return Math.floor((Date.now() - ts) / 86_400_000)
}

export function BackupSection() {
  const [last, setLast] = useState<number | null>(readLast)
  const [backing, setBacking] = useState(false)
  const [restoring, setRestoring] = useState(false)

  const backup = async () => {
    setBacking(true)
    try {
      const res = await api.system.backup()
      if (!res) {
        toast.info('Zaxira bekor qilindi')
        return
      }
      const now = Date.now()
      try {
        localStorage.setItem(LAST_KEY, String(now))
      } catch {
        /* ignore */
      }
      setLast(now)
      toast.success('Zaxira nusxa saqlandi', { description: 'Fayl: ' + res.path, duration: 8000 })
    } catch (e) {
      toast.error(e)
    } finally {
      setBacking(false)
    }
  }

  const restore = async () => {
    const ok = await confirmDialog({
      title: 'Zaxiradan tiklaysizmi?',
      message:
        "DIQQAT: hozirgi BARCHA ma'lumotlar (xonalar, ochiq hisoblar, savdolar, qarzlar, xodimlar) tanlangan zaxira nusxasi bilan " +
        'ALMASHTIRILADI. Zaxiradan keyingi savdolar yo\'qoladi. Tiklangach dastur qulflanadi va qaytadan PIN bilan kirasiz.',
      confirmText: 'Ha, tiklash',
      cancelText: 'Bekor qilish',
      danger: true,
      icon: 'alert'
    })
    if (!ok) return
    setRestoring(true)
    try {
      const done = await api.system.restore()
      if (!done) {
        toast.info('Tiklash bekor qilindi')
        return
      }
      toast.success("Ma'lumotlar zaxiradan tiklandi", { description: 'Qaytadan kiring' })
      await useApp.getState().reloadSettings()
      await useApp.getState().lock()
    } catch (e) {
      toast.error(e)
    } finally {
      setRestoring(false)
    }
  }

  const old = last != null && daysAgo(last) >= 7

  return (
    <div className="set-section">
      <SectionHead icon="database" title="Zaxira" description="Ma'lumotlar nusxasini olish va tiklash" />
      <div className="set-section__body">
        <div className="set-tiles">
          <div className="set-tile">
            <div className="set-tile__icon"><Icon name="database" size={30} /></div>
            <div className="set-tile__title">Zaxira nusxa olish</div>
            <div className="set-tile__desc">
              Butun bazani bitta faylga saqlaydi. Faylni fleshka yoki boshqa kompyuterga ko'chirib qo'ying.
            </div>
            <Button variant="primary" size="lg" icon="download" block onClick={() => void backup()} loading={backing} data-testid="backup">
              Zaxira nusxa olish
            </Button>
          </div>
          <div className="set-tile is-danger">
            <div className="set-tile__icon"><Icon name="refresh" size={30} /></div>
            <div className="set-tile__title">Zaxiradan tiklash</div>
            <div className="set-tile__desc">
              Oldin olingan nusxani qaytaradi. Hozirgi ma'lumotlar <b>o'chib ketadi</b> — ehtiyot bo'ling.
            </div>
            <Button variant="danger" size="lg" icon="upload" block onClick={() => void restore()} loading={restoring} data-testid="restore">
              Tiklash…
            </Button>
          </div>
        </div>

        <Note tone={last == null || old ? 'warning' : 'info'} icon={last == null || old ? 'alert' : 'clock'}>
          {last == null ? (
            <>Bu kompyuterda hali zaxira olinmagan. Kompyuter buzilsa yoki o'g'irlansa barcha savdo tarixi yo'qoladi — hozir zaxira oling.</>
          ) : (
            <>
              Oxirgi zaxira: <b>{formatDateTime(last)}</b>
              {daysAgo(last) > 0 ? ` (${daysAgo(last)} kun oldin)` : ' (bugun)'}.{' '}
              {old ? 'Ancha vaqt o\'tibdi — yangi nusxa oling.' : ''}
            </>
          )}
          <div className="set-note__more">Tavsiya: har kuni ish oxirida zaxira oling va nusxani boshqa joyda saqlang.</div>
        </Note>
      </div>
    </div>
  )
}
