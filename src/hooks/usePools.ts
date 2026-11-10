import { useQuery } from '@tanstack/react-query'
import { erc20Abi, parseAbi, type Address } from 'viem'
import { AMM_FACTORY, USDC_ADDRESS, publicClient } from '@/lib/chain'
import { same } from '@/lib/invoice'

export const factoryAbi = parseAbi(['function allPairsLength() view returns (uint256)', 'function allPairs(uint256) view returns (address)'])
export const pairAbi = parseAbi([
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function getReserves() view returns (uint112, uint112, uint32)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
])
export const routerAbi = parseAbi([
  'function addLiquidity(address tokenA,address tokenB,uint256 amountADesired,uint256 amountBDesired,uint256 amountAMin,uint256 amountBMin,address to,uint256 deadline) returns (uint256,uint256,uint256)',
  'function removeLiquidity(address tokenA,address tokenB,uint256 liquidity,uint256 amountAMin,uint256 amountBMin,address to,uint256 deadline) returns (uint256,uint256)',
])

export interface PoolToken {
  address: Address
  symbol: string
  decimals: number
}
export interface Pool {
  pair: Address
  token0: PoolToken
  token1: PoolToken
  reserve0: bigint
  reserve1: bigint
  totalSupply: bigint
  lp: bigint
}

const MAX_PAIRS = 24

async function loadPools(factory: Address, account?: Address): Promise<Pool[]> {
  const len = Number(await publicClient.readContract({ address: factory, abi: factoryAbi, functionName: 'allPairsLength' }))
  const start = Math.max(0, len - MAX_PAIRS)
  const idx = Array.from({ length: len - start }, (_, i) => BigInt(start + i))
  if (!idx.length) return []
  const pairs = (await publicClient.multicall({ contracts: idx.map((i) => ({ address: factory, abi: factoryAbi, functionName: 'allPairs' as const, args: [i] as const })), allowFailure: false }))
  const per = await Promise.all(
    pairs.map((pair) =>
      publicClient.multicall({
        allowFailure: false,
        contracts: [
          { address: pair, abi: pairAbi, functionName: 'token0' },
          { address: pair, abi: pairAbi, functionName: 'token1' },
          { address: pair, abi: pairAbi, functionName: 'getReserves' },
          { address: pair, abi: pairAbi, functionName: 'totalSupply' },
          { address: pair, abi: pairAbi, functionName: 'balanceOf', args: [account ?? '0x0000000000000000000000000000000000000001'] },
        ],
      }),
    ),
  )
  const tokenAddrs = [...new Set(per.flatMap((p) => [p[0], p[1]]))]
  const meta = new Map<string, PoolToken>()
  await Promise.all(
    tokenAddrs.map(async (address) => {
      const [symbol, decimals] = await publicClient.multicall({
        allowFailure: false,
        contracts: [
          { address, abi: erc20Abi, functionName: 'symbol' },
          { address, abi: erc20Abi, functionName: 'decimals' },
        ],
      })
      meta.set(address.toLowerCase(), { address, symbol, decimals })
    }),
  )
  return pairs.map((pair, i) => {
    const [t0, t1, reserves, totalSupply, lp] = per[i]
    return { pair, token0: meta.get(t0.toLowerCase())!, token1: meta.get(t1.toLowerCase())!, reserve0: reserves[0], reserve1: reserves[1], totalSupply, lp: account ? lp : 0n }
  })
}

/** Reads pools from a configured Uniswap V2 compatible factory. Returns empty when none is configured. */
export function usePools(account?: Address) {
  const q = useQuery({
    queryKey: ['pools', AMM_FACTORY, account],
    queryFn: () => loadPools(AMM_FACTORY!, account),
    enabled: !!AMM_FACTORY,
    refetchInterval: 15000,
  })
  const pools = q.data ?? []
  const positions = pools.filter((p) => p.lp > 0n)
  // Valued in USDC only for pairs that contain USDC (twice the USDC side of the share).
  const positionsValue = positions.reduce((sum, p) => {
    if (p.totalSupply === 0n) return sum
    if (same(p.token0.address, USDC_ADDRESS)) return sum + (2n * p.reserve0 * p.lp) / p.totalSupply
    if (same(p.token1.address, USDC_ADDRESS)) return sum + (2n * p.reserve1 * p.lp) / p.totalSupply
    return sum
  }, 0n)
  return { configured: !!AMM_FACTORY, pools, positions, positionsValue, isLoading: q.isLoading, error: q.error, refetch: q.refetch }
}
