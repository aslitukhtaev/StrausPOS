/**
 * ReceiptPreview — chekni (system.receiptHtml) xavfsiz iframe ichida ko'rsatadi.
 *
 *   <ReceiptPreview data={receipt} />                 // qog'oz kengligi data.settings.paperWidth dan
 *   <ReceiptPreview data={sampleReceiptData(settings)} width={58} scale={1.2} />
 *
 * - iframe `sandbox="allow-same-origin"` (skriptlar YO'Q) + `srcdoc`: chek ichidagi hech narsa ishga tushmaydi,
 *   faqat balandlikni o'lchash uchun hujjatni o'qiymiz.
 * - Ma'lumot o'zgarsa (masalan sozlamalarda jonli ko'rinish) — 150ms kechikish bilan qayta so'raladi.
 */
import { useEffect, useRef, useState } from 'react'
import type { ReceiptData } from '@shared/types'
import { api } from '@/api'
import { Button, Icon, Spinner, cx, errorMessage } from '@/ui'
import './checkout.css'

export interface ReceiptPreviewProps {
  data: ReceiptData
  /** Qog'oz kengligi (mm). Berilmasa data.settings.paperWidth */
  width?: 58 | 80
  /** Ekranda kattalashtirish (1 = haqiqiy o'lcham, 96dpi) */
  scale?: number
  /** Tashqi o'ram balandligi cheklovi (px) — oshsa ichida skroll */
  maxHeight?: number
  className?: string
}

const MM = 96 / 25.4

export function ReceiptPreview({ data, width, scale = 1, maxHeight, className }: ReceiptPreviewProps) {
  const paper: 58 | 80 = width ?? (data.settings.paperWidth === 58 ? 58 : 80)
  const pxWidth = Math.round(paper * MM)
  const [html, setHtml] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [height, setHeight] = useState(320)
  const [reloadKey, setReloadKey] = useState(0)
  const frameRef = useRef<HTMLIFrameElement>(null)

  const key = JSON.stringify(data) + '|' + paper
  useEffect(() => {
    let alive = true
    const t = setTimeout(() => {
      const payload: ReceiptData = { ...data, settings: { ...data.settings, paperWidth: paper } }
      api.system
        .receiptHtml(payload)
        .then((h) => {
          if (!alive) return
          setHtml(h)
          setError(null)
        })
        .catch((e: unknown) => {
          if (!alive) return
          setError(errorMessage(e))
        })
    }, html === null ? 0 : 150)
    return () => {
      alive = false
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reloadKey])

  const measure = () => {
    const f = frameRef.current
    try {
      const doc = f && f.contentDocument
      if (!doc || !doc.documentElement) return
      const h = Math.max(doc.documentElement.scrollHeight, doc.body ? doc.body.scrollHeight : 0)
      if (h > 0) setHeight(h)
    } catch {
      /* o'lchab bo'lmadi — standart balandlik qoladi */
    }
  }

  if (error && html === null) {
    return (
      <div className={cx('checkout-paper', 'checkout-paper--error', className)}>
        <Icon name="alert" size={28} />
        <div className="checkout-paper__err">{error}</div>
        <Button size="sm" icon="refresh" onClick={() => setReloadKey((k) => k + 1)}>
          Qayta urinish
        </Button>
      </div>
    )
  }

  return (
    <div
      className={cx('checkout-paper', className)}
      style={maxHeight ? { maxHeight } : undefined}
    >
      <div
        className="checkout-paper__sheet"
        style={{ width: Math.round(pxWidth * scale), height: Math.round(height * scale) }}
      >
        {html === null ? (
          <div className="checkout-paper__loading">
            <Spinner size={28} />
          </div>
        ) : (
          <iframe
            ref={frameRef}
            title="Chek"
            className="checkout-paper__frame"
            sandbox="allow-same-origin"
            srcDoc={html}
            onLoad={measure}
            scrolling="no"
            tabIndex={-1}
            style={{
              width: pxWidth,
              height,
              transform: scale !== 1 ? 'scale(' + scale + ')' : undefined
            }}
          />
        )}
      </div>
    </div>
  )
}
