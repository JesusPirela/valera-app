import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { supabase } from './supabase'

const DEFAULT_COLOR = '#1a6470'

type ThemeCtx = {
  primaryColor: string
  setPrimaryColor: (color: string) => void
}

const ThemeContext = createContext<ThemeCtx>({
  primaryColor: DEFAULT_COLOR,
  setPrimaryColor: () => {},
})

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [primaryColor, setPrimaryColor] = useState(DEFAULT_COLOR)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        const { data } = await supabase
          .from('profiles')
          .select('color_acento')
          .eq('id', session.user.id)
          .single()
        if (data?.color_acento) setPrimaryColor(data.color_acento)
      } else {
        setPrimaryColor(DEFAULT_COLOR)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  return (
    <ThemeContext.Provider value={{ primaryColor, setPrimaryColor }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
