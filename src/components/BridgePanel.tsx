import { useState } from 'react'
import { useAccount, useReadContract, useSwitchChain } from 'wagmi'
import { erc20Abi } from 'viem'
import { ArrowRight, CheckCircle2, CircleDashed, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { getChain, getUsdc, buildTxExplorerUrl } from '@/onchain-facts'
import { fmtUsdc, parseAmountInput, shortHash } from '@/lib/format'
import { BRIDGE_CHAINS, adapterFromConnector, appKit, friendlySdkError, type BridgeChainId } from '@/lib/appkit'
import { usePersisted } from '@/lib/store'
import { useFlowFi } from '@/state'
import { Card, Field, Notice, Spinner } from '@/components/ui'

type StepName = 'approve' | 'burn' | 'fetchAttestation' | 'mint'
type StepState = 'pending' | 'success' | 'error'
interface Step { name: StepName; state: StepState; txHash?: string }
interface BridgeRecord { id: string; from: BridgeChainId; to: BridgeChainId; amount: string; createdAt: number; state: 'running' | 'success' | 'error'; steps: Step[]; error?: string }

const NO_RECORDS: BridgeRecord[] = []
const LABEL: Record<StepName, string> = { approve: 'Approve USDC', burn: 'Burn on source chain', fetchAttestation: 'Circle attestation', mint: 'Mint on destination' }
const ORDER: StepName[] = ['approve', 'burn', 'fetchAttestation', 'mint']
type Estimate = Awaited<ReturnType<typeof appKit.estimateBridge>>

// Live step events from the SDK are forwarded to whichever transfer is running.
let sink: ((name: StepName, txHash?: string) => void) | null = null
const forward = (name: StepName) => (payload: { values?: unknown }) => {
  const v = payload.values as { txHash?: string; transactionHash?: string } | undefined
  sink?.(name, v?.txHash ?? v?.transactionHash)
}
appKit.on('bridge.approve', forward('approve'))
appKit.on('bridge.burn', forward('burn'))
appKit.on('bridge.fetchAttestation', forward('fetchAttestation'))
appKit.on('bridge.mint', forward('mint'))

const stepUrl = (chain: BridgeChainId, hash: string) => {
  const c = BRIDGE_CHAINS.find((x) => x.id === chain)?.chain
  return c && getChain(c.id) ? buildTxExplorerUrl(c.id, hash) : c?.blockExplorers ? `${c.blockExplorers.default.url}/tx/${hash}` : undefined
}

function ChainSelect({ value, onChange, label }: { value: BridgeChainId; onChange: (v: BridgeChainId) => void; label: string }) {
  return (
    <Field label={label}>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value as BridgeChainId)}>
        {BRIDGE_CHAINS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </Field>
  )
}

export function BridgePanel() {
  const { connector, address, chainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const { refetchBalance } = useFlowFi()
  const [records, setRecords] = usePersisted<BridgeRecord[]>(address, 'bridges', NO_RECORDS)
  const [from, setFrom] = useState<BridgeChainId>('Arc_Testnet')
  const [to, setTo] = useState<BridgeChainId>('Base_Sepolia')
  const [amount, setAmount] = useState('')
  const [estimate, setEstimate] = useState<Estimate | null>(null)
  const [busy, setBusy] = useState<'quote' | 'bridge' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const src = BRIDGE_CHAINS.find((c) => c.id === from)!
  const srcUsdc = getUsdc(src.chain.id)?.address
  const bal = useReadContract({ address: srcUsdc as `0x${string}` | undefined, abi: erc20Abi, functionName: 'balanceOf', args: address ? [address] : undefined, chainId: src.chain.id, query: { enabled: !!address && !!srcUsdc, refetchInterval: 10000 } })
  const parsed = parseAmountInput(amount, bal.data)
  const sameChain = from === to
  const active = records.find((r) => r.state === 'running')

  const prepare = async () => {
    if (chainId !== src.chain.id) await switchChainAsync({ chainId: src.chain.id })
    return adapterFromConnector(connector)
  }

  const quote = async () => {
    setBusy('quote')
    setError(null)
    setEstimate(null)
    try {
      const adapter = await prepare()
      setEstimate(await appKit.estimateBridge({ from: { adapter, chain: from }, to: { adapter, chain: to }, amount: amount.trim() }))
    } catch (e) {
      setError(friendlySdkError(e) || null)
    } finally {
      setBusy(null)
    }
  }

  const patch = (id: string, fn: (r: BridgeRecord) => BridgeRecord) => setRecords((p) => p.map((r) => (r.id === id ? fn(r) : r)))

  const run = async () => {
    setBusy('bridge')
    setError(null)
    const id = crypto.randomUUID()
    const rec: BridgeRecord = { id, from, to, amount: amount.trim(), createdAt: Date.now(), state: 'running', steps: ORDER.map((name) => ({ name, state: 'pending' })) }
    setRecords((p) => [rec, ...p].slice(0, 10))
    sink = (name, txHash) => patch(id, (r) => ({ ...r, steps: r.steps.map((s) => (s.name === name ? { ...s, state: 'success', txHash: txHash ?? s.txHash } : s)) }))
    try {
      const adapter = await prepare()
      const res = await appKit.bridge({ from: { adapter, chain: from }, to: { adapter, chain: to }, amount: amount.trim() })
      patch(id, (r) => ({
        ...r,
        state: res.state === 'success' ? 'success' : 'error',
        steps: r.steps.map((s) => {
          const found = res.steps.find((x) => x.name === s.name)
          return found ? { ...s, state: found.state === 'success' ? 'success' : found.state === 'error' ? 'error' : s.state, txHash: found.txHash ?? s.txHash } : s
        }),
        error: res.state === 'success' ? undefined : 'The transfer did not complete. Check the failed step below.',
      }))
      if (res.state === 'success') toast.success('Bridge complete')
      refetchBalance()
      void bal.refetch()
    } catch (e) {
      const msg = friendlySdkError(e)
      patch(id, (r) => ({ ...r, state: 'error', error: msg || 'Cancelled in wallet' }))
      if (msg) setError(msg)
    } finally {
      sink = null
      setBusy(null)
    }
  }

  return (
    <div className="mx-auto grid max-w-3xl gap-5">
      <Card className="card-pad">
        <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
          <ChainSelect value={from} onChange={(v) => { setFrom(v); setEstimate(null) }} label="From" />
          <button className="btn-ghost mx-auto hidden h-11 w-11 !px-0 sm:flex" aria-label="Swap chains" onClick={() => { setFrom(to); setTo(from); setEstimate(null) }}><ArrowRight className="h-4 w-4" /></button>
          <ChainSelect value={to} onChange={(v) => { setTo(v); setEstimate(null) }} label="To" />
        </div>
        <div className="mt-4">
          <Field label="Amount (USDC)" error={amount && !parsed.ok ? parsed.error : sameChain ? 'Choose two different chains' : null} hint={`Balance on ${src.name}: ${bal.data === undefined ? '…' : fmtUsdc(bal.data)} USDC`}>
            <input className="input num text-lg" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => { setAmount(e.target.value); setEstimate(null) }} />
          </Field>
        </div>
        {estimate && (
          <div className="inset mt-4 space-y-1.5 p-3.5 text-xs">
            {estimate.fees?.map((f, i) => f.amount ? <div key={i} className="flex justify-between"><span className="capitalize text-muted">{f.type} fee</span><span className="num">{f.amount} {f.token}</span></div> : null)}
            {estimate.gasFees?.map((g, i) => g.fees ? <div key={i} className="flex justify-between"><span className="text-muted">Network gas ({g.name})</span><span className="num">{g.fees.fee} {g.token}</span></div> : null)}
            <p className="pt-1 text-muted">Fast transfers usually finish within a minute. You may be asked to switch networks in your wallet for the mint step.</p>
          </div>
        )}
        {error && <div className="mt-4"><Notice tone="warn">{error}</Notice></div>}
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button className="btn-ghost" disabled={!address || !parsed.ok || sameChain || !!busy} onClick={() => void quote()}>{busy === 'quote' ? <Spinner /> : 'Estimate fees'}</button>
          <button className="btn-primary" disabled={!address || !parsed.ok || sameChain || !!busy || !!active} onClick={() => void run()}>{busy === 'bridge' ? (<><Spinner /> Bridging</>) : 'Bridge USDC'}</button>
        </div>
        {!address && <p className="mt-3 text-center text-xs text-muted">Connect your wallet to bridge.</p>}
      </Card>

      {records.length > 0 && (
        <Card className="card-pad">
          <h3 className="font-display text-base font-semibold">Transfers</h3>
          <div className="mt-3 space-y-4">
            {records.map((r) => (
              <div key={r.id} className="inset p-3.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold">{r.amount} USDC · {BRIDGE_CHAINS.find((c) => c.id === r.from)?.name} to {BRIDGE_CHAINS.find((c) => c.id === r.to)?.name}</span>
                  <span className={r.state === 'success' ? 'text-ok' : r.state === 'error' ? 'text-bad' : 'text-warn'}>{r.state === 'running' ? 'In progress' : r.state === 'success' ? 'Complete' : 'Failed'}</span>
                </div>
                <div className="mt-2 space-y-1.5">
                  {r.steps.map((s) => {
                    const url = s.txHash ? stepUrl(s.name === 'mint' ? r.to : r.from, s.txHash) : undefined
                    return (
                      <div key={s.name} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2">
                          {s.state === 'success' ? <CheckCircle2 className="h-3.5 w-3.5 text-ok" /> : s.state === 'error' || (r.state === 'error' && s.state === 'pending') ? <XCircle className="h-3.5 w-3.5 text-bad" /> : <CircleDashed className="h-3.5 w-3.5 text-muted" />}
                          {LABEL[s.name]}
                        </span>
                        {s.txHash && (url ? <a className="font-mono text-accent hover:underline" href={url} target="_blank" rel="noopener noreferrer">{shortHash(s.txHash)}</a> : <span className="font-mono">{shortHash(s.txHash)}</span>)}
                      </div>
                    )
                  })}
                </div>
                {r.error && <p className="mt-2 text-xs text-bad">{r.error}</p>}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
