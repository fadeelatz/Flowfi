import { isAddress, type Address } from 'viem'
import { formatUnitsFixed, parseUsdc, AmountError } from '@/onchain-money'
import { USDC_DECIMALS } from '@/onchain-facts'

export const shortAddr = (a?: string, head = 6, tail = 4) => (a ? `${a.slice(0, head)}…${a.slice(-tail)}` : '')
export const shortHash = (h?: string) => (h ? `${h.slice(0, 10)}…${h.slice(-6)}` : '')

const withCommas = (s: string) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ',')

/** Formats raw 6-decimal USDC as 1,234.56 (no currency symbol). */
export function fmtUsdc(raw: bigint | string | undefined, digits = 2): string {
  if (raw === undefined) return '0.00'
  const fixed = formatUnitsFixed(BigInt(raw), USDC_DECIMALS, digits)
  const [whole, frac] = fixed.split('.')
  const neg = whole.startsWith('-')
  const body = withCommas(neg ? whole.slice(1) : whole)
  return `${neg ? '-' : ''}${body}${frac ? '.' + frac : ''}`
}

export function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function fmtDateTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function timeAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export function isValidAddress(value: string): value is Address {
  return /^0x[0-9a-fA-F]{40}$/.test(value.trim()) && isAddress(value.trim(), { strict: false })
}

export type ParsedAmount = { ok: true; raw: bigint } | { ok: false; error: string }

/** Validates user-typed USDC input. Optionally checks it against a balance. */
export function parseAmountInput(input: string, balance?: bigint): ParsedAmount {
  const v = input.trim()
  if (!v) return { ok: false, error: 'Enter an amount' }
  try {
    const raw = parseUsdc(v)
    if (raw <= 0n) return { ok: false, error: 'Amount must be greater than zero' }
    if (balance !== undefined && raw > balance) return { ok: false, error: 'Amount exceeds your USDC balance' }
    return { ok: true, raw }
  } catch (e) {
    if (e instanceof AmountError && e.code === 'TOO_MANY_FRACTION_DIGITS') {
      return { ok: false, error: 'USDC supports up to 6 decimal places' }
    }
    return { ok: false, error: 'Enter a valid number' }
  }
}

/** Turns wallet and RPC errors into plain language. Returns null for a user cancel. */
export function parseTxError(error: unknown): string | null {
  const e = error as { code?: number; shortMessage?: string; message?: string } | undefined
  const msg = (e?.shortMessage ?? e?.message ?? '').toLowerCase()
  if (e?.code === 4001 || msg.includes('user rejected') || msg.includes('user denied')) return null
  if (msg.includes('insufficient funds') || msg.includes('exceeds balance')) return 'Insufficient balance for this transaction or its gas.'
  if (msg.includes('reverted')) return 'The transaction was rejected by the contract.'
  if (msg.includes('network') || msg.includes('timeout') || msg.includes('fetch')) return 'Network issue. Check your connection and try again.'
  return e?.shortMessage ?? 'Something went wrong. Please try again.'
}

export function uid(bytes = 4): string {
  const a = new Uint8Array(bytes)
  crypto.getRandomValues(a)
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('')
}
