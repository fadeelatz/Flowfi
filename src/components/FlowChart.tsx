import { useId, useState } from 'react'

export interface Series {
  label: string
  /** CSS color, usually rgb(var(--c-accent)). */
  color: string
  values: number[]
}

function smooth(points: [number, number][]): string {
  if (points.length < 2) return ''
  let d = `M ${points[0][0]} ${points[0][1]}`
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i]
    const [x1, y1] = points[i + 1]
    const cx = (x0 + x1) / 2
    d += ` C ${cx} ${y0}, ${cx} ${y1}, ${x1} ${y1}`
  }
  return d
}

/** Dependency-free line and area chart over equally spaced buckets. */
export function FlowChart({ labels, series, height = 220 }: { labels: string[]; series: Series[]; height?: number }) {
  const id = useId().replace(/:/g, '')
  const [hover, setHover] = useState<number | null>(null)
  const W = 680
  const H = height
  const pad = { t: 12, b: 26, l: 34, r: 8 }
  const max = Math.max(1, ...series.flatMap((s) => s.values))
  const n = labels.length
  const x = (i: number) => pad.l + (n <= 1 ? 0 : (i * (W - pad.l - pad.r)) / (n - 1))
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b)
  const ticks = [0, 0.25, 0.5, 0.75, 1]
  const fmt = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : v >= 10 ? v.toFixed(0) : v.toFixed(1))

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          const rel = ((e.clientX - r.left) / r.width) * W
          setHover(Math.max(0, Math.min(n - 1, Math.round(((rel - pad.l) / (W - pad.l - pad.r)) * (n - 1)))))
        }}
        role="img"
        aria-label="Incoming and outgoing USDC per day"
      >
        <defs>
          {series.map((s, i) => (
            <linearGradient key={s.label} id={`${id}-g${i}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" style={{ stopColor: s.color, stopOpacity: 0.28 }} />
              <stop offset="100%" style={{ stopColor: s.color, stopOpacity: 0 }} />
            </linearGradient>
          ))}
        </defs>
        {ticks.map((g) => {
          const yy = pad.t + (1 - g) * (H - pad.t - pad.b)
          return (
            <g key={g}>
              <line x1={pad.l} x2={W - pad.r} y1={yy} y2={yy} style={{ stroke: 'rgb(var(--c-line))', strokeOpacity: 0.45 }} strokeDasharray={g === 0 ? undefined : '3 5'} />
              <text x={pad.l - 8} y={yy + 3} textAnchor="end" fontSize="10" style={{ fill: 'rgb(var(--c-muted))' }}>
                {fmt(g * max)}
              </text>
            </g>
          )
        })}
        {series.map((s, i) => {
          const line = smooth(s.values.map((v, k): [number, number] => [x(k), y(v)]))
          if (!line) return null
          return (
            <g key={s.label}>
              <path d={`${line} L ${x(n - 1)} ${H - pad.b} L ${x(0)} ${H - pad.b} Z`} fill={`url(#${id}-g${i})`} />
              <path d={line} fill="none" style={{ stroke: s.color }} strokeWidth="2" strokeLinecap="round" />
            </g>
          )
        })}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} style={{ stroke: 'rgb(var(--c-muted))', strokeOpacity: 0.5 }} />
            {series.map((s) => (
              <circle key={s.label} cx={x(hover)} cy={y(s.values[hover] ?? 0)} r="4.5" style={{ fill: s.color, stroke: 'rgb(var(--c-surface))' }} strokeWidth="2" />
            ))}
          </g>
        )}
        {labels.map((l, i) =>
          i % Math.ceil(n / 7) === 0 ? (
            <text key={l + i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="10" style={{ fill: 'rgb(var(--c-muted))' }}>
              {l}
            </text>
          ) : null,
        )}
      </svg>
      <div className="mt-1 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted">
        {series.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
            {s.label}
            {hover !== null && <span className="num font-semibold text-ink">{(s.values[hover] ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>}
          </span>
        ))}
        {hover !== null && <span className="ml-auto">{labels[hover]}</span>}
      </div>
    </div>
  )
}

/** Tiny trend line for rows and cards. */
export function Sparkline({ values, color = 'rgb(var(--c-accent))', width = 120, height = 36 }: { values: number[]; color?: string; width?: number; height?: number }) {
  const max = Math.max(...values, 0)
  const min = Math.min(...values, 0)
  const span = max - min || 1
  const pts = values.map((v, i): [number, number] => [(i * width) / Math.max(1, values.length - 1), height - 3 - ((v - min) / span) * (height - 6)])
  const d = smooth(pts)
  if (!d) return <svg width={width} height={height} aria-hidden />
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <path d={d} fill="none" style={{ stroke: color }} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
