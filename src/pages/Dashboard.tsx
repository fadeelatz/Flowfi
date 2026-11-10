import type { ReactNode } from 'react'
import { ConnectKitButton } from 'connectkit'
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, CheckCircle2, Clock, FileText, Layers, Receipt, Wallet } from 'lucide-react'
import { TokenUSDC } from '@web3icons/react'
import { addressUrl } from '@/lib/chain'
import { fmtUsdc, shortAddr } from '@/lib/format'
import { bucketFlows, totals } from '@/lib/analytics'
import { displayStatus } from '@/lib/invoice'
import { useFlowFi } from '@/state'
import { usePools } from '@/hooks/usePools'
import { Card, CopyButton, EmptyState, Money, Spinner, StatusBadge } from '@/components/ui'
import { FlowChart, Sparkline } from '@/components/FlowChart'
import { TxRow } from '@/components/TxRow'
import type { View } from '@/lib/types'

type Go = (v: View, tab?: string) => void

function Stat({ label, value, sub, icon, tone }: { label: string; value: string; sub?: string; icon: ReactNode; tone: string }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2.5">
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${tone}`}>{icon}</span>
        <span className="text-sm text-muted">{label}</span>
      </div>
      <p className="num mt-3 font-display text-[28px] font-semibold tracking-tight text-ink">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </Card>
  )
}

export function Dashboard({ go }: { go: Go }) {
  const { address, isConnected, balance, transfers, invoices, txNotes, scanProgress, scanError } = useFlowFi()
  const pools = usePools(address)
  const { received, sent } = totals(transfers, address)
  const flows = bucketFlows(transfers, address)
  const sum = (list: typeof invoices) => list.reduce((s, i) => s + BigInt(i.amount), 0n)
  const live = invoices.filter((i) => i.status !== 'cancelled')
  const paid = invoices.filter((i) => i.status === 'paid')
  const unpaid = invoices.filter((i) => i.status === 'pending')
  const overdue = unpaid.filter((i) => displayStatus(i) === 'overdue')
  const current = unpaid.filter((i) => displayStatus(i) !== 'overdue')
  const unpaidTotal = sum(unpaid)
  const currentPct = unpaidTotal > 0n ? Number((sum(current) * 100n) / unpaidTotal) : 0
  const behind = scanProgress ? scanProgress.head - scanProgress.cursor + 1n : null

  const totalIn = flows.received.reduce((a, b) => a + b, 0)
  const totalOut = flows.sent.reduce((a, b) => a + b, 0)
  const net = totalIn - totalOut
  const cumulative = flows.received.map((_, i) => flows.received.slice(0, i + 1).reduce((a, b) => a + b, 0) - flows.sent.slice(0, i + 1).reduce((a, b) => a + b, 0))
  const usd = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  if (!isConnected || !address) {
    return (
      <Card className="card-pad mx-auto mt-10 max-w-lg text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15 text-accent">
          <Wallet className="h-6 w-6" />
        </div>
        <h1 className="font-display text-2xl font-semibold">Welcome to FlowFi</h1>
        <p className="mx-auto mt-2 max-w-sm text-pretty text-sm text-muted">Connect a wallet to send USDC, invoice customers, automate payouts and use DeFi on Arc Testnet.</p>
        <div className="mt-6 flex justify-center">
          <ConnectKitButton.Custom>{({ show }) => <button onClick={show} className="btn-primary px-6">Connect wallet</button>}</ConnectKitButton.Custom>
        </div>
      </Card>
    )
  }

  const actions = [
    { label: 'Send', icon: <ArrowUpRight className="h-[18px] w-[18px]" />, run: () => go('payments', 'send') },
    { label: 'Receive', icon: <ArrowDownLeft className="h-[18px] w-[18px]" />, run: () => go('payments', 'receive') },
    { label: 'Invoice', icon: <FileText className="h-[18px] w-[18px]" />, run: () => go('invoices', 'new') },
    { label: 'Swap', icon: <ArrowLeftRight className="h-[18px] w-[18px]" />, run: () => go('defi', 'swap') },
  ]

  return (
    <div className="space-y-5">
      <h1 className="sr-only">Dashboard</h1>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="card-pad lg:col-span-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm text-muted"><TokenUSDC variant="branded" size={18} /> Portfolio summary</span>
            <div className="flex items-center gap-2">
              <a href={addressUrl(address)} target="_blank" rel="noopener noreferrer" className="inset hidden px-3 py-1.5 font-mono text-xs text-muted hover:text-ink sm:inline-flex">{shortAddr(address, 8, 6)}</a>
              <CopyButton value={address} label="Copy" />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs text-muted">Total USDC balance</p>
              <p className="mt-1 font-display text-5xl font-semibold tracking-[-0.03em] text-ink sm:text-6xl">
                {balance === undefined ? <Spinner className="h-8 w-8" /> : <Money value={fmtUsdc(balance)} />}
              </p>
              <p className={`num mt-2 text-sm font-medium ${net >= 0 ? 'text-ok' : 'text-bad'}`}>
                {net >= 0 ? '+' : '-'}{usd(Math.abs(net))} <span className="font-normal text-muted">net flow, 14 days</span>
              </p>
            </div>
            <div className="hidden sm:block"><Sparkline values={cumulative} width={190} height={64} /></div>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {actions.map((a) => (
              <button key={a.label} onClick={a.run} className="btn-ghost !min-h-[64px] flex-col gap-1.5 py-3 hover:shadow-glow">
                <span className="text-accent">{a.icon}</span>
                {a.label}
              </button>
            ))}
          </div>
        </Card>

        <Card className="card-pad">
          <p className="font-display text-base font-semibold">Total Receivables</p>
          <p className="mt-1 text-xs text-muted">Total unpaid invoices <span className="num font-semibold text-ink">{fmtUsdc(unpaidTotal)} USDC</span></p>
          <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-bad/25" role="img" aria-label="Current versus overdue share of unpaid invoices">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${unpaidTotal > 0n ? currentPct : 0}%` }} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-accent">Current</p>
              <p className="num mt-1 font-display text-xl font-semibold">{fmtUsdc(sum(current))}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-bad">Overdue</p>
              <p className="num mt-1 font-display text-xl font-semibold">{fmtUsdc(sum(overdue))}</p>
            </div>
          </div>
          <button className="btn-ghost mt-5 w-full" onClick={() => go('invoices')}>View invoices</button>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
        <Stat label="Total invoiced" value={fmtUsdc(sum(live))} sub={`${live.length} invoice${live.length === 1 ? '' : 's'}`} icon={<Receipt className="h-4 w-4" />} tone="bg-accent/15 text-accent" />
        <Stat label="Paid invoices" value={fmtUsdc(sum(paid))} sub={`${paid.length} confirmed onchain`} icon={<CheckCircle2 className="h-4 w-4" />} tone="bg-ok/15 text-ok" />
        <Stat label="Pending invoices" value={fmtUsdc(unpaidTotal)} sub={`${unpaid.length} awaiting payment`} icon={<Clock className="h-4 w-4" />} tone="bg-warn/15 text-warn" />
        <Stat label="DeFi portfolio" value={pools.configured ? fmtUsdc(pools.positionsValue) : '0.00'} sub={pools.configured ? `${pools.positions.length} liquidity position${pools.positions.length === 1 ? '' : 's'}` : 'No liquidity positions yet'} icon={<Layers className="h-4 w-4" />} tone="bg-teal/15 text-teal" />
      </div>

      <Card className="card-pad">
        <h2 className="font-display text-base font-semibold">Cash Flow</h2>
        <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_220px]">
          <FlowChart labels={flows.labels} series={[{ label: 'Incoming', color: 'rgb(var(--c-accent))', values: flows.received }, { label: 'Outgoing', color: 'rgb(var(--c-bad))', values: flows.sent }]} />
          <div className="grid grid-cols-3 gap-4 border-t border-line/40 pt-4 lg:grid-cols-1 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <div>
              <p className="text-xs font-medium text-accent">Net, last 14 days</p>
              <p className="num mt-1 font-display text-2xl font-semibold">{net < 0 ? '-' : ''}{usd(Math.abs(net))}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-ok">Incoming (total)</p>
              <p className="num mt-1 font-display text-2xl font-semibold">{fmtUsdc(received)}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-bad">Outgoing (total)</p>
              <p className="num mt-1 font-display text-2xl font-semibold">{fmtUsdc(sent)}</p>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="card-pad lg:col-span-3">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="font-display text-base font-semibold">Recent transactions</h2>
            <button className="text-xs font-medium text-accent hover:underline" onClick={() => go('payments', 'history')}>View all</button>
          </div>
          {transfers.length === 0 ? (
            <EmptyState icon={<Receipt className="h-5 w-5" />} title="No transactions yet" body="USDC you send or receive on Arc Testnet will appear here once confirmed onchain." />
          ) : (
            <div className="divide-y divide-line/40">
              {transfers.slice(0, 5).map((t) => <TxRow key={`${t.hash}:${t.logIndex}`} t={t} me={address} note={txNotes.find((n) => n.hash === t.hash)} />)}
            </div>
          )}
          <p className="mt-3 text-[11px] leading-relaxed text-muted">{scanError ? scanError : behind !== null && behind > 50n ? `Syncing history: ${behind.toString()} blocks remaining.` : 'History is in sync with the latest block.'}</p>
        </Card>

        <Card className="card-pad lg:col-span-2">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="font-display text-base font-semibold">Active invoices</h2>
            <button className="text-xs font-medium text-accent hover:underline" onClick={() => go('invoices')}>Manage</button>
          </div>
          {unpaid.length === 0 ? (
            <EmptyState icon={<FileText className="h-5 w-5" />} title="No open invoices" body="Create an invoice and share its payment link. It is marked paid once the payment confirms onchain." action={<button className="btn-primary" onClick={() => go('invoices', 'new')}>Create invoice</button>} />
          ) : (
            <div className="divide-y divide-line/40">
              {unpaid.slice(0, 4).map((i) => (
                <div key={i.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{i.customerName || shortAddr(i.customer)}</p>
                    <p className="text-xs text-muted">{i.number}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <p className="num text-sm font-semibold">{fmtUsdc(i.amount)} USDC</p>
                    <StatusBadge status={displayStatus(i)} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
