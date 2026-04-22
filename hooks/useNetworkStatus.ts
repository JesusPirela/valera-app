import { useEffect, useState } from 'react'
import NetInfo from '@react-native-community/netinfo'

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(true)

  useEffect(() => {
    NetInfo.fetch().then(state => setIsOnline(state.isConnected ?? true))
    return NetInfo.addEventListener(state => setIsOnline(state.isConnected ?? true))
  }, [])

  return isOnline
}
