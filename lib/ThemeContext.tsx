import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from './supabase'

const DEFAULT_COLOR  = '#1a6470'
const DARK_MODE_KEY  = '@valera_dark_mode'

type ThemeCtx = {
  primaryColor: string
  setPrimaryColor: (color: string) => void
  darkMode: boolean
  toggleDarkMode: () => void
}

const ThemeContext = createContext<ThemeCtx>({
  primaryColor:    DEFAULT_COLOR,
  setPrimaryColor: () => {},
  darkMode:        true,
  toggleDarkMode:  () => {},
})

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [primaryColor, setPrimaryColor] = useState(DEFAULT_COLOR)
  const [darkMode, setDarkMode]         = useState(true)

  // Cargar preferencia guardada al iniciar
  useEffect(() => {
    AsyncStorage.getItem(DARK_MODE_KEY).then(val => {
      if (val !== null) setDarkMode(val === 'true')
    })
  }, [])

  // Cargar color de acento al hacer login
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

  function toggleDarkMode() {
    setDarkMode(prev => {
      const next = !prev
      AsyncStorage.setItem(DARK_MODE_KEY, String(next))
      return next
    })
  }

  return (
    <ThemeContext.Provider value={{ primaryColor, setPrimaryColor, darkMode, toggleDarkMode }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
