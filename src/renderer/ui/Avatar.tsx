/**
 * Avatar — ism bosh harflari bilan doira. Rang ismdan barqaror tanlanadi.
 *   <Avatar name="Jasur Karimov" size={56} />
 */
import { initials } from './format'

/** Rangi tokens.css dagi --avatar-1..8 (har rejimda o'qiladigan) */
const HUES = 8

export function Avatar({ name, size = 48, className }: { name: string; size?: number; className?: string }) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  const color = `var(--avatar-${(h % HUES) + 1})`
  return (
    <span
      className={'ui-avatar' + (className ? ' ' + className : '')}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38), color, borderColor: color }}
      aria-hidden
    >
      {initials(name)}
    </span>
  )
}
