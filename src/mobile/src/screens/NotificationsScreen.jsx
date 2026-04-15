import { View, Text, StyleSheet } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { colors, font, spacing } from '../theme'

export default function NotificationsScreen() {
  return (
    <View style={styles.container}>
      <Feather name="bell" size={48} color={colors.muted2} />
      <Text style={styles.title}>Sin notificaciones</Text>
      <Text style={styles.sub}>Las alertas del supervisor aparecerán aquí.</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: spacing.lg,
  },
  title: { fontSize: font.lg, fontWeight: '700', color: colors.text },
  sub:   { fontSize: font.sm, color: colors.muted, textAlign: 'center', lineHeight: 20 },
})
