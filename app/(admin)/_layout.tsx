import { Image, Text, TouchableOpacity } from 'react-native'
import { Stack } from 'expo-router'
import { supabase } from '../../lib/supabase'

const LOGO_URI = 'https://valerarealestate.com/images/logo.png'

export default function AdminLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#1a6470' },
        headerTintColor: '#c9a84c',
        headerTitleStyle: { fontWeight: 'bold' },
        headerTitle: () => (
          <Image
            source={{ uri: LOGO_URI }}
            style={{ width: 80, height: 40 }}
            resizeMode="contain"
          />
        ),
        headerRight: () => (
          <TouchableOpacity
            onPress={() => supabase.auth.signOut()}
            style={{ marginRight: 8 }}
          >
            <Text style={{ color: '#c9a84c', fontSize: 14, fontWeight: '600' }}>Salir</Text>
          </TouchableOpacity>
        ),
      }}
    />
  )
}
