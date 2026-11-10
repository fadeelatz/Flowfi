import { Moon, Sun, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import clsx from 'clsx'
import { AMM_FACTORY, AMM_ROUTER, CHAIN, CHAIN_ID, ESCROW_ADDRESS, EURC_ADDRESS, USDC_ADDRESS, addressUrl } from '@/lib/chain'
import { shortAddr } from '@/lib/format'
import { clearScope } from '@/lib/store'
import { useTheme } from '@/theme'
import { useFlowFi } from '@/state'
import { Card, CopyButton, PageHeader, StatusBadge } from '@/components/ui'

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 text-sm">
      <span className="text-muted">{k}</span>
      <span className="min-w-0 truncate text-right text-ink">{v}</span>
    </div>
  )
}

export function Settings() {
  const { theme, setTheme } = useTheme()
  const { address } = useFlowFi()
  const features: { name: string; ready: boolean; note: string }[] = [
    { name: 'USDC payments, invoices, automation', ready: true, note: 'Native USDC contract on Arc Testnet' },
    { name: 'Escrow', ready: !!ESCROW_ADDRESS, note: 'FlowFiEscrow contract deployed by this app' },
    { name: 'Swap (USDC / EURC)', ready: !!EURC_ADDRESS, note: 'Routed by Circle App Kit, needs liquidity on the route' },
    { name: 'CCTP bridge', ready: true, note: 'Circle App Kit, Arc Testnet and other CCTP testnets' },
    { name: 'Liquidity pools', ready: !!AMM_FACTORY && !!AMM_ROUTER, note: 'Needs a Uniswap V2 compatible factory and router (VITE_AMM_FACTORY, VITE_AMM_ROUTER)' },
  ]
  return (
    <>
      <PageHeader title="Settings" subtitle="Appearance, network details and local data." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="card-pad">
          <h2 className="font-display text-base font-semibold">Appearance</h2>
          <p className="mt-1 text-sm text-muted">Choose how FlowFi looks. Your choice is saved on this device.</p>
          <div className="mt-4 grid grid-cols-2 gap-3" role="radiogroup" aria-label="Theme">
            {([['dark', 'Dark', Moon], ['light', 'Light', Sun]] as const).map(([id, label, Icon]) => (
              <button
                key={id}
                role="radio"
                aria-checked={theme === id}
                onClick={() => setTheme(id)}
                className={clsx('flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-xl border text-sm font-semibold transition', theme === id ? 'border-accent/60 bg-accent/10 text-ink shadow-glow' : 'border-line/60 bg-surface2/40 text-muted hover:text-ink')}
              >
                <Icon className={clsx('h-5 w-5', theme === id && 'text-accent')} />
                {label}
              </button>
            ))}
          </div>
        </Card>

        <Card className="card-pad">
          <h2 className="font-display text-base font-semibold">Network</h2>
          <div className="mt-2 divide-y divide-line/40">
            <Row k="Network" v={CHAIN.name} />
            <Row k="Chain ID" v={CHAIN_ID} />
            <Row k="RPC" v={<span className="font-mono text-xs">{CHAIN.rpcUrls[0]}</span>} />
            <Row k="Explorer" v={<a className="text-accent hover:underline" href={CHAIN.explorerBase} target="_blank" rel="noopener noreferrer">{CHAIN.explorerBase.replace('https://', '')}</a>} />
            <Row k="USDC contract" v={<a className="font-mono text-xs text-accent hover:underline" href={addressUrl(USDC_ADDRESS)} target="_blank" rel="noopener noreferrer">{shortAddr(USDC_ADDRESS, 8, 6)}</a>} />
            <Row k="Gas token" v="USDC (native)" />
            {ESCROW_ADDRESS && <Row k="Escrow contract" v={<a className="font-mono text-xs text-accent hover:underline" href={addressUrl(ESCROW_ADDRESS)} target="_blank" rel="noopener noreferrer">{shortAddr(ESCROW_ADDRESS, 8, 6)}</a>} />}
          </div>
        </Card>

        <Card className="card-pad">
          <h2 className="font-display text-base font-semibold">Feature availability</h2>
          <div className="mt-2 divide-y divide-line/40">
            {features.map((f) => (
              <div key={f.name} className="flex items-start justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium">{f.name}</p>
                  <p className="text-xs text-muted">{f.note}</p>
                </div>
                <StatusBadge status={f.ready ? 'confirmed' : 'pending'} />
              </div>
            ))}
          </div>
        </Card>

        <Card className="card-pad">
          <h2 className="font-display text-base font-semibold">Wallet and local data</h2>
          <p className="mt-1 text-sm text-muted">Invoices, schedules, notes and notifications are stored in this browser for the connected wallet. Funds always stay in your wallet.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {address ? <><span className="inset px-3 py-2 font-mono text-xs">{shortAddr(address, 8, 6)}</span><CopyButton value={address} /></> : <span className="text-sm text-muted">No wallet connected</span>}
          </div>
          <button
            className="btn-danger mt-4"
            disabled={!address}
            onClick={() => {
              if (window.confirm('Delete all FlowFi records stored in this browser for this wallet? Onchain data is not affected.')) {
                clearScope(address)
                toast('Local data cleared')
              }
            }}
          >
            <Trash2 className="h-4 w-4" /> Clear local data
          </button>
        </Card>
      </div>
    </>
  )
}
