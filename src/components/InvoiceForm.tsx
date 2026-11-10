import { useState } from 'react'
import { useNow } from '@/hooks/useNow'
import { toast } from 'sonner'
import { publicClient, USDC_ADDRESS } from '@/lib/chain'
import { isValidAddress, parseAmountInput, uid } from '@/lib/format'
import { same } from '@/lib/invoice'
import { useFlowFi } from '@/state'
import { Field, Spinner } from '@/components/ui'
import type { Invoice } from '@/lib/types'

const inDays = (n: number) => {
  const d = new Date(Date.now() + n * 86_400_000)
  return d.toISOString().slice(0, 10)
}

export function InvoiceForm({ onCreated }: { onCreated: (inv: Invoice) => void }) {
  const { address, invoices, addInvoice } = useFlowFi()
  const now = useNow()
  const [name, setName] = useState('')
  const [customer, setCustomer] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [due, setDue] = useState(inDays(14))
  const [busy, setBusy] = useState(false)

  const custOk = isValidAddress(customer)
  const custError = !customer ? null : !custOk ? 'Enter a valid 0x wallet address' : same(customer, address) ? 'The customer cannot be your own wallet' : same(customer, USDC_ADDRESS) ? 'That is the USDC contract, not a wallet' : null
  const parsed = parseAmountInput(amount)
  const amountError = amount && !parsed.ok ? parsed.error : null
  const dueTs = new Date(`${due}T23:59:59`).getTime()
  const dueOk = Number.isFinite(dueTs) && dueTs > now
  const ready = !!address && custOk && !custError && parsed.ok && dueOk && description.trim().length > 0 && !busy

  const submit = async () => {
    if (!address || !parsed.ok) return
    setBusy(true)
    try {
      const head = await publicClient.getBlockNumber()
      const inv: Invoice = {
        id: uid(4),
        number: `INV-${String(invoices.length + 1).padStart(4, '0')}`,
        creator: address,
        customerName: name.trim(),
        customer: customer.trim() as `0x${string}`,
        amount: parsed.raw.toString(),
        description: description.trim(),
        createdAt: Date.now(),
        createdBlock: head.toString(),
        dueAt: dueTs,
        status: 'pending',
      }
      addInvoice(inv)
      toast.success(`Invoice ${inv.number} created`)
      onCreated(inv)
    } catch {
      toast.error('Could not read the latest block from Arc Testnet. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Customer name">
          <input className="input" maxLength={40} placeholder="Acme Studio" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Amount (USDC)" error={amountError}>
          <input className="input num" inputMode="decimal" placeholder="250.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
      </div>
      <Field label="Customer wallet address" error={custError} hint="Payment is verified from this wallet to yours.">
        <input className="input font-mono" placeholder="0x…" value={customer} onChange={(e) => setCustomer(e.target.value)} spellCheck={false} />
      </Field>
      <Field label="Description">
        <input className="input" maxLength={120} placeholder="Brand design, October" value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label="Due date" error={due && !dueOk ? 'Pick a date in the future' : null}>
        <input type="date" className="input" min={inDays(0)} value={due} onChange={(e) => setDue(e.target.value)} />
      </Field>
      <button className="btn-primary w-full" disabled={!ready} onClick={() => void submit()}>
        {busy ? <Spinner /> : null} Create invoice
      </button>
      {!address && <p className="text-center text-xs text-muted">Connect your wallet to create invoices.</p>}
    </div>
  )
}
