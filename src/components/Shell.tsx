import { useState, type ReactNode } from 'react'
import { ConnectKitButton } from 'connectkit'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, ArrowLeftRight, Bell, FileText, Layers, LayoutDashboard, Repeat, Search, Settings as SettingsIcon, ShieldCheck } from 'lucide-react'
import clsx from 'clsx'
import { useAccount } from 'wagmi'
import { CHAIN_ID } from '@/lib/chain'
import { timeAgo } from '@/lib/format'
import { useTheme } from '@/theme'
import { useFlowFi } from '@/state'
import { useEnsureChain } from '@/hooks/useChainWrite'
import type { View } from '@/lib/types'

type Item = { id: View; label: string; icon: typeof Bell }

export const NAV: Item[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'payments', label: 'Payments', icon: ArrowLeftRight },
  { id: 'invoices', label: 'Invoices', icon: FileText },
  { id: 'defi', label: 'DeFi', icon: Layers },
  { id: 'automation', label: 'Automation', icon: Repeat },
  { id: 'escrow', label: 'Escrow', icon: ShieldCheck },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
]

const GROUPS: { label: string; ids: View[] }[] = [
  { label: 'Main', ids: ['dashboard', 'payments', 'invoices'] },
  { label: 'Finance', ids: ['defi', 'automation', 'escrow'] },
  { label: 'Account', ids: ['settings'] },
]

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <rect width="32" height="32" rx="9" style={{ fill: 'rgb(var(--c-accent))' }} />
      <path d="M8 21c4 0 4-10 8-10s4 10 8 10" style={{ stroke: 'rgb(var(--c-onaccent))' }} strokeWidth="2.6" strokeLinecap="round" />
      <path d="M8 15.5c3 0 3.2-4 6-4" style={{ stroke: 'rgb(var(--c-onaccent))', strokeOpacity: 0.5 }} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function ThemeSwitch() {
  const { theme, setTheme } = useTheme()
  const dark = theme === 'dark'
  return (
    <div className="flex items-center justify-center gap-2.5 text-xs font-medium text-sidemuted">
      <span className={clsx(!dark && 'text-sideink')}>Light</span>
      <button
        role="switch"
        aria-checked={dark}
        aria-label="Dark mode"
        onClick={() => setTheme(dark ? 'light' : 'dark')}
        className="relative h-7 w-14 rounded-full border border-sideline bg-sideline/60 transition"
      >
        <motion.span
          className="absolute top-0.5 h-5 w-5 rounded-full bg-sidehl shadow"
          style={{ background: dark ? 'rgb(var(--c-accent))' : 'rgb(var(--c-sideink))' }}
          animate={{ left: dark ? 32 : 4 }}
          transition={{ type: 'spring', stiffness: 500, damping: 32 }}
        />
      </button>
      <span className={clsx(dark && 'text-sideink')}>Dark</span>
    </div>
  )
}

function Notifications() {
  const { notifications, markAllRead, clearNotifications } = useFlowFi()
  const [open, setOpen] = useState(false)
  const unread = notifications.filter((n) => !n.read).length
  return (
    <div className="relative">
      <button
        type="button"
        className="btn-ghost relative h-11 w-11 !rounded-full !px-0"
        aria-label="Notifications"
        onClick={() => {
          setOpen((o) => !o)
          if (!open) setTimeout(markAllRead, 1200)
        }}
      >
        <Bell className="h-[18px] w-[18px]" />
        {unread > 0 && <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-accent shadow-glow" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="card absolute right-0 z-40 mt-2 w-[min(92vw,360px)] overflow-hidden">
            <div className="flex items-center justify-between border-b border-line/50 px-4 py-3">
              <span className="font-display text-sm font-semibold">Notifications</span>
              {notifications.length > 0 && (
                <button className="text-xs text-muted hover:text-ink" onClick={clearNotifications}>
                  Clear all
                </button>
              )}
            </div>
            <div className="scroll-thin max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted">Payment confirmations and reminders appear here.</p>
              ) : (
                notifications.map((n) => (
                  <div key={n.id} className="border-b border-line/40 px-4 py-3 last:border-0">
                    <p className="text-sm font-medium text-ink">{n.title}</p>
                    <p className="mt-0.5 text-xs text-muted">{n.body}</p>
                    <p className="mt-1 text-[11px] text-muted/80">{timeAgo(n.ts)}</p>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function NetworkGuard() {
  const { isConnected, chainId } = useAccount()
  const ensure = useEnsureChain()
  if (!isConnected || chainId === CHAIN_ID) return null
  return (
    <button onClick={() => void ensure()} className="mb-5 flex w-full items-center gap-2 rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-left text-sm text-warn">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      Your wallet is on another network. Tap to switch to Arc Testnet.
    </button>
  )
}

export function Shell({ view, setView, children }: { view: View; setView: (v: View) => void; children: ReactNode }) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const title = NAV.find((n) => n.id === view)?.label ?? ''
  return (
    <div className="min-h-dvh">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-side p-5 text-sideink lg:flex">
        <div className="mb-6 flex items-center gap-3">
          <Logo />
          <p className="font-display text-lg font-semibold leading-none tracking-tight">FlowFi</p>
        </div>
        <div className="relative mb-5">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sidemuted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            aria-label="Search pages"
            className="h-10 w-full rounded-xl border border-sideline bg-sideline/40 pl-9 pr-3 text-sm text-sideink placeholder:text-sidemuted focus:border-sidehl focus:outline-none"
          />
        </div>
        <nav className="scroll-thin flex-1 space-y-5 overflow-y-auto" aria-label="Primary">
          {GROUPS.map((g) => {
            const items = g.ids.map((id) => NAV.find((n) => n.id === id)!).filter((n) => !q || n.label.toLowerCase().includes(q))
            if (!items.length) return null
            return (
              <div key={g.label}>
                <p className="mb-1.5 px-3 text-[11px] font-medium uppercase tracking-[0.1em] text-sidemuted">{g.label}</p>
                <div className="space-y-0.5">
                  {items.map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      onClick={() => setView(id)}
                      className={clsx('relative flex min-h-[42px] w-full items-center gap-3 rounded-xl px-3 text-sm font-medium transition', view === id ? 'text-sidehlfg' : 'text-sidemuted hover:bg-sideline/50 hover:text-sideink')}
                    >
                      {view === id && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-xl bg-sidehl" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
                      <Icon className="relative h-[18px] w-[18px]" />
                      <span className="relative">{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </nav>
        <div className="mt-4 space-y-4">
          <div className="rounded-xl border border-sideline bg-sideline/30 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold">
              <span className="h-2 w-2 rounded-full bg-ok" /> Arc Testnet
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-sidemuted">Testnet funds only. Use Get test USDC in the Arc Studio sidebar to top up.</p>
          </div>
          <ThemeSwitch />
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line/40 bg-bg/80 px-4 py-3 backdrop-blur-xl sm:px-8">
          <div className="flex items-center gap-2.5">
            <div className="lg:hidden"><Logo size={28} /></div>
            <h2 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">{title}</h2>
          </div>
          <div className="flex items-center gap-2">
            <div className="lg:hidden">
              <MobileTheme />
            </div>
            <Notifications />
            <ConnectKitButton.Custom>
              {({ isConnected, show, truncatedAddress }) => (
                <button onClick={show} className={isConnected ? 'btn-ghost !rounded-full font-mono text-xs' : 'btn-primary'}>
                  {isConnected && <span className="h-2 w-2 rounded-full bg-accent" />}
                  {isConnected ? truncatedAddress : 'Connect wallet'}
                </button>
              )}
            </ConnectKitButton.Custom>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-8 lg:pb-12">
          <NetworkGuard />
          <AnimatePresence mode="wait">
            <motion.div key={view} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-7 bg-side pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Primary mobile">
        {NAV.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setView(id)} className={clsx('flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[10px] font-medium', view === id ? 'text-accent' : 'text-sidemuted')}>
            <Icon className="h-5 w-5" />
            {label}
          </button>
        ))}
      </nav>
    </div>
  )
}

function MobileTheme() {
  const { theme, setTheme } = useTheme()
  return (
    <button className="btn-ghost h-11 !rounded-full px-3 text-xs" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle theme">
      {theme === 'dark' ? 'Light' : 'Dark'}
    </button>
  )
}
