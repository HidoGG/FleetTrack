import { useState } from 'react'
import {
  View, Text, TextInput, StyleSheet,
  KeyboardAvoidingView, Platform, StatusBar,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { api } from '../services/api'
import { useAuthStore } from '../store/authStore'
import { Button } from '../components/ui'
import { colors, radius, spacing, font, shadow } from '../theme'

export default function LoginScreen() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const login = useAuthStore((s) => s.login)

  async function handleLogin() {
    if (!email || !password) return
    setError('')
    setLoading(true)
    try {
      const data = await api.login(email.trim().toLowerCase(), password)
      login(data.token, data.refreshToken, data.user, data.user?.driver || null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />

      {/* Logo */}
      <View style={styles.logoArea}>
        <View style={styles.logoIcon}>
          <Feather name="zap" size={28} color="#fff" />
        </View>
        <Text style={styles.logoTitle}>FleetTrack</Text>
        <Text style={styles.logoSub}>Operación de Campo</Text>
      </View>

      {/* Card del formulario */}
      <View style={[styles.formCard, shadow.card]}>
        <Text style={styles.fieldLabel}>Correo electrónico</Text>
        <View style={styles.inputWrapper}>
          <Feather name="mail" size={16} color={colors.muted2} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="conductor@empresa.com"
            placeholderTextColor={colors.placeholder}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>Contraseña</Text>
        <View style={styles.inputWrapper}>
          <Feather name="lock" size={16} color={colors.muted2} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor={colors.placeholder}
            secureTextEntry
          />
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Feather name="alert-circle" size={14} color={colors.dangerT} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <Button
          variant="primary"
          size="lg"
          loading={loading}
          onPress={handleLogin}
          style={{ marginTop: spacing.lg }}
        >
          Iniciar sesión
        </Button>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },

  logoArea:  { alignItems: 'center', marginBottom: spacing.xl },
  logoIcon:  {
    width: 64, height: 64, borderRadius: radius.lg,
    backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 14,
    ...shadow.accent,
  },
  logoTitle: { fontSize: font.xxxl, fontWeight: '700', color: colors.text, letterSpacing: -0.5 },
  logoSub:   { fontSize: font.base, color: colors.muted, marginTop: 4 },

  formCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },

  fieldLabel: {
    fontSize: font.xs,
    fontWeight: '600',
    color: colors.muted,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
  },
  inputIcon: { marginRight: 8 },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: font.base,
    paddingVertical: 12,
  },

  errorBox:  {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.dangerL,
    borderRadius: radius.md,
    padding: 10,
    marginTop: 12,
  },
  errorText: { color: colors.dangerT, fontSize: font.sm, flex: 1 },
})
