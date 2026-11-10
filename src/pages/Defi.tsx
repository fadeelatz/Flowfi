import { useState } from 'react'
import { PageHeader, Tabs } from '@/components/ui'
import { SwapPanel } from '@/components/SwapPanel'
import { BridgePanel } from '@/components/BridgePanel'
import { PoolsPanel } from '@/components/PoolsPanel'

type Tab = 'swap' | 'bridge' | 'pools'

export function Defi({ tab: initial }: { tab?: string }) {
  const [tab, setTab] = useState<Tab>((initial as Tab) || 'swap')
  return (
    <>
      <PageHeader title="DeFi" subtitle="Swap USDC and EURC, bridge USDC across chains with CCTP, and manage liquidity. Every quote and status comes from the live service or the chain." />
      <div className="mb-6 flex justify-center sm:justify-start">
        <Tabs value={tab} onChange={setTab} items={[{ id: 'swap', label: 'Swap' }, { id: 'bridge', label: 'Bridge' }, { id: 'pools', label: 'Pools' }]} />
      </div>
      {tab === 'swap' && <SwapPanel />}
      {tab === 'bridge' && <BridgePanel />}
      {tab === 'pools' && <PoolsPanel />}
    </>
  )
}
