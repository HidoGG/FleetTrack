import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, ScrollView } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useAuthStore } from '../store/authStore'
import { api } from '../services/api'
import { Button, Card, Badge } from '../components/ui'
import { colors, radius, spacing, font, shadow } from '../theme'

export default function HomeScreen({ navigation }) {
  const { profile, logout } = useAuthStore()
  const [activeTrip, setActiveTrip] = useState(null)
  const [loading, setLoading]       = useState(true)

  useEffect(() => { checkActiveTrip() }, [])

  async function checkActiveTrip() {
    try {
      const trips = await api.getTrips({ status: 'in_progress', limit: 1 })
      setActiveTrip(trips[0] || null)
    } catch {
      setActiveTrip(null)
    } finally {
      setLoading(false)
    }
  }

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : 'CD'

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Buenos días' : hour < 18 ? 'Buenas tardes' : 'Buenas noches'

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{greeting}</Text>
            <Text style={styles.name}>{profile?.full_name || 'Conductor'}</Text>
          </View>
          <TouchableOpacity onPress={logout} style={[styles.avatar, shadow.card]} activeOpacity={0.8}>
            <Text style={styles.avatarText}>{initials}</Text>
          </TouchableOpacity>
        </View>

        {/* Pill de estado */}
        <View style={styles.statusPill}>
          <View style={styles.dot} />
          <Text style={styles.statusText}>Disponible</Text>
          <Badge label="En línea" preset="online" />
        </View>

        {/* Tarjeta principal */}
        {loading ? (
          <Card style={styles.placeholderCard}>
            <Text style={styles.placeholderText}>Verificando viajes activos…</Text>
          </Card>
        ) : activeTrip ? (
          /* Viaje en curso */
          <Card variant="accent" style={styles.activeTripCard}>
            <View style={styles.activeTripHeader}>
              <View style={styles.activeTripIconWrap}>
                <Feather name="navigation" size={18} color={colors.accent} />
              </View>
              <Badge label="En curso" preset="in_progress" />
            </View>
            <Text style={styles.activeTripPlate}>
              {activeTrip.vehicles?.plate}
            </Text>
            <Text style={styles.activeTripVehicle}>
              {activeTrip.vehicles?.brand} {activeTrip.vehicles?.model}
            </Text>
            <Text style={styles.activeTripTime}>
              Desde las {new Date(activeTrip.start_time).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
            </Text>
            <Button
              variant="primary"
              size="md"
              style={{ marginTop: spacing.md }}
              onPress={() => navigation.navigate('Trip', { trip: activeTrip })}
            >
              Continuar viaje
            </Button>
          </Card>
        ) : (
          /* Sin viaje */
          <Card style={styles.emptyCard}>
            <View style={styles.emptyIconWrap}>
              <Feather name="truck" size={32} color={colors.muted2} />
            </View>
            <Text style={styles.emptyTitle}>Sin viaje activo</Text>
            <Text style={styles.emptySub}>Seleccioná un vehículo para comenzar</Text>
          </Card>
        )}

        {/* Acciones rápidas */}
        <View style={styles.quickRow}>
          <QuickAction
            icon="clock"
            label="Historial"
            onPress={() => navigation.navigate('History')}
          />
          <QuickAction
            icon="bar-chart-2"
            label="Estadísticas"
            onPress={() => {}}
          />
          <QuickAction
            icon="tool"
            label="Soporte"
            onPress={() => {}}
          />
        </View>

        {/* Botón principal */}
        <Button
          variant={activeTrip ? 'secondary' : 'primary'}
          size="lg"
          disabled={!!activeTrip}
          onPress={() => navigation.navigate('VehicleSelect')}
          style={styles.mainBtn}
        >
          {activeTrip ? 'Viaje en curso' : 'Iniciar nuevo viaje'}
        </Button>

      </ScrollView>
    </View>
  )
}

function QuickAction({ icon, label, onPress }) {
  return (
    <TouchableOpacity style={qaStyles.wrap} onPress={onPress} activeOpacity={0.75}>
      <View style={qaStyles.iconBox}>
        <Feather name={icon} size={20} color={colors.text2} />
      </View>
      <Text style={qaStyles.label}>{label}</Text>
    </TouchableOpacity>
  )
}

const qaStyles = StyleSheet.create({
  wrap:    { flex: 1, alignItems: 'center', gap: 6 },
  iconBox: {
    width: 52, height: 52, borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
    ...shadow.card,
  },
  label:   { fontSize: font.xs, color: colors.muted, fontWeight: '500' },
})

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll:    { padding: spacing.lg, paddingBottom: spacing.xxl },

  header:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  greeting:  { fontSize: font.sm, color: colors.muted, fontWeight: '500' },
  name:      { fontSize: font.xxl, fontWeight: '700', color: colors.text, marginTop: 2, letterSpacing: -0.3 },
  avatar:    {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.accentL,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#c7d2fe',
  },
  avatarText: { color: colors.accent, fontSize: font.sm, fontWeight: '700' },

  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  dot:        { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success },
  statusText: { color: colors.successT, fontWeight: '600', fontSize: font.sm, flex: 1 },

  placeholderCard:   { paddingVertical: 28, alignItems: 'center', marginBottom: spacing.lg },
  placeholderText:   { color: colors.muted, fontSize: font.base },

  activeTripCard:    { marginBottom: spacing.lg },
  activeTripHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  activeTripIconWrap:{ width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.accentL, alignItems: 'center', justifyContent: 'center' },
  activeTripPlate:   { fontSize: font.xxl, fontWeight: '700', color: colors.text, marginBottom: 2 },
  activeTripVehicle: { fontSize: font.base, color: colors.muted, marginBottom: 4 },
  activeTripTime:    { fontSize: font.sm, color: colors.muted2 },

  emptyCard:         { alignItems: 'center', paddingVertical: 36, marginBottom: spacing.lg },
  emptyIconWrap:     {
    width: 72, height: 72, borderRadius: radius.lg,
    backgroundColor: colors.surface2,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle:        { fontSize: font.lg, fontWeight: '600', color: colors.text2, marginBottom: 6 },
  emptySub:          { fontSize: font.sm, color: colors.muted2, textAlign: 'center' },

  quickRow:          { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },

  mainBtn:           { ...shadow.accent },
})
