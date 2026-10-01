/**
 * Avatar — ism bosh harflari bilan doira. Rang ismdan barqaror tanlanadi.
 *   <Avatar name="Jasur Karimov" size={56} />
 */
import { initials } from './format'

const HUES = ['#e3b15a', '#5aa7ff', '#3ccf8e', '#c78bff', '#ff8f6b', '#4fd1d9', '#f27ea9', '#a3c95b']

export function Avatar({ name, size = 48, className }: { name: string; size?: number; className?: string }) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  const color = HUES[h % HUES.length]
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
