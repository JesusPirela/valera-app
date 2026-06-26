import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { Text, TextInput } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from './supabase'

const DEFAULT_COLOR  = '#1a6470'
const PATRON_BASE: Record<string, string> = {
  aurora: '#5c3d99', lava: '#c62828', ocean: '#01579b', forest: '#2e7d32',
  sunset: '#e65100', galaxy: '#4a148c', rose: '#ad1457', arctic: '#0097a7',
}
function resolverColor(acento: string): string {
  if (acento.startsWith('animated:')) return PATRON_BASE[acento.replace('animated:', '')] ?? DEFAULT_COLOR
  return acento
}
const DARK_MODE_KEY  = '@valera_dark_mode'
const FONT_CAP_KEY   = '@valera_font_scale_cap'
const FONT_CAP_MULTIPLIER = 1.15

type ThemeCtx = {
  primaryColor: string
  setPrimaryColor: (color: string) => void
  acentoId: string
  setAcentoId: (id: string) => void
  darkMode: boolean
  toggleDarkMode: () => void
  fontScaleCap: boolean
  toggleFontScaleCap: () => void
}

const ThemeContext = createContext<ThemeCtx>({
  primaryColor:    DEFAULT_COLOR,
  setPrimaryColor: () => {},
  acentoId:        DEFAULT_COLOR,
  setAcentoId:     () => {},
  darkMode:        true,
  toggleDarkMode:  () => {},
  fontScaleCap:       false,
  toggleFontScaleCap: () => {},
})

function aplicarTopeFuente(activo: boolean) {
  const maxFontSizeMultiplier = activo ? FONT_CAP_MULTIPLIER : undefined
  ;(Text as any).defaultProps = (Text as any).defaultProps || {}
  ;(Text as any).defaultProps.maxFontSizeMultiplier = maxFontSizeMultiplier
  ;(TextInput as any).defaultProps = (TextInput as any).defaultProps || {}
  ;(TextInput as any).defaultProps.maxFontSizeMultiplier = maxFontSizeMultiplier
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [primaryColor, setPrimaryColor] = useState(DEFAULT_COLOR)
  const [acentoId, setAcentoId]         = useState(DEFAULT_COLOR)
  const [darkMode, setDarkMode]         = useState(false)
  const [fontScaleCap, setFontScaleCap] = useState(false)

  // Cargar preferencia guardada al iniciar
  useEffect(() => {
    AsyncStorage.getItem(DARK_MODE_KEY).then(val => {
      if (val !== null) setDarkMode(val === 'true')
    })
    AsyncStorage.getItem(FONT_CAP_KEY).then(val => {
      const activo = val === 'true'
      if (activo) {
        aplicarTopeFuente(true)
        setFontScaleCap(true)
      }
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
        if (data?.color_acento) {
          setAcentoId(data.color_acento)
          setPrimaryColor(resolverColor(data.color_acento))
        }
      } else {
        setAcentoId(DEFAULT_COLOR)
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

  function toggleFontScaleCap() {
    setFontScaleCap(prev => {
      const next = !prev
      aplicarTopeFuente(next)
      AsyncStorage.setItem(FONT_CAP_KEY, String(next))
      return next
    })
  }

  return (
    <ThemeContext.Provider value={{ primaryColor, setPrimaryColor, acentoId, setAcentoId, darkMode, toggleDarkMode, fontScaleCap, toggleFontScaleCap }}>
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
