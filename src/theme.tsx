import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ConnectKitProvider } from 'connectkit'
import { Toaster } from 'sonner'

export type Theme = 'dark' | 'light'

const KEY = 'flowfi:theme'

interface ThemeCtx {
  theme: Theme
  setTheme: (t: Theme) => void
}

const Ctx = createContext<ThemeCtx>({ theme: 'dark', setTheme: () => undefined })

function readTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
    try {
      localStorage.setItem(KEY, t)
    } catch {
      /* storage unavailable */
    }
  }, [])

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTheme() {
  return useContext(Ctx)
}

/** ConnectKit and toasts follow the app theme. */
export function ThemedProviders({ children }: { children: ReactNode }) {
  const { theme } = useTheme()
  return (
    <ConnectKitProvider
      mode={theme}
      customTheme={{
        '--ck-font-family': "'DM Sans', sans-serif",
        '--ck-accent-color': theme === 'dark' ? '#b8f57d' : '#7c4dd6',
        '--ck-accent-text-color': theme === 'dark' ? '#0b1408' : '#ffffff',
        '--ck-border-radius': '16px',
      }}
    >
      {children}
      <Toaster position="top-center" theme={theme} />
    </ConnectKitProvider>
  )
}
