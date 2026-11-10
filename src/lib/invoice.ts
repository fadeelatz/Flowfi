import { parseAbiItem, parseEventLogs, type Address, type Hex } from 'viem'
import { buildShareLink } from '@/lib/share'
import { CHAIN_ID, USDC_ADDRESS, publicClient } from '@/lib/chain'
import { isValidAddress } from '@/lib/format'
import type { Invoice, InvoiceDisplayStatus } from '@/lib/types'

export const TRANSFER_EVENT = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')

export const same = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase()

export function displayStatus(inv: Invoice, now = Date.now()): InvoiceDisplayStatus {
  if (inv.status === 'pending' && inv.dueAt < now) return 'overdue'
  return inv.status
}

interface Payload {
  v: 1
  id: string
  n: string
  c: string
  u: string
  cn: string
  a: string
  d: string
  t: number
  ca: number
  b: string
  ch: number
}

const toB64Url = (s: string) => {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  bytes.forEach((b) => (bin += String.fromCharCode(b)))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const fromB64Url = (s: string) => {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad)
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
}

export function encodeInvoice(inv: Invoice): string {
  const p: Payload = {
    v: 1,
    id: inv.id,
    n: inv.number,
    c: inv.creator,
    u: inv.customer,
    cn: inv.customerName,
    a: inv.amount,
    d: inv.description,
    t: inv.dueAt,
    ca: inv.createdAt,
    b: inv.createdBlock,
    ch: CHAIN_ID,
  }
  return toB64Url(JSON.stringify(p))
}

/** Parses and validates an invoice from a payment link. Returns null when anything is off. */
export function decodeInvoice(encoded: string): Invoice | null {
  try {
    const p = JSON.parse(fromB64Url(encoded)) as Partial<Payload>
    if (p.v !== 1 || p.ch !== CHAIN_ID) return null
    if (typeof p.c !== 'string' || !isValidAddress(p.c)) return null
    if (typeof p.u !== 'string' || !isValidAddress(p.u)) return null
    if (typeof p.a !== 'string' || !/^\d{1,20}$/.test(p.a) || BigInt(p.a) <= 0n) return null
    if (typeof p.b !== 'string' || !/^\d{1,20}$/.test(p.b)) return null
    if (typeof p.id !== 'string' || !/^[0-9a-f]{4,32}$/.test(p.id)) return null
    if (typeof p.t !== 'number' || typeof p.ca !== 'number') return null
    return {
      id: p.id,
      number: String(p.n ?? '').slice(0, 24),
      creator: p.c,
      customer: p.u,
      customerName: String(p.cn ?? '').slice(0, 60),
      amount: p.a,
      description: String(p.d ?? '').slice(0, 160),
      createdAt: p.ca,
      createdBlock: p.b,
      dueAt: p.t,
      status: 'pending',
    }
  } catch {
    return null
  }
}

/** Built at display time, never stored: the share base differs per context. */
export function buildInvoiceLink(inv: Invoice): Promise<string> {
  return buildShareLink(`/?inv=${encodeInvoice(inv)}`)
}

export type VerifyResult =
  | { ok: true; hash: Hex; from: Address; value: bigint; block: bigint; logIndex: number }
  | { ok: false; reason: string }

/**
 * Confirms from the chain that a transaction succeeded and contains a USDC transfer
 * from the customer to the creator for at least the invoice amount.
 */
export async function verifyInvoiceTx(
  inv: Pick<Invoice, 'creator' | 'customer' | 'amount' | 'createdBlock'>,
  hash: Hex,
): Promise<VerifyResult> {
  let receipt
  try {
    receipt = await publicClient.getTransactionReceipt({ hash })
  } catch {
    return { ok: false, reason: 'Transaction not found on Arc Testnet yet.' }
  }
  if (receipt.status !== 'success') return { ok: false, reason: 'The transaction reverted onchain.' }
  if (receipt.blockNumber < BigInt(inv.createdBlock)) {
    return { ok: false, reason: 'This transaction happened before the invoice was created.' }
  }
  const logs = parseEventLogs({ abi: [TRANSFER_EVENT], logs: receipt.logs }).filter((l) => same(l.address, USDC_ADDRESS))
  const match = logs.find(
    (l) => same(l.args.to, inv.creator) && same(l.args.from, inv.customer) && l.args.value >= BigInt(inv.amount),
  )
  if (!match) {
    return { ok: false, reason: 'No USDC transfer from the customer to the invoice creator for the full amount.' }
  }
  return {
    ok: true,
    hash,
    from: match.args.from,
    value: match.args.value,
    block: receipt.blockNumber,
    logIndex: match.logIndex,
  }
}

/** Human label for a status pill, e.g. "Overdue by 3 days" or "Due in 14 days". */
export function statusLabel(inv: Invoice, now = Date.now()): string {
  const s = displayStatus(inv, now)
  if (s === 'paid') return 'Paid'
  if (s === 'cancelled') return 'Cancelled'
  const days = Math.ceil(Math.abs(inv.dueAt - now) / 86_400_000)
  if (s === 'overdue') return `Overdue by ${days} day${days === 1 ? '' : 's'}`
  return days <= 0 ? 'Due today' : `Due in ${days} day${days === 1 ? '' : 's'}`
}
