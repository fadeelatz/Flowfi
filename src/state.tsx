import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useAccount } from 'wagmi'
import { toast } from 'sonner'
import type { Address, Hex } from 'viem'
import { publicClient } from '@/lib/chain'
import { fmtUsdc, shortAddr, uid } from '@/lib/format'
import { displayStatus, same, verifyInvoiceTx } from '@/lib/invoice'
import { usePersisted } from '@/lib/store'
import type { AppNotification, ChainTransfer, Invoice, Recurring, TxNote } from '@/lib/types'
import { useTransferScanner, type ScanProgress } from '@/hooks/useTransferScanner'
import { useUsdcBalance } from '@/hooks/useChainWrite'

const EMPTY_INVOICES: Invoice[] = []
const EMPTY_NOTES: TxNote[] = []
const EMPTY_NOTIFS: AppNotification[] = []
const EMPTY_KEYS: string[] = []
const EMPTY_RECURRING: Recurring[] = []

interface FlowFiState {
  address?: Address
  isConnected: boolean
  balance?: bigint
  refetchBalance: () => void
  transfers: ChainTransfer[]
  scanProgress: ScanProgress | null
  scanError: string | null
  rescan: () => void
  invoices: Invoice[]
  addInvoice: (inv: Invoice) => void
  updateInvoice: (id: string, patch: Partial<Invoice>) => void
  txNotes: TxNote[]
  recordTx: (note: TxNote) => void
  notifications: AppNotification[]
  notify: (n: Pick<AppNotification, 'kind' | 'title' | 'body'>) => void
  markAllRead: () => void
  clearNotifications: () => void
  recurring: Recurring[]
  setRecurring: (next: Recurring[] | ((prev: Recurring[]) => Recurring[])) => void
}

const Ctx = createContext<FlowFiState | null>(null)

export function useFlowFi(): FlowFiState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useFlowFi must be used inside FlowFiProvider')
  return v
}

export function FlowFiProvider({ children }: { children: ReactNode }) {
  const { address, isConnected } = useAccount()
  const [invoices, setInvoices] = usePersisted<Invoice[]>(address, 'invoices', EMPTY_INVOICES)
  const [txNotes, setTxNotes] = usePersisted<TxNote[]>(address, 'txnotes', EMPTY_NOTES)
  const [notifications, setNotifs] = usePersisted<AppNotification[]>(address, 'notifications', EMPTY_NOTIFS)
  const [reminderKeys, setReminderKeys] = usePersisted<string[]>(address, 'reminder-keys', EMPTY_KEYS)
  const [recurring, setRecurring] = usePersisted<Recurring[]>(address, 'recurring', EMPTY_RECURRING)
  const { balance, refetch } = useUsdcBalance(address)

  const floor = useMemo(() => {
    const open = invoices.filter((i) => i.status === 'pending').map((i) => BigInt(i.createdBlock))
    return open.length ? open.reduce((a, b) => (a < b ? a : b)) : undefined
  }, [invoices])
  const { transfers, progress, error, rescan } = useTransferScanner(address, floor)

  const notify = useCallback(
    (n: Pick<AppNotification, 'kind' | 'title' | 'body'>) => {
      setNotifs((prev) => [{ id: uid(), ts: Date.now(), read: false, ...n }, ...prev].slice(0, 60))
      toast(n.title, { description: n.body })
    },
    [setNotifs],
  )

  const addInvoice = useCallback((inv: Invoice) => setInvoices((p) => [inv, ...p]), [setInvoices])
  const updateInvoice = useCallback(
    (id: string, patch: Partial<Invoice>) => setInvoices((p) => p.map((i) => (i.id === id ? { ...i, ...patch } : i))),
    [setInvoices],
  )

  const trackedTx = useRef(new Set<string>())
  const watchTx = useCallback(
    (hash: Hex) => {
      if (trackedTx.current.has(hash)) return
      trackedTx.current.add(hash)
      publicClient
        .waitForTransactionReceipt({ hash, timeout: 120_000 })
        .then((r) => {
          setTxNotes((p) => p.map((n) => (n.hash === hash ? { ...n, status: r.status === 'success' ? 'confirmed' : 'failed' } : n)))
          void refetch()
        })
        .catch(() => trackedTx.current.delete(hash))
    },
    [setTxNotes, refetch],
  )

  const recordTx = useCallback(
    (note: TxNote) => {
      setTxNotes((p) => [note, ...p.filter((n) => n.hash !== note.hash)].slice(0, 200))
      watchTx(note.hash)
    },
    [setTxNotes, watchTx],
  )

  // Resume status tracking for anything still pending after a reload.
  useEffect(() => {
    txNotes.filter((n) => n.status === 'pending').forEach((n) => watchTx(n.hash))
  }, [txNotes, watchTx])

  // Automatic invoice verification: match a scanned transfer, then confirm it from the receipt.
  const verifying = useRef(new Set<string>())
  useEffect(() => {
    if (!address) return
    const used = new Set(invoices.filter((i) => i.paidTx).map((i) => `${i.paidTx}:${i.paidLogIndex}`))
    const pending = invoices.filter((i) => i.status === 'pending' && same(i.creator, address)).sort((a, b) => a.createdAt - b.createdAt)
    for (const inv of pending) {
      if (verifying.current.has(inv.id)) continue
      const match = transfers.find(
        (t) =>
          !used.has(`${t.hash}:${t.logIndex}`) &&
          same(t.to, inv.creator) &&
          same(t.from, inv.customer) &&
          BigInt(t.value) >= BigInt(inv.amount) &&
          BigInt(t.block) >= BigInt(inv.createdBlock),
      )
      if (!match) continue
      used.add(`${match.hash}:${match.logIndex}`)
      verifying.current.add(inv.id)
      void verifyInvoiceTx(inv, match.hash)
        .then((res) => {
          if (!res.ok) return
          updateInvoice(inv.id, {
            status: 'paid',
            paidTx: res.hash,
            paidLogIndex: res.logIndex,
            paidAt: Date.now(),
            paidAmount: res.value.toString(),
          })
          notify({
            kind: 'invoice-paid',
            title: `Invoice ${inv.number} paid`,
            body: `${fmtUsdc(res.value)} USDC confirmed from ${inv.customerName || shortAddr(inv.customer)}.`,
          })
          void refetch()
        })
        .finally(() => verifying.current.delete(inv.id))
    }
  }, [transfers, invoices, address, updateInvoice, notify, refetch])

  // Reminders for overdue invoices and due recurring payments, once each.
  useEffect(() => {
    if (!address) return
    const fresh: { key: string; title: string; body: string }[] = []
    for (const inv of invoices) {
      if (displayStatus(inv) === 'overdue' && !reminderKeys.includes(`inv:${inv.id}`)) {
        fresh.push({ key: `inv:${inv.id}`, title: `Invoice ${inv.number} is overdue`, body: `${fmtUsdc(inv.amount)} USDC from ${inv.customerName || shortAddr(inv.customer)} is past due.` })
      }
    }
    for (const r of recurring) {
      if (r.active && r.nextDue <= Date.now() && !reminderKeys.includes(`rec:${r.id}:${r.nextDue}`)) {
        fresh.push({ key: `rec:${r.id}:${r.nextDue}`, title: `Payment due: ${r.label}`, body: `${fmtUsdc(r.amount)} USDC to ${shortAddr(r.to)} is ready to send.` })
      }
    }
    if (!fresh.length) return
    setReminderKeys((p) => [...p, ...fresh.map((f) => f.key)].slice(-300))
    fresh.forEach((f) => notify({ kind: 'reminder', title: f.title, body: f.body }))
  }, [invoices, recurring, reminderKeys, address, notify, setReminderKeys])

  const value: FlowFiState = {
    address,
    isConnected,
    balance,
    refetchBalance: () => void refetch(),
    transfers,
    scanProgress: progress,
    scanError: error,
    rescan,
    invoices,
    addInvoice,
    updateInvoice,
    txNotes,
    recordTx,
    notifications,
    notify,
    markAllRead: () => setNotifs((p) => p.map((n) => ({ ...n, read: true }))),
    clearNotifications: () => setNotifs([]),
    recurring,
    setRecurring,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
