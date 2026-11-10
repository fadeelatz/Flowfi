import { createPublicClient, http, type Address } from 'viem'
import { arcTestnet } from 'viem/chains'
import { buildAddressExplorerUrl, buildTxExplorerUrl, getUsdc, requireChain } from '@/onchain-facts'

export const CHAIN_ID = arcTestnet.id
export const CHAIN = requireChain(CHAIN_ID)
export const USDC_ADDRESS = (getUsdc(CHAIN_ID)?.address ?? '0x3600000000000000000000000000000000000000') as Address

/** EURC on Arc Testnet is not in the facts registry, so it comes from .env. */
export const EURC_ADDRESS = (import.meta.env.VITE_ARC_TESTNET_EURC || undefined) as Address | undefined

/** Deployed FlowFiEscrow address (set in .env after deploy). */
export const ESCROW_ADDRESS = (import.meta.env.VITE_FLOWFI_ESCROW || undefined) as Address | undefined

/** Optional Uniswap V2 compatible AMM on Arc Testnet, used by the Pools page when configured. */
export const AMM_FACTORY = (import.meta.env.VITE_AMM_FACTORY || undefined) as Address | undefined
export const AMM_ROUTER = (import.meta.env.VITE_AMM_ROUTER || undefined) as Address | undefined

export const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(CHAIN.rpcUrls[0]),
})

export const txUrl = (hash: string) => buildTxExplorerUrl(CHAIN_ID, hash)
export const addressUrl = (address: string) => buildAddressExplorerUrl(CHAIN_ID, address)
export const explorerName = 'Arc Explorer'
