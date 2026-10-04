import { useEffect } from 'react'
import { LicensePanel } from '@/layout/LicensePanel'
import { useLicense } from '@/store/license'
import { SectionHead } from './common'

/** Sozlamalar → Litsenziya: holat, kompyuter kodi, kalit kiritish (aktivatsiya oynasi bilan bir xil panel) */
export function LicenseSection() {
  useEffect(() => {
    void useLicense.getState().load()
  }, [])
  return (
    <div className="set-section">
      <SectionHead icon="key" title="Litsenziya" description="Sinov, faollashtirish va kalit muddati" />
      <div className="set-section__body">
        <LicensePanel />
      </div>
    </div>
  )
}
