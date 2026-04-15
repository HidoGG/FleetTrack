import { View, Text, StyleSheet } from 'react-native'
import { colors, radius, font } from '../../theme'

// Idéntico al sistema de badges del frontend web (.badge.active, etc.)
const PRESETS = {
  active:      { bg: colors.successL, color: colors.successT },
  inactive:    { bg: colors.surface2, color: colors.muted },
  maintenance: { bg: colors.warnL,    color: colors.warnT },
  in_progress: { bg: colors.accentL,  color: colors.accentText },
  completed:   { bg: colors.successL, color: colors.successT },
  cancelled:   { bg: colors.surface2, color: colors.muted },
  online:      { bg: colors.successL, color: colors.successT },
  offline:     { bg: colors.surface2, color: colors.muted2 },
}

export default function Badge({ label, preset, color, bg }) {
  const p = PRESETS[preset] || {}
  const resolvedBg    = bg    || p.bg    || colors.surface2
  const resolvedColor = color || p.color || colors.muted

  return (
    <View style={[styles.badge, { backgroundColor: resolvedBg }]}>
      <Text style={[styles.text, { color: resolvedColor }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.full },
  text:  { fontSize: font.xs, fontWeight: '600', letterSpacing: 0.2 },
})
