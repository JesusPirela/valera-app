import { Platform, Switch, TouchableOpacity, View, StyleSheet } from 'react-native'

type Props = {
  value: boolean
  onValueChange: (v: boolean) => void
  trackColor?: { false?: string; true?: string }
  thumbColor?: string
  disabled?: boolean
  style?: any
}

export default function ToggleSwitch({ value, onValueChange, trackColor, thumbColor, disabled, style }: Props) {
  if (Platform.OS !== 'web') {
    return (
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={trackColor}
        thumbColor={thumbColor ?? '#fff'}
        disabled={disabled}
        style={style}
      />
    )
  }

  const trackOn  = trackColor?.true  ?? '#c9a84c'
  const trackOff = trackColor?.false ?? '#555'
  const thumb    = thumbColor ?? '#fff'

  return (
    <TouchableOpacity
      onPress={() => !disabled && onValueChange(!value)}
      activeOpacity={disabled ? 1 : 0.8}
      style={[
        styles.track,
        { backgroundColor: value ? trackOn : trackOff },
        disabled && styles.disabled,
        style,
      ]}
    >
      <View
        style={[
          styles.thumb,
          { backgroundColor: thumb, transform: [{ translateX: value ? 18 : 2 }] },
        ]}
      />
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  track: {
    width: 42,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    padding: 2,
  },
  thumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
    elevation: 2,
  },
  disabled: {
    opacity: 0.45,
  },
})
