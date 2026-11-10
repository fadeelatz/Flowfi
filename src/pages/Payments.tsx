import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { ArrowUpRight, CheckCircle2, History as HistoryIcon, RefreshCw } from 'lucide-react'
import { CHAIN_ID, USDC_ADDRESS } from '@/lib/chain'
import { fmtUsdc, isValidAddress, parseAmountInput, parseTxError, shortAddr } from '@/lib/format'
import { same } from '@/lib/invoice'
import { useFlowFi } from '@/state'
import { useSendUsdc } from '@/hooks/useSendUsdc'
import { Card, CopyButton, EmptyState, Field, Notice, PageHeader, Spinner, StatusBadge, Tabs, TxLink } from '@/components/ui'
import { TxRow } from '@/components/TxRow'
import { toast } from 'sonner'
import type { Hex } from 'viem'

type Tab = 'send' | 'receive' | 'history'

function Send() {
  const { address, isConnected, balance } = useFlowFi()
  const { send, confirm } = useSendUsdc()
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [phase, setPhase] = useState<'idle' | 'signing' | 'confirming' | 'done' | 'failed'>('idle')
  const [hash, setHash] = useState<Hex>()
  const [error, setError] = useState<string | null>(null)

  const addrOk = isValidAddress(to)
  const addrError = !to ? null : !addrOk ? 'Enter a valid 0x wallet address' : same(to, address) ? 'You cannot send to your own address' : same(to, USDC_ADDRESS) ? 'That is the USDC contract, not a wallet' : /^0x0{40}$/.test(to) ? 'The zero address is not allowed' : null
  const parsed = parseAmountInput(amount, balance)
  const amountError = amount && !parsed.ok ? parsed.error : null
  const ready = isConnected && addrOk && !addrError && parsed.ok && phase !== 'signing' && phase !== 'confirming'

  const submit = async () => {
    if (!parsed.ok || !addrOk) return
    setError(null)
    setPhase('signing')
    try {
      const h = await send(to.trim() as `0x${string}`, parsed.raw, 'send', note.trim() || undefined)
      setHash(h)
      setPhase('confirming')
      const ok = await confirm(h)
      setPhase(ok ? 'done' : 'failed')
      if (ok) toast.success('Payment confirmed onchain')
      else setError('The transaction was included but reverted.')
    } catch (e) {
      const msg = parseTxError(e)
      setPhase('idle')
      if (msg) setError(msg)
    }
  }

  if (phase === 'done' && hash) {
    return (
      <Card className="card-pad mx-auto max-w-lg text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-ok" />
        <h2 className="mt-3 font-display text-xl font-semibold">Payment confirmed</h2>
        <p className="num mt-1 text-sm text-muted">
          {amount} USDC sent to <span className="font-mono">{shortAddr(to)}</span>
        </p>
        <div className="mt-3 flex justify-center">
          <TxLink hash={hash} />
        </div>
        <button
          className="btn-primary mt-6"
          onClick={() => {
            setPhase('idle')
            setTo('')
            setAmount('')
            setNote('')
            setHash(undefined)
          }}
        >
          Send another
        </button>
      </Card>
    )
  }

  return (
    <Card className="card-pad mx-auto max-w-lg">
      <div className="space-y-5">
        <Field label="Recipient address" error={addrError}>
          <input className="input font-mono" placeholder="0x…" value={to} onChange={(e) => setTo(e.target.value)} spellCheck={false} autoComplete="off" />
        </Field>
        <Field label="Amount (USDC)" error={amountError}>
          <div className="relative">
            <input className="input num pr-20 text-lg" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-accent/15 px-2.5 py-1 text-xs font-semibold text-accent" onClick={() => balance !== undefined && setAmount((Number(balance) / 1e6).toFixed(6).replace(/\.?0+$/, ''))}>
              MAX
            </button>
          </div>
          <p className="mt-1.5 text-xs text-muted">Balance: {balance === undefined ? '…' : fmtUsdc(balance)} USDC</p>
        </Field>
        <Field label="Note (optional, saved on this device)">
          <input className="input" maxLength={80} placeholder="What is this for?" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="inset space-y-1.5 p-3.5 text-xs text-muted">
          <div className="flex justify-between"><span>Network</span><span className="text-ink">Arc Testnet</span></div>
          <div className="flex justify-between"><span>Network fee</span><span className="text-ink">Paid in USDC, shown by your wallet</span></div>
        </div>
        {error && <Notice tone="bad">{error}</Notice>}
        <button className="btn-primary w-full" disabled={!ready} onClick={() => void submit()}>
          {phase === 'signing' ? (<><Spinner /> Confirm in your wallet</>) : phase === 'confirming' ? (<><Spinner /> Waiting for confirmation</>) : (<><ArrowUpRight className="h-4 w-4" /> Send USDC</>)}
        </button>
        {!isConnected && <p className="text-center text-xs text-muted">Connect your wallet to send.</p>}
        {phase === 'confirming' && hash && (
          <p className="text-center text-xs text-muted">Submitted: <TxLink hash={hash} /></p>
        )}
      </div>
    </Card>
  )
}

function Receive() {
  const { address } = useFlowFi()
  const [amount, setAmount] = useState('')
  if (!address) return <Notice>Connect a wallet to get your payment address.</Notice>
  const parsed = amount ? parseAmountInput(amount) : null
  // EIP-681 request for an ERC-20 transfer; plain address when no amount is set.
  const value = parsed?.ok ? `ethereum:${USDC_ADDRESS}@${CHAIN_ID}/transfer?address=${address}&uint256=${parsed.raw.toString()}` : address
  return (
    <Card className="card-pad mx-auto max-w-lg text-center">
      <p className="kicker">Your payment address</p>
      <div className="mx-auto mt-4 w-fit rounded-2xl bg-white p-4 shadow-glow">
        <QRCodeSVG value={value} size={196} fgColor="#0b1220" bgColor="#ffffff" level="M" />
      </div>
      <p className="mt-4 break-all font-mono text-xs text-muted">{address}</p>
      <div className="mt-3 flex justify-center gap-2">
        <CopyButton value={address} label="Copy address" />
      </div>
      <div className="mx-auto mt-6 max-w-xs text-left">
        <Field label="Request a specific amount (optional)" error={amount && parsed && !parsed.ok ? parsed.error : null} hint="Adds the amount to the QR code for wallets that support payment requests.">
          <input className="input num" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
      </div>
      <p className="mt-5 text-xs text-muted">Only send USDC on Arc Testnet to this address. Funds sent on other networks may be lost.</p>
    </Card>
  )
}

function History() {
  const { address, transfers, txNotes, scanProgress, scanError, rescan } = useFlowFi()
  const [filter, setFilter] = useState<'all' | 'sent' | 'received'>('all')
  const rows = transfers.filter((t) => (filter === 'all' ? true : filter === 'sent' ? same(t.from, address) : same(t.to, address)))
  const unsettled = txNotes.filter((n) => n.status !== 'confirmed')
  const behind = scanProgress ? scanProgress.head - scanProgress.cursor + 1n : null
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      {unsettled.length > 0 && (
        <Card className="card-pad">
          <h3 className="font-display text-sm font-semibold">Submitted from FlowFi</h3>
          <div className="mt-2 divide-y divide-line/40">
            {unsettled.slice(0, 6).map((n) => (
              <div key={n.hash} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="text-sm">{fmtUsdc(n.amount)} USDC to <span className="font-mono text-[13px]">{shortAddr(n.to)}</span></p>
                  <TxLink hash={n.hash} />
                </div>
                <StatusBadge status={n.status} />
              </div>
            ))}
          </div>
        </Card>
      )}
      <Card className="card-pad">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <Tabs value={filter} onChange={setFilter} items={[{ id: 'all', label: 'All' }, { id: 'sent', label: 'Sent' }, { id: 'received', label: 'Received' }]} />
          <button className="btn-ghost min-h-[38px] text-xs" onClick={rescan}><RefreshCw className="h-3.5 w-3.5" /> Rescan</button>
        </div>
        {rows.length === 0 ? (
          <EmptyState icon={<HistoryIcon className="h-5 w-5" />} title="Nothing here yet" body="Confirmed USDC transfers to and from your wallet are read directly from Arc Testnet." />
        ) : (
          <div className="divide-y divide-line/40">
            {rows.map((t) => (
              <TxRow key={`${t.hash}:${t.logIndex}`} t={t} me={address} note={txNotes.find((n) => n.hash === t.hash)} />
            ))}
          </div>
        )}
        <p className="mt-3 text-[11px] text-muted">
          {scanError ?? (scanProgress ? (behind !== null && behind > 50n ? `Syncing: ${behind.toString()} blocks remaining.` : `Synced through block ${(scanProgress.cursor - 1n).toString()}.`) : 'Starting scan…')} History covers a recent window of Arc Testnet blocks.
        </p>
      </Card>
    </div>
  )
}

export function Payments({ tab: initial }: { tab?: string }) {
  const [tab, setTab] = useState<Tab>((initial as Tab) || 'send')
  return (
    <>
      <PageHeader title="Payments" subtitle="Send USDC, receive it by address or QR code, and review confirmed history." />
      <div className="mb-6 flex justify-center sm:justify-start">
        <Tabs value={tab} onChange={setTab} items={[{ id: 'send', label: 'Send' }, { id: 'receive', label: 'Receive' }, { id: 'history', label: 'History' }]} />
      </div>
      {tab === 'send' && <Send />}
      {tab === 'receive' && <Receive />}
      {tab === 'history' && <History />}
    </>
  )
}
