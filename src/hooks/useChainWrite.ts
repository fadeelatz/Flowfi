import { useCallback } from 'react'
import { useAccount, useReadContract, useSwitchChain } from 'wagmi'
import { erc20Abi, type Address } from 'viem'
import { CHAIN_ID, USDC_ADDRESS } from '@/lib/chain'

export function useUsdcBalance(address?: Address) {
  const q = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: !!address, refetchInterval: 5000 },
  })
  return { balance: q.data, refetch: q.refetch, isLoading: q.isLoading }
}

/** Returns a function that switches the wallet to Arc Testnet when needed. Call before any write. */
export function useEnsureChain() {
  const { chainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  return useCallback(async () => {
    if (chainId !== CHAIN_ID) await switchChainAsync({ chainId: CHAIN_ID })
  }, [chainId, switchChainAsync])
}
