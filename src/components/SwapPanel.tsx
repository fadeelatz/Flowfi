import { useState } from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { erc20Abi } from 'viem'
import { ArrowDownUp, ArrowRight } from 'lucide-react'
import { TokenEURC, TokenUSDC } from '@web3icons/react'
import { toast } from 'sonner'
import { CHAIN_ID, EURC_ADDRESS } from '@/lib/chain'
import { fmtUsdc, parseAmountInput } from '@/lib/format'
import { adapterFromConnector, appKit, friendlySdkError } from '@/lib/appkit'
import { useFlowFi } from '@/state'
import { useEnsureChain } from '@/hooks/useChainWrite'
import { Card, Money, Notice, Spinner, TxLink } from '@/components/ui'

type Token = 'USDC' | 'EURC'
type Estimate = Awaited<ReturnType<typeof appKit.estimateSwap>>
const SLIPPAGE = [50, 100, 300]

function TokenPill({ token }: { token: Token }) {
  const Icon = token === 'USDC' ? TokenUSDC : TokenEURC
  return (
    <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-line/50 bg-surface px-3 py-1.5 text-sm font-semibold">
      <Icon variant="branded" size={22} />
      {token}
    </span>
  )
}

export function SwapPanel() {
  const { connector } = useAccount()
  const { address, balance: usdcBalance, refetchBalance } = useFlowFi()
  const ensure = useEnsureChain()
  const [tokenIn, setTokenIn] = useState<Token>('USDC')
  const tokenOut: Token = tokenIn === 'USDC' ? 'EURC' : 'USDC'
  const [amount, setAmount] = useState('')
  const [slip, setSlip] = useState(100)
  const [estimate, setEstimate] = useState<Estimate | null>(null)
  const [busy, setBusy] = useState<'quote' | 'swap' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ hash: string; out?: string } | null>(null)

  const eurc = useReadContract({ address: EURC_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: address ? [address] : undefined, chainId: CHAIN_ID, query: { enabled: !!address && !!EURC_ADDRESS, refetchInterval: 8000 } })
  const balIn = tokenIn === 'USDC' ? usdcBalance : (eurc.data)
  const parsed = parseAmountInput(amount, balIn)
  const reset = () => {
    setEstimate(null)
    setDone(null)
    setError(null)
  }

  const quote = async () => {
    if (!parsed.ok) return
    setBusy('quote')
    reset()
    try {
      await ensure()
      const adapter = await adapterFromConnector(connector)
      setEstimate(await appKit.estimateSwap({ from: { adapter, chain: 'Arc_Testnet' }, tokenIn, tokenOut, amountIn: amount.trim(), config: { slippageBps: slip } }))
    } catch (e) {
      setError(friendlySdkError(e) || null)
    } finally {
      setBusy(null)
    }
  }

  const swap = async () => {
    if (!estimate) return
    setBusy('swap')
    setError(null)
    try {
      await ensure()
      const adapter = await adapterFromConnector(connector)
      const res = await appKit.swap({ from: { adapter, chain: 'Arc_Testnet' }, tokenIn, tokenOut, amountIn: amount.trim(), config: { slippageBps: slip } })
      setDone({ hash: res.txHash, out: res.amountOut })
      setEstimate(null)
      refetchBalance()
      void eurc.refetch()
      toast.success('Swap submitted')
    } catch (e) {
      setError(friendlySdkError(e) || null)
    } finally {
      setBusy(null)
    }
  }

  const rate = estimate && Number(estimate.amountIn) > 0 ? Number(estimate.estimatedOutput.amount) / Number(estimate.amountIn) : null
  const outText = estimate ? estimate.estimatedOutput.amount : '0.00'

  return (
    <Card className="card-pad mx-auto max-w-lg">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold">Swap</h2>
        <div className="flex gap-1.5" aria-label="Max slippage">
          {SLIPPAGE.map((s) => (
            <button key={s} onClick={() => { setSlip(s); reset() }} className={`min-h-[32px] rounded-full px-3 text-xs font-semibold transition ${slip === s ? 'bg-accent text-onaccent' : 'bg-surface2 text-muted hover:text-ink'}`}>
              {s / 100}%
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <div className="rounded-2xl bg-surface2 p-5">
          <div className="flex items-center justify-between text-xs text-muted">
            <span className="font-medium uppercase tracking-[0.08em]">From</span>
            <span>
              Available: <span className="num text-ink">{balIn === undefined ? '…' : fmtUsdc(balIn)}</span>
              <button className="ml-2 rounded-md bg-surface px-1.5 py-0.5 font-semibold text-accent" onClick={() => { if (balIn !== undefined) { setAmount((Number(balIn) / 1e6).toFixed(6).replace(/\.?0+$/, '')); reset() } }}>MAX</button>
            </span>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <TokenPill token={tokenIn} />
            <input
              className="num min-w-0 flex-1 bg-transparent text-right font-display text-4xl font-semibold text-ink outline-none placeholder:text-muted/40"
              inputMode="decimal"
              placeholder="0.00"
              aria-label="Amount to swap"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); reset() }}
            />
          </div>
        </div>

        <div className="relative z-10 -my-4 flex justify-center">
          <button className="flex h-10 w-10 items-center justify-center rounded-full border-4 border-surface bg-accent text-onaccent shadow-glow" aria-label="Reverse pair" onClick={() => { setTokenIn(tokenOut); reset() }}>
            <ArrowDownUp className="h-4 w-4" />
          </button>
        </div>

        <div className="rounded-2xl bg-surface2 p-5">
          <div className="text-xs font-medium uppercase tracking-[0.08em] text-muted">To (estimate)</div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <TokenPill token={tokenOut} />
            <p className="min-w-0 flex-1 truncate text-right font-display text-4xl font-semibold text-ink"><Money value={outText} /></p>
          </div>
        </div>
      </div>

      {estimate && (
        <div className="mt-4 space-y-1.5 text-xs">
          <div className="flex justify-between"><span className="text-muted">Rate</span><span className="num text-ink">1 {tokenIn} ≈ {rate?.toFixed(4)} {tokenOut}</span></div>
          <div className="flex justify-between"><span className="text-muted">Minimum received</span><span className="num text-ink">{estimate.stopLimit.amount} {estimate.stopLimit.token}</span></div>
          {(estimate.fees ?? []).map((f, i) => (
            <div key={i} className="flex justify-between"><span className="capitalize text-muted">{f.type} fee</span><span className="num text-ink">{f.amount ?? '0'} {f.token}</span></div>
          ))}
          <p className="pt-1 text-muted">Quotes can move before execution. Routed by a swap provider chosen by Circle App Kit (a third-party aggregator or Circle); provider terms apply.</p>
        </div>
      )}
      {error && <div className="mt-4"><Notice tone="warn">{error}</Notice></div>}
      {done && <div className="mt-4"><Notice>Swap submitted{done.out ? `: received ${done.out} ${tokenOut}` : ''}. <TxLink hash={done.hash} /></Notice></div>}

      {estimate ? (
        <button className="btn-primary mt-5 !min-h-[56px] w-full justify-between px-6 text-base" disabled={busy === 'swap'} onClick={() => void swap()}>
          {busy === 'swap' ? (<><span className="flex items-center gap-2"><Spinner /> Confirm in your wallet</span></>) : (<><span>Confirm Swap</span><ArrowRight className="h-5 w-5" /></>)}
        </button>
      ) : (
        <button className="btn-primary mt-5 !min-h-[56px] w-full justify-between px-6 text-base" disabled={!address || !parsed.ok || busy === 'quote'} onClick={() => void quote()}>
          {busy === 'quote' ? (<span className="flex items-center gap-2"><Spinner /> Getting quote</span>) : (<><span>{parsed.ok || !amount ? 'Review quote' : parsed.error}</span><ArrowRight className="h-5 w-5" /></>)}
        </button>
      )}
      {!address && <p className="mt-3 text-center text-xs text-muted">Connect your wallet to swap.</p>}
    </Card>
  )
}
