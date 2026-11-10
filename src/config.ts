/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { arcTestnet, sepolia, baseSepolia, arbitrumSepolia, optimismSepolia, avalancheFuji, polygonAmoy } from 'viem/chains'
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(arcTestnet.id, arcTestnet.rpcUrls.default.http[0])

export const config = createConfig({
  // Other testnets are here so the CCTP bridge can switch the wallet to the source chain.
  chains: [arcTestnet, sepolia, baseSepolia, arbitrumSepolia, optimismSepolia, avalancheFuji, polygonAmoy, mainnet], // mainnet needed for ENS resolution
  connectors: [injected()],
  transports: {
    [arcTestnet.id]: http(),
    [sepolia.id]: http(),
    [baseSepolia.id]: http(),
    [arbitrumSepolia.id]: http(),
    [optimismSepolia.id]: http(),
    [avalancheFuji.id]: http(),
    [polygonAmoy.id]: http(),
    [mainnet.id]: http(), // ENS resolution uses mainnet
  },
})
