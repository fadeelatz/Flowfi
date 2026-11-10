import { ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import clsx from 'clsx'
import { fmtUsdc, shortAddr, timeAgo } from '@/lib/format'
import { same } from '@/lib/invoice'
import type { ChainTransfer, TxNote } from '@/lib/types'
import { TxLink } from '@/components/ui'

export function TxRow({ t, me, note }: { t: ChainTransfer; me?: string; note?: TxNote }) {
  const incoming = same(t.to, me) && !same(t.from, me)
  const other = incoming ? t.from : t.to
  return (
    <div className="flex items-center gap-3 py-3">
      <div className={clsx('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border', incoming ? 'border-ok/25 bg-ok/10 text-ok' : 'border-line/70 bg-surface2/70 text-accent')}>
        {incoming ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">
          {incoming ? 'Received from' : 'Sent to'} <span className="font-mono text-[13px]">{shortAddr(other)}</span>
        </p>
        <p className="mt-0.5 flex items-center gap-2 text-xs text-muted">
          {t.ts ? timeAgo(t.ts) : `Block ${t.block}`}
          {note?.note && <span className="truncate">· {note.note}</span>}
        </p>
      </div>
      <div className="text-right">
        <p className={clsx('num text-sm font-semibold', incoming ? 'text-ok' : 'text-ink')}>
          {incoming ? '+' : '-'}
          {fmtUsdc(t.value)} <span className="text-xs font-medium text-muted">USDC</span>
        </p>
        <TxLink hash={t.hash} />
      </div>
    </div>
  )
}
