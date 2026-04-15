/**
 * MainScreen v2.4
 * Layout: Mapa arriba (45%) · Lista compacta pendientes · Barra inferior custom
 * Botón [Pedidos] abre modal dividido Pendientes / Entregados
 */

import { useEffect, useRef, useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, ActivityIndicator, Dimensions, StatusBar, Image,
  Linking, Modal, Platform,
} from 'react-native'
import MapView, { Marker } from 'react-native-maps'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as ImagePicker from 'expo-image-picker'
import * as FileSystem from 'expo-file-system'
import { Feather } from '@expo/vector-icons'
import { api } from '../services/api'
import { getCurrentPosition, stopBultoTracking } from '../services/locationService'
import { useAuthStore } from '../store/authStore'
import { colors, radius, spacing, font, shadow } from '../theme'

const { height: SCREEN_H } = Dimensions.get('window')
const MAP_H = Math.round(SCREEN_H * 0.45)

// ── Geo ───────────────────────────────────────────────────────────────────────

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000
  const φ1 = (lat1 * Math.PI) / 180, φ2 = (lat2 * Math.PI) / 180
  const Δφ = ((lat2 - lat1) * Math.PI) / 180
  const Δλ = ((lon2 - lon1) * Math.PI) / 180
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function sortByProximity(orders, fromLat, fromLng) {
  const pending   = orders.filter((o) => o.status !== 'DELIVERED' && o.status !== 'FAILED')
  const done      = orders.filter((o) => o.status === 'DELIVERED' || o.status === 'FAILED')
  if (!pending.length || fromLat == null) return [...pending, ...done]

  const sorted = []
  let remaining = pending.map((o) => ({ ...o }))
  let curLat = fromLat, curLng = fromLng

  while (remaining.length) {
    let ni = 0, nd = Infinity
    remaining.forEach((o, i) => {
      if (o.delivery_lat == null) return
      const d = haversineMeters(curLat, curLng, o.delivery_lat, o.delivery_lng)
      if (d < nd) { nd = d; ni = i }
    })
    const picked = { ...remaining[ni], _distMeters: Math.round(nd) }
    sorted.push(picked)
    curLat = remaining[ni].delivery_lat ?? curLat
    curLng = remaining[ni].delivery_lng ?? curLng
    remaining.splice(ni, 1)
  }
  return [...sorted, ...done]
}

// ── Constantes ────────────────────────────────────────────────────────────────

const PIN_COLORS = {
  PENDING:    '#f59e0b',
  IN_TRANSIT: '#4f46e5',
}

const STATUS_LABEL = {
  PENDING:    'Pendiente',
  IN_TRANSIT: 'En camino',
  DELIVERED:  'Entregado',
  FAILED:     'Fallido',
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function MainScreen({ route, navigation }) {
  const { bultoId, bultoCode } = route.params || {}
  const insets = useSafeAreaInsets()

  const mapRef = useRef(null)
  const mapReady = useRef(false)

  const [orders,       setOrders]       = useState([])
  const [loading,      setLoading]      = useState(true)
  const [pos,          setPos]          = useState(null)
  const [uploading,    setUploading]    = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)

  const [showPedidos,       setShowPedidos]       = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [showProfile,       setShowProfile]       = useState(false)
  const [showFinished,      setShowFinished]      = useState(false)

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
    } catch (err) {
      Alert.alert('Error', 'No se pudieron cargar los pedidos: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // ── fitToCoordinates: centrar mapa cuando tengamos pos + pedidos ───────────
  useEffect(() => {
    if (!mapReady.current) return
    fitMap()
  }, [pos, orders])

  function fitMap() {
    const coords = []
    if (pos?.lat && pos?.lng) coords.push({ latitude: pos.lat, longitude: pos.lng })
    orders
      .filter((o) => o.status !== 'DELIVERED' && o.status !== 'FAILED')
      .forEach((o) => {
        if (o.delivery_lat && o.delivery_lng)
          coords.push({ latitude: o.delivery_lat, longitude: o.delivery_lng })
      })
    if (coords.length === 0) return
    mapRef.current?.fitToCoordinates(coords, {
      edgePadding: { top: 48, right: 32, bottom: 32, left: 32 },
      animated: true,
    })
  }

  // ── Fin de jornada ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!loading && orders.length > 0) {
      const allDone = orders.every((o) => o.status === 'DELIVERED' || o.status === 'FAILED')
      if (allDone) setShowFinished(true)
    }
  }, [orders, loading])

  // ── Derivados ──────────────────────────────────────────────────────────────
  const sorted    = sortByProximity(orders, pos?.lat, pos?.lng)
  const pending   = sorted.filter((o) => o.status !== 'DELIVERED' && o.status !== 'FAILED')
  const delivered = sorted.filter((o) => o.status === 'DELIVERED' || o.status === 'FAILED')
  const total     = orders.length
  const doneCount = delivered.length
  const progress  = total > 0 ? doneCount / total : 0
  const allDone   = total > 0 && doneCount === total

  // ── Acciones de mapa ───────────────────────────────────────────────────────
  function flyTo(order) {
    if (!order?.delivery_lat) return
    mapRef.current?.animateToRegion({
      latitude: order.delivery_lat, longitude: order.delivery_lng,
      latitudeDelta: 0.007, longitudeDelta: 0.007,
    }, 500)
  }

  function openNav(order) {
    if (!order.delivery_lat) return
    Linking.openURL(
      `https://www.google.com/maps/dir/?api=1&destination=${order.delivery_lat},${order.delivery_lng}&travelmode=driving`
    ).catch(() => Alert.alert('Error', 'No se pudo abrir Google Maps.'))
  }

  function handleLlamar(phone) {
    if (!phone) return
    Linking.openURL(`tel:${phone}`).catch(() => Alert.alert('Error', 'No se pudo abrir el dialer.'))
  }

  // ── Llegué ─────────────────────────────────────────────────────────────────
  async function handleLlegue(order) {
    if (!pos) return Alert.alert('Sin GPS', 'Esperá que el GPS obtenga tu posición.')
    const dist = haversineMeters(pos.lat, pos.lng, order.delivery_lat, order.delivery_lng)
    if (dist > 100) {
      return Alert.alert('Muy lejos', `Estás a ${Math.round(dist)} m. Necesitás estar a ≤100 m.`)
    }
    try {
      await api.updateOrderStatus(order.id, 'IN_TRANSIT')
      setOrders((p) => p.map((o) => o.id === order.id ? { ...o, status: 'IN_TRANSIT' } : o))
    } catch (e) { Alert.alert('Error', e.message) }
  }

  // ── Entregar con foto ──────────────────────────────────────────────────────
  async function handleEntregar(order) {
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') return Alert.alert('Permiso de cámara', 'Habilitá la cámara en Ajustes.')
    const result = await ImagePicker.launchCameraAsync({ quality: 0.65 })
    if (result.canceled) return
    const base64 = await FileSystem.readAsStringAsync(result.assets[0].uri, {
      encoding: FileSystem.EncodingType.Base64,
    })
    setPhotoPreview({ uri: result.assets[0].uri, base64, orderId: order.id })
  }

  async function handleConfirmarEntrega() {
    const { base64, orderId } = photoPreview
    setPhotoPreview(null)
    setUploading(orderId)
    try {
      const updated = await api.uploadPoD(orderId, base64)
      setOrders((p) => p.map((o) => o.id === orderId
        ? { ...o, status: 'DELIVERED', pod_photo_url: updated.pod_photo_url } : o))
    } catch (e) { Alert.alert('Error al entregar', e.message) }
    finally { setUploading(null) }
  }

  // ── Fin de jornada ─────────────────────────────────────────────────────────
  function handleFinJornada() {
    stopBultoTracking()
    setShowFinished(false)
    navigation.replace('Lote')
  }

  // ── Altura tab bar con safe area ───────────────────────────────────────────
  const TAB_BAR_H = 56 + insets.bottom

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      <StatusBar hidden />

      {/* ── MAPA (45% de pantalla) ── */}
      <View style={{ height: MAP_H }}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          showsUserLocation
          showsMyLocationButton={false}
          onMapReady={() => {
            mapReady.current = true
            fitMap()
          }}
        >
          {pending.map((o, idx) =>
            o.delivery_lat && o.delivery_lng ? (
              <Marker
                key={o.id}
                coordinate={{ latitude: o.delivery_lat, longitude: o.delivery_lng }}
                onPress={() => flyTo(o)}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <View style={[
                  styles.pin,
                  { backgroundColor: o.status === 'IN_TRANSIT' ? colors.accent : PIN_COLORS.PENDING },
                ]}>
                  <Text style={styles.pinNum}>{idx + 1}</Text>
                </View>
              </Marker>
            ) : null
          )}
        </MapView>
      </View>

      {/* ── BARRA DE PROGRESO ── */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>

      {/* ── LISTA COMPACTA de pendientes ── */}
      <View style={{ flex: 1, backgroundColor: colors.surface }}>
        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 20 }} />
        ) : pending.length === 0 && !allDone ? (
          <View style={styles.emptyWrap}>
            <Feather name="inbox" size={28} color={colors.muted2} />
            <Text style={styles.emptyText}>Sin pedidos pendientes</Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={[styles.compactList, { paddingBottom: TAB_BAR_H + 8 }]}
            showsVerticalScrollIndicator={false}
          >
            {/* Header mini */}
            <View style={styles.compactHeader}>
              <Text style={styles.compactTitle}>
                {bultoCode ? `Lote ${bultoCode}` : 'Mis entregas'}
              </Text>
              <Text style={styles.compactSub}>{doneCount}/{total} entregados</Text>
            </View>

            {pending.map((order, idx) => (
              <CompactCard
                key={order.id}
                order={order}
                idx={idx}
                onPress={() => flyTo(order)}
                onNavigate={() => openNav(order)}
              />
            ))}
          </ScrollView>
        )}
      </View>

      {/* ── BARRA INFERIOR CUSTOM ── */}
      <View style={[styles.tabBar, { height: TAB_BAR_H, paddingBottom: insets.bottom }]}>
        <TouchableOpacity
          style={[styles.tab, allDone && styles.tabDisabled]}
          onPress={() => { if (!allDone) setShowPedidos((v) => !v) }}
          disabled={allDone || loading}
          activeOpacity={0.8}
        >
          <Feather
            name="package"
            size={20}
            color={allDone || loading ? colors.muted2 : showPedidos ? colors.accent : colors.text2}
          />
          <Text style={[
            styles.tabLabel,
            { color: allDone || loading ? colors.muted2 : showPedidos ? colors.accent : colors.text2 },
          ]}>Pedidos</Text>
          {pending.length > 0 && !allDone && (
            <View style={styles.badgeDot}>
              <Text style={styles.badgeDotText}>{pending.length}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.tab} onPress={() => setShowNotifications(true)} activeOpacity={0.8}>
          <Feather name="bell" size={20} color={colors.text2} />
          <Text style={styles.tabLabel}>Alertas</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.tab} onPress={() => setShowProfile(true)} activeOpacity={0.8}>
          <Feather name="user" size={20} color={colors.text2} />
          <Text style={styles.tabLabel}>Perfil</Text>
        </TouchableOpacity>
      </View>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* MODAL: Pedidos (dividido Pendientes / Entregados)          */}
      {/* ══════════════════════════════════════════════════════════ */}
      <Modal visible={showPedidos} animationType="slide" transparent onRequestClose={() => setShowPedidos(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalDismiss} onPress={() => setShowPedidos(false)} />
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.handle} />

            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {bultoCode ? `Lote ${bultoCode}` : 'Mis Pedidos'}
              </Text>
              <TouchableOpacity onPress={() => setShowPedidos(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Feather name="x" size={18} color={colors.muted} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalList} showsVerticalScrollIndicator={false}>
              {/* ── PENDIENTES ── */}
              {pending.length > 0 && (
                <>
                  <SectionHeader icon="clock" label="PENDIENTES" color={colors.accent} count={pending.length} />
                  {pending.map((order, idx) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      idx={idx}
                      uploading={uploading}
                      onFlyTo={() => { flyTo(order); setShowPedidos(false) }}
                      onNavigate={() => openNav(order)}
                      onLlegue={() => handleLlegue(order)}
                      onLlamar={() => handleLlamar(order.customer_phone)}
                      onEntregar={() => handleEntregar(order)}
                    />
                  ))}
                </>
              )}

              {/* ── ENTREGADOS ── */}
              {delivered.length > 0 && (
                <>
                  <SectionHeader icon="check-circle" label="ENTREGADOS" color={colors.success} count={delivered.length} />
                  {delivered.map((order) => (
                    <DoneCard key={order.id} order={order} />
                  ))}
                </>
              )}

              {orders.length === 0 && (
                <View style={styles.emptyWrap}>
                  <Feather name="inbox" size={32} color={colors.muted2} />
                  <Text style={styles.emptyText}>No hay pedidos en este lote.</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* MODAL: Confirmar foto                                      */}
      {/* ══════════════════════════════════════════════════════════ */}
      <Modal visible={!!photoPreview} animationType="slide" transparent onRequestClose={() => setPhotoPreview(null)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalDismiss} onPress={() => setPhotoPreview(null)} />
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.handle} />
            <Text style={styles.previewTitle}>Confirmar foto de entrega</Text>
            {photoPreview?.uri && (
              <Image source={{ uri: photoPreview.uri }} style={styles.previewImg} resizeMode="cover" />
            )}
            <View style={styles.previewActions}>
              <TouchableOpacity
                style={styles.btnRetake}
                onPress={async () => {
                  const orderId = photoPreview.orderId
                  setPhotoPreview(null)
                  const order = orders.find((o) => o.id === orderId)
                  if (order) setTimeout(() => handleEntregar(order), 300)
                }}
              >
                <Feather name="refresh-cw" size={13} color={colors.accent} />
                <Text style={styles.btnRetakeText}>Sacar de nuevo</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnConfirm} onPress={handleConfirmarEntrega}>
                <Feather name="check" size={13} color="#fff" />
                <Text style={styles.btnConfirmText}>Confirmar entrega</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* MODAL: Alertas                                             */}
      {/* ══════════════════════════════════════════════════════════ */}
      <Modal visible={showNotifications} animationType="slide" transparent onRequestClose={() => setShowNotifications(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalDismiss} onPress={() => setShowNotifications(false)} />
          <View style={[styles.modalSheet, { alignItems: 'center', paddingVertical: 40, paddingBottom: insets.bottom + 32 }]}>
            <View style={styles.handle} />
            <Feather name="bell" size={36} color={colors.muted2} style={{ marginBottom: 10 }} />
            <Text style={styles.modalTitle}>Sin alertas</Text>
            <Text style={{ color: colors.muted, fontSize: font.sm, marginTop: 6, textAlign: 'center' }}>
              Las notificaciones del supervisor aparecerán aquí.
            </Text>
          </View>
        </View>
      </Modal>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* MODAL: Perfil                                              */}
      {/* ══════════════════════════════════════════════════════════ */}
      <ProfileModal
        visible={showProfile}
        insetBottom={insets.bottom}
        onClose={() => setShowProfile(false)}
        onLogout={handleFinJornada}
      />

      {/* ══════════════════════════════════════════════════════════ */}
      {/* MODAL: ¡Ruta Terminada!                                    */}
      {/* ══════════════════════════════════════════════════════════ */}
      <Modal visible={showFinished} animationType="fade" transparent>
        <View style={styles.finishedOverlay}>
          <View style={styles.finishedCard}>
            <View style={styles.finishedIcon}>
              <Feather name="check-circle" size={36} color="#fff" />
            </View>
            <Text style={styles.finishedTitle}>¡Ruta Terminada!</Text>
            <Text style={styles.finishedSub}>
              Completaste todos los pedidos del lote {bultoCode}.{'\n'}¡Excelente trabajo!
            </Text>
            <TouchableOpacity style={styles.btnFinished} onPress={handleFinJornada}>
              <Text style={styles.btnFinishedText}>Cerrar jornada</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}

// ── Tarjeta compacta (lista principal, solo info) ─────────────────────────────

function CompactCard({ order, idx, onPress, onNavigate }) {
  const isInTransit = order.status === 'IN_TRANSIT'
  const distM = order._distMeters

  return (
    <TouchableOpacity style={[ccs.card, isInTransit && ccs.cardActive]} onPress={onPress} activeOpacity={0.85}>
      {/* Número */}
      <View style={[ccs.num, { backgroundColor: isInTransit ? colors.accent : PIN_COLORS.PENDING }]}>
        <Text style={ccs.numText}>{idx + 1}</Text>
      </View>

      {/* Info */}
      <View style={{ flex: 1 }}>
        <Text style={ccs.name} numberOfLines={1}>{order.customer_name}</Text>
        <Text style={ccs.addr} numberOfLines={1}>{order.delivery_address}</Text>
      </View>

      {/* Distancia */}
      {distM != null && (
        <Text style={ccs.dist}>
          {distM < 1000 ? `${distM}m` : `${(distM / 1000).toFixed(1)}km`}
        </Text>
      )}

      {/* Ícono navegación */}
      <TouchableOpacity style={ccs.navBtn} onPress={onNavigate} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Feather name="navigation" size={13} color={colors.accent} />
      </TouchableOpacity>
    </TouchableOpacity>
  )
}

const ccs = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.bg,
    borderRadius: radius.md, padding: 10,
    marginBottom: 6,
    borderWidth: 1, borderColor: colors.border,
  },
  cardActive: { borderColor: colors.accent, backgroundColor: colors.accentL },
  num: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  numText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  name:    { fontSize: font.sm, fontWeight: '700', color: colors.text },
  addr:    { fontSize: font.xs, color: colors.muted, marginTop: 1 },
  dist:    { fontSize: font.xs, color: colors.muted2, fontWeight: '600', flexShrink: 0 },
  navBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.accentL,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
})

// ── Sección header ─────────────────────────────────────────────────────────

function SectionHeader({ icon, label, color, count }) {
  return (
    <View style={sh.row}>
      <Feather name={icon} size={12} color={color} />
      <Text style={[sh.label, { color }]}>{label}</Text>
      <View style={[sh.badge, { backgroundColor: color + '22' }]}>
        <Text style={[sh.badgeText, { color }]}>{count}</Text>
      </View>
    </View>
  )
}
const sh = StyleSheet.create({
  row:       { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 12, marginBottom: 8 },
  label:     { fontSize: font.xs, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', flex: 1 },
  badge:     { borderRadius: 20, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { fontSize: font.xs, fontWeight: '700' },
})

// ── Tarjeta de pedido con acciones (para modal Pedidos) ───────────────────────

function OrderCard({ order, idx, uploading, onFlyTo, onNavigate, onLlegue, onLlamar, onEntregar }) {
  const isInTransit = order.status === 'IN_TRANSIT'
  const isUploading = uploading === order.id
  const distM       = order._distMeters

  return (
    <TouchableOpacity
      style={[ocs.card, isInTransit && ocs.cardActive]}
      onPress={onFlyTo}
      activeOpacity={0.88}
    >
      {/* Cabecera */}
      <View style={ocs.head}>
        <View style={[ocs.num, { backgroundColor: isInTransit ? colors.accent : PIN_COLORS.PENDING }]}>
          <Text style={ocs.numText}>{idx + 1}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={ocs.name}>{order.customer_name}</Text>
          <Text style={ocs.addr} numberOfLines={1}>{order.delivery_address}</Text>
        </View>
        {/* Badge estado */}
        <View style={[ocs.statusBadge, { backgroundColor: (isInTransit ? colors.accent : PIN_COLORS.PENDING) + '22' }]}>
          <Text style={[ocs.statusText, { color: isInTransit ? colors.accent : PIN_COLORS.PENDING }]}>
            {STATUS_LABEL[order.status]}
          </Text>
        </View>
        {/* Ícono nav */}
        <TouchableOpacity style={ocs.navBtn} onPress={onNavigate} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Feather name="navigation" size={14} color={colors.accent} />
        </TouchableOpacity>
      </View>

      {/* Distancia */}
      {distM != null && (
        <View style={ocs.metaRow}>
          <Feather name="map-pin" size={10} color={colors.muted} />
          <Text style={ocs.metaText}>
            {distM < 1000 ? `${distM} m` : `${(distM / 1000).toFixed(1)} km`}
          </Text>
        </View>
      )}

      {/* Factura */}
      {order.invoice_photo_url && (
        <View style={ocs.invoiceRow}>
          <Feather name="file-text" size={10} color={colors.muted} />
          <Text style={ocs.invoiceLabel}>Factura:</Text>
          <Image source={{ uri: order.invoice_photo_url }} style={ocs.invoiceThumb} resizeMode="cover" />
        </View>
      )}

      {/* Acciones */}
      <View style={ocs.actions}>
        {order.status === 'PENDING' && (
          <TouchableOpacity style={ocs.btnLlegue} onPress={onLlegue} activeOpacity={0.85}>
            <Feather name="map-pin" size={13} color="#fff" />
            <Text style={ocs.btnText}>Llegué</Text>
          </TouchableOpacity>
        )}
        {isInTransit && (
          <>
            {order.customer_phone ? (
              <TouchableOpacity style={ocs.btnLlamar} onPress={onLlamar} activeOpacity={0.85}>
                <Feather name="phone" size={13} color={colors.accent} />
                <Text style={ocs.btnLlamarText}>Llamar</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[ocs.btnEntregar, isUploading && { opacity: 0.5 }]}
              onPress={onEntregar}
              disabled={isUploading}
              activeOpacity={0.85}
            >
              {isUploading
                ? <><ActivityIndicator color="#fff" size="small" /><Text style={ocs.btnText}>Subiendo…</Text></>
                : <><Feather name="camera" size={13} color="#fff" /><Text style={ocs.btnText}>Entregar con foto</Text></>
              }
            </TouchableOpacity>
          </>
        )}
      </View>
    </TouchableOpacity>
  )
}

const ocs = StyleSheet.create({
  card: {
    backgroundColor: colors.bg, borderRadius: radius.lg,
    padding: spacing.md, marginBottom: 10,
    borderWidth: 1, borderColor: colors.border,
  },
  cardActive: { borderColor: colors.accent, borderWidth: 2, backgroundColor: colors.accentL },
  head:       { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  num: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  numText:    { color: '#fff', fontSize: 11, fontWeight: '800' },
  name:       { fontSize: font.sm, fontWeight: '700', color: colors.text },
  addr:       { fontSize: font.xs, color: colors.muted, marginTop: 1 },
  statusBadge:{ borderRadius: 20, paddingHorizontal: 7, paddingVertical: 2 },
  statusText: { fontSize: 10, fontWeight: '700' },
  navBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: colors.accentL,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  metaRow:    { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  metaText:   { fontSize: 11, color: colors.muted },
  invoiceRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 },
  invoiceLabel:{ fontSize: 11, color: colors.muted },
  invoiceThumb:{ width: 44, height: 44, borderRadius: 5, borderWidth: 1, borderColor: '#fcd34d' },
  actions:    { flexDirection: 'row', gap: 7, marginTop: 4 },
  btnLlegue: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 11,
  },
  btnLlamar: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1, borderColor: colors.accent,
    borderRadius: radius.md, paddingVertical: 11, paddingHorizontal: 12,
  },
  btnLlamarText: { color: colors.accent, fontWeight: '700', fontSize: font.xs },
  btnEntregar: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    backgroundColor: colors.success, borderRadius: radius.md, paddingVertical: 11,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: font.xs },
})

// ── Tarjeta entregado (gris/opaca) ───────────────────────────────────────────

function DoneCard({ order }) {
  return (
    <View style={dcs.card}>
      <View style={dcs.check}>
        <Feather name="check" size={12} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={dcs.name}>{order.customer_name}</Text>
        <Text style={dcs.addr} numberOfLines={1}>{order.delivery_address}</Text>
      </View>
      {order.pod_photo_url && (
        <Image source={{ uri: order.pod_photo_url }} style={dcs.pod} resizeMode="cover" />
      )}
    </View>
  )
}
const dcs = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#f1f5f9', borderRadius: radius.md,
    padding: 10, marginBottom: 6,
    borderWidth: 1, borderColor: '#e2e8f0', opacity: 0.75,
  },
  check: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: colors.success,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  name: { fontSize: font.sm, fontWeight: '600', color: colors.muted },
  addr: { fontSize: font.xs, color: colors.muted2, marginTop: 1 },
  pod:  { width: 36, height: 36, borderRadius: 5 },
})

// ── Perfil Modal ──────────────────────────────────────────────────────────────

function ProfileModal({ visible, insetBottom, onClose, onLogout }) {
  const { user, profile } = useAuthStore()
  const name = profile?.full_name || user?.email || 'Conductor'
  const email = user?.email || ''

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <TouchableOpacity style={styles.modalDismiss} onPress={onClose} />
        <View style={[styles.modalSheet, { paddingBottom: insetBottom + 24 }]}>
          <View style={styles.handle} />
          <View style={pm.avatarWrap}>
            <View style={pm.avatar}>
              <Text style={pm.avatarTxt}>{name.charAt(0).toUpperCase()}</Text>
            </View>
            <Text style={pm.name}>{name}</Text>
            <Text style={pm.email}>{email}</Text>
          </View>
          <View style={pm.info}>
            <View style={pm.row}>
              <Feather name="wifi" size={14} color={colors.success} />
              <Text style={pm.rowLabel}>GPS</Text>
              <Text style={[pm.rowVal, { color: colors.successT }]}>Activo</Text>
            </View>
            <View style={pm.divider} />
            <View style={pm.row}>
              <Feather name="shield" size={14} color={colors.muted2} />
              <Text style={pm.rowLabel}>Rol</Text>
              <Text style={pm.rowVal}>{profile?.role || 'driver'}</Text>
            </View>
          </View>
          <TouchableOpacity style={pm.btnLogout} onPress={onLogout} activeOpacity={0.85}>
            <Feather name="log-out" size={15} color="#ef4444" />
            <Text style={pm.btnLogoutText}>Cerrar jornada</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const pm = StyleSheet.create({
  avatarWrap: { alignItems: 'center', paddingVertical: 16 },
  avatar: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  avatarTxt: { fontSize: 24, fontWeight: '700', color: '#fff' },
  name:      { fontSize: font.lg, fontWeight: '700', color: colors.text },
  email:     { fontSize: font.xs, color: colors.muted, marginTop: 4 },
  info: {
    width: '100%', backgroundColor: colors.surface2,
    borderRadius: radius.lg, padding: spacing.md, marginBottom: 16,
  },
  row:      { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  rowLabel: { flex: 1, fontSize: font.sm, color: colors.text2 },
  rowVal:   { fontSize: font.sm, fontWeight: '600', color: colors.text },
  divider:  { height: 1, backgroundColor: colors.border },
  btnLogout: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    borderWidth: 1, borderColor: '#fca5a5',
    borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 24,
    backgroundColor: '#fff1f2',
  },
  btnLogoutText: { fontSize: font.sm, fontWeight: '700', color: '#ef4444' },
})

// ── Estilos principales ───────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },

  // Progreso
  progressTrack: { height: 3, backgroundColor: colors.border },
  progressFill:  { height: 3, backgroundColor: colors.success },

  // Lista compacta
  compactList: { paddingHorizontal: 12, paddingTop: 8 },
  compactHeader: {
    flexDirection: 'row', alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingBottom: 6, marginBottom: 4,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  compactTitle: { fontSize: font.sm, fontWeight: '700', color: colors.text },
  compactSub:   { fontSize: font.xs, color: colors.muted },

  emptyWrap: { alignItems: 'center', paddingTop: 32, gap: 8 },
  emptyText: { fontSize: font.sm, color: colors.muted2 },

  // Pines del mapa
  pin: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 2, elevation: 4,
  },
  pinNum: { color: '#fff', fontSize: 11, fontWeight: '800' },

  // Tab bar
  tabBar: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderTopWidth: 1, borderTopColor: colors.border,
    paddingTop: 6,
    ...shadow.card,
  },
  tab: { flex: 1, alignItems: 'center', gap: 2, position: 'relative' },
  tabDisabled: { opacity: 0.4 },
  tabLabel: { fontSize: 10, fontWeight: '600' },
  badgeDot: {
    position: 'absolute', top: 0, right: '20%',
    backgroundColor: colors.accent,
    width: 14, height: 14, borderRadius: 7,
    alignItems: 'center', justifyContent: 'center',
  },
  badgeDotText: { fontSize: 8, color: '#fff', fontWeight: '800' },

  // Modales base
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  modalDismiss: { flex: 1 },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    maxHeight: SCREEN_H * 0.88,
    paddingHorizontal: spacing.md,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.border2,
    alignSelf: 'center', marginTop: 10, marginBottom: 8,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    marginBottom: 4,
  },
  modalTitle: { fontSize: font.lg, fontWeight: '700', color: colors.text },
  modalList:  { paddingVertical: 8, paddingBottom: 24 },

  // Vista previa foto
  previewTitle: {
    fontSize: font.md, fontWeight: '700', color: colors.text,
    textAlign: 'center', marginVertical: 12,
  },
  previewImg: {
    width: '100%', height: 240, borderRadius: radius.lg, marginBottom: 16,
  },
  previewActions: { flexDirection: 'row', gap: 10 },
  btnRetake: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderColor: colors.accent,
    borderRadius: radius.md, paddingVertical: 13,
  },
  btnRetakeText:  { color: colors.accent, fontWeight: '700', fontSize: font.sm },
  btnConfirm: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.success, borderRadius: radius.md, paddingVertical: 13,
  },
  btnConfirmText: { color: '#fff', fontWeight: '700', fontSize: font.sm },

  // Ruta terminada
  finishedOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center', justifyContent: 'center', padding: spacing.lg,
  },
  finishedCard: {
    backgroundColor: colors.surface, borderRadius: radius.xl,
    padding: spacing.xl, width: '100%', alignItems: 'center',
  },
  finishedIcon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: colors.success,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  finishedTitle: { fontSize: font.xxl, fontWeight: '800', color: colors.text, marginBottom: 10 },
  finishedSub: {
    fontSize: font.sm, color: colors.muted,
    textAlign: 'center', lineHeight: 22, marginBottom: 24,
  },
  btnFinished: {
    backgroundColor: colors.success, borderRadius: radius.md,
    paddingVertical: 14, paddingHorizontal: 36,
  },
  btnFinishedText: { color: '#fff', fontSize: font.md, fontWeight: '700' },
})
