import { AppKit } from '@circle-fin/app-kit'
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2'
import { numberToHex, type Chain, type EIP1193Provider } from 'viem'
import { arbitrumSepolia, arcTestnet, avalancheFuji, baseSepolia, optimismSepolia, polygonAmoy, sepolia } from 'viem/chains'
import type { Connector } from 'wagmi'

export const appKit = new AppKit()

export const BRIDGE_CHAINS = [
  { id: 'Arc_Testnet', name: 'Arc Testnet', chain: arcTestnet },
  { id: 'Ethereum_Sepolia', name: 'Ethereum Sepolia', chain: sepolia },
  { id: 'Base_Sepolia', name: 'Base Sepolia', chain: baseSepolia },
  { id: 'Arbitrum_Sepolia', name: 'Arbitrum Sepolia', chain: arbitrumSepolia },
  { id: 'Optimism_Sepolia', name: 'OP Sepolia', chain: optimismSepolia },
  { id: 'Avalanche_Fuji', name: 'Avalanche Fuji', chain: avalancheFuji },
  { id: 'Polygon_Amoy_Testnet', name: 'Polygon Amoy', chain: polygonAmoy },
] as const

export type BridgeChainId = (typeof BRIDGE_CHAINS)[number]['id']

const supportedChains: readonly Chain[] = BRIDGE_CHAINS.map((c) => c.chain)

const isUnrecognizedChain = (error: unknown) => {
  const e = error as { code?: number; data?: { originalError?: { code?: number } } }
  return e?.code === 4902 || e?.data?.originalError?.code === 4902
}

/** Adds an unknown chain to the wallet and retries when the adapter asks for a chain switch. */
function withAddChainFallback(provider: EIP1193Provider): EIP1193Provider {
  const send = (provider.request as unknown as (args: { method: string; params?: unknown }) => Promise<unknown>).bind(provider)
  const request = (async (args: { method: string; params?: unknown }) => {
    try {
      return await send(args)
    } catch (error) {
      if (args.method !== 'wallet_switchEthereumChain' || !isUnrecognizedChain(error)) throw error
      const [{ chainId }] = args.params as [{ chainId: string }]
      const chain = supportedChains.find((c) => c.id === Number(chainId))
      if (!chain) throw error
      await send({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: numberToHex(chain.id),
            chainName: chain.name,
            nativeCurrency: chain.nativeCurrency,
            rpcUrls: [...chain.rpcUrls.default.http],
            blockExplorerUrls: chain.blockExplorers ? [chain.blockExplorers.default.url] : undefined,
          },
        ],
      })
      return send(args)
    }
  }) as EIP1193Provider['request']
  return new Proxy(provider, {
    get(target, prop) {
      if (prop === 'request') return request
      const value: unknown = Reflect.get(target, prop, target)
      return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value
    },
  })
}

export async function adapterFromConnector(connector: Connector | undefined) {
  if (!connector) throw new Error('Wallet not connected')
  const provider = (await connector.getProvider()) as EIP1193Provider
  return createViemAdapterFromProvider({ provider: withAddChainFallback(provider) })
}

export function friendlySdkError(e: unknown): string {
  const msg = ((e as { message?: string })?.message ?? '').toLowerCase()
  if ((e as { code?: number })?.code === 4001 || msg.includes('user rejected') || msg.includes('user denied')) return ''
  if (msg.includes('unsupported_route') || msg.includes('no route') || msg.includes('not supported')) return 'No route is available for this pair on Arc Testnet right now.'
  if (msg.includes('insufficient')) return 'Insufficient balance for this transfer or its fees.'
  if (msg.includes('rate limit') || msg.includes('429')) return 'The quote service is rate limited. Wait a moment and retry.'
  return (e as { message?: string })?.message?.slice(0, 160) || 'Something went wrong. Please try again.'
}
