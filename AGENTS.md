# FlowFi

> Built with Arc Studio - money-powered apps in minutes

This is the **project memory** - what Arc Studio remembers about building this app. It helps future agents (or humans) understand and extend the project.

---

## What This App Does

FlowFi is a USDC financial operating system on Arc Testnet: payments, invoices with automatic onchain verification, automation (recurring, payouts, reminders), escrow, and DeFi (swap, CCTP bridge, pools). Dark navy fintech UI with a dark/light toggle in Settings.

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/`, unit tests in `contracts/test/*.t.sol`. Build with `bun run contracts:build` (`forge build`), test with `bun run contracts:test` (`forge test`).
- Wallet: injected (MetaMask, etc.)
- Chain: Arc Testnet (Chain ID: 5042002, imported from `viem/chains`)
- Token: USDC (6 decimals) (Address: 0x3600000000000000000000000000000000000000, Chain: Arc Testnet)
- Toasts: Sonner

## Key Files

- `src/App.tsx` - Main application logic
- `src/components/` - UI components
- `src/config.ts` - wagmi config (chains, connectors, transports)

## Share links

- Starter apps already ship `getShareBase`, `buildShareLink` and `installShareSync` in `src/lib/share.ts`; import them instead of rewriting them.
- Keep shareable state in the URL path or query, not in the `#fragment`.
- Never put a secret (private key, claim secret, seed phrase, session token, API key) in the URL path or query, encoded or not: every in-app path and query is mirrored to the visitor's studio.arc.io address bar and browser history and reaches servers. A bearer claim secret goes only in the `#fragment` appended to the share link (`` `${await buildShareLink('/claim')}#${secret}` ``) and is read from `location.hash` on load. A link to the app's own share URL shown inside the app must be copy-only or open in a new tab with `target="_blank" rel="noopener noreferrer"`.
- Build every link a user copies or sends with `buildShareLink()` from `src/lib/share.ts`.
- Keep the `installShareSync()` call in `src/main.tsx` when editing it; it keeps the Studio address bar in step with in-app navigation.
- Navigate inside the app with relative links.

## To Run

```bash
bun install
bun run dev
```

## Deployed contracts

- FlowFiEscrow (Arc Testnet): `0xd7d47e5b8cc42566ca42c91895ee04b5e2e1544d`, constructor arg = USDC `0x3600000000000000000000000000000000000000`. Address is in `.env` as `VITE_FLOWFI_ESCROW`. Every escrow needs a deadline (at most 365 days) after which the payer can reclaim; referee is optional.

## Architecture notes

- `src/state.tsx` holds wallet-scoped app state (invoices, notifications, tx notes, transfer scanner). Records persist in localStorage via `src/lib/store.ts`.
- `src/hooks/useTransferScanner.ts` reads USDC Transfer logs in bounded ranges from a persisted cursor (never block 0). Invoice payment detection matches a scanned transfer, then re-verifies the receipt with `verifyInvoiceTx` in `src/lib/invoice.ts`.
- Invoice payment links carry the invoice in `?inv=` (built with `buildShareLink`); payment is matched by creator, customer, amount and block.
- Chain facts (RPC, explorer, USDC) come from `@/onchain-facts`. The registry's RPC and explorer differ from the hosts in the original brief (`rpc.testnet.arc.network`, `testnet.arcscan.app`); the registry values are used.
- Swap and bridge use Circle App Kit (`src/lib/appkit.ts`). Pools read a Uniswap V2 style AMM from `VITE_AMM_FACTORY` and `VITE_AMM_ROUTER`; none is configured.
- Recurring payments are non-custodial: the app reminds and prepares each payment, the user signs it.
