import { useState } from 'react'
import { useAccount, useWriteContract } from 'wagmi'
import { erc20Abi, formatUnits, parseUnits } from 'viem'
import { Droplets } from 'lucide-react'
import { toast } from 'sonner'
import { AMM_FACTORY, AMM_ROUTER, CHAIN_ID, addressUrl, publicClient } from '@/lib/chain'
import { parseTxError } from '@/lib/format'
import { usePools, pairAbi, routerAbi, type Pool } from '@/hooks/usePools'
import { useEnsureChain } from '@/hooks/useChainWrite'
import { Card, EmptyState, Field, Notice, Spinner } from '@/components/ui'

const fmt = (raw: bigint, d: number) => Number(formatUnits(raw, d)).toLocaleString(undefined, { maximumFractionDigits: 4 })

function ManagePool({ pool, onDone }: { pool: Pool; onDone: () => void }) {
  const { address } = useAccount()
  const ensure = useEnsureChain()
  const { writeContractAsync } = useWriteContract()
  const [mode, setMode] = useState<'add' | 'remove'>('add')
  const [amount0, setAmount0] = useState('')
  const [pct, setPct] = useState(100)
  const [busy, setBusy] = useState(false)
  const { token0, token1 } = pool

  let a0 = 0n
  try {
    a0 = amount0 ? parseUnits(amount0, token0.decimals) : 0n
  } catch {
    a0 = 0n
  }
  const a1 = pool.reserve0 > 0n ? (a0 * pool.reserve1) / pool.reserve0 : 0n
  const lpToRemove = (pool.lp * BigInt(pct)) / 100n
  const deadline = () => BigInt(Math.floor(Date.now() / 1000) + 1200)
  const tx = async (p: Parameters<typeof writeContractAsync>[0]) => {
    const h = await writeContractAsync(p)
    const r = await publicClient.waitForTransactionReceipt({ hash: h })
    if (r.status !== 'success') throw new Error('reverted')
  }

  const run = async () => {
    if (!address || !AMM_ROUTER) return
    setBusy(true)
    try {
      await ensure()
      if (mode === 'add') {
        for (const [token, amt] of [[token0.address, a0], [token1.address, a1]] as const) {
          const allowance = await publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'allowance', args: [address, AMM_ROUTER] })
          if (allowance < amt) await tx({ address: token, abi: erc20Abi, functionName: 'approve', args: [AMM_ROUTER, amt], chainId: CHAIN_ID })
        }
        await tx({ address: AMM_ROUTER, abi: routerAbi, functionName: 'addLiquidity', args: [token0.address, token1.address, a0, a1, (a0 * 99n) / 100n, (a1 * 99n) / 100n, address, deadline()], chainId: CHAIN_ID })
      } else {
        await tx({ address: pool.pair, abi: pairAbi, functionName: 'approve', args: [AMM_ROUTER, lpToRemove], chainId: CHAIN_ID })
        const out0 = (pool.reserve0 * lpToRemove) / pool.totalSupply
        const out1 = (pool.reserve1 * lpToRemove) / pool.totalSupply
        await tx({ address: AMM_ROUTER, abi: routerAbi, functionName: 'removeLiquidity', args: [token0.address, token1.address, lpToRemove, (out0 * 99n) / 100n, (out1 * 99n) / 100n, address, deadline()], chainId: CHAIN_ID })
      }
      toast.success(mode === 'add' ? 'Liquidity added' : 'Liquidity removed')
      onDone()
    } catch (e) {
      const m = parseTxError(e)
      if (m) toast.error(m)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex rounded-xl bg-surface2 p-1">
        {(['add', 'remove'] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)} className={`min-h-[38px] flex-1 rounded-lg px-4 text-sm font-semibold ${mode === m ? 'bg-teal text-bg' : 'text-muted'}`}>{m === 'add' ? 'Paired Token' : 'Remove'}</button>
        ))}
      </div>
      {mode === 'add' ? (
        <>
          <Field label={`${token0.symbol} amount`}><input className="input num" inputMode="decimal" value={amount0} onChange={(e) => setAmount0(e.target.value)} placeholder="0.0" /></Field>
          <div className="inset p-3.5 text-sm"><span className="text-muted">Required {token1.symbol}: </span><span className="num font-semibold">{fmt(a1, token1.decimals)}</span><p className="mt-1 text-xs text-muted">Calculated from the current pool ratio. Minimums allow 1% slippage.</p></div>
        </>
      ) : (
        <Field label={`Remove ${pct}% of your position`}><input type="range" min={1} max={100} value={pct} onChange={(e) => setPct(Number(e.target.value))} className="w-full accent-[rgb(var(--c-accent))]" /></Field>
      )}
      <button className="btn !min-h-[52px] w-full bg-teal text-bg hover:brightness-110" disabled={busy || !AMM_ROUTER || (mode === 'add' ? a0 <= 0n || a1 <= 0n : pool.lp <= 0n)} onClick={() => void run()}>{busy ? <Spinner /> : mode === 'add' ? 'Approve and add liquidity' : 'Remove liquidity'}</button>
    </div>
  )
}

export function PoolsPanel() {
  const { address } = useAccount()
  const { configured, pools, positions, isLoading, refetch } = usePools(address)
  const [open, setOpen] = useState<Pool | null>(null)

  if (!configured) {
    return (
      <Card className="card-pad mx-auto max-w-2xl">
        <EmptyState
          icon={<Droplets className="h-5 w-5" />}
          title="Liquidity pools need an AMM on Arc Testnet"
          body="FlowFi reads pools from any Uniswap V2 compatible factory and router. None is configured, so no pools, positions or APRs are shown instead of inventing them."
        />
        <div className="inset mx-auto mt-2 max-w-md space-y-1 p-3.5 font-mono text-xs text-muted">
          <p>VITE_AMM_FACTORY=0x… (factory)</p>
          <p>VITE_AMM_ROUTER=0x… (router)</p>
        </div>
        <p className="mt-3 text-center text-xs text-muted">Add both to .env and restart the dev server. Pool shares, reserves and your positions load from the chain.</p>
      </Card>
    )
  }

  const sel = open ?? pools[0] ?? null
  return (
    <div className="grid gap-5 lg:grid-cols-5">
      <div className="space-y-5 lg:col-span-3">
        <Card className="card-pad">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-base font-semibold">Pool Choice</h2>
            <a className="text-xs text-teal hover:underline" href={addressUrl(AMM_FACTORY!)} target="_blank" rel="noopener noreferrer">Factory contract</a>
          </div>
          {isLoading ? (
            <div className="py-10 text-center"><Spinner /></div>
          ) : pools.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">This factory has no pools yet.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {pools.map((p) => {
                const active = sel?.pair === p.pair
                return (
                  <div key={p.pair} className={`relative overflow-hidden rounded-2xl border bg-gradient-to-b from-teal/15 to-surface2 p-4 ${active ? 'border-teal/70 shadow-[0_0_30px_-8px_rgb(var(--c-teal)/0.6)]' : 'border-teal/20'}`}>
                    <p className="font-display text-lg font-semibold">{p.token0.symbol}/{p.token1.symbol}</p>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div><p className="text-muted">{p.token0.symbol} reserve</p><p className="num mt-0.5 font-semibold text-ink">{fmt(p.reserve0, p.token0.decimals)}</p></div>
                      <div><p className="text-muted">{p.token1.symbol} reserve</p><p className="num mt-0.5 font-semibold text-ink">{fmt(p.reserve1, p.token1.decimals)}</p></div>
                      <div><p className="text-muted">Swap fee</p><p className="mt-0.5 font-semibold text-ink">0.30%</p></div>
                      <div><p className="text-muted">Your share</p><p className="num mt-0.5 font-semibold text-ink">{p.totalSupply > 0n ? ((Number(p.lp) / Number(p.totalSupply)) * 100).toFixed(2) : '0.00'}%</p></div>
                    </div>
                    <button className="mt-4 min-h-[40px] w-full rounded-xl border border-teal/50 text-sm font-semibold text-teal transition hover:bg-teal/10 disabled:opacity-50" disabled={!address || !AMM_ROUTER} onClick={() => setOpen(p)}>Supply Liquidity</button>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        <Card className="card-pad">
          <h2 className="font-display text-base font-semibold">My Pool Share Valuation</h2>
          {positions.length === 0 ? <p className="py-6 text-center text-sm text-muted">You have no liquidity positions.</p> : (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {positions.map((p) => (
                <button key={p.pair} className="inset p-3.5 text-left" onClick={() => setOpen(p)}>
                  <p className="font-semibold">{p.token0.symbol}/{p.token1.symbol}</p>
                  <p className="num mt-1 text-xs text-muted">{((Number(p.lp) / Number(p.totalSupply)) * 100).toFixed(2)}% of pool</p>
                  <p className="num mt-1 text-xs">{fmt((p.reserve0 * p.lp) / p.totalSupply, p.token0.decimals)} {p.token0.symbol} + {fmt((p.reserve1 * p.lp) / p.totalSupply, p.token1.decimals)} {p.token1.symbol}</p>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="card-pad h-fit lg:col-span-2">
        <h2 className="mb-4 font-display text-base font-semibold">Liquidity</h2>
        {sel ? (
          <>
            <p className="mb-3 text-sm text-muted">{sel.token0.symbol}/{sel.token1.symbol} pool</p>
            <ManagePool key={sel.pair} pool={sel} onDone={() => { void refetch() }} />
          </>
        ) : (
          <p className="py-6 text-center text-sm text-muted">Choose a pool to add or remove liquidity.</p>
        )}
        {!AMM_ROUTER && <div className="mt-4"><Notice tone="warn">Set VITE_AMM_ROUTER to add or remove liquidity.</Notice></div>}
      </Card>
    </div>
  )
}
