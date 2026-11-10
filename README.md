# FlowFi

A USDC financial operating system for Arc Testnet: payments, invoicing, payment automation, escrow and DeFi in one app.

Built with [Arc Studio](https://studio.arc.io)

## Features

- Wallet connection, USDC balance, sent and received totals, cash-flow chart and recent transactions
- Send USDC to any valid address, receive by address or QR code, and review confirmed history with explorer links
- Invoices with shareable payment links and QR codes. An invoice is marked paid only after a matching USDC transfer from the customer wallet is confirmed onchain
- Recurring payments, business payouts, payment reminders and payment tracking
- Escrow agreements with an optional referee and a reclaim deadline, backed by a smart contract
- Swap (USDC and EURC), CCTP bridge across testnets, and liquidity pools when a compatible AMM is configured
- Dark and light themes, switchable in Settings

Invoices, schedules, notes and notifications are stored in the browser for the connected wallet. Funds always stay in the user's wallet or in the escrow contract.

## Tech stack

React, Vite, TypeScript, Tailwind CSS, wagmi, viem, ConnectKit, Circle App Kit, Solidity (Foundry)

## Development

Prerequisites: Bun and Foundry.

```bash
bun install
bun run dev
```

Other scripts:

```bash
bun run check            # lint and typecheck
bun run contracts:build  # compile contracts
bun run contracts:test   # run contract tests
```

### Environment variables

| Name | Purpose |
| --- | --- |
| `VITE_FLOWFI_ESCROW` | Address of the deployed escrow contract |
| `VITE_ARC_TESTNET_EURC` | EURC token address on Arc Testnet (used by Swap) |
| `VITE_AMM_FACTORY` | Optional. Uniswap V2 compatible factory for the Pools page |
| `VITE_AMM_ROUTER` | Optional. Matching router for adding and removing liquidity |
| `RPC_PROXY_BASE_URL`, `RPC_PROXY_TOKEN`, `RPC_PROXY_CHAINS` | Optional outside Arc Studio. Provisioned RPC proxy, not read by the frontend |
