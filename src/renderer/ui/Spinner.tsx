/** Spinner — yuklanish aylanasi. <Spinner size={24} /> (rang: currentColor) */
export function Spinner({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <span
      className={'ui-spinner' + (className ? ' ' + className : '')}
      style={{ width: size, height: size, borderWidth: Math.max(2, Math.round(size / 9)) }}
      role="status"
      aria-label="Yuklanmoqda"
    />
  )
}
