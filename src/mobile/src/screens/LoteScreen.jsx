import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { colors, radius, spacing, font, shadow } from '../theme'
import { useAuthStore } from '../store/authStore'
import { startBultoTracking } from '../services/locationService'

const BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001'

async function callValidate(token, codigoLote, conteo) {
  const res = await fetch(`${BASE}/api/bultos/validate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ codigo_lote: codigoLote, conteo_ingresado: conteo }),
  })
  return res.json()
}

async function callUnlock(token, codigoLote, claveDesbloqueo) {
  const res = await fetch(`${BASE}/api/bultos/unlock`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ codigo_lote: codigoLote, clave_desbloqueo: claveDesbloqueo }),
  })
  return res.json()
}

// ─────────────────────────────────────────────────────────────────────────────

export default function LoteScreen({ navigation }) {
  const token = useAuthStore((s) => s.token)

  const [codigoLote, setCodigoLote]     = useState('')
  const [conteo, setConteo]             = useState('')
  const [loading, setLoading]           = useState(false)

  // Estado de bloqueo
  const [bloqueado, setBloqueado]       = useState(false)
  const [claveAdmin, setClaveAdmin]     = useState('')
  const [codigoParaDesbloqueo, setCodigoParaDesbloqueo] = useState('')

  // Alerta de diferencia de conteo (warning amarillo)
  const [mismatch, setMismatch]         = useState(null) // { esperado, ingresado }

  async function handleValidar() {
    const codigo = codigoLote.trim().toUpperCase()
    const conteoNum = parseInt(conteo)

    if (!codigo) return Alert.alert('Campo requerido', 'Ingresá el código de lote.')
    if (!conteo || isNaN(conteoNum)) return Alert.alert('Campo requerido', 'Ingresá la cantidad de paquetes.')

    setLoading(true)
    try {
      const data = await callValidate(token, codigo, conteoNum)

      if (data.result === 'OK') {
        // Encender GPS inmediatamente (no bloquea la navegación)
        if (data.vehicle_id) {
          startBultoTracking(data.vehicle_id).catch((e) =>
            console.warn('[LoteScreen] GPS no disponible:', e.message)
          )
        }
        navigation.replace('MainTabs', { bultoId: data.bulto_id, bultoCode: codigo })

      } else if (data.result === 'COUNT_MISMATCH') {
        // Warning no bloqueante — mostrar confirmación
        setMismatch({
          esperado:   data.cantidad_esperada,
          ingresado:  data.conteo_ingresado,
          bultoId:    data.bulto_id,
          vehicleId:  data.vehicle_id,
          codigo,
        })

      } else if (data.result === 'WRONG_CODE') {
        Alert.alert(
          '⚠️ Código incorrecto',
          data.message,
          [{ text: 'Entendido', style: 'destructive' }]
        )

      } else if (data.result === 'BLOCKED') {
        // Bloqueo total — mostrar pantalla roja
        setCodigoParaDesbloqueo(codigo)
        setBloqueado(true)

      } else {
        Alert.alert('Error', data.error || 'Respuesta inesperada del servidor.')
      }
    } catch {
      Alert.alert('Error de red', 'No se pudo conectar con el servidor.')
    } finally {
      setLoading(false)
    }
  }

  function handleConfirmarDiferencia() {
    const { bultoId, vehicleId, codigo } = mismatch
    setMismatch(null)
    if (vehicleId) {
      startBultoTracking(vehicleId).catch((e) =>
        console.warn('[LoteScreen] GPS no disponible:', e.message)
      )
    }
    navigation.replace('MainTabs', { bultoId, bultoCode: codigo })
  }

  async function handleDesbloquear() {
    const clave = claveAdmin.trim()
    if (!clave) return Alert.alert('Requerido', 'Ingresá la clave que te dictó el supervisor.')
    setLoading(true)
    try {
      const data = await callUnlock(token, codigoParaDesbloqueo, clave)
      if (data.result === 'UNLOCKED') {
        setBloqueado(false)
        setClaveAdmin('')
        setCodigoLote('')
        setConteo('')
        Alert.alert('Desbloqueado', 'Tu acceso fue restaurado. Ingresá tu código nuevamente.')
      } else {
        Alert.alert('Clave incorrecta', data.error || 'La clave no coincide. Verificá con tu supervisor.')
      }
    } catch {
      Alert.alert('Error de red', 'No se pudo conectar con el servidor.')
    } finally {
      setLoading(false)
    }
  }

  // ── PANTALLA DE BLOQUEO ───────────────────────────────────────────────────
  if (bloqueado) {
    return (
      <View style={styles.blockedContainer}>
        <View style={styles.blockedCard}>
          <View style={styles.blockedIconWrap}>
            <Feather name="lock" size={36} color="#fff" />
          </View>
          <Text style={styles.blockedTitle}>Acceso bloqueado</Text>
          <Text style={styles.blockedSubtitle}>
            Superaste los 3 intentos permitidos.{'\n'}Pedí la clave de desbloqueo a tu supervisor.
          </Text>

          <TextInput
            style={styles.inputDark}
            placeholder="Clave del supervisor"
            placeholderTextColor="rgba(255,255,255,0.4)"
            value={claveAdmin}
            onChangeText={setClaveAdmin}
            autoCapitalize="none"
            secureTextEntry
          />

          <TouchableOpacity
            style={[styles.btnUnlock, loading && { opacity: 0.5 }]}
            onPress={handleDesbloquear}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#ef4444" />
              : <Text style={styles.btnUnlockText}>Desbloquear</Text>
            }
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  // ── PANTALLA NORMAL ───────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.iconWrap}>
            <Feather name="package" size={28} color={colors.accent} />
          </View>
          <Text style={styles.title}>Validación de lote</Text>
          <Text style={styles.subtitle}>
            Ingresá el código del lote y la cantidad de paquetes que tenés en el vehículo.
          </Text>
        </View>

        {/* Warning diferencia de conteo */}
        {mismatch && (
          <View style={styles.warningCard}>
            <Feather name="alert-triangle" size={20} color="#d97706" />
            <View style={{ flex: 1 }}>
              <Text style={styles.warningTitle}>Diferencia de conteo detectada</Text>
              <Text style={styles.warningBody}>
                Esperado: <Text style={{ fontWeight: '700' }}>{mismatch.esperado}</Text>
                {'  ·  '}
                Ingresado: <Text style={{ fontWeight: '700' }}>{mismatch.ingresado}</Text>
              </Text>
              <Text style={styles.warningNote}>
                Esta diferencia quedará registrada para auditoría.
              </Text>
            </View>
            <View style={styles.warningActions}>
              <TouchableOpacity
                style={styles.btnWarningConfirm}
                onPress={handleConfirmarDiferencia}
                activeOpacity={0.85}
              >
                <Text style={styles.btnWarningConfirmText}>Confirmar y continuar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.btnWarningCancel}
                onPress={() => setMismatch(null)}
                activeOpacity={0.85}
              >
                <Text style={styles.btnWarningCancelText}>Corregir conteo</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Formulario */}
        <View style={styles.card}>
          <Text style={styles.label}>Código de lote</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej: LOTE-001"
            placeholderTextColor={colors.placeholder}
            value={codigoLote}
            onChangeText={(t) => setCodigoLote(t.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect={false}
          />

          <Text style={[styles.label, { marginTop: spacing.md }]}>Cantidad de paquetes</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej: 24"
            placeholderTextColor={colors.placeholder}
            value={conteo}
            onChangeText={setConteo}
            keyboardType="number-pad"
          />

          <TouchableOpacity
            style={[styles.btnPrimary, (loading || !!mismatch) && { opacity: 0.5 }]}
            onPress={handleValidar}
            disabled={loading || !!mismatch}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Feather name="check-circle" size={18} color="#fff" />
                  <Text style={styles.btnPrimaryText}>Validar acceso</Text>
                </View>
              )
            }
          </TouchableOpacity>
        </View>

        {/* Nota informativa */}
        <View style={styles.infoRow}>
          <Feather name="shield" size={13} color={colors.muted2} />
          <Text style={styles.infoText}>
            3 intentos incorrectos bloquean el acceso. Un error de conteo no bloquea.
          </Text>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: spacing.md + 4,
    justifyContent: 'center',
  },

  // Header
  header: { alignItems: 'center', marginBottom: spacing.xl },
  iconWrap: {
    width: 64, height: 64, borderRadius: radius.xl,
    backgroundColor: colors.accentL,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title:    { fontSize: font.xxl, fontWeight: '700', color: colors.text, textAlign: 'center' },
  subtitle: { fontSize: font.sm, color: colors.muted, textAlign: 'center', marginTop: 6, lineHeight: 20 },

  // Card principal
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  label: { fontSize: font.sm, fontWeight: '600', color: colors.text2, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 14,
    fontSize: font.md,
    color: colors.text,
    backgroundColor: colors.bg,
  },

  btnPrimary: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: spacing.lg,
    ...shadow.card,
  },
  btnPrimaryText: { color: '#fff', fontSize: font.md, fontWeight: '700' },

  // Warning card (diferencia de conteo)
  warningCard: {
    backgroundColor: colors.warnL,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#fcd34d',
    marginBottom: spacing.md,
    gap: 8,
  },
  warningTitle:  { fontSize: font.md, fontWeight: '700', color: colors.warnT },
  warningBody:   { fontSize: font.sm, color: colors.warnT, marginTop: 2 },
  warningNote:   { fontSize: font.xs, color: colors.muted, marginTop: 4 },
  warningActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  btnWarningConfirm: {
    flex: 1, backgroundColor: colors.warn,
    borderRadius: radius.md, paddingVertical: 10,
    alignItems: 'center',
  },
  btnWarningConfirmText: { color: '#fff', fontWeight: '700', fontSize: font.sm },
  btnWarningCancel: {
    flex: 1, backgroundColor: 'transparent',
    borderRadius: radius.md, paddingVertical: 10,
    alignItems: 'center', borderWidth: 1, borderColor: '#fcd34d',
  },
  btnWarningCancelText: { color: colors.warnT, fontWeight: '600', fontSize: font.sm },

  // Info row
  infoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: spacing.md, paddingHorizontal: 4,
  },
  infoText: { fontSize: font.xs, color: colors.muted2, flex: 1, lineHeight: 17 },

  // Pantalla de bloqueo
  blockedContainer: {
    flex: 1, backgroundColor: '#7f1d1d',
    alignItems: 'center', justifyContent: 'center',
    padding: spacing.lg,
  },
  blockedCard: {
    backgroundColor: '#991b1b',
    borderRadius: radius.xl,
    padding: spacing.xl,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1, borderColor: '#ef4444',
  },
  blockedIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#ef4444',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.md,
  },
  blockedTitle: {
    fontSize: font.xxl, fontWeight: '700', color: '#fff',
    textAlign: 'center', marginBottom: spacing.sm,
  },
  blockedSubtitle: {
    fontSize: font.sm, color: 'rgba(255,255,255,0.7)',
    textAlign: 'center', lineHeight: 22, marginBottom: spacing.lg,
  },
  inputDark: {
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: radius.md, padding: 14,
    fontSize: font.md, color: '#fff',
    backgroundColor: 'rgba(0,0,0,0.3)',
    width: '100%', marginBottom: spacing.md,
  },
  btnUnlock: {
    width: '100%', backgroundColor: '#fff',
    borderRadius: radius.md, paddingVertical: 16,
    alignItems: 'center',
  },
  btnUnlockText: { color: '#ef4444', fontSize: font.md, fontWeight: '700' },
})
