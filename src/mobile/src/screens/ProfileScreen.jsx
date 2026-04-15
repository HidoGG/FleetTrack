import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useAuthStore } from '../store/authStore'
import { stopBultoTracking } from '../services/locationService'
import { colors, font, spacing, radius, shadow } from '../theme'

export default function ProfileScreen() {
  const { user, profile, logout } = useAuthStore()

  function handleLogout() {
    Alert.alert(
      'Cerrar sesión',
      '¿Seguro que querés salir? Se detendrá el GPS.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Salir',
          style: 'destructive',
          onPress: () => {
            stopBultoTracking()
            logout()
          },
        },
      ]
    )
  }

  const name  = profile?.full_name || user?.email || 'Conductor'
  const email = user?.email || ''
  const role  = profile?.role || 'driver'

  return (
    <View style={styles.container}>
      {/* Avatar */}
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>
          {name.charAt(0).toUpperCase()}
        </Text>
      </View>

      <Text style={styles.name}>{name}</Text>
      <Text style={styles.email}>{email}</Text>

      <View style={styles.badgeRow}>
        <View style={styles.badge}>
          <Feather name="shield" size={12} color={colors.accent} />
          <Text style={styles.badgeText}>{role}</Text>
        </View>
      </View>

      {/* Info card */}
      <View style={[styles.card, shadow.card]}>
        <Row icon="wifi" label="GPS activo" value="Encendido" valueColor={colors.successT} />
        <Divider />
        <Row icon="clock" label="Sesión" value="Activa" valueColor={colors.successT} />
      </View>

      {/* Logout */}
      <TouchableOpacity style={styles.btnLogout} onPress={handleLogout} activeOpacity={0.85}>
        <Feather name="log-out" size={16} color="#ef4444" />
        <Text style={styles.btnLogoutText}>Cerrar sesión</Text>
      </TouchableOpacity>
    </View>
  )
}

function Row({ icon, label, value, valueColor }) {
  return (
    <View style={styles.row}>
      <Feather name={icon} size={15} color={colors.muted2} />
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, valueColor ? { color: valueColor } : {}]}>{value}</Text>
    </View>
  )
}

function Divider() {
  return <View style={styles.divider} />
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    paddingTop: 48,
    paddingHorizontal: spacing.lg,
  },

  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 14,
  },
  avatarText: { fontSize: 32, fontWeight: '700', color: '#fff' },

  name:  { fontSize: font.xl, fontWeight: '700', color: colors.text },
  email: { fontSize: font.sm, color: colors.muted, marginTop: 4 },

  badgeRow: { flexDirection: 'row', gap: 8, marginTop: 10, marginBottom: 24 },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: colors.accentL,
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5,
  },
  badgeText: { fontSize: font.xs, color: colors.accent, fontWeight: '700', textTransform: 'uppercase' },

  card: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.md,
    marginBottom: 24,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10,
  },
  rowLabel: { flex: 1, fontSize: font.sm, color: colors.text2 },
  rowValue: { fontSize: font.sm, fontWeight: '600', color: colors.text },
  divider: { height: 1, backgroundColor: colors.border, marginHorizontal: -spacing.md },

  btnLogout: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: '#fca5a5',
    borderRadius: radius.md,
    paddingVertical: 14, paddingHorizontal: 28,
    backgroundColor: '#fff1f2',
  },
  btnLogoutText: { fontSize: font.sm, fontWeight: '700', color: '#ef4444' },
})
