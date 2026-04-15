import { useEffect, useState, useRef } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  StatusBar, Alert, ActivityIndicator, Dimensions,
} from 'react-native'
import MapView, { Marker, Polyline } from 'react-native-maps'
import { Feather } from '@expo/vector-icons'
import { useAuthStore } from '../store/authStore'
import { api } from '../services/api'
import { startTracking, stopTracking, getCurrentPosition } from '../services/locationService'
import { colors, radius, spacing, font, shadow } from '../theme'

const { height } = Dimensions.get('window')

export default function TripScreen({ route, navigation }) {
  const { vehicle: routeVehicle, trip: existingTrip } = route.params || {}
  const profile = useAuthStore((s) => s.profile)

  // Si se retoma un viaje desde HomeScreen, `routeVehicle` llega undefined.
  // En ese caso extraemos los datos del vehículo desde el objeto trip.
  const vehicle = routeVehicle || (existingTrip?.vehicles
    ? { id: existingTrip.vehicle_id, ...existingTrip.vehicles }
    : null)

  const [trip, setTrip]       = useState(existingTrip || null)
  const [tracking, setTracking] = useState(false)   // siempre false al inicio; se activa luego
  const [loading, setLoading]   = useState(false)
  const [elapsed, setElapsed]   = useState(0)
  const [route_, setRoute_]     = useState([])
  const [currentPos, setCurrentPos] = useState(null)
  const [gpsPoints, setGpsPoints]   = useState(0)   // contador explícito de puntos enviados

  const mapRef   = useRef(null)
  const timerRef = useRef(null)

  // Timer de duración
  useEffect(() => {
    if (tracking && trip) {
      const start = new Date(trip.start_time).getTime()
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - start) / 1000))
      }, 1000)
    }
    return () => clearInterval(timerRef.current)
  }, [tracking, trip])

  // Si llega un viaje existente (retomar), activar tracking inmediatamente
  useEffect(() => {
    if (!existingTrip || !vehicle) return
    activateTracking(existingTrip, vehicle.id)
    return () => stopTracking()
  }, [])

  async function activateTracking(activeTrip, vehicleId) {
    try {
      await startTracking(activeTrip.id, vehicleId, (newPos) => {
        moveMap(newPos)
        setRoute_((prev) => [...prev, { latitude: newPos.lat, longitude: newPos.lng }])
        setGpsPoints((n) => n + 1)
      })
      setTracking(true)
    } catch (err) {
      Alert.alert('GPS', err.message)
    }
  }

  // Obtener posición real al montar (para centrar el mapa antes de iniciar viaje)
  useEffect(() => {
    getCurrentPosition().then((pos) => {
      if (pos) moveMap(pos)
    })
  }, [])

  function moveMap(pos) {
    setCurrentPos(pos)
    mapRef.current?.animateToRegion({
      latitude:      pos.lat,
      longitude:     pos.lng,
      latitudeDelta:  0.01,
      longitudeDelta: 0.01,
    }, 600)
  }

  async function handleStartTrip() {
    if (!vehicle) return
    setLoading(true)
    try {
      // 1. Obtener posición y driver en paralelo
      const [pos, myDriver] = await Promise.all([
        getCurrentPosition(),
        api.getMyDriver(),
      ])

      console.log(`[TripScreen] driver_id resuelto: ${myDriver?.id}`)
      console.log(`[TripScreen] vehicle_id: ${vehicle.id}`)
      console.log(`[TripScreen] pos inicial: ${pos?.lat}, ${pos?.lng}`)

      if (!myDriver?.id) {
        throw new Error('No tenés un registro de conductor. Pedile al admin que te cree uno.')
      }

      // 2. Crear viaje en backend
      const newTrip = await api.startTrip({
        vehicle_id: vehicle.id,
        driver_id:  myDriver.id,
        start_lat:  pos?.lat,
        start_lng:  pos?.lng,
      })

      setTrip(newTrip)
      if (pos) setRoute_([{ latitude: pos.lat, longitude: pos.lng }])

      // 3. Activar GPS tracking con callback al mapa
      await activateTracking(newTrip, vehicle.id)
    } catch (err) {
      console.error('[TripScreen] handleStartTrip ERROR:', err.message)
      Alert.alert('Error al iniciar viaje', err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleEndTrip() {
    Alert.alert(
      'Finalizar viaje',
      '¿Estás seguro que querés terminar el viaje actual?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Finalizar',
          style: 'destructive',
          onPress: async () => {
            setLoading(true)
            try {
              const pos = await getCurrentPosition()
              stopTracking()
              await api.endTrip(trip.id, {
                end_lat: pos?.lat,
                end_lng: pos?.lng,
              })
              setTracking(false)
              clearInterval(timerRef.current)
              Alert.alert('Viaje finalizado', 'El viaje fue registrado correctamente.', [
                { text: 'OK', onPress: () => navigation.navigate('Home') },
              ])
            } catch (err) {
              Alert.alert('Error', err.message)
            } finally {
              setLoading(false)
            }
          },
        },
      ]
    )
  }

  function formatElapsed(secs) {
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    const s = secs % 60
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      {/* Mapa a pantalla completa */}
      <MapView
        ref={mapRef}
        style={styles.map}
        mapType="standard"
        userInterfaceStyle="dark"
        showsUserLocation
        showsMyLocationButton={false}
        // No se usa initialRegion con coordenadas hardcodeadas.
        // El mapa se centra en la posición real vía animateToRegion()
        // cuando getCurrentPosition() resuelve con datos del hardware.
        {...(currentPos ? {
          initialRegion: {
            latitude:      currentPos.lat,
            longitude:     currentPos.lng,
            latitudeDelta:  0.01,
            longitudeDelta: 0.01,
          }
        } : {})}
      >
        {route_.length > 1 && (
          <Polyline
            coordinates={route_}
            strokeColor="#4f46e5"
            strokeWidth={4}
          />
        )}
        {currentPos && (
          <Marker
            coordinate={{ latitude: currentPos.lat, longitude: currentPos.lng }}
            title={vehicle?.plate || 'Vehículo'}
          />
        )}
      </MapView>

      {/* HUD — info flotante superior */}
      {tracking && (
        <View style={styles.hud}>
          <Feather name="navigation" size={14} color={colors.accent} />
          <Text style={styles.hudPlate}>{vehicle?.plate || trip?.vehicles?.plate}</Text>
          <Text style={styles.hudTimer}>{formatElapsed(elapsed)}</Text>
          <View style={[styles.dot, { backgroundColor: colors.success }]} />
        </View>
      )}

      {/* Panel inferior — zona del pulgar */}
      <View style={styles.bottomPanel}>
        {!tracking && !trip ? (
          <>
            <View style={styles.vehicleInfo}>
              <Text style={styles.vehicleLabel}>Vehículo seleccionado</Text>
              <Text style={styles.vehiclePlate}>{vehicle?.plate}</Text>
              <Text style={styles.vehicleName}>{vehicle?.brand} {vehicle?.model}</Text>
            </View>
            <TouchableOpacity
              style={[styles.btnBig, styles.btnGreen, loading && styles.btnDisabled]}
              onPress={handleStartTrip}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading
                ? <ActivityIndicator color="#fff" size="large" />
                : <Text style={styles.btnBigText}>Iniciar viaje</Text>
              }
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={styles.tripStats}>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{formatElapsed(elapsed)}</Text>
                <Text style={styles.statLabel}>Duración</Text>
              </View>
              <View style={[styles.statDivider]} />
              <View style={styles.stat}>
                <Text style={styles.statValue}>{gpsPoints}</Text>
                <Text style={styles.statLabel}>Puntos GPS</Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.btnBig, styles.btnRed, loading && styles.btnDisabled]}
              onPress={handleEndTrip}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading
                ? <ActivityIndicator color="#fff" size="large" />
                : <Text style={styles.btnBigText}>Finalizar viaje</Text>
              }
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  map:       { width: '100%', height: height * 0.62 },

  // HUD flotante — fondo blanco semitransparente sobre el mapa
  hud: {
    position: 'absolute', top: 56, left: spacing.md, right: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: radius.md,
    padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: colors.border,
    ...shadow.card,
  },
  hudPlate:  { color: colors.text, fontWeight: '700', fontSize: font.md, flex: 1 },
  hudTimer:  { color: colors.accent, fontWeight: '700', fontSize: font.lg, fontVariant: ['tabular-nums'] },
  dot:       { width: 8, height: 8, borderRadius: 4 },

  // Panel inferior — fondo blanco, separador sutil
  bottomPanel: {
    flex: 1, backgroundColor: colors.surface, padding: spacing.md + 4,
    borderTopWidth: 1, borderTopColor: colors.border,
  },

  vehicleInfo:  { marginBottom: spacing.md },
  vehicleLabel: {
    fontSize: font.xs, color: colors.muted, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4,
  },
  vehiclePlate: { fontSize: font.xxl, fontWeight: '700', color: colors.text },
  vehicleName:  { fontSize: font.sm, color: colors.muted2, marginTop: 2 },

  tripStats:   { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  stat:        { flex: 1, alignItems: 'center' },
  statValue:   { fontSize: font.xxl, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  statLabel:   { fontSize: font.xs, color: colors.muted2, marginTop: 2 },
  statDivider: { width: 1, height: 36, backgroundColor: colors.border },

  btnBig:    { borderRadius: radius.md, paddingVertical: 18, alignItems: 'center' },
  btnGreen:  { backgroundColor: colors.success, ...shadow.success },
  btnRed:    { backgroundColor: colors.danger,  ...shadow.danger },
  btnDisabled: { opacity: 0.45 },
  btnBigText:{ color: '#fff', fontSize: font.xl, fontWeight: '700' },
})
