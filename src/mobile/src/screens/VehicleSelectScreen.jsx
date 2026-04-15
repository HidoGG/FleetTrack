import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, FlatList, ActivityIndicator, StatusBar, TouchableOpacity } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { api } from '../services/api'
import { Card, Badge } from '../components/ui'
import { colors, radius, spacing, font, shadow } from '../theme'

export default function VehicleSelectScreen({ navigation }) {
  const [vehicles, setVehicles]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [selecting, setSelecting] = useState(null)

  useEffect(() => {
    api.getVehicles()
      .then(data => setVehicles(data.filter(v => v.status === 'active')))
      .catch(() => setVehicles([]))
      .finally(() => setLoading(false))
  }, [])

  function handleSelect(vehicle) {
    setSelecting(vehicle.id)
    navigation.navigate('Trip', { vehicle })
    setSelecting(null)
  }

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

      <Text style={styles.hint}>Solo se muestran vehículos disponibles</Text>

      {vehicles.length === 0 ? (
        <View style={styles.center}>
          <Feather name="truck" size={40} color={colors.muted2} style={{ marginBottom: 12 }} />
          <Text style={styles.emptyText}>Sin vehículos disponibles</Text>
        </View>
      ) : (
        <FlatList
          data={vehicles}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => handleSelect(item)}
              activeOpacity={0.78}
              disabled={!!selecting}
            >
              <Card style={styles.card}>
                {/* Fila superior */}
                <View style={styles.cardTop}>
                  <View style={styles.plateRow}>
                    <View style={styles.vehicleIconWrap}>
                      <Feather name="truck" size={18} color={colors.text2} />
                    </View>
                    <Text style={styles.plate}>{item.plate}</Text>
                  </View>
                  <Badge label={item.status} preset={item.status} />
                </View>

                {/* Info */}
                <Text style={styles.vehicleName}>
                  {item.brand} {item.model}{item.year ? ` · ${item.year}` : ''}
                </Text>

                {/* Footer */}
                <View style={styles.cardFooter}>
                  <View style={styles.metaRow}>
                    {item.color && (
                      <View style={styles.metaItem}>
                        <Feather name="circle" size={10} color={colors.muted2} />
                        <Text style={styles.meta}>{item.color}</Text>
                      </View>
                    )}
                    <View style={styles.metaItem}>
                      <Feather name="activity" size={10} color={colors.muted2} />
                      <Text style={styles.meta}>
                        {item.odometer_km > 0 ? `${Number(item.odometer_km).toLocaleString()} km` : 'Sin odómetro'}
                      </Text>
                    </View>
                  </View>

                  {selecting === item.id
                    ? <ActivityIndicator color={colors.accent} size="small" />
                    : <View style={styles.arrowWrap}>
                        <Text style={styles.arrowText}>Seleccionar</Text>
                        <Feather name="chevron-right" size={16} color={colors.accent} />
                      </View>
                  }
                </View>
              </Card>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: colors.bg },
  center:         { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hint:           { fontSize: font.xs, color: colors.muted2, textAlign: 'center', paddingTop: spacing.md, paddingBottom: 4 },
  emptyText:      { color: colors.muted, fontSize: font.md },
  list:           { padding: spacing.md, paddingBottom: spacing.xxl },

  card:           { marginBottom: 10 },
  cardTop:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  plateRow:       { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  vehicleIconWrap:{ width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  plate:          { fontSize: font.xl, fontWeight: '700', color: colors.text },
  vehicleName:    { fontSize: font.base, color: colors.muted, marginBottom: spacing.sm },

  cardFooter:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metaRow:        { flexDirection: 'row', gap: spacing.md },
  metaItem:       { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meta:           { fontSize: font.xs, color: colors.muted2 },
  arrowWrap:      { flexDirection: 'row', alignItems: 'center', gap: 4 },
  arrowText:      { fontSize: font.sm, fontWeight: '600', color: colors.accent },
})
