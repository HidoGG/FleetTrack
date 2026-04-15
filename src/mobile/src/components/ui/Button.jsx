import { TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native'
import { colors, radius, font, shadow } from '../../theme'

/**
 * variant: 'primary' | 'secondary' | 'danger' | 'success' | 'ghost'
 * size:    'sm' | 'md' | 'lg'
 */
export default function Button({
  children, onPress, variant = 'primary', size = 'md',
  loading = false, disabled = false, style,
}) {
  const shad = variant === 'primary' ? shadow.accent
             : variant === 'success' ? shadow.success
             : variant === 'danger'  ? shadow.danger
             : {}

  return (
    <TouchableOpacity
      style={[
        styles.base,
        styles[variant],
        styles[`size_${size}`],
        shad,
        (disabled || loading) && styles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.82}
    >
      {loading
        ? <ActivityIndicator color={variant === 'secondary' ? colors.accent : '#fff'} size="small" />
        : <Text style={[styles.label, styles[`label_${variant}`], styles[`labelSize_${size}`]]}>
            {children}
          </Text>
      }
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  base:     { borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.45 },

  primary:   { backgroundColor: colors.accent },
  secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  danger:    { backgroundColor: colors.danger },
  success:   { backgroundColor: colors.success },
  ghost:     { backgroundColor: 'transparent' },

  size_sm: { paddingVertical: 9,  paddingHorizontal: 16 },
  size_md: { paddingVertical: 13, paddingHorizontal: 20 },
  size_lg: { paddingVertical: 17, paddingHorizontal: 24 },

  label:           { fontWeight: '600', color: '#fff' },
  label_secondary: { color: colors.text2 },
  label_ghost:     { color: colors.accent },

  labelSize_sm: { fontSize: font.sm },
  labelSize_md: { fontSize: font.md },
  labelSize_lg: { fontSize: font.lg },
})
