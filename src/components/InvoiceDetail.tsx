import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'sonner'
import type { Hex } from 'viem'
import { fmtDate, fmtDateTime, fmtUsdc, shortAddr } from '@/lib/format'
import { buildInvoiceLink, displayStatus, verifyInvoiceTx } from '@/lib/invoice'
import { useFlowFi } from '@/state'
import { CopyButton, Notice, Spinner, StatusBadge, TxLink } from '@/components/ui'
import type { Invoice } from '@/lib/types'

export function InvoiceDetail({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const { invoices, updateInvoice, notify } = useFlowFi()
  const [link, setLink] = useState<string>()
  const [hash, setHash] = useState('')
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const status = displayStatus(invoice)
  const open = invoice.status === 'pending'

  useEffect(() => {
    let live = true
    void buildInvoiceLink(invoice).then((l) => live && setLink(l))
    return () => {
      live = false
    }
  }, [invoice])

  const reminder = link
    ? `Hi${invoice.customerName ? ' ' + invoice.customerName : ''}, a reminder that invoice ${invoice.number} for ${fmtUsdc(invoice.amount)} USDC (${invoice.description}) is due ${fmtDate(invoice.dueAt)}. Pay here: ${link}`
    : ''

  const verifyManual = async () => {
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash.trim())) {
      setResult('Enter a full transaction hash (0x followed by 64 characters).')
      return
    }
    setChecking(true)
    setResult(null)
    const res = await verifyInvoiceTx(invoice, hash.trim() as Hex)
    setChecking(false)
    if (!res.ok) {
      setResult(res.reason)
      return
    }
    if (invoices.some((i) => i.paidTx === res.hash && i.paidLogIndex === res.logIndex && i.id !== invoice.id)) {
      setResult('That payment already settled a different invoice.')
      return
    }
    updateInvoice(invoice.id, { status: 'paid', paidTx: res.hash, paidLogIndex: res.logIndex, paidAt: Date.now(), paidAmount: res.value.toString() })
    notify({ kind: 'invoice-paid', title: `Invoice ${invoice.number} paid`, body: `${fmtUsdc(res.value)} USDC verified onchain.` })
    setResult('Verified onchain. Invoice marked as paid.')
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="kicker">{invoice.number}</p>
          <p className="num mt-1 font-display text-3xl font-semibold">{fmtUsdc(invoice.amount)} <span className="text-base text-muted">USDC</span></p>
        </div>
        <StatusBadge status={status} />
      </div>
      <div className="inset divide-y divide-line/40 text-sm">
        {[
          ['Customer', invoice.customerName || 'Unnamed'],
          ['Wallet', shortAddr(invoice.customer, 8, 6)],
          ['Description', invoice.description],
          ['Created', fmtDateTime(invoice.createdAt)],
          ['Due', fmtDate(invoice.dueAt)],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 px-3.5 py-2.5">
            <span className="text-muted">{k}</span>
            <span className="text-right text-ink">{v}</span>
          </div>
        ))}
        {invoice.paidTx && (
          <div className="flex justify-between gap-4 px-3.5 py-2.5">
            <span className="text-muted">Payment tx</span>
            <TxLink hash={invoice.paidTx} />
          </div>
        )}
      </div>

      {open && (
        <>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
            <div className="shrink-0 rounded-2xl bg-white p-3">{link ? <QRCodeSVG value={link} size={132} fgColor="#0b1220" bgColor="#ffffff" level="M" /> : <div className="grid h-[132px] w-[132px] place-items-center"><Spinner /></div>}</div>
            <div className="min-w-0 flex-1 space-y-2">
              <p className="kicker">Payment link</p>
              <p className="break-all rounded-xl border border-line/50 bg-bg/50 p-2.5 font-mono text-[11px] text-muted">{link ?? 'Preparing link…'}</p>
              <div className="flex flex-wrap gap-2">
                <CopyButton value={link ?? ''} label="Copy link" />
                <CopyButton value={reminder} label="Copy reminder" className={!link ? 'pointer-events-none opacity-50' : ''} />
              </div>
              <p className="text-xs text-muted">The invoice is marked paid automatically when a USDC transfer from the customer wallet for the full amount is confirmed onchain. Keep FlowFi open on this wallet to see it happen.</p>
            </div>
          </div>
          <div className="space-y-2">
            <p className="kicker">Already paid? Verify a transaction</p>
            <div className="flex gap-2">
              <input className="input font-mono" placeholder="0x transaction hash" value={hash} onChange={(e) => setHash(e.target.value)} spellCheck={false} />
              <button className="btn-ghost shrink-0" disabled={checking || !hash} onClick={() => void verifyManual()}>
                {checking ? <Spinner /> : 'Verify'}
              </button>
            </div>
            {result && <Notice tone={result.startsWith('Verified') ? 'info' : 'warn'}>{result}</Notice>}
          </div>
          <button
            className="btn-danger w-full"
            onClick={() => {
              updateInvoice(invoice.id, { status: 'cancelled' })
              toast('Invoice cancelled')
              onClose()
            }}
          >
            Cancel invoice
          </button>
        </>
      )}
    </div>
  )
}
