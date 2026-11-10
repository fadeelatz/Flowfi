import { useMemo, useState } from 'react'
import { Users } from 'lucide-react'
import { fmtDateTime, fmtUsdc, isValidAddress, parseAmountInput, parseTxError, shortAddr, uid } from '@/lib/format'
import { same } from '@/lib/invoice'
import { usePersisted } from '@/lib/store'
import { useFlowFi } from '@/state'
import { useSendUsdc } from '@/hooks/useSendUsdc'
import { Card, EmptyState, Field, Notice, Spinner, StatusBadge, TxLink } from '@/components/ui'
import type { PayoutBatch, PayoutRow } from '@/lib/types'

const NO_BATCHES: PayoutBatch[] = []
const MAX_ROWS = 50

interface ParsedLine {
  line: number
  to: string
  amount: string
  label: string
  error?: string
  raw?: bigint
}

function parseLines(text: string, me?: string): ParsedLine[] {
  return text
    .split('\n')
    .map((l, i) => ({ l: l.trim(), i }))
    .filter((x) => x.l)
    .map(({ l, i }) => {
      const [to = '', amount = '', ...rest] = l.split(/[,\t]/).map((s) => s.trim())
      const p = parseAmountInput(amount)
      let error: string | undefined
      if (!isValidAddress(to)) error = 'Invalid address'
      else if (same(to, me)) error = 'Your own address'
      else if (!p.ok) error = p.error
      return { line: i + 1, to, amount, label: rest.join(', '), error, raw: p.ok ? p.raw : undefined }
    })
}

export function PayoutPanel() {
  const { address, balance } = useFlowFi()
  const { send, confirm } = useSendUsdc()
  const [batches, setBatches] = usePersisted<PayoutBatch[]>(address, 'payouts', NO_BATCHES)
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const [runningId, setRunningId] = useState<string | null>(null)

  const lines = useMemo(() => parseLines(text, address), [text, address])
  const bad = lines.filter((l) => l.error)
  const total = lines.reduce((s, l) => s + (l.raw ?? 0n), 0n)
  const overBalance = balance !== undefined && total > balance
  const canRun = !!address && lines.length > 0 && lines.length <= MAX_ROWS && bad.length === 0 && !overBalance && !runningId

  const patchRow = (batchId: string, idx: number, patch: Partial<PayoutRow>) =>
    setBatches((p) => p.map((b) => (b.id === batchId ? { ...b, rows: b.rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)) } : b)))

  const run = async (batch: PayoutBatch) => {
    setRunningId(batch.id)
    for (let i = 0; i < batch.rows.length; i++) {
      const row = batch.rows[i]
      if (row.status === 'confirmed') continue
      try {
        patchRow(batch.id, i, { status: 'signing', error: undefined })
        const hash = await send(row.to, BigInt(row.amount), 'payout', row.label || batch.name)
        patchRow(batch.id, i, { status: 'confirming', hash })
        const ok = await confirm(hash)
        patchRow(batch.id, i, ok ? { status: 'confirmed' } : { status: 'failed', error: 'Transaction reverted' })
        if (!ok) break
      } catch (e) {
        patchRow(batch.id, i, { status: 'failed', error: parseTxError(e) ?? 'Cancelled in wallet' })
        break
      }
    }
    setRunningId(null)
  }

  const start = () => {
    const rows: PayoutRow[] = lines.map((l) => ({ to: l.to as `0x${string}`, label: l.label, amount: (l.raw ?? 0n).toString(), status: 'queued' }))
    const batch: PayoutBatch = { id: uid(4), name: name.trim() || `Payout ${new Date().toLocaleDateString()}`, createdAt: Date.now(), rows }
    setBatches((p) => [batch, ...p])
    setText('')
    setName('')
    void run(batch)
  }

  return (
    <div className="space-y-5">
      <Card className="card-pad">
        <h2 className="font-display text-base font-semibold">Business payouts</h2>
        <p className="mb-4 text-xs text-muted">Pay several people in one run. One wallet approval per recipient; each payment is confirmed onchain before the next starts.</p>
        <div className="space-y-4">
          <Field label="Batch name"><input className="input" maxLength={40} placeholder="October contractors" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Recipients" hint="One per line: address, amount, optional label">
            <textarea className="input min-h-[120px] py-3 font-mono text-xs" placeholder={'0xabc…, 250.00, Design\n0xdef…, 400, Engineering'} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
          </Field>
          {lines.length > 0 && (
            <div className="inset divide-y divide-line/40 text-sm">
              {lines.map((l) => (
                <div key={l.line} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                  <span className="min-w-0 truncate font-mono text-xs">{shortAddr(l.to)} {l.label && <span className="font-sans text-muted">· {l.label}</span>}</span>
                  {l.error ? <span className="text-xs text-bad">Line {l.line}: {l.error}</span> : <span className="num font-semibold">{fmtUsdc(l.raw)} USDC</span>}
                </div>
              ))}
              <div className="flex justify-between px-3.5 py-2.5 font-semibold"><span>Total</span><span className="num">{fmtUsdc(total)} USDC</span></div>
            </div>
          )}
          {lines.length > MAX_ROWS && <Notice tone="warn">Limit is {MAX_ROWS} recipients per batch.</Notice>}
          {overBalance && <Notice tone="warn">Total exceeds your USDC balance ({fmtUsdc(balance)}).</Notice>}
          <button className="btn-primary w-full" disabled={!canRun} onClick={start}>Run payout</button>
        </div>
      </Card>

      <Card className="card-pad">
        <h3 className="font-display text-base font-semibold">Payout history</h3>
        {batches.length === 0 ? (
          <EmptyState icon={<Users className="h-5 w-5" />} title="No payouts yet" body="Completed and in-progress batches are tracked here with a transaction link per recipient." />
        ) : (
          <div className="mt-2 space-y-4">
            {batches.map((b) => {
              const done = b.rows.filter((r) => r.status === 'confirmed').length
              const incomplete = done < b.rows.length
              return (
                <div key={b.id} className="inset p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">{b.name}</p>
                      <p className="text-xs text-muted">{fmtDateTime(b.createdAt)} · {done}/{b.rows.length} confirmed</p>
                    </div>
                    {incomplete && (
                      <button className="btn-ghost min-h-[38px] text-xs" disabled={!!runningId} onClick={() => void run(b)}>
                        {runningId === b.id ? <Spinner /> : 'Resume'}
                      </button>
                    )}
                  </div>
                  <div className="mt-2 divide-y divide-line/30">
                    {b.rows.map((r, i) => (
                      <div key={i} className="flex items-center justify-between gap-3 py-2 text-xs">
                        <span className="min-w-0 truncate font-mono">{shortAddr(r.to)} <span className="font-sans text-muted">{fmtUsdc(r.amount)} USDC</span></span>
                        <span className="flex items-center gap-2">
                          {r.error && <span className="text-bad">{r.error}</span>}
                          {r.hash && <TxLink hash={r.hash} />}
                          <StatusBadge status={r.status === 'queued' ? 'pending' : r.status === 'signing' || r.status === 'confirming' ? 'pending' : r.status} />
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}
