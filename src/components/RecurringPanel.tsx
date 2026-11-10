import { useState } from 'react'
import { useNow } from '@/hooks/useNow'
import { Pause, Play, Repeat, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { fmtDate, fmtUsdc, isValidAddress, parseAmountInput, parseTxError, shortAddr, uid } from '@/lib/format'
import { same } from '@/lib/invoice'
import { useFlowFi } from '@/state'
import { useSendUsdc } from '@/hooks/useSendUsdc'
import { Card, EmptyState, Field, Notice, Spinner, StatusBadge, Modal } from '@/components/ui'
import type { Frequency, Recurring } from '@/lib/types'

const STEP_DAYS: Record<Frequency, number> = { weekly: 7, biweekly: 14, monthly: 30 }

function nextAfter(from: number, f: Frequency): number {
  const d = new Date(from)
  if (f === 'monthly') d.setMonth(d.getMonth() + 1)
  else d.setDate(d.getDate() + STEP_DAYS[f])
  return d.getTime()
}

const today = () => new Date().toISOString().slice(0, 10)

export function RecurringPanel() {
  const { address, recurring, setRecurring, balance } = useFlowFi()
  const { send, confirm } = useSendUsdc()
  const now = useNow()
  const [open, setOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [label, setLabel] = useState('')
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [freq, setFreq] = useState<Frequency>('monthly')
  const [first, setFirst] = useState(today())

  const parsed = parseAmountInput(amount)
  const toErr = !to ? null : !isValidAddress(to) ? 'Enter a valid 0x wallet address' : same(to, address) ? 'Cannot pay your own wallet' : null
  const valid = !!address && label.trim() && isValidAddress(to) && !toErr && parsed.ok && !!first

  const create = () => {
    if (!parsed.ok) return
    const r: Recurring = {
      id: uid(4),
      label: label.trim(),
      to: to.trim() as `0x${string}`,
      amount: parsed.raw.toString(),
      frequency: freq,
      nextDue: new Date(`${first}T09:00:00`).getTime(),
      active: true,
      history: [],
    }
    setRecurring((p) => [r, ...p])
    setOpen(false)
    setLabel('')
    setTo('')
    setAmount('')
    toast.success('Recurring payment scheduled')
  }

  const payNow = async (r: Recurring) => {
    setBusyId(r.id)
    try {
      const hash = await send(r.to, BigInt(r.amount), 'recurring', r.label)
      const ok = await confirm(hash)
      if (!ok) throw new Error('reverted')
      setRecurring((p) => p.map((x) => (x.id === r.id ? { ...x, nextDue: nextAfter(Math.max(x.nextDue, Date.now()), x.frequency), history: [{ hash, at: Date.now() }, ...x.history].slice(0, 12) } : x)))
      toast.success(`${r.label} paid and confirmed`)
    } catch (e) {
      const msg = parseTxError(e)
      if (msg) toast.error(msg)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Card className="card-pad">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-semibold">Recurring payments</h2>
          <p className="text-xs text-muted">Schedules stay in your wallet's control: when a payment is due, you approve it with one tap.</p>
        </div>
        <button className="btn-primary" onClick={() => setOpen(true)} disabled={!address}>New schedule</button>
      </div>
      {recurring.length === 0 ? (
        <EmptyState icon={<Repeat className="h-5 w-5" />} title="No schedules" body="Set up rent, subscriptions or retainers and get reminded when each payment is due." />
      ) : (
        <div className="divide-y divide-line/40">
          {recurring.map((r) => {
            const due = r.active && r.nextDue <= now
            const short = balance !== undefined && balance < BigInt(r.amount)
            return (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{r.label}</p>
                  <p className="text-xs text-muted">{fmtUsdc(r.amount)} USDC to <span className="font-mono">{shortAddr(r.to)}</span> · {r.frequency} · next {fmtDate(r.nextDue)}</p>
                </div>
                <div className="flex items-center gap-2">
                  {!r.active ? <StatusBadge status="cancelled" /> : due ? <StatusBadge status="overdue" /> : <StatusBadge status="pending" />}
                  <button className="btn-primary min-h-[40px]" disabled={busyId === r.id || !r.active || short} onClick={() => void payNow(r)} title={short ? 'Balance too low' : undefined}>
                    {busyId === r.id ? <Spinner /> : 'Pay now'}
                  </button>
                  <button className="btn-ghost h-10 min-h-0 w-10 !px-0" aria-label={r.active ? 'Pause' : 'Resume'} onClick={() => setRecurring((p) => p.map((x) => (x.id === r.id ? { ...x, active: !x.active } : x)))}>
                    {r.active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </button>
                  <button className="btn-ghost h-10 min-h-0 w-10 !px-0 text-bad" aria-label="Delete" onClick={() => setRecurring((p) => p.filter((x) => x.id !== r.id))}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="New recurring payment">
        <div className="space-y-4">
          <Field label="Label"><input className="input" maxLength={40} placeholder="Office rent" value={label} onChange={(e) => setLabel(e.target.value)} /></Field>
          <Field label="Recipient address" error={toErr}><input className="input font-mono" placeholder="0x…" value={to} onChange={(e) => setTo(e.target.value)} spellCheck={false} /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Amount (USDC)" error={amount && !parsed.ok ? parsed.error : null}><input className="input num" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="100.00" /></Field>
            <Field label="Frequency">
              <select className="input" value={freq} onChange={(e) => setFreq(e.target.value as Frequency)}>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Every 2 weeks</option>
                <option value="monthly">Monthly</option>
              </select>
            </Field>
          </div>
          <Field label="First payment date"><input type="date" className="input" min={today()} value={first} onChange={(e) => setFirst(e.target.value)} /></Field>
          <Notice>FlowFi does not hold your funds, so it cannot pull payments on its own. You will be reminded and can pay each one in a tap.</Notice>
          <button className="btn-primary w-full" disabled={!valid} onClick={create}>Schedule payment</button>
        </div>
      </Modal>
    </Card>
  )
}
