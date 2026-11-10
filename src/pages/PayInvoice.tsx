import { useMemo, useState } from 'react'
import { ConnectKitButton } from 'connectkit'
import { CheckCircle2, ShieldCheck } from 'lucide-react'
import type { Hex } from 'viem'
import { fmtDate, fmtUsdc, parseTxError, shortAddr } from '@/lib/format'
import { decodeInvoice, displayStatus, same, verifyInvoiceTx } from '@/lib/invoice'
import { useFlowFi } from '@/state'
import { useSendUsdc } from '@/hooks/useSendUsdc'
import { Card, Notice, Spinner, StatusBadge, TxLink } from '@/components/ui'
import { Logo } from '@/components/Shell'

/** Public payment page opened from an invoice link. */
export function PayInvoice({ encoded }: { encoded: string }) {
  const invoice = useMemo(() => decodeInvoice(encoded), [encoded])
  const { address, isConnected, balance } = useFlowFi()
  const { send, confirm } = useSendUsdc()
  const [phase, setPhase] = useState<'idle' | 'signing' | 'confirming' | 'verified' | 'failed'>('idle')
  const [hash, setHash] = useState<Hex>()
  const [error, setError] = useState<string | null>(null)

  const pay = async () => {
    if (!invoice) return
    setError(null)
    setPhase('signing')
    try {
      const h = await send(invoice.creator, BigInt(invoice.amount), 'invoice', `Invoice ${invoice.number}`)
      setHash(h)
      setPhase('confirming')
      const ok = await confirm(h)
      if (!ok) throw new Error('reverted')
      const res = await verifyInvoiceTx(invoice, h)
      if (!res.ok) {
        setError(res.reason)
        setPhase('failed')
        return
      }
      setPhase('verified')
    } catch (e) {
      const msg = parseTxError(e)
      setPhase('idle')
      if (msg) setError(msg)
    }
  }

  const wrongWallet = !!invoice && isConnected && !same(address, invoice.customer)
  const short = !!invoice && balance !== undefined && balance < BigInt(invoice.amount)
  const busy = phase === 'signing' || phase === 'confirming'

  return (
    <div className="min-h-dvh px-4 py-8">
      <div className="mx-auto max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <Logo size={30} />
          <span className="font-display text-lg font-semibold">FlowFi</span>
        </div>
        {!invoice ? (
          <Card className="card-pad">
            <Notice tone="bad">This payment link is invalid or was altered. Ask the sender for a new invoice link.</Notice>
          </Card>
        ) : (
          <Card className="card-pad">
            <div className="flex items-start justify-between">
              <div>
                <p className="kicker">Invoice {invoice.number}</p>
                <p className="num mt-2 font-display text-4xl font-semibold tracking-tight">{fmtUsdc(invoice.amount)} <span className="text-lg text-muted">USDC</span></p>
              </div>
              <StatusBadge status={displayStatus(invoice)} />
            </div>
            <div className="inset mt-5 divide-y divide-line/40 text-sm">
              {[
                ['Pay to', shortAddr(invoice.creator, 8, 6)],
                ['For', invoice.description],
                ['Billed to', invoice.customerName || shortAddr(invoice.customer)],
                ['Due', fmtDate(invoice.dueAt)],
                ['Network', 'Arc Testnet'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 px-3.5 py-2.5">
                  <span className="text-muted">{k}</span>
                  <span className="text-right">{v}</span>
                </div>
              ))}
            </div>

            {phase === 'verified' && hash ? (
              <div className="mt-6 text-center">
                <CheckCircle2 className="mx-auto h-12 w-12 text-ok" />
                <p className="mt-2 font-display text-lg font-semibold">Payment verified onchain</p>
                <p className="mt-1 text-sm text-muted">The sender's FlowFi will mark this invoice as paid once it syncs.</p>
                <div className="mt-2 flex justify-center"><TxLink hash={hash} /></div>
              </div>
            ) : (
              <div className="mt-6 space-y-3">
                {wrongWallet && <Notice tone="warn">This invoice is addressed to {shortAddr(invoice.customer)}. Connect that wallet to pay, otherwise the payment will not be matched to this invoice.</Notice>}
                {short && !wrongWallet && <Notice tone="warn">Your USDC balance ({fmtUsdc(balance)}) is below the invoice amount.</Notice>}
                {error && <Notice tone="bad">{error}</Notice>}
                {!isConnected ? (
                  <ConnectKitButton.Custom>
                    {({ show }) => <button onClick={show} className="btn-primary w-full">Connect wallet to pay</button>}
                  </ConnectKitButton.Custom>
                ) : (
                  <button className="btn-primary w-full" disabled={busy || wrongWallet || short || invoice.status !== 'pending'} onClick={() => void pay()}>
                    {phase === 'signing' ? (<><Spinner /> Confirm in your wallet</>) : phase === 'confirming' ? (<><Spinner /> Waiting for confirmation</>) : `Pay ${fmtUsdc(invoice.amount)} USDC`}
                  </button>
                )}
                {hash && phase === 'confirming' && <p className="text-center text-xs text-muted">Submitted: <TxLink hash={hash} /></p>}
                <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted">
                  <ShieldCheck className="h-3.5 w-3.5" /> Sent directly to the creator's wallet. FlowFi never holds your funds.
                </p>
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  )
}
