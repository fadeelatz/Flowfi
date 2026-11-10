import { useCallback, useState } from 'react'
import { FlowFiProvider } from '@/state'
import { Shell } from '@/components/Shell'
import { Dashboard } from '@/pages/Dashboard'
import { Payments } from '@/pages/Payments'
import { Invoices } from '@/pages/Invoices'
import { Defi } from '@/pages/Defi'
import { Automation } from '@/pages/Automation'
import { Escrow } from '@/pages/Escrow'
import { Settings } from '@/pages/Settings'
import { PayInvoice } from '@/pages/PayInvoice'
import type { View } from '@/lib/types'

interface Nav {
  view: View
  tab?: string
}

export default function App() {
  const invoiceParam = new URLSearchParams(window.location.search).get('inv')
  const [nav, setNav] = useState<Nav>({ view: 'dashboard' })
  const go = useCallback((view: View, tab?: string) => setNav({ view, tab }), [])

  return (
    <FlowFiProvider>
      {invoiceParam ? (
        <PayInvoice encoded={invoiceParam} />
      ) : (
        <Shell view={nav.view} setView={(v) => go(v)}>
          {nav.view === 'dashboard' && <Dashboard go={go} />}
          {nav.view === 'payments' && <Payments key={nav.tab} tab={nav.tab} />}
          {nav.view === 'invoices' && <Invoices key={nav.tab} tab={nav.tab} />}
          {nav.view === 'defi' && <Defi key={nav.tab} tab={nav.tab} />}
          {nav.view === 'automation' && <Automation />}
          {nav.view === 'escrow' && <Escrow />}
          {nav.view === 'settings' && <Settings />}
        </Shell>
      )}
    </FlowFiProvider>
  )
}
