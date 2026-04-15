import { View, StyleSheet } from 'react-native'
import { colors, radius, shadow } from '../../theme'

/**
 * variant: 'default' | 'accent' | 'success' | 'warn' | 'danger'
 */
export default function Card({ children, variant = 'default', style }) {
  return (
    <View style={[styles.base, styles[variant], shadow.card, style]}>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  base:    {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  default: {},
  accent:  { borderColor: '#c7d2fe', backgroundColor: '#eef2ff' },   // indigo-100 border + bg
  success: { borderColor: '#a7f3d0', backgroundColor: colors.successL },
  warn:    { borderColor: '#fde68a', backgroundColor: colors.warnL },
  danger:  { borderColor: '#fecaca', backgroundColor: colors.dangerL },
})
