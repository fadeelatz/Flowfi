import { useState } from 'react'
import { useNow } from '@/hooks/useNow'
import { BellRing, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { fmtDate, fmtUsdc, shortAddr } from '@/lib/format'
import { buildInvoiceLink, displayStatus } from '@/lib/invoice'
import { useFlowFi } from '@/state'
import { Card, EmptyState, PageHeader, StatusBadge, Tabs, TxLink } from '@/components/ui'
import { RecurringPanel } from '@/components/RecurringPanel'
import { PayoutPanel } from '@/components/PayoutPanel'

type Tab = 'recurring' | 'payouts' | 'tracking'

function Tracking() {
  const { invoices, recurring, txNotes, updateInvoice } = useFlowFi()
  const now = useNow()
  const soon = now + 7 * 86_400_000
  const dueInvoices = invoices.filter((i) => i.status === 'pending' && i.dueAt <= soon).sort((a, b) => a.dueAt - b.dueAt)
  const dueRecurring = recurring.filter((r) => r.active && r.nextDue <= soon).sort((a, b) => a.nextDue - b.nextDue)
  const tracked = txNotes.filter((n) => n.kind !== 'send')

  const copyReminder = async (id: string) => {
    const inv = invoices.find((i) => i.id === id)
    if (!inv) return
    const link = await buildInvoiceLink(inv)
    await navigator.clipboard.writeText(
      `Hi${inv.customerName ? ' ' + inv.customerName : ''}, a reminder that invoice ${inv.number} for ${fmtUsdc(inv.amount)} USDC (${inv.description}) is due ${fmtDate(inv.dueAt)}. Pay here: ${link}`,
    )
    updateInvoice(id, { remindedAt: Date.now() })
    toast.success('Reminder copied. Paste it into your message to the customer.')
  }

  return (
    <div className="space-y-5">
      <Card className="card-pad">
        <h2 className="font-display text-base font-semibold">Payment reminders</h2>
        <p className="mb-2 text-xs text-muted">Items due in the next 7 days or already late. Reminders also appear in the bell menu.</p>
        {dueInvoices.length + dueRecurring.length === 0 ? (
          <EmptyState icon={<BellRing className="h-5 w-5" />} title="Nothing due soon" body="Overdue invoices and upcoming scheduled payments will show up here." />
        ) : (
          <div className="divide-y divide-line/40">
            {dueInvoices.map((i) => (
              <div key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium">Collect {fmtUsdc(i.amount)} USDC from {i.customerName || shortAddr(i.customer)}</p>
                  <p className="text-xs text-muted">{i.number} · due {fmtDate(i.dueAt)}{i.remindedAt ? ' · reminder copied' : ''}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={displayStatus(i)} />
                  <button className="btn-ghost min-h-[38px] text-xs" onClick={() => void copyReminder(i.id)}><Copy className="h-3.5 w-3.5" /> Reminder</button>
                </div>
              </div>
            ))}
            {dueRecurring.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium">Pay {fmtUsdc(r.amount)} USDC: {r.label}</p>
                  <p className="text-xs text-muted">to {shortAddr(r.to)} · due {fmtDate(r.nextDue)}</p>
                </div>
                <StatusBadge status={r.nextDue <= now ? 'overdue' : 'pending'} />
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="card-pad">
        <h2 className="font-display text-base font-semibold">Payment tracking</h2>
        <p className="mb-2 text-xs text-muted">Status of automated payments and invoice payments sent from this app, read from onchain receipts.</p>
        {tracked.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">No tracked payments yet.</p>
        ) : (
          <div className="divide-y divide-line/40">
            {tracked.slice(0, 15).map((n) => (
              <div key={n.hash} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm">{fmtUsdc(n.amount)} USDC to <span className="font-mono text-[13px]">{shortAddr(n.to)}</span> <span className="text-muted">· {n.kind}{n.note ? ` · ${n.note}` : ''}</span></p>
                  <TxLink hash={n.hash} />
                </div>
                <StatusBadge status={n.status} />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

export function Automation() {
  const [tab, setTab] = useState<Tab>('recurring')
  return (
    <>
      <PageHeader title="Automation" subtitle="Recurring payments, business payouts, reminders and payment tracking." />
      <div className="mb-6 overflow-x-auto">
        <Tabs value={tab} onChange={setTab} items={[{ id: 'recurring', label: 'Recurring' }, { id: 'payouts', label: 'Payouts' }, { id: 'tracking', label: 'Reminders & tracking' }]} />
      </div>
      <div className="max-w-3xl">
        {tab === 'recurring' && <RecurringPanel />}
        {tab === 'payouts' && <PayoutPanel />}
        {tab === 'tracking' && <Tracking />}
      </div>
    </>
  )
}
