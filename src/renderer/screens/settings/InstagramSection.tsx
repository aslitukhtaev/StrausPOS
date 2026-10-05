/**
 * Sozlamalar → Instagram: chekka chiqadigan QR kod va nom. QR yuklash joyi tagida "Bizning Instagram" yozuvi.
 */
import { useRef, useState } from 'react'
import { Button, Field, Input, toast } from '@/ui'
import { Note, SaveBar, SectionHead, jsonEqual, useReportDirty, type SectionProps } from './common'
import './instagram.css'

const MAX_BYTES = 500_000

export function InstagramSection({ settings, save, onDirty }: SectionProps) {
  const [s, setS] = useState(settings.instagram)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const dirty = !jsonEqual(s, settings.instagram)
  useReportDirty(dirty, onDirty)

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (fileRef.current) fileRef.current.value = ''
    if (!file) return
    if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) return toast.error('Faqat PNG yoki JPG rasm tanlang')
    if (file.size > MAX_BYTES) return toast.error('Rasm juda katta (500 KB gacha)')
    const r = new FileReader()
    r.onload = () => setS((p) => ({ ...p, qrCodeBase64: String(r.result) }))
    r.readAsDataURL(file)
  }

  const onSave = async () => {
    setSaving(true)
    try {
      await save({ ...settings, instagram: s }, 'Instagram sozlamalari saqlandi')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="set-section">
      <SectionHead icon="inbox" title="Instagram" description="Chekning pastida chiqadigan QR kod yoki logo" />
      <div className="set-section__body">
        <div className="set-group">
          <div className="set-group__title">QR kod yoki logo</div>
          <div className="set-ig">
            <div className="set-ig__box" data-testid="ig-preview">
              {s.qrCodeBase64 ? (
                <img src={s.qrCodeBase64} alt="Instagram QR kod" className="set-ig__img" />
              ) : (
                <span className="set-ig__empty">QR kod yoki logo yuklanmagan</span>
              )}
            </div>
            <div className="set-ig__caption">Bizning Instagram</div>
            {s.handle && <div className="set-ig__handle">{s.handle}</div>}
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={onFile} data-testid="ig-file" />
            <div className="set-ig__actions">
              <Button icon="upload" onClick={() => fileRef.current?.click()}>
                {s.qrCodeBase64 ? 'QR kod yoki logoni almashtirish' : 'QR kod yoki logo yuklash'}
              </Button>
              {s.qrCodeBase64 && (
                <Button variant="danger" icon="trash" onClick={() => setS((p) => ({ ...p, qrCodeBase64: '' }))}>
                  O'chirish
                </Button>
              )}
            </div>
          </div>
          <Field label="Instagram nomi" hint="Ixtiyoriy. QR tagida «Bizning Instagram» yozuvi yoniga chiqadi">
            <Input
              value={s.handle}
              placeholder="@delfin.sauna"
              maxLength={40}
              onChange={(e) => setS((p) => ({ ...p, handle: e.target.value }))}
              data-testid="ig-handle"
            />
          </Field>
        </div>
        <Note>PNG yoki JPG, 500 KB gacha. QR kod yoki logo har bir chekning pastida chop etiladi (oshxona chekida chiqmaydi).</Note>
      </div>
      <SaveBar dirty={dirty} saving={saving} onSave={() => void onSave()} onReset={() => setS(settings.instagram)} />
    </div>
  )
}
