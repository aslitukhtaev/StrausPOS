/**
 * Vaqt ogohlantirishlari: mehmon vaqti `warnBeforeMinutes` ga yetganda va olingan vaqt tugaganda (0 dan o'tganda)
 * — bir martalik ekran bildirishnomasi (toast) + qisqa ovozli signal (WebAudio, fayl kerak emas).
 * Bir hodisa qayta chalinmaydi: kalit = sessiya + mehmon + bosqich + olingan daqiqa (uzaytirilsa yana ogohlantiradi).
 * Ortiqcha vaqt daqiqalab hisoblanadi — shuning uchun "vaqt tugadi" har mehmon uchun BIR MARTA chiqadi.
 * Xotira modul darajasida — ekranlar orasida o'tilganda ham takrorlanmaydi.
 */
import { useEffect } from 'react'
import { getNow, toast, useNow } from '@/ui'
import { guestPhase, liveTotals, useBillingOptions, useWarnMs } from './live'
import { useBoard } from './boardStore'
import { formatHours } from '@shared/billing'

const fired = new Set<string>()

let audio: AudioContext | null = null

/** Qisqa signal: warn — 2 ta yumshoq "bip", over — 3 ta balandroq. Xato bo'lsa jim o'tadi. */
export function beep(kind: 'warn' | 'over'): void {
  try {
    const Ctx: typeof AudioContext | undefined =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    if (!audio) audio = new Ctx()
    const ctx = audio
    if (ctx.state === 'suspended') void ctx.resume()
    const count = kind === 'over' ? 3 : 2
    const freq = kind === 'over' ? 988 : 784
    const t0 = ctx.currentTime + 0.02
    for (let i = 0; i < count; i++) {
      const start = t0 + i * 0.28
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(kind === 'over' ? 0.35 : 0.22, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.2)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(start)
      osc.stop(start + 0.22)
    }
  } catch {
    /* ovoz yo'q — faqat ekran bildirishnomasi */
  }
}

export function useTimeAlerts(): void {
  const now = useNow()
  const cards = useBoard((s) => s.cards)
  const at = useBoard((s) => s.at)
  const opts = useBillingOptions()
  const warnMs = useWarnMs()

  useEffect(() => {
    if (!cards) return
    let sound: 'warn' | 'over' | null = null
    for (const c of cards) {
      if (!c.session || c.session.session.status !== 'open') continue
      const live = liveTotals(c.session, at, getNow(), opts, warnMs)
      for (const g of live.guests) {
        if (g.state !== 'running') continue
        const phase = guestPhase(g, warnMs)
        if (phase !== 'warn' && phase !== 'over') continue
        // Butun olingan vaqt ogohlantirish oynasidan qisqa bo'lsa (masalan 10 daq) — "tugayapti" darhol chiqmasin
        if (phase === 'warn' && g.paidMinutes * 60_000 <= warnMs) continue
        const key = [c.session.session.id, g.id, phase, g.paidMinutes].join(':')
        if (fired.has(key)) continue
        fired.add(key)
        const name = `${c.room.name}: ${g.label}`
        if (phase === 'over') {
          const block = Math.max(1, opts.blockMinutes)
          toast.error(`${name} vaqti tugadi`, {
            description:
              `Olingan ${formatHours(g.paidMinutes)} tugadi. ` +
              (block === 1 ? "Endi o'tirilgan har daqiqa qo'shiladi." : `Endi har boshlangan ${formatHours(block)} qo'shiladi.`) +
              ' "+1 soat" bilan uzaytiring yoki tugating.',
            duration: 15_000
          })
          sound = 'over'
        } else {
          toast.warning(`${name} — ${Math.max(1, Math.ceil(g.remainingMs / 60_000))} daqiqa qoldi`, {
            description: `Olingan ${formatHours(g.paidMinutes)} tugayapti.`,
            duration: 10_000
          })
          if (sound !== 'over') sound = 'warn'
        }
      }
    }
    if (sound) beep(sound)
    // `now` — har soniya tekshirish uchun
  }, [now, cards, at, opts, warnMs])
}
