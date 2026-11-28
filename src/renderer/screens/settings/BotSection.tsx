import { useCallback, useEffect, useState } from 'react'
import type { BotStatus } from '@shared/types'
import { api } from '@/api'
import { Button, Field, Input, Switch, formatDateTime, toast } from '@/ui'
import { Note, SectionHead } from './common'

/** Telegram bot (serverdagi PHP, cron bilan): dastur shu manzilga holatni va smena voqealarini yuboradi. */
export function BotSection() {
  const [st, setSt] = useState<BotStatus | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [url, setUrl] = useState('')
  const [secret, setSecret] = useState('')
  const [busy, setBusy] = useState<'save' | 'test' | null>(null)

  const load = useCallback(async () => {
    try {
      const s = await api.bot.status()
      setSt(s)
      setEnabled(s.enabled)
      setUrl(s.url)
    } catch (e) {
      toast.error(e)
    }
  }, [])
  useEffect(() => {
    void load()
    const id = setInterval(() => api.bot.status().then(setSt).catch(() => undefined), 10_000)
    return () => clearInterval(id)
  }, [load])

  const save = async () => {
    setBusy('save')
    try {
      const s = await api.bot.save({ enabled, url: url.trim(), secret: secret.trim() || undefined })
      setSt(s)
      setSecret('')
      toast.success('Telegram bot sozlamalari saqlandi')
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(null)
    }
  }

  const test = async () => {
    setBusy('test')
    try {
      // Avval kiritilganini saqlaymiz (kalit/manzil o'zgargan bo'lishi mumkin)
      if (url.trim() && (secret.trim() || st?.secretSet)) await api.bot.save({ enabled, url: url.trim(), secret: secret.trim() || undefined })
      setSecret('')
      const r = await api.bot.test()
      if (r.ok) toast.success('Server javob berdi — aloqa yaxshi')
      else toast.error(r.error || 'Aloqa yo\'q')
      setSt(await api.bot.status())
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="set-section">
      <SectionHead icon="inbox" title="Telegram bot" description="Bar qoldig'i, ochiq xonalar, smena hisobotlari — Telegramda" />
      <div className="set-section__body">
        <div className="set-group">
          <div className="set-group__title">Server bilan aloqa</div>
          <Switch checked={enabled} onChange={setEnabled} label="Botga ma'lumot yuborish yoqilgan" description="Dastur har daqiqada serverga holatni, smena ochilganda/yopilganda voqeani yuboradi" data-testid="bot-enabled" />
          <Field label="Server manzili (receive.php)" hint="Masalan: https://sizning-sayt.uz/bot/receive.php">
            <Input size="lg" icon="eye" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." data-testid="bot-url" />
          </Field>
          <Field label="Maxfiy kalit" hint={st?.secretSet ? "Saqlangan. O'zgartirish uchun yangisini kiriting" : "bot/config.php dagi 'secret' bilan bir xil bo'lishi kerak"}>
            <Input size="lg" type="password" autoComplete="new-password" icon="key" value={secret} onChange={(e) => setSecret(e.target.value)} data-testid="bot-secret" />
          </Field>
          <div className="row">
            <Button variant="success" icon="check" onClick={() => void save()} loading={busy === 'save'} data-testid="bot-save">Saqlash</Button>
            <Button variant="secondary" icon="refresh" onClick={() => void test()} loading={busy === 'test'} data-testid="bot-test">Tekshirish</Button>
          </div>
        </div>

        {st && (
          <div className="set-group" data-testid="bot-status">
            <div className="set-group__title">Holat</div>
            <div>
              {st.lastOkAt != null ? <>Oxirgi muvaffaqiyatli yuborish: <b className="num">{formatDateTime(st.lastOkAt)}</b></> : "Hali yuborilmagan"}
              {st.pending > 0 && <> · yuborilmagan voqealar: <b className="num">{st.pending}</b></>}
            </div>
            {st.lastError && <Note tone="warning" icon="alert">Oxirgi xato: {st.lastError}</Note>}
          </div>
        )}

        <Note tone="info" icon="info">
          Bot serverda (oddiy PHP, cron) ishlaydi. O'rnatish: <b>bot/README.md</b>. Bot tokeni faqat serverdagi config.php da turadi — dasturda saqlanmaydi.
          Zaxira nusxada serverning maxfiy kaliti saqlanadi — zaxira faylini begonalarga bermang.
        </Note>
      </div>
    </div>
  )
}
