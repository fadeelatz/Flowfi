import { useState } from 'react'
import { CheckCircle2, Clock, FileText, Plus, Receipt } from 'lucide-react'
import { fmtDate, fmtUsdc, shortAddr } from '@/lib/format'
import { displayStatus, statusLabel } from '@/lib/invoice'
import { useFlowFi } from '@/state'
import { useNow } from '@/hooks/useNow'
import { Card, EmptyState, Modal, PageHeader, StatusBadge, Tabs } from '@/components/ui'
import { InvoiceForm } from '@/components/InvoiceForm'
import { InvoiceDetail } from '@/components/InvoiceDetail'
import type { Invoice, InvoiceDisplayStatus } from '@/lib/types'

type Filter = 'all' | InvoiceDisplayStatus

export function Invoices({ tab }: { tab?: string }) {
  const { invoices, isConnected } = useFlowFi()
  const now = useNow()
  const [filter, setFilter] = useState<Filter>('all')
  const [creating, setCreating] = useState(tab === 'new')
  const [openId, setOpenId] = useState<string | null>(null)

  const list = invoices.filter((i) => filter === 'all' || displayStatus(i, now) === filter)
  const selected = invoices.find((i) => i.id === openId) ?? null
  const sum = (f: (i: Invoice) => boolean) => invoices.filter(f).reduce((a, i) => a + BigInt(i.amount), 0n)
  const count = (f: (i: Invoice) => boolean) => invoices.filter(f).length

  const stats = [
    { label: 'Total invoices', value: sum((i) => i.status !== 'cancelled'), n: count((i) => i.status !== 'cancelled'), icon: <Receipt className="h-4 w-4" />, tone: 'bg-accent/15 text-accent' },
    { label: 'Paid invoices', value: sum((i) => i.status === 'paid'), n: count((i) => i.status === 'paid'), icon: <CheckCircle2 className="h-4 w-4" />, tone: 'bg-ok/15 text-ok' },
    { label: 'Pending invoices', value: sum((i) => i.status === 'pending'), n: count((i) => i.status === 'pending'), icon: <Clock className="h-4 w-4" />, tone: 'bg-warn/15 text-warn' },
  ]

  return (
    <>
      <PageHeader title="Invoices" subtitle="Create invoices with a payment link and QR code. Each one is marked paid only after the matching USDC transfer is confirmed onchain." />

      <div className="mb-5 grid gap-5 sm:grid-cols-3">
        {stats.map((s) => (
          <Card key={s.label} className="p-5">
            <div className="flex items-center gap-2.5">
              <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${s.tone}`}>{s.icon}</span>
              <span className="text-sm text-muted">{s.label}</span>
            </div>
            <p className="num mt-3 font-display text-[28px] font-semibold tracking-tight">{fmtUsdc(s.value)} <span className="text-sm font-medium text-muted">USDC</span></p>
            <p className="mt-1 text-xs text-muted">{s.n} invoice{s.n === 1 ? '' : 's'}</p>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-5 pb-3">
          <h2 className="font-display text-base font-semibold">All Invoices</h2>
          <div className="flex flex-wrap items-center gap-3">
            <div className="max-w-full overflow-x-auto">
              <Tabs value={filter} onChange={setFilter} items={[{ id: 'all', label: 'All' }, { id: 'pending', label: 'Pending' }, { id: 'paid', label: 'Paid' }, { id: 'overdue', label: 'Overdue' }, { id: 'cancelled', label: 'Cancelled' }]} />
            </div>
            <button className="btn-primary" onClick={() => setCreating(true)} disabled={!isConnected}>
              <Plus className="h-4 w-4" /> New Invoice
            </button>
          </div>
        </div>

        {list.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-5 w-5" />}
            title={invoices.length ? 'No invoices in this view' : 'No invoices yet'}
            body={isConnected ? 'Create your first invoice and send the payment link to your customer.' : 'Connect your wallet to create and track invoices.'}
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-surface2">
                  <tr>
                    <th className="th">Invoice Number</th>
                    <th className="th">Customer Name</th>
                    <th className="th">Status</th>
                    <th className="th">Date</th>
                    <th className="th">Due Date</th>
                    <th className="th text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/40">
                  {list.map((i) => (
                    <tr key={i.id} onClick={() => setOpenId(i.id)} className="cursor-pointer transition hover:bg-surface2/70">
                      <td className="px-4 py-3.5 font-mono text-xs font-medium text-accent">{i.number}-{i.id.slice(0, 4).toUpperCase()}</td>
                      <td className="px-4 py-3.5 font-medium">{i.customerName || shortAddr(i.customer)}</td>
                      <td className="px-4 py-3.5"><StatusBadge status={displayStatus(i, now)} label={statusLabel(i, now)} /></td>
                      <td className="px-4 py-3.5 text-muted">{fmtDate(i.createdAt)}</td>
                      <td className="px-4 py-3.5 text-muted">{fmtDate(i.dueAt)}</td>
                      <td className="num px-4 py-3.5 text-right font-semibold">{fmtUsdc(i.amount)} USDC</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="divide-y divide-line/40 md:hidden">
              {list.map((i) => (
                <button key={i.id} onClick={() => setOpenId(i.id)} className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{i.customerName || shortAddr(i.customer)}</p>
                    <p className="mt-0.5 truncate text-xs text-muted">{i.number} · due {fmtDate(i.dueAt)}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="num text-sm font-semibold">{fmtUsdc(i.amount)} USDC</span>
                    <StatusBadge status={displayStatus(i, now)} label={statusLabel(i, now)} />
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
        <p className="border-t border-line/40 px-5 py-3 text-[11px] text-muted">Invoices are stored in this browser for the connected wallet. The payment link carries the invoice details, so the customer can pay without an account.</p>
      </Card>

      <Modal open={creating} onClose={() => setCreating(false)} title="New invoice">
        <InvoiceForm onCreated={(inv) => { setCreating(false); setOpenId(inv.id) }} />
      </Modal>
      <Modal open={!!selected} onClose={() => setOpenId(null)} title="Invoice">
        {selected && <InvoiceDetail invoice={selected} onClose={() => setOpenId(null)} />}
      </Modal>
    </>
  )
}
