import { useEffect, useRef, useState } from 'react'
import type { Address } from 'viem'
import { USDC_ADDRESS, publicClient } from '@/lib/chain'
import { TRANSFER_EVENT } from '@/lib/invoice'
import { usePersisted } from '@/lib/store'
import type { ChainTransfer, ScanState } from '@/lib/types'

const LOOKBACK = 20_000n
const MAX_ITEMS = 400
const MAX_ROUNDS_PER_TICK = 6
const INITIAL: ScanState = { items: [] }

export interface ScanProgress {
  cursor: bigint
  head: bigint
}

/**
 * Reads USDC Transfer logs to and from the wallet in bounded block ranges, resuming from a
 * persisted cursor. The first scan starts a bounded distance behind the chain head (or at the
 * oldest open invoice), never at block zero.
 */
export function useTransferScanner(address: Address | undefined, floorBlock?: bigint) {
  const [state, setState] = usePersisted<ScanState>(address, 'scan', INITIAL)
  const [progress, setProgress] = useState<ScanProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const stateRef = useRef(state)
  const floorRef = useRef(floorBlock)
  useEffect(() => {
    stateRef.current = state
    floorRef.current = floorBlock
  })
  const busy = useRef(false)
  const chunk = useRef(2000n)

  useEffect(() => {
    if (!address) return
    const ctl = { cancelled: false }

    const fetchRange = async (fromBlock: bigint, toBlock: bigint): Promise<ChainTransfer[]> => {
      const [out, inn] = await Promise.all([
        publicClient.getLogs({ address: USDC_ADDRESS, event: TRANSFER_EVENT, args: { from: address }, fromBlock, toBlock }),
        publicClient.getLogs({ address: USDC_ADDRESS, event: TRANSFER_EVENT, args: { to: address }, fromBlock, toBlock }),
      ])
      return [...out, ...inn].flatMap((l) =>
        l.transactionHash && l.logIndex !== null && l.blockNumber !== null
          ? [
              {
                hash: l.transactionHash,
                logIndex: l.logIndex,
                block: l.blockNumber.toString(),
                from: l.args.from as Address,
                to: l.args.to as Address,
                value: (l.args.value ?? 0n).toString(),
              },
            ]
          : [],
      )
    }

    const tick = async () => {
      if (busy.current) return
      busy.current = true
      try {
        const head = await publicClient.getBlockNumber()
        let cursor: bigint
        if (stateRef.current.cursor) {
          cursor = BigInt(stateRef.current.cursor)
        } else {
          const base = head > LOOKBACK ? head - LOOKBACK : 0n
          const floor = floorRef.current
          cursor = floor !== undefined && floor < base ? floor : base
        }
        const map = new Map<string, ChainTransfer>(stateRef.current.items.map((t) => [`${t.hash}:${t.logIndex}`, t]))
        let rounds = 0
        while (cursor <= head && rounds < MAX_ROUNDS_PER_TICK && !ctl.cancelled) {
          const to = cursor + chunk.current - 1n > head ? head : cursor + chunk.current - 1n
          const found = await fetchRange(cursor, to)
          for (const t of found) map.set(`${t.hash}:${t.logIndex}`, { ...map.get(`${t.hash}:${t.logIndex}`), ...t })
          cursor = to + 1n
          rounds++
          const items = [...map.values()].sort((a, b) => Number(BigInt(b.block) - BigInt(a.block))).slice(0, MAX_ITEMS)
          setState({ cursor: cursor.toString(), items })
          setProgress({ cursor, head })
        }
        // Fill in block timestamps for a few transfers per tick.
        const missing = [...new Set(stateRef.current.items.filter((t) => t.ts === undefined).map((t) => t.block))].slice(0, 6)
        if (missing.length && !ctl.cancelled) {
          const stamps = new Map<string, number>()
          await Promise.all(
            missing.map(async (b) => {
              const blk = await publicClient.getBlock({ blockNumber: BigInt(b) })
              stamps.set(b, Number(blk.timestamp) * 1000)
            }),
          )
          setState((s) => ({ ...s, items: s.items.map((t) => (t.ts === undefined && stamps.has(t.block) ? { ...t, ts: stamps.get(t.block) } : t)) }))
        }
        setError(null)
      } catch {
        chunk.current = chunk.current > 500n ? chunk.current / 2n : 250n
        setError('Could not reach Arc Testnet. Retrying.')
      } finally {
        busy.current = false
      }
    }

    void tick()
    const timer = setInterval(() => void tick(), 4000)
    return () => {
      ctl.cancelled = true
      clearInterval(timer)
    }
  }, [address, setState])

  const rescan = () => setState({ items: [] })

  return { transfers: state.items, progress, error, rescan }
}
