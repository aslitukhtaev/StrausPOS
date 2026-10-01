import { useEffect, useState } from 'react'
import { api } from '@/api'
import { Button, Field, Input, Segmented, toast } from '@/ui'
import { useStaff } from '@/store/auth'
import { ROLE_LABELS } from '@shared/permissions'
import { FieldBox, Note, SaveBar, SectionHead, SwitchRow, useReportDirty, type SectionProps } from './common'

const AUTO_LOCK = [0, 1, 2, 5, 10, 30]

export function SecuritySection({ settings, save, onDirty }: SectionProps) {
  const staff = useStaff()
  const [lockEnabled, setLockEnabled] = useState(settings.lockEnabled)
  const [autoLock, setAutoLock] = useState(settings.autoLockMinutes)
  const [saving, setSaving] = useState(false)

  const [pin1, setPin1] = useState('')
  const [pin2, setPin2] = useState('')
  const [pinSaving, setPinSaving] = useState(false)

  useEffect(() => {
    setLockEnabled(settings.lockEnabled)
    setAutoLock(settings.autoLockMinutes)
  }, [settings.lockEnabled, settings.autoLockMinutes])

  const dirty = lockEnabled !== settings.lockEnabled || autoLock !== settings.autoLockMinutes
  const pinDirty = pin1.length > 0 || pin2.length > 0
  useReportDirty(dirty || pinDirty, onDirty)

  const onSave = async () => {
    setSaving(true)
    await save({ ...settings, lockEnabled, autoLockMinutes: autoLock }, 'Xavfsizlik sozlamalari saqlandi')
    setSaving(false)
  }

  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 8)
  const pin1Err = pin1 && pin1.length < 4 ? "PIN 4–8 ta raqamdan iborat bo'lsin" : null
  const pin2Err = pin2 && pin1 !== pin2 && pin2.length >= pin1.length ? 'PINlar bir xil emas' : null
  const pinOk = pin1.length >= 4 && pin1 === pin2

  const changePin = async () => {
    if (!staff || !pinOk) return
    setPinSaving(true)
    try {
      await api.staff.changePin(staff.id, pin1)
      toast.success('PIN o\'zgartirildi', { description: 'Keyingi kirishda yangi PIN bilan kiring' })
      setPin1('')
      setPin2('')
    } catch (e) {
      toast.error(e)
    } finally {
      setPinSaving(false)
    }
  }

  return (
    <div className="set-section">
      <SectionHead icon="shield" title="Xavfsizlik" description="Qulf ekrani va kirish PIN kodi" />
      <div className="set-section__body">
        <div className="set-group">
          <div className="set-group__title">Qulf ekrani</div>
          <SwitchRow
            checked={lockEnabled}
            onChange={setLockEnabled}
            title="Qulf ekrani yoqilgan"
            description="Xodim PIN bilan kiradi; yuqoridagi qulf tugmasi bilan ekranni yopish mumkin"
            testId="sec-lock"
          />
          <FieldBox
            label="Avtomatik qulflash"
            hint={
              !lockEnabled
                ? 'Avval qulf ekranini yoqing'
                : autoLock === 0
                  ? "Ekran o'zi qulflanmaydi"
                  : `${autoLock} daqiqa hech narsa bosilmasa ekran o'zi qulflanadi`
            }
          >
            <Segmented
              block
              size="lg"
              value={autoLock}
              onChange={setAutoLock}
              options={AUTO_LOCK.map((m) => ({ value: m, label: m === 0 ? 'Hech qachon' : `${m} daq`, disabled: !lockEnabled }))}
            />
          </FieldBox>
        </div>

        <div className="set-group">
          <div className="set-group__title">
            PIN kodni o'zgartirish
            {staff && <span className="set-group__sub"> · {staff.name} ({ROLE_LABELS[staff.role]})</span>}
          </div>
          <form
            className="set-form__row"
            onSubmit={(e) => {
              e.preventDefault()
              void changePin()
            }}
          >
            <Field label="Yangi PIN" error={pin1Err} hint="4–8 ta raqam">
              <Input
                size="lg"
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                icon="key"
                value={pin1}
                onChange={(e) => setPin1(digits(e.target.value))}
                invalid={!!pin1Err}
                data-testid="pin1"
              />
            </Field>
            <Field label="Yangi PIN (qayta)" error={pin2Err} hint={pinOk ? 'PINlar mos ✓' : 'Xato bo\'lmasligi uchun qayta kiriting'}>
              <Input
                size="lg"
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                icon="key"
                value={pin2}
                onChange={(e) => setPin2(digits(e.target.value))}
                invalid={!!pin2Err}
                data-testid="pin2"
              />
            </Field>
            <button type="submit" hidden />
          </form>
          <div className="row">
            <Button icon="key" variant="success" onClick={() => void changePin()} disabled={!pinOk} loading={pinSaving} data-testid="pin-save">
              PINni o'zgartirish
            </Button>
            {pinDirty && (
              <Button variant="ghost" onClick={() => { setPin1(''); setPin2('') }}>Tozalash</Button>
            )}
          </div>
          <Note tone="warning" icon="alert">
            Yangi PINni unutmang va hech kimga aytmang. Ega PINi barcha sozlamalar va hisobotlarga kirish kaliti.
          </Note>
        </div>
      </div>
      <SaveBar dirty={dirty} saving={saving} onSave={() => void onSave()} onReset={() => { setLockEnabled(settings.lockEnabled); setAutoLock(settings.autoLockMinutes) }} />
    </div>
  )
}
