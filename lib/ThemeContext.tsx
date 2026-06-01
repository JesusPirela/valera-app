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

const DARK = {
  bg:          '#0d1b2a',
  bg2:         '#0a1520',
  card:        '#111f2e',
  border:      '#1e3448',
  text:        '#e8f0f4',
  textSub:     '#7a9ab5',
  textMute:    '#556a7a',
  input:       '#111f2e',
  inputBorder: '#1e3448',
  inputText:   '#e8f0f4',
  placeholder: '#556a7a',
  icon:        '#7a9ab5',
  divider:     '#1e3448',
  tabBar:      '#111f2e',
}
const LIGHT = {
  bg:          '#f0f4f5',
  bg2:         '#ffffff',
  card:        '#ffffff',
  border:      '#e2e8f0',
  text:        '#1a1a2e',
  textSub:     '#555',
  textMute:    '#94a3b8',
  input:       '#ffffff',
  inputBorder: '#dde8e9',
  inputText:   '#1a1a2e',
  placeholder: '#94a3b8',
  icon:        '#888',
  divider:     '#f0f0f0',
  tabBar:      '#ffffff',
}

export type AppColors = typeof DARK
export function useColors(): AppColors {
  const { darkMode } = useContext(ThemeContext)
  return darkMode ? DARK : LIGHT
}
