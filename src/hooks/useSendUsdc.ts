import { useCallback } from 'react'
import { useWriteContract } from 'wagmi'
import { erc20Abi, type Address, type Hex } from 'viem'
import { CHAIN_ID, USDC_ADDRESS, publicClient } from '@/lib/chain'
import { useFlowFi } from '@/state'
import { useEnsureChain } from '@/hooks/useChainWrite'
import type { TxNote } from '@/lib/types'

/** Sends USDC with the ERC-20 interface, records the transaction, and waits for the receipt on demand. */
export function useSendUsdc() {
  const { writeContractAsync } = useWriteContract()
  const ensure = useEnsureChain()
  const { recordTx, refetchBalance } = useFlowFi()

  const send = useCallback(
    async (to: Address, raw: bigint, kind: TxNote['kind'], note?: string): Promise<Hex> => {
      await ensure()
      const hash = await writeContractAsync({
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [to, raw],
        chainId: CHAIN_ID,
      })
      recordTx({ hash, to, amount: raw.toString(), note, createdAt: Date.now(), status: 'pending', kind })
      return hash
    },
    [ensure, writeContractAsync, recordTx],
  )

  const confirm = useCallback(
    async (hash: Hex): Promise<boolean> => {
      const r = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 })
      refetchBalance()
      return r.status === 'success'
    },
    [refetchBalance],
  )

  return { send, confirm }
}
