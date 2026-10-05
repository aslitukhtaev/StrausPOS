/**
 * Tarix: ikki tab.
 *  - Sessiyalar: yopilgan hisoblar (reports.sessions), "Chek" tugmasi, tafsilot (sessions.detail).
 *  - Sotuvlar: qaysi xodim nima sotgan (sessions.soldItems).
 */
import { useState } from 'react'
import type { ReportRange } from '@shared/types'
import { PageHeader, Tabs, getNow } from '@/ui'
import { presetRange } from './common'
import { DateFilter } from './DateFilter'
import { SessionsTab } from './SessionsTab'
import { SoldTab } from './SoldTab'
import './history.css'

type Tab = 'sessions' | 'sold'

export default function HistoryScreen() {
  const [tab, setTab] = useState<Tab>('sessions')
  const [range, setRange] = useState<ReportRange>(() => presetRange('today', getNow()))
  return (
    <div className="hist" data-testid="history-screen">
      <PageHeader title="Tarix" subtitle="Yopilgan hisoblar, cheklar va kim nima sotgani" icon="clock" />
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { id: 'sessions', label: 'Sessiyalar', icon: 'receipt' },
          { id: 'sold', label: 'Sotuvlar', icon: 'user' }
        ]}
      />
      <div className="hist-filters"><DateFilter onChange={setRange} /></div>
      {tab === 'sessions' ? <SessionsTab range={range} /> : <SoldTab range={range} />}
    </div>
  )
}
