/**
 * Ilova oqimi: boot → (setup | lock) → shell. Global: toastlar, tasdiqlash oynasi, jonli soat.
 */
import { useEffect } from 'react'
import { useApp } from './store/app'
import { startClock } from './store/clock'
import { AppShell } from './layout/AppShell'
import LockScreen from './screens/Lock'
import SetupScreen from './screens/Setup'
import { Button, ConfirmHost, EmptyState, Logo, Spinner, ToastViewport } from './ui'
import Gallery from './ui/Gallery'

const SHOW_GALLERY = new URLSearchParams(location.search).has('gallery')

function Boot() {
  return (
    <div className="boot">
      <Logo size={88} className="boot__logo" />
      <Spinner size={32} />
    </div>
  )
}

export default function App() {
  const phase = useApp((s) => s.phase)
  const bootError = useApp((s) => s.bootError)
  const boot = useApp((s) => s.boot)

  useEffect(() => {
    startClock()
    if (!SHOW_GALLERY) void boot()
  }, [boot])

  if (SHOW_GALLERY) {
    return (
      <>
        <Gallery />
        <ToastViewport />
        <ConfirmHost />
      </>
    )
  }

  return (
    <>
      {phase === 'boot' && <Boot />}
      {phase === 'error' && (
        <div className="boot">
          <EmptyState
            size="lg"
            icon="alert"
            title="Dastur ishga tushmadi"
            description={bootError}
            action={<Button variant="primary" size="lg" icon="refresh" onClick={() => void boot()}>Qayta urinish</Button>}
          />
        </div>
      )}
      {phase === 'setup' && <SetupScreen />}
      {phase === 'lock' && <LockScreen />}
      {phase === 'shell' && <AppShell />}
      <ToastViewport />
      <ConfirmHost />
    </>
  )
}
