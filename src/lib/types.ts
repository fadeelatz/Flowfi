import type { Address, Hex } from 'viem'

export type InvoiceStatus = 'pending' | 'paid' | 'cancelled'
export type InvoiceDisplayStatus = InvoiceStatus | 'overdue'

export interface Invoice {
  id: string
  number: string
  creator: Address
  customerName: string
  customer: Address
  /** Raw 6-decimal USDC units as a string. */
  amount: string
  description: string
  createdAt: number
  /** Chain head when the invoice was created; payment scanning starts here. */
  createdBlock: string
  dueAt: number
  status: InvoiceStatus
  paidTx?: Hex
  paidLogIndex?: number
  paidAt?: number
  paidAmount?: string
  remindedAt?: number
}

export interface ChainTransfer {
  hash: Hex
  logIndex: number
  block: string
  from: Address
  to: Address
  value: string
  /** Block timestamp in ms, filled in lazily. */
  ts?: number
}

export interface ScanState {
  cursor?: string
  items: ChainTransfer[]
}

export interface TxNote {
  hash: Hex
  to: Address
  amount: string
  note?: string
  createdAt: number
  status: 'pending' | 'confirmed' | 'failed'
  kind: 'send' | 'payout' | 'recurring' | 'invoice' | 'escrow'
}

export type Frequency = 'weekly' | 'biweekly' | 'monthly'

export interface Recurring {
  id: string
  label: string
  to: Address
  amount: string
  frequency: Frequency
  nextDue: number
  active: boolean
  history: { hash: Hex; at: number }[]
}

export interface PayoutRow {
  to: Address
  label: string
  amount: string
  status: 'queued' | 'signing' | 'confirming' | 'confirmed' | 'failed' | 'skipped'
  hash?: Hex
  error?: string
}

export interface PayoutBatch {
  id: string
  name: string
  createdAt: number
  rows: PayoutRow[]
}

export interface AppNotification {
  id: string
  ts: number
  kind: 'invoice-paid' | 'reminder' | 'info' | 'escrow'
  title: string
  body: string
  read: boolean
}

export interface EscrowTerms {
  /** keccak256 of the terms text stored onchain. */
  hash: Hex
  text: string
}

export type View =
  | 'dashboard'
  | 'payments'
  | 'invoices'
  | 'defi'
  | 'automation'
  | 'escrow'
  | 'settings'
