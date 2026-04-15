import { useEffect, useRef, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, ActivityIndicator, Dimensions, StatusBar, Image,
  Linking, Modal, Platform,
} from 'react-native'
import MapView, { Marker } from 'react-native-maps'
import * as ImagePicker from 'expo-image-picker'
import * as FileSystem from 'expo-file-system'
import { Feather } from '@expo/vector-icons'
import { api } from '../services/api'
import { getCurrentPosition } from '../services/locationService'
import { colors, radius, spacing, font, shadow } from '../theme'

const { height: SCREEN_H } = Dimensions.get('window')
const MAP_H = SCREEN_H * 0.50

// ── Geoespacial ───────────────────────────────────────────────────────────────

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const Δφ = ((lat2 - lat1) * Math.PI) / 180
  const Δλ = ((lon2 - lon1) * Math.PI) / 180
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function sortByProximity(orders, fromLat, fromLng) {
  const pending   = orders.filter((o) => o.status !== 'DELIVERED' && o.status !== 'FAILED')
  const done      = orders.filter((o) => o.status === 'DELIVERED' || o.status === 'FAILED')

  if (!pending.length || fromLat == null) return [...pending, ...done]

  const sorted  = []
  let remaining = pending.map((o) => ({ ...o }))
  let curLat = fromLat
  let curLng = fromLng

  while (remaining.length) {
    let nearestIdx  = 0
    let nearestDist = Infinity
    remaining.forEach((o, i) => {
      if (o.delivery_lat == null || o.delivery_lng == null) return
      const d = haversineMeters(curLat, curLng, o.delivery_lat, o.delivery_lng)
      if (d < nearestDist) { nearestDist = d; nearestIdx = i }
    })
    const picked = { ...remaining[nearestIdx], _distMeters: Math.round(nearestDist) }
    sorted.push(picked)
    curLat = remaining[nearestIdx].delivery_lat ?? curLat
    curLng = remaining[nearestIdx].delivery_lng ?? curLng
    remaining.splice(nearestIdx, 1)
  }

  return [...sorted, ...done]
}

// ── Constantes UI ─────────────────────────────────────────────────────────────

const PIN_COLOR = {
  PENDING:    '#f59e0b',
  IN_TRANSIT: '#4f46e5',
  DELIVERED:  '#10b981',
  FAILED:     '#ef4444',
}

const STATUS_LABEL = {
  PENDING:    'Pendiente',
  IN_TRANSIT: 'En camino',
  DELIVERED:  'Entregado',
  FAILED:     'Fallido',
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function RouteScreen({ route }) {
  const { bultoId, bultoCode } = route.params || {}

  const mapRef = useRef(null)

  const [orders,     setOrders]     = useState([])
  const [loading,    setLoading]    = useState(true)
  const [pos,        setPos]        = useState(null)
  const [uploading,  setUploading]  = useState(null)  // orderId en PoD
  const [transitId,  setTransitId]  = useState(null)  // orderId IN_TRANSIT activo

  // Estado para vista previa de foto
  const [photoPreview, setPhotoPreview] = useState(null) // { uri, base64, orderId }

  // ── Carga inicial ──────────────────────────────────────────────────────────
  useEffect(() => {
    loadOrders()
    getCurrentPosition().then((p) => { if (p) setPos(p) })
  }, [])

  async function loadOrders() {
    setLoading(true)
    try {
      const data = await api.getOrdersByBulto(bultoId)
      setOrders(data)
      const inTransit = data.find((o) => o.status === 'IN_TRANSIT')
      if (inTransit) setTransitId(inTransit.id)
    } catch (err) {
      Alert.alert('Error', 'No se pudieron cargar los pedidos: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Datos derivados ────────────────────────────────────────────────────────
  const sorted    = sortByProximity(orders, pos?.lat, pos?.lng)
  const delivered = orders.filter((o) => o.status === 'DELIVERED').length
  const total     = orders.length
  const progress  = total > 0 ? (delivered / total) : 0
  const focusOrder = sorted.find((o) => o.status !== 'DELIVERED' && o.status !== 'FAILED')

  // ── Vuelo al destino ───────────────────────────────────────────────────────
  function flyToOrder(order) {
    if (!order?.delivery_lat || !order?.delivery_lng) return
    mapRef.current?.animateToRegion({
      latitude:      order.delivery_lat,
      longitude:     order.delivery_lng,
      latitudeDelta:  0.008,
      longitudeDelta: 0.008,
    }, 600)
  }

  // ── Abrir navegación en la app de Google Maps instalada (URL Intent nativo) ─
  // Usa las coordenadas obtenidas de Nominatim para precisión exacta del destino.
  // Fallback automático a Google Maps web si la app no está instalada.
  async function openNavigation(order) {
    const lat = order.delivery_lat
    const lng = order.delivery_lng

    if (!lat || !lng) {
      return Alert.alert(
        'Sin coordenadas',
        'Este pedido no tiene coordenadas de entrega. Verificá la dirección en el panel admin.'
      )
    }

    // Intent nativo que abre Google Maps en modo navegación conduciendo
    // Android: google.navigation:q=lat,lng
    // iOS:     comgooglemaps://?daddr=lat,lng&directionsmode=driving
    const nativeIntent = Platform.OS === 'ios'
      ? `comgooglemaps://?daddr=${lat},${lng}&directionsmode=driving`
      : `google.navigation:q=${lat},${lng}`

    const canOpenNative = await Linking.canOpenURL(nativeIntent).catch(() => false)

    if (canOpenNative) {
      Linking.openURL(nativeIntent).catch(() =>
        Alert.alert('Error', 'No se pudo abrir Google Maps.')
      )
    } else {
      // Fallback: Google Maps web (app no instalada o error de permisos)
      const webUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`
      Linking.openURL(webUrl).catch(() =>
        Alert.alert('Error', 'No se pudo abrir la aplicación de mapas.')
      )
    }
  }

  // ── Llamar al cliente ──────────────────────────────────────────────────────
  function handleLlamar(phone) {
    if (!phone) return
    Linking.openURL(`tel:${phone}`).catch(() =>
      Alert.alert('Error', 'No se pudo abrir el dialer.')
    )
  }

  // ── "Llegué" ───────────────────────────────────────────────────────────────
  async function handleLlegue(order) {
    if (!pos) {
      return Alert.alert('Sin GPS', 'Esperá que el GPS obtenga tu posición.')
    }
    if (!order.delivery_lat || !order.delivery_lng) {
      return Alert.alert('Sin coordenadas', 'Este pedido no tiene coordenadas de entrega.')
    }

    const dist = haversineMeters(pos.lat, pos.lng, order.delivery_lat, order.delivery_lng)
    if (dist > 100) {
      return Alert.alert(
        'Muy lejos',
        `Estás a ${Math.round(dist)} m.\nNecesitás estar a menos de 100 m para marcar llegada.`,
        [{ text: 'OK' }]
      )
    }

    try {
      await api.updateOrderStatus(order.id, 'IN_TRANSIT')
      setOrders((prev) =>
        prev.map((o) => (o.id === order.id ? { ...o, status: 'IN_TRANSIT' } : o))
      )
      setTransitId(order.id)
    } catch (err) {
      Alert.alert('Error', err.message)
    }
  }

  // ── "Entregar con foto" — captura ──────────────────────────────────────────
  async function handleEntregar(order) {
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') {
      return Alert.alert(
        'Permiso de cámara',
        'Habilitá la cámara en Ajustes → Expo Go → Permisos.'
      )
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.65,
      allowsEditing: false,
    })
    if (result.canceled) return

    const imageUri = result.assets[0].uri

    // Leer base64 y mostrar vista previa antes de confirmar
    const base64 = await FileSystem.readAsStringAsync(imageUri, {
      encoding: FileSystem.EncodingType.Base64,
    })

    setPhotoPreview({ uri: imageUri, base64, orderId: order.id })
  }

  // ── Confirmar entrega tras previsualización ────────────────────────────────
  async function handleConfirmarEntrega() {
    const { base64, orderId } = photoPreview
    setPhotoPreview(null)
    setUploading(orderId)

    try {
      const updated = await api.uploadPoD(orderId, base64)
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? { ...o, status: 'DELIVERED', pod_photo_url: updated.pod_photo_url }
            : o
        )
      )
      setTransitId(null)
    } catch (err) {
      Alert.alert('Error al entregar', err.message)
    } finally {
      setUploading(null)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      {/* ── MAPA ── */}
      <MapView
        ref={mapRef}
        style={styles.map}
        showsUserLocation
        showsMyLocationButton={false}
        {...(focusOrder?.delivery_lat
          ? {
              initialRegion: {
                latitude:      focusOrder.delivery_lat,
                longitude:     focusOrder.delivery_lng,
                latitudeDelta:  0.045,
                longitudeDelta: 0.045,
              },
            }
          : {})}
      >
        {sorted.map((o, idx) =>
          o.delivery_lat && o.delivery_lng ? (
            <Marker
              key={o.id}
              coordinate={{ latitude: o.delivery_lat, longitude: o.delivery_lng }}
              title={`${idx + 1}. ${o.customer_name}`}
              description={o.delivery_address}
              pinColor={PIN_COLOR[o.status] || PIN_COLOR.PENDING}
              onPress={() => flyToOrder(o)}
            />
          ) : null
        )}
      </MapView>

      {/* Barra de progreso */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>

      {/* ── BOTTOM SHEET ── */}
      <View style={styles.sheet}>
        <View style={styles.handle} />

        <View style={styles.sheetHeader}>
          <View>
            <Text style={styles.sheetTitle}>
              {bultoCode ? `Lote ${bultoCode}` : 'Mis entregas'}
            </Text>
            <Text style={styles.sheetSubtitle}>
              {delivered} de {total} entregados
            </Text>
          </View>
          {delivered === total && total > 0 && (
            <View style={styles.completedBadge}>
              <Feather name="check-circle" size={13} color={colors.successT} />
              <Text style={styles.completedText}>Completado</Text>
            </View>
          )}
        </View>

        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
        ) : orders.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Feather name="inbox" size={32} color={colors.muted2} />
            <Text style={styles.emptyText}>Este lote no tiene pedidos asignados.</Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          >
            {sorted.map((order, idx) => {
              const isDelivered = order.status === 'DELIVERED' || order.status === 'FAILED'
              const isInTransit = order.status === 'IN_TRANSIT'
              const isUploading = uploading === order.id
              const distM      = order._distMeters

              return (
                <TouchableOpacity
                  key={order.id}
                  activeOpacity={0.85}
                  onPress={() => flyToOrder(order)}
                  style={[
                    styles.card,
                    isInTransit && styles.cardActive,
                    isDelivered && styles.cardDone,
                  ]}
                >
                  {/* Cabecera: número + nombre + estado + flecha navegación */}
                  <View style={styles.cardHead}>
                    <View style={[
                      styles.numBadge,
                      {
                        backgroundColor: isDelivered
                          ? colors.success
                          : isInTransit
                            ? colors.accent
                            : colors.accentL,
                      },
                    ]}>
                      {isDelivered
                        ? <Feather name="check" size={12} color="#fff" />
                        : <Text style={[styles.numText, { color: isInTransit ? '#fff' : colors.accent }]}>
                            {idx + 1}
                          </Text>
                      }
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={[styles.customerName, isDelivered && styles.textMuted]}>
                        {order.customer_name}
                      </Text>
                      <Text style={styles.address} numberOfLines={1}>
                        {order.delivery_address}
                      </Text>
                    </View>

                    {/* Badge de estado */}
                    <View style={[styles.statusBadge, { backgroundColor: PIN_COLOR[order.status] + '22' }]}>
                      <Text style={[styles.statusText, { color: PIN_COLOR[order.status] }]}>
                        {STATUS_LABEL[order.status]}
                      </Text>
                    </View>

                    {/* Ícono de navegación — siempre en esquina superior derecha */}
                    {!isDelivered && (
                      <TouchableOpacity
                        style={styles.navBtn}
                        onPress={() => openNavigation(order)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Feather name="navigation" size={16} color={colors.accent} />
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Distancia */}
                  {!isDelivered && distM != null && (
                    <View style={styles.meta}>
                      <View style={styles.chip}>
                        <Feather name="map-pin" size={10} color={colors.muted} />
                        <Text style={styles.chipText}>
                          {distM < 1000 ? `${distM} m` : `${(distM / 1000).toFixed(1)} km`}
                        </Text>
                      </View>
                    </View>
                  )}

                  {/* Foto de factura como referencia */}
                  {!isDelivered && order.invoice_photo_url && (
                    <View style={styles.invoiceRow}>
                      <Feather name="file-text" size={11} color={colors.muted} />
                      <Text style={styles.invoiceLabel}>Factura:</Text>
                      <Image
                        source={{ uri: order.invoice_photo_url }}
                        style={styles.invoiceThumb}
                        resizeMode="cover"
                      />
                    </View>
                  )}

                  {/* Notas */}
                  {order.notes && !isDelivered ? (
                    <Text style={styles.notes}>{order.notes}</Text>
                  ) : null}

                  {/* Botones de acción */}
                  {!isDelivered && (
                    <View style={styles.actions}>
                      {order.status === 'PENDING' && (
                        <TouchableOpacity
                          style={styles.btnLlegue}
                          onPress={() => handleLlegue(order)}
                          activeOpacity={0.85}
                        >
                          <Feather name="map-pin" size={14} color="#fff" />
                          <Text style={styles.btnText}>Llegué</Text>
                        </TouchableOpacity>
                      )}

                      {isInTransit && (
                        <>
                          {/* Botón Llamar — solo aparece en IN_TRANSIT */}
                          {order.customer_phone ? (
                            <TouchableOpacity
                              style={styles.btnLlamar}
                              onPress={() => handleLlamar(order.customer_phone)}
                              activeOpacity={0.85}
                            >
                              <Feather name="phone" size={14} color={colors.accent} />
                              <Text style={styles.btnLlamarText}>Llamar</Text>
                            </TouchableOpacity>
                          ) : null}

                          <TouchableOpacity
                            style={[styles.btnEntregar, isUploading && { opacity: 0.5 }]}
                            onPress={() => handleEntregar(order)}
                            disabled={isUploading}
                            activeOpacity={0.85}
                          >
                            {isUploading ? (
                              <>
                                <ActivityIndicator color="#fff" size="small" />
                                <Text style={styles.btnText}>Subiendo…</Text>
                              </>
                            ) : (
                              <>
                                <Feather name="camera" size={14} color="#fff" />
                                <Text style={styles.btnText}>Entregar con foto</Text>
                              </>
                            )}
                          </TouchableOpacity>
                        </>
                      )}
                    </View>
                  )}

                  {/* Confirmación de entrega */}
                  {isDelivered && order.pod_photo_url ? (
                    <View style={styles.podRow}>
                      <Feather name="image" size={12} color={colors.successT} />
                      <Text style={styles.podText}>Foto de entrega registrada</Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
              )
            })}
          </ScrollView>
        )}
      </View>

      {/* ── MODAL: Vista previa de foto antes de confirmar ── */}
      <Modal
        visible={!!photoPreview}
        transparent
        animationType="slide"
        onRequestClose={() => setPhotoPreview(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Confirmar foto de entrega</Text>

            {photoPreview?.uri && (
              <Image
                source={{ uri: photoPreview.uri }}
                style={styles.previewImage}
                resizeMode="cover"
              />
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.btnRetake}
                onPress={async () => {
                  // Volver a sacar foto: cerrar preview y reabrir cámara con la orden
                  const orderId = photoPreview.orderId
                  setPhotoPreview(null)
                  // Buscar la orden para re-entregar
                  const order = orders.find((o) => o.id === orderId)
                  if (order) setTimeout(() => handleEntregar(order), 300)
                }}
                activeOpacity={0.85}
              >
                <Feather name="refresh-cw" size={14} color={colors.accent} />
                <Text style={styles.btnRetakeText}>Sacar de nuevo</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.btnConfirm}
                onPress={handleConfirmarEntrega}
                activeOpacity={0.85}
              >
                <Feather name="check" size={14} color="#fff" />
                <Text style={styles.btnText}>Confirmar entrega</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

// ── Estilos ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  map: { width: '100%', height: MAP_H },

  progressTrack: { height: 4, backgroundColor: colors.border },
  progressFill:  { height: 4, backgroundColor: colors.success },

  sheet: {
    flex: 1,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.border2,
    alignSelf: 'center',
    marginTop: 8, marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  sheetTitle:    { fontSize: font.md, fontWeight: '700', color: colors.text },
  sheetSubtitle: { fontSize: font.xs, color: colors.muted, marginTop: 2 },
  completedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.successL, borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  completedText: { fontSize: font.xs, color: colors.successT, fontWeight: '700' },

  list:      { paddingHorizontal: spacing.md, paddingVertical: 10, paddingBottom: 24 },
  emptyWrap: { alignItems: 'center', paddingTop: 32, gap: 10 },
  emptyText: { fontSize: font.sm, color: colors.muted2 },

  // Card
  card: {
    backgroundColor: colors.bg,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardActive: { borderColor: colors.accent, borderWidth: 2, backgroundColor: colors.accentL },
  cardDone:   { opacity: 0.55 },

  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  numBadge: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  numText:      { fontSize: 12, fontWeight: '700' },
  customerName: { fontSize: font.md, fontWeight: '700', color: colors.text },
  address:      { fontSize: font.xs, color: colors.muted, marginTop: 1 },
  textMuted:    { color: colors.muted },

  statusBadge: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  statusText:  { fontSize: 10, fontWeight: '700' },

  // Ícono de navegación (esquina superior derecha)
  navBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.accentL,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },

  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.surface2, borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  chipText: { fontSize: 11, color: colors.muted },

  notes: { fontSize: font.xs, color: colors.muted2, marginBottom: 6, fontStyle: 'italic' },

  invoiceRow:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  invoiceLabel: { fontSize: 11, color: colors.muted },
  invoiceThumb: {
    width: 48, height: 48, borderRadius: 6,
    borderWidth: 1, borderColor: '#fcd34d',
  },

  actions:    { flexDirection: 'row', gap: 8, marginTop: 4 },
  btnLlegue: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.accent,
    borderRadius: radius.md, paddingVertical: 12,
  },
  btnLlamar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderColor: colors.accent,
    borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 14,
  },
  btnLlamarText: { color: colors.accent, fontWeight: '700', fontSize: font.sm },
  btnEntregar: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.success,
    borderRadius: radius.md, paddingVertical: 12,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: font.sm },

  podRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  podText: { fontSize: 11, color: colors.successT, fontWeight: '500' },

  // Modal vista previa
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: 36,
  },
  modalTitle: {
    fontSize: font.lg, fontWeight: '700', color: colors.text,
    textAlign: 'center', marginBottom: 16,
  },
  previewImage: {
    width: '100%', height: 260,
    borderRadius: radius.lg,
    marginBottom: 20,
  },
  modalActions: { flexDirection: 'row', gap: 10 },
  btnRetake: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderColor: colors.accent,
    borderRadius: radius.md, paddingVertical: 14,
  },
  btnRetakeText: { color: colors.accent, fontWeight: '700', fontSize: font.sm },
  btnConfirm: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.success,
    borderRadius: radius.md, paddingVertical: 14,
  },
})
