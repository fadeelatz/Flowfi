import { formatUnitsExact } from '@/onchain-money'
import { USDC_DECIMALS } from '@/onchain-facts'
import { same } from '@/lib/invoice'
import type { ChainTransfer } from '@/lib/types'

export function totals(transfers: ChainTransfer[], address?: string) {
  let received = 0n
  let sent = 0n
  for (const t of transfers) {
    if (same(t.from, t.to)) continue
    if (same(t.to, address)) received += BigInt(t.value)
    else if (same(t.from, address)) sent += BigInt(t.value)
  }
  return { received, sent }
}

/** Buckets transfers with a known timestamp into the last `days` calendar days. */
export function bucketFlows(transfers: ChainTransfer[], address: string | undefined, days = 14) {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - (days - 1))
  const labels: string[] = []
  for (let i = 0; i < days; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    labels.push(d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }))
  }
  const received = new Array<number>(days).fill(0)
  const sent = new Array<number>(days).fill(0)
  for (const t of transfers) {
    if (t.ts === undefined || same(t.from, t.to)) continue
    const idx = Math.floor((t.ts - start.getTime()) / 86_400_000)
    if (idx < 0 || idx >= days) continue
    const v = Number(formatUnitsExact(BigInt(t.value), USDC_DECIMALS))
    if (same(t.to, address)) received[idx] += v
    else if (same(t.from, address)) sent[idx] += v
  }
  return { labels, received, sent }
}
