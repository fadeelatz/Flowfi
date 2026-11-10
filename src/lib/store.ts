import { useCallback, useSyncExternalStore } from 'react'

/**
 * Tiny localStorage-backed store shared across components.
 * FlowFi records (invoices, schedules, notes) live in this browser, scoped per wallet.
 */
const cache = new Map<string, unknown>()
const listeners = new Map<string, Set<() => void>>()

function read<T>(key: string, initial: T): T {
  if (cache.has(key)) return cache.get(key) as T
  let value = initial
  try {
    const raw = localStorage.getItem(key)
    if (raw) value = JSON.parse(raw) as T
  } catch {
    /* corrupted or unavailable */
  }
  cache.set(key, value)
  return value
}

function write<T>(key: string, value: T) {
  cache.set(key, value)
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage full or unavailable */
  }
  listeners.get(key)?.forEach((fn) => fn())
}

function subscribe(key: string, fn: () => void) {
  let set = listeners.get(key)
  if (!set) listeners.set(key, (set = new Set()))
  set.add(fn)
  return () => {
    set.delete(fn)
  }
}

/** Removes every stored FlowFi record for a wallet. */
export function clearScope(scope: string | undefined) {
  const prefix = storageKey(scope, '')
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(prefix))
      .forEach((k) => localStorage.removeItem(k))
  } catch {
    /* storage unavailable */
  }
  for (const k of [...cache.keys()].filter((key) => key.startsWith(prefix))) {
    cache.delete(k)
    listeners.get(k)?.forEach((fn) => fn())
  }
}

export const storageKey = (scope: string | undefined, name: string) =>
  `flowfi:v1:${(scope ?? 'anon').toLowerCase()}:${name}`

/** `initial` must be a stable reference (module constant). */
export function usePersisted<T>(scope: string | undefined, name: string, initial: T) {
  const key = storageKey(scope, name)
  const value = useSyncExternalStore(
    (fn) => subscribe(key, fn),
    () => read(key, initial),
  )
  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      const prev = read(key, initial)
      write(key, typeof next === 'function' ? (next as (p: T) => T)(prev) : next)
    },
    [key, initial],
  )
  return [value, set] as const
}
