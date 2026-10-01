/**
 * Forma elementlari: Field (yorliq+xato), Input, TextArea, Select, MoneyInput.
 *
 *   <Field label="Xona nomi" error={err} hint="Masalan: VIP-1">
 *     <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nomi" />
 *   </Field>
 *   <Field label="Narx (soatiga)"><MoneyInput value={price} onChange={setPrice} /></Field>
 *   <Field label="Rol"><Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
 *     <option value="cashier">Kassir</option></Select></Field>
 *
 * Input/Select/TextArea — oddiy HTML atributlarini qabul qiladi (forwardRef bor).
 *   size: 'md' 56px (standart) | 'lg' 68px ;  icon — chapdagi ikon ;  invalid — qizil chegara.
 * MoneyInput — raqam (so'm) qiymati, ko'rinishda "1 250 000" probellar bilan; `suffix` standart "so'm".
 * Field: label, hint, error (error bo'lsa hint o'rniga qizil matn), required (yulduzcha), inline (yorliq chapda).
 *   as="div" — <label> o'ramaydi (role="group"): ichida tugmalar bo'lsa (Segmented, Stepper, chiplar) shuni ishlating,
 *   aks holda yorliqni bosish birinchi tugmani "bosib" yuboradi.
 */
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cx } from './cx'
import { Icon, type IconName } from './Icon'
import { formatMoney } from '@shared/billing'

export interface FieldProps {
  label?: ReactNode
  hint?: ReactNode
  error?: ReactNode
  required?: boolean
  inline?: boolean
  /** 'label' (standart) — input/select uchun; 'div' — tugmalar guruhi (Segmented, Stepper, chiplar) uchun */
  as?: 'label' | 'div'
  className?: string
  /** Yorliqni bog'lash uchun id (bermasangiz ichki element bilan avtomatik bog'lanmaydi — label baribir o'rab oladi) */
  children: ReactNode
}

export function Field({ label, hint, error, required, inline, as = 'label', className, children }: FieldProps) {
  const labelId = useId()
  const cls = cx('ui-field', inline && 'ui-field--inline', error ? 'is-invalid' : undefined, className)
  const head = label && (
    <span className="ui-field__label" id={as === 'div' ? labelId : undefined}>
      {label}
      {required && <span className="ui-field__req">*</span>}
    </span>
  )
  const foot = error ? <span className="ui-field__error">{error}</span> : hint ? <span className="ui-field__hint">{hint}</span> : null
  if (as === 'div') {
    return (
      <div className={cls} role="group" aria-labelledby={label ? labelId : undefined}>
        {head}
        <div className="ui-field__control">{children}</div>
        {foot}
      </div>
    )
  }
  return (
    <label className={cls}>
      {head}
      <span className="ui-field__control">{children}</span>
      {foot}
    </label>
  )
}

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: 'md' | 'lg'
  icon?: IconName
  invalid?: boolean
  /** O'ng tomondagi matn/element (masalan "so'm") */
  suffix?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { size = 'md', icon, invalid, suffix, className, ...rest }, ref
) {
  return (
    <span className={cx('ui-input', 'ui-input--' + size, invalid && 'is-invalid', rest.disabled && 'is-disabled', className)}>
      {icon && <Icon name={icon} size={22} className="ui-input__icon" />}
      <input ref={ref} className="ui-input__el" aria-invalid={invalid || undefined} {...rest} />
      {suffix != null && <span className="ui-input__suffix">{suffix}</span>}
    </span>
  )
})

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea({ invalid, className, rows = 3, ...rest }, ref) {
  return <textarea ref={ref} rows={rows} className={cx('ui-textarea', invalid && 'is-invalid', className)} {...rest} />
})

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  size?: 'md' | 'lg'
  invalid?: boolean
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ size = 'md', invalid, className, children, ...rest }, ref) {
  return (
    <span className={cx('ui-select', 'ui-input--' + size, invalid && 'is-invalid', className)}>
      <select ref={ref} className="ui-select__el" {...rest}>
        {children}
      </select>
      <Icon name="chevronDown" size={22} className="ui-select__chev" />
    </span>
  )
})

export interface MoneyInputProps extends Omit<InputProps, 'value' | 'onChange' | 'type'> {
  value: number
  onChange: (v: number) => void
  /** Maksimal qiymat (standart 999 999 999) */
  max?: number
}

export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(function MoneyInput(
  { value, onChange, max = 999_999_999, suffix = "so'm", ...rest }, ref
) {
  const id = useId()
  return (
    <Input
      {...rest}
      ref={ref}
      id={rest.id ?? id}
      inputMode="numeric"
      autoComplete="off"
      className={cx('ui-input--money', rest.className)}
      value={value ? formatMoney(value) : ''}
      placeholder={rest.placeholder ?? '0'}
      suffix={suffix}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, '')
        const n = digits ? Math.min(max, parseInt(digits, 10)) : 0
        onChange(n)
      }}
    />
  )
})
