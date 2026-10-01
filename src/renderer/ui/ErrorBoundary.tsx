/**
 * ErrorBoundary — ekran ichidagi kutilmagan xato butun ilovani yiqitmasligi uchun.
 * Qobiq (layout) har bir ekranni avtomatik o'raydi. `resetKey` o'zgarsa holat tozalanadi.
 */
import { Component, type ReactNode } from 'react'
import { EmptyState } from './EmptyState'
import { Button } from './Button'

interface Props {
  children: ReactNode
  resetKey?: unknown
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error) {
    // eslint-disable-next-line no-console
    console.error('[StrausPOS] ekran xatosi:', error)
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null })
  }

  render() {
    if (this.state.error) {
      return (
        <EmptyState
          size="lg"
          icon="alert"
          title="Bu bo'limda xatolik yuz berdi"
          description={this.state.error.message}
          action={<Button variant="primary" icon="refresh" onClick={() => this.setState({ error: null })}>Qayta urinish</Button>}
        />
      )
    }
    return this.props.children
  }
}
