import { useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Copy, ExternalLink, Loader2, X } from 'lucide-react'
import clsx from 'clsx'
import { txUrl } from '@/lib/chain'
import { shortHash } from '@/lib/format'

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx('card', className)}>{children}</div>
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 className="sr-only">{title}</h1>
      {subtitle ? <p className="max-w-xl text-pretty text-sm text-muted">{subtitle}</p> : <span />}
      {action}
    </div>
  )
}

/** Big amount with dimmed decimals, as in the reference wallet card. */
export function Money({ value, prefix, className }: { value: string; prefix?: string; className?: string }) {
  const [whole, frac] = value.split('.')
  return (
    <span className={clsx('num', className)}>
      {prefix}
      {whole}
      {frac !== undefined && <span className="text-muted/70">.{frac}</span>}
    </span>
  )
}

const TONES: Record<string, string> = {
  pending: 'bg-info/15 text-info',
  paid: 'bg-ok/15 text-ok',
  confirmed: 'bg-ok/15 text-ok',
  released: 'bg-ok/15 text-ok',
  funded: 'bg-info/15 text-info',
  overdue: 'bg-bad/15 text-bad',
  failed: 'bg-bad/15 text-bad',
  cancelled: 'bg-muted/15 text-muted',
  refunded: 'bg-muted/15 text-muted',
}

const LABELS: Record<string, string> = { fetchAttestation: 'Attestation' }

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return (
    <span className={clsx('inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold capitalize', TONES[status] ?? TONES.cancelled)}>
      {label ?? LABELS[status] ?? status}
    </span>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx('h-4 w-4 animate-spin', className)} aria-hidden />
}

export function CopyButton({ value, label, className }: { value: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      className={clsx('btn-ghost min-h-[36px] px-3 text-xs', className)}
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setDone(true)
          setTimeout(() => setDone(false), 1500)
        })
      }}
    >
      {done ? <Check className="h-3.5 w-3.5 text-ok" /> : <Copy className="h-3.5 w-3.5" />}
      {label ?? (done ? 'Copied' : 'Copy')}
    </button>
  )
}

export function TxLink({ hash }: { hash: string }) {
  return (
    <a
      href={txUrl(hash)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-mono text-xs text-accent hover:underline"
    >
      {shortHash(hash)}
      <ExternalLink className="h-3 w-3" />
    </a>
  )
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-line/70 bg-surface2/70 text-accent">{icon}</div>
      <p className="font-display text-base font-semibold text-ink">{title}</p>
      <p className="mt-1 max-w-xs text-pretty text-sm text-muted">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Field({ label, error, hint, children }: { label: string; error?: string | null; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {error ? <p className="mt-1.5 text-xs text-bad">{error}</p> : hint ? <p className="mt-1.5 text-xs text-muted">{hint}</p> : null}
    </div>
  )
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'bad'; children: ReactNode }) {
  const t = tone === 'bad' ? 'border-bad/30 bg-bad/10 text-bad' : tone === 'warn' ? 'border-warn/30 bg-warn/10 text-warn' : 'border-line/60 bg-surface2 text-ink'
  return <div className={clsx('rounded-xl border px-3.5 py-3 text-sm', t)}>{children}</div>
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-bg/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-label={title}
            className="card max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-b-none p-5 sm:rounded-b-2xl sm:p-6"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
              <button type="button" onClick={onClose} className="rounded-lg p-2 text-muted hover:bg-surface2 hover:text-ink" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { id: T; label: string }[] }) {
  return (
    <div className="inline-flex rounded-xl border border-line/50 bg-surface2 p-1" role="tablist">
      {items.map((it) => (
        <button
          key={it.id}
          role="tab"
          aria-selected={value === it.id}
          onClick={() => onChange(it.id)}
          className={clsx(
            'min-h-[38px] rounded-lg px-4 text-sm font-semibold transition',
            value === it.id ? 'bg-accent text-onaccent shadow-glow' : 'text-muted hover:text-ink',
          )}
        >
          {it.label}
        </button>
      ))}
    </div>
  )
}
