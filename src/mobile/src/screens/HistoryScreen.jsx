import { useEffect, useState } from 'react'
import { View, Text, FlatList, StyleSheet, ActivityIndicator, StatusBar } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { api } from '../services/api'
import { Card, Badge } from '../components/ui'
import { colors, spacing, font } from '../theme'

function formatDuration(start, end) {
  if (!end) return 'En curso'
  const mins = Math.round((new Date(end) - new Date(start)) / 60000)
  if (mins < 60) return `${mins} min`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

export default function HistoryScreen() {
  const [trips, setTrips]       = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    api.getTrips({ limit: 50 })
      .then(setTrips)
      .catch(() => setTrips([]))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />

      {trips.length === 0 ? (
        <View style={styles.center}>
          <Feather name="inbox" size={40} color={colors.muted2} style={{ marginBottom: 12 }} />
          <Text style={styles.emptyText}>Sin viajes registrados</Text>
        </View>
      ) : (
        <FlatList
          data={trips}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const statusLabel =
              item.status === 'in_progress' ? 'En curso'
              : item.status === 'completed' ? 'Completado'
              : 'Cancelado'

            return (
              <Card style={styles.card}>
                {/* Encabezado */}
                <View style={styles.cardHeader}>
                  <View style={styles.headerLeft}>
                    <View style={styles.tripIconWrap}>
                      <Feather name="map-pin" size={16} color={colors.text2} />
                    </View>
                    <View>
                      <Text style={styles.plate}>{item.vehicles?.plate}</Text>
                      <Text style={styles.vehicle}>{item.vehicles?.brand} {item.vehicles?.model}</Text>
                    </View>
                  </View>
                  <Badge label={statusLabel} preset={item.status} />
                </View>

                {/* Separador */}
                <View style={styles.divider} />

                {/* Estadísticas */}
                <View style={styles.statsRow}>
                  <StatCell
                    icon="calendar"
                    label="Fecha"
                    value={new Date(item.start_time).toLocaleDateString('es-AR')}
                  />
                  <StatCell
                    icon="clock"
                    label="Hora"
                    value={new Date(item.start_time).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                  />
                  <StatCell
                    icon="activity"
                    label="Duración"
                    value={formatDuration(item.start_time, item.end_time)}
                  />
                  <StatCell
                    icon="navigation"
                    label="Km"
                    value={item.km_total > 0 ? `${item.km_total}` : '—'}
                  />
                </View>
              </Card>
            )
          }}
        />
      )}
    </View>
  )
}

function StatCell({ icon, label, value }) {
  return (
    <View style={scStyles.cell}>
      <Feather name={icon} size={12} color={colors.muted2} style={{ marginBottom: 4 }} />
      <Text style={scStyles.value}>{value}</Text>
      <Text style={scStyles.label}>{label}</Text>
    </View>
  )
}

const scStyles = StyleSheet.create({
  cell:  { flex: 1, alignItems: 'center' },
  value: { fontSize: font.sm, fontWeight: '600', color: colors.text2 },
  label: { fontSize: font.xs - 1, color: colors.muted2, marginTop: 2 },
})

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: colors.bg },
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText:    { color: colors.muted, fontSize: font.md },
  list:         { padding: spacing.md, paddingBottom: spacing.xxl },

  card:         { marginBottom: 10 },
  cardHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  headerLeft:   { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tripIconWrap: { width: 36, height: 36, borderRadius: 8, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  plate:        { fontSize: font.lg, fontWeight: '700', color: colors.text },
  vehicle:      { fontSize: font.xs, color: colors.muted2, marginTop: 1 },

  divider:      { height: 1, backgroundColor: colors.border, marginBottom: spacing.sm },
  statsRow:     { flexDirection: 'row', alignItems: 'center' },
})
