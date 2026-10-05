import { useState, useRef } from 'react'
import type { AppSettings } from '@shared/types'
import { Button, Field, Input, toast } from '@/ui'
import { Note, SaveBar, SectionHead, jsonEqual, useReportDirty, type SectionProps } from './common'

export function InstagramSection({ settings, save, onDirty }: SectionProps) {
  const [s, setSettings] = useState(settings.instagram)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dirty = !jsonEqual(s, settings.instagram)

  if (dirty) onDirty(true)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast.error('Faqat rasm fayli tanlang')
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      const base64 = event.target?.result as string
      setSettings((prev) => ({ ...prev, qrCodeBase64: base64 }))
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
    reader.readAsDataURL(file)
  }

  const handleRemoveQR = () => {
    setSettings((prev) => ({ ...prev, qrCodeBase64: '' }))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSave = async () => {
    await save({ ...settings, instagram: s }, 'Instagram sozlamalari saqlandi')
    onDirty(false)
  }

  return (
    <>
      <SectionHead title="Instagram" description="QR kod va handle ni kiriting" />

      <div style={{ maxWidth: '600px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '14px' }}>
            Instagram Handle
          </label>
          <Field label="">
            <Input
              type="text"
              placeholder="@bizning_instagram"
              value={s.handle}
              onChange={(e) => setSettings((prev) => ({ ...prev, handle: e.target.value }))}
            />
          </Field>
          <Note>Chekda ko'rsatiladi</Note>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '14px' }}>
            Instagram QR kod
          </label>
          {s.qrCodeBase64 && (
            <div style={{ marginBottom: '1rem', padding: '1rem', border: '1px solid var(--border)', borderRadius: '8px', textAlign: 'center' }}>
              <img src={s.qrCodeBase64} alt="Instagram QR kod" style={{ maxWidth: '200px', maxHeight: '200px' }} />
              <div style={{ marginTop: '0.5rem' }}>
                <Button variant="danger" size="sm" onClick={handleRemoveQR}>Olib tashlash</Button>
              </div>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
          <Button
            variant="secondary"
            icon="upload"
            onClick={() => fileInputRef.current?.click()}
          >
            QR kod yuklash
          </Button>
          <Note>PNG, JPG yoki boshqa rasm formatlari</Note>
        </div>
      </div>

      <SaveBar dirty={dirty} onSave={handleSave} />
    </>
  )
}
