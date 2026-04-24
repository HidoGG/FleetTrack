import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, Plus, ShieldCheck, ShieldOff, Users, UserPlus } from 'lucide-react'
import { api } from '../services/api'

const EMPTY_COMPANY = {
  name: '',
  plan: 'basic',
  commercial_status: 'trial',
}

const EMPTY_COMPANY_EDIT = {
  name: '',
  plan: 'basic',
  commercial_status: 'trial',
  commercial_name: '',
  email: '',
  phone: '',
  feature_flags: {},
  limits_config: {},
  addons: [],
}

const EMPTY_PROFILE = {
  email: '',
  password: '',
  role: 'admin',
  full_name: '',
  phone: '',
  location_id: '',
}

const STATE_LABELS = {
  active: 'Activa',
  suspended: 'Suspendida',
  inactive: 'Inactiva',
}

const COMMERCIAL_STATUS_LABELS = {
  trial: 'Trial',
  active: 'Activa comercialmente',
  past_due: 'Pago vencido',
  paused: 'Pausada',
  cancelled: 'Cancelada',
}

const FEATURE_OPTIONS = [
  { key: 'live_tracking', label: 'Mapa en vivo' },
  { key: 'incidents', label: 'Incidentes' },
  { key: 'advanced_history', label: 'Historial avanzado' },
  { key: 'financial_dashboard', label: 'Dashboard financiero' },
  { key: 'invoice_capture', label: 'Fotos de factura y entrega' },
  { key: 'multi_location', label: 'Multiples ubicaciones' },
  { key: 'full_traceability', label: 'Trazabilidad completa' },
  { key: 'operational_rollback', label: 'Rollback operativo' },
  { key: 'advanced_metrics', label: 'Metricas avanzadas' },
]

const LIMIT_FIELDS = [
  { key: 'profiles', label: 'Perfiles' },
  { key: 'stores', label: 'Sucursales' },
  { key: 'drivers', label: 'Riders' },
  { key: 'vehicles', label: 'Vehiculos' },
]

const ADDON_OPTIONS = [
  { key: 'priority_support', label: 'Soporte prioritario' },
  { key: 'white_label', label: 'White label' },
  { key: 'extra_integrations', label: 'Integraciones extra' },
]

const PLAN_DEFAULTS = {
  basic: {
    feature_flags: {
      live_tracking: true,
      incidents: false,
      advanced_history: false,
      financial_dashboard: false,
      invoice_capture: true,
      multi_location: false,
      full_traceability: false,
      operational_rollback: false,
      advanced_metrics: false,
    },
    limits_config: {
      profiles: 3,
      stores: 1,
      drivers: 5,
      vehicles: 5,
    },
    addons: [],
  },
  pro: {
    feature_flags: {
      live_tracking: true,
      incidents: true,
      advanced_history: true,
      financial_dashboard: true,
      invoice_capture: true,
      multi_location: true,
      full_traceability: false,
      operational_rollback: false,
      advanced_metrics: true,
    },
    limits_config: {
      profiles: 12,
      stores: 4,
      drivers: 20,
      vehicles: 20,
    },
    addons: ['priority_support'],
  },
  enterprise: {
    feature_flags: {
      live_tracking: true,
      incidents: true,
      advanced_history: true,
      financial_dashboard: true,
      invoice_capture: true,
      multi_location: true,
      full_traceability: true,
      operational_rollback: true,
      advanced_metrics: true,
    },
    limits_config: {
      profiles: 50,
      stores: 20,
      drivers: 100,
      vehicles: 100,
    },
    addons: ['priority_support', 'white_label', 'extra_integrations'],
  },
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function getPlanTemplate(plan = 'basic') {
  return clone(PLAN_DEFAULTS[plan] || PLAN_DEFAULTS.basic)
}

function buildEditCompanyState(company = {}) {
  const template = getPlanTemplate(company.plan || 'basic')

  return {
    name: company.name || '',
    plan: company.plan || 'basic',
    commercial_status: company.commercial_status || 'trial',
    commercial_name: company.commercial_name || '',
    email: company.email || '',
    phone: company.phone || '',
    feature_flags: FEATURE_OPTIONS.reduce((acc, option) => {
      acc[option.key] = company.feature_flags?.[option.key] ?? template.feature_flags[option.key]
      return acc
    }, {}),
    limits_config: LIMIT_FIELDS.reduce((acc, field) => {
      const value = company.limits_config?.[field.key]
      acc[field.key] = value === null || value === undefined ? '' : String(value)
      return acc
    }, {}),
    addons: Array.isArray(company.addons) ? company.addons : template.addons,
  }
}

function countEnabledFeatures(featureFlags = {}) {
  return FEATURE_OPTIONS.filter((option) => Boolean(featureFlags?.[option.key])).length
}

function formatLimitValue(value) {
  return value === null || value === undefined || value === '' ? 'sin tope' : value
}

function formatLimitSummary(limitsConfig = {}) {
  return LIMIT_FIELDS.map((field) => `${field.label}: ${formatLimitValue(limitsConfig[field.key])}`).join(' · ')
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('es-AR')
}

function isRecentDate(value, days = 7) {
  if (!value) return false
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return false
  return Date.now() - date.getTime() <= days * 24 * 60 * 60 * 1000
}

function getDaysSince(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000)))
}

function formatDaysAgo(value) {
  const days = getDaysSince(value)
  if (days === null) return 'sin fecha'
  if (days === 0) return 'hoy'
  if (days === 1) return 'hace 1 dia'
  return `hace ${days} dias`
}

function getProfileIdentity(profile) {
  return profile.full_name || profile.email || profile.id
}

function getProfileLocationId(profile) {
  return profile.location_id || profile.store_id || ''
}

function getProfileRoleLabel(role) {
  if (role === 'store') return 'punto de despacho'
  return role
}

function ActionTag({ label, tone = 'neutral' }) {
  const tones = {
    neutral: {
      color: 'var(--muted)',
      background: 'rgba(148, 163, 184, 0.12)',
    },
    danger: {
      color: '#b91c1c',
      background: '#fee2e2',
    },
  }

  const style = tones[tone] || tones.neutral

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px 8px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '.01em',
        color: style.color,
        background: style.background,
      }}
    >
      {label}
    </span>
  )
}
function FilterChip({ label }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '4px 9px',
        borderRadius: 999,
        fontSize: 11.5,
        fontWeight: 600,
        color: 'var(--text2)',
        background: 'var(--accent-l)',
        border: '1px solid var(--border)',
      }}
    >
      {label}
    </span>
  )
}
function QuickActionButton({ label, active = false, tone = 'neutral', onClick, disabled = false }) {
  const tones = {
    neutral: {
      color: 'var(--text2)',
      background: active ? 'rgba(14, 165, 233, 0.12)' : 'rgba(248, 250, 252, 0.92)',
      border: active ? 'rgba(14, 165, 233, 0.34)' : 'rgba(148, 163, 184, 0.22)',
    },
    danger: {
      color: active ? '#991b1b' : '#b45309',
      background: active ? '#fee2e2' : '#fff7ed',
      border: active ? 'rgba(239, 68, 68, 0.3)' : 'rgba(249, 115, 22, 0.22)',
    },
  }

  const style = tones[tone] || tones.neutral

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '7px 11px',
        borderRadius: 999,
        border: `1px solid ${style.border}`,
        background: style.background,
        color: style.color,
        fontSize: 12,
        fontWeight: 600,
        lineHeight: 1.2,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {label}
    </button>
  )
}
function SectionHeading({ eyebrow, title, description, icon }) {
  return (
    <div
      style={{
        padding: '18px 20px 16px',
        borderBottom: '1px solid rgba(148, 163, 184, 0.16)',
        background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.035), rgba(15, 23, 42, 0))',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 14,
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 12,
            display: 'grid',
            placeItems: 'center',
            background: 'var(--accent-l)',
            color: 'var(--accent)',
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <div>
          {eyebrow && (
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '.08em',
                textTransform: 'uppercase',
                color: 'var(--muted)',
                marginBottom: 4,
              }}
            >
              {eyebrow}
            </div>
          )}
          <h2 style={{ fontSize: 17, fontWeight: 700 }}>{title}</h2>
          <p style={{ color: 'var(--muted)', fontSize: 12.5, marginTop: 4, maxWidth: 620 }}>{description}</p>
        </div>
      </div>
    </div>
  )
}

function OperationalCallout({ title, value, subtitle, tone = 'neutral', children }) {
  const tones = {
    neutral: {
      border: 'rgba(148, 163, 184, 0.18)',
      background: 'rgba(248, 250, 252, 0.9)',
      value: 'var(--text)',
    },
    accent: {
      border: 'rgba(14, 165, 233, 0.2)',
      background: 'rgba(14, 165, 233, 0.08)',
      value: 'var(--accent)',
    },
    danger: {
      border: 'rgba(239, 68, 68, 0.18)',
      background: 'rgba(254, 242, 242, 0.95)',
      value: 'var(--danger)',
    },
  }

  const style = tones[tone] || tones.neutral

  return (
    <div
      style={{
        border: `1px solid ${style.border}`,
        background: style.background,
        borderRadius: 14,
        padding: '14px 15px',
        minHeight: 132,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>
        {title}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: style.value, lineHeight: 1 }}>{value}</div>
      {subtitle && (
        <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 8, lineHeight: 1.45 }}>
          {subtitle}
        </div>
      )}
      {children && <div style={{ marginTop: 12 }}>{children}</div>}
    </div>
  )
}

export default function SuperAdminPage() {
  const qc = useQueryClient()
  const [selectedCompany, setSelectedCompany] = useState(null)
  const [showCompanyForm, setShowCompanyForm] = useState(false)
  const [showCompanyEditForm, setShowCompanyEditForm] = useState(false)
  const [showProfileForm, setShowProfileForm] = useState(false)
  const [companySearch, setCompanySearch] = useState('')
  const [companyStateFilter, setCompanyStateFilter] = useState('all')
  const [companyPlanFilter, setCompanyPlanFilter] = useState('all')
  const [profileSearch, setProfileSearch] = useState('')
  const [profileRoleFilter, setProfileRoleFilter] = useState('all')
  const [profileStateFilter, setProfileStateFilter] = useState('all')
  const [profileQuickFilter, setProfileQuickFilter] = useState('all')
  const [companyStateTarget, setCompanyStateTarget] = useState(null)
  const [profileToSuspend, setProfileToSuspend] = useState(null)
  const [suspendReason, setSuspendReason] = useState('')
  const [companyForm, setCompanyForm] = useState(EMPTY_COMPANY)
  const [companyEditForm, setCompanyEditForm] = useState(() => buildEditCompanyState())
  const [profileForm, setProfileForm] = useState(EMPTY_PROFILE)

  const { data: companies = [], isLoading: companiesLoading } = useQuery({
    queryKey: ['super-admin', 'companies'],
    queryFn: api.getCompanies,
  })

  const { data: profiles = [], isLoading: profilesLoading } = useQuery({
    queryKey: ['super-admin', 'profiles', selectedCompany?.id],
    queryFn: () => api.getCompanyProfiles(selectedCompany.id),
    enabled: Boolean(selectedCompany?.id),
  })

  const companyById = useMemo(
    () => new Map(companies.map((company) => [company.id, company])),
    [companies]
  )

  const filteredCompanies = useMemo(() => {
    const term = companySearch.trim().toLowerCase()

    return companies.filter((company) => {
      const matchesSearch =
        !term ||
        company.name?.toLowerCase().includes(term) ||
        company.email?.toLowerCase().includes(term) ||
        company.id?.toLowerCase().includes(term)

      const matchesState = companyStateFilter === 'all' || (company.state || 'active') === companyStateFilter
      const matchesPlan = companyPlanFilter === 'all' || (company.plan || 'basic') === companyPlanFilter

      return matchesSearch && matchesState && matchesPlan
    })
  }, [companies, companyPlanFilter, companySearch, companyStateFilter])

  const filteredProfiles = useMemo(() => {
    const term = profileSearch.trim().toLowerCase()

    return profiles.filter((profile) => {
      const matchesSearch =
        !term ||
        profile.full_name?.toLowerCase().includes(term) ||
        profile.email?.toLowerCase().includes(term)

      const matchesRole = profileRoleFilter === 'all' || profile.role === profileRoleFilter
      const matchesState = profileStateFilter === 'all' || (profile.state || 'active') === profileStateFilter
      const profileState = profile.state || 'active'
      const profileAge = getDaysSince(profile.created_at)

      let matchesQuickFilter = true
      if (profileQuickFilter === 'no_login') matchesQuickFilter = !profile.last_login
      if (profileQuickFilter === 'stale_onboarding') matchesQuickFilter = !profile.last_login && profileAge !== null && profileAge >= 3
      if (profileQuickFilter === 'recent_activity') matchesQuickFilter = isRecentDate(profile.last_login, 7)
      if (profileQuickFilter === 'recently_suspended') {
        matchesQuickFilter = profileState === 'suspended' && isRecentDate(profile.suspended_at, 14)
      }

      return matchesSearch && matchesRole && matchesState && matchesQuickFilter
    })
  }, [profileQuickFilter, profileRoleFilter, profileSearch, profileStateFilter, profiles])

  const companySummary = useMemo(() => {
    const counts = companies.reduce(
      (acc, company) => {
        const state = company.state || 'active'
        acc.total += 1
        acc[state] += 1
        return acc
      },
      { total: 0, active: 0, suspended: 0, inactive: 0 }
    )

    return counts
  }, [companies])

  const selectedProfilesSummary = useMemo(() => {
    return filteredProfiles.reduce(
      (acc, profile) => {
        const state = profile.state || 'active'
        acc.total += 1
        acc[state] += 1
        if (profile.role === 'admin') acc.admin += 1
        if (profile.role === 'store') acc.location += 1
        return acc
      },
      { total: 0, active: 0, suspended: 0, admin: 0, location: 0 }
    )
  }, [filteredProfiles])

  const selectedProfilesActivity = useMemo(() => {
    return profiles.reduce(
      (acc, profile) => {
        if (profile.last_login) acc.withLogin += 1
        if (isRecentDate(profile.last_login, 7)) acc.recent += 1
        return acc
      },
      { withLogin: 0, recent: 0 }
    )
  }, [profiles])

  const selectedCompanyCommercialSummary = useMemo(() => {
    if (!selectedCompany) return null

    return {
      enabledFeatures: countEnabledFeatures(selectedCompany.feature_flags),
      addonCount: Array.isArray(selectedCompany.addons) ? selectedCompany.addons.length : 0,
      limitSummary: formatLimitSummary(selectedCompany.limits_config),
    }
  }, [selectedCompany])

  const profilesWithoutLogin = useMemo(
    () =>
      [...profiles]
        .filter((profile) => !profile.last_login)
        .sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()),
    [profiles]
  )

  const onboardingSummary = useMemo(() => {
    return profilesWithoutLogin.reduce(
      (acc, profile) => {
        const age = getDaysSince(profile.created_at)
        if (age !== null) acc.oldestDays = Math.max(acc.oldestDays, age)
        if (age !== null && age >= 3) {
          acc.stale += 1
        } else {
          acc.fresh += 1
        }
        return acc
      },
      { stale: 0, fresh: 0, oldestDays: 0 }
    )
  }, [profilesWithoutLogin])

  const recentlySuspendedProfiles = useMemo(() => {
    return profiles
      .filter((profile) => profile.state === 'suspended' && profile.suspended_at)
      .sort((a, b) => new Date(b.suspended_at).getTime() - new Date(a.suspended_at).getTime())
      .slice(0, 3)
  }, [profiles])

  const recentlyActiveProfiles = useMemo(() => {
    return profiles
      .filter((profile) => isRecentDate(profile.last_login, 7))
      .sort((a, b) => new Date(b.last_login).getTime() - new Date(a.last_login).getTime())
      .slice(0, 3)
  }, [profiles])

  useEffect(() => {
    if (!selectedCompany?.id) return
    const refreshed = companyById.get(selectedCompany.id)
    if (refreshed) setSelectedCompany(refreshed)
  }, [companyById, selectedCompany?.id])

  useEffect(() => {
    setProfileSearch('')
    setProfileRoleFilter('all')
    setProfileStateFilter('all')
    setProfileQuickFilter('all')
  }, [selectedCompany?.id])

  function resetProfileFilters() {
    setProfileSearch('')
    setProfileRoleFilter('all')
    setProfileStateFilter('all')
    setProfileQuickFilter('all')
  }

  function toggleQuickFilter(nextFilter) {
    setProfileQuickFilter((current) => (current === nextFilter ? 'all' : nextFilter))
  }

  function toggleRecentSuspendedShortcut() {
    const isActive = profileQuickFilter === 'recently_suspended' || profileStateFilter === 'suspended'
    if (isActive) {
      setProfileQuickFilter('all')
      setProfileStateFilter('all')
      return
    }

    setProfileStateFilter('suspended')
    setProfileQuickFilter('recently_suspended')
  }

  function focusProfile(profile, options = {}) {
    setProfileSearch(profile.email || profile.full_name || '')
    setProfileQuickFilter(options.quickFilter || 'all')
    if (options.role) setProfileRoleFilter(options.role)
    if (options.state) setProfileStateFilter(options.state)
    if (options.openTable !== false) setShowProfileForm(false)
  }

  const createCompany = useMutation({
    mutationFn: api.createCompany,
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['super-admin', 'companies'] })
      setCompanyForm(EMPTY_COMPANY)
      setShowCompanyForm(false)
      setSelectedCompany(created)
    },
  })

  const changeCompanyState = useMutation({
    mutationFn: ({ id, state }) => api.setCompanyState(id, state),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['super-admin', 'companies'] })
      setCompanyStateTarget(null)
      if (selectedCompany?.id === variables.id) {
        const updated = companyById.get(variables.id)
        if (updated) setSelectedCompany({ ...updated, state: variables.state })
      }
    },
  })

  const updateCompany = useMutation({
    mutationFn: ({ id, data }) => api.updateCompany(id, data),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['super-admin', 'companies'] })
      setSelectedCompany(updated)
      setShowCompanyEditForm(false)
    },
  })

  const createProfile = useMutation({
    mutationFn: ({ companyId, data }) => api.createProfile(companyId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['super-admin', 'profiles', selectedCompany?.id] })
      setProfileForm(EMPTY_PROFILE)
      setShowProfileForm(false)
    },
  })

  const changeProfileState = useMutation({
    mutationFn: ({ id, action, reason }) => api.setProfileState(id, action, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['super-admin', 'profiles', selectedCompany?.id] })
      setProfileToSuspend(null)
      setSuspendReason('')
    },
  })

  function handleCompanyChange(event) {
    const { name, value } = event.target
    setCompanyForm((current) => ({ ...current, [name]: value }))
  }

  function handleProfileChange(event) {
    const { name, value } = event.target
    setProfileForm((current) => ({ ...current, [name]: value }))
  }

  function handleCompanyEditChange(event) {
    const { name, value } = event.target
    setCompanyEditForm((current) => {
      if (name !== 'plan') {
        return { ...current, [name]: value }
      }

      const template = getPlanTemplate(value)
      return {
        ...current,
        plan: value,
        feature_flags: template.feature_flags,
        limits_config: LIMIT_FIELDS.reduce((acc, field) => {
          acc[field.key] = String(template.limits_config[field.key] ?? '')
          return acc
        }, {}),
        addons: template.addons,
      }
    })
  }

  function handleCompanyFeatureToggle(featureKey) {
    setCompanyEditForm((current) => ({
      ...current,
      feature_flags: {
        ...current.feature_flags,
        [featureKey]: !current.feature_flags?.[featureKey],
      },
    }))
  }

  function handleCompanyAddonToggle(addonKey) {
    setCompanyEditForm((current) => {
      const currentAddons = Array.isArray(current.addons) ? current.addons : []
      const addons = currentAddons.includes(addonKey)
        ? currentAddons.filter((item) => item !== addonKey)
        : [...currentAddons, addonKey]

      return {
        ...current,
        addons,
      }
    })
  }

  function handleCompanyLimitChange(limitKey, value) {
    setCompanyEditForm((current) => ({
      ...current,
      limits_config: {
        ...current.limits_config,
        [limitKey]: value,
      },
    }))
  }

  function submitCompany(event) {
    event.preventDefault()
    createCompany.mutate({
      name: companyForm.name.trim(),
      plan: companyForm.plan,
      commercial_status: companyForm.commercial_status,
    })
  }

  function submitProfile(event) {
    event.preventDefault()
    if (!selectedCompany?.id) return

    createProfile.mutate({
      companyId: selectedCompany.id,
      data: {
        email: profileForm.email.trim(),
        password: profileForm.password,
        role: profileForm.role,
        full_name: profileForm.full_name.trim(),
        phone: profileForm.phone.trim() || undefined,
        location_id: profileForm.role === 'store' ? profileForm.location_id.trim() : undefined,
        store_id: profileForm.role === 'store' ? profileForm.location_id.trim() : undefined,
      },
    })
  }

  function triggerCompanyState(company, state) {
    if (state === 'active') {
      changeCompanyState.mutate({ id: company.id, state })
      return
    }

    setCompanyStateTarget({ company, state })
  }

  function confirmCompanyStateChange() {
    if (!companyStateTarget) return

    changeCompanyState.mutate({
      id: companyStateTarget.company.id,
      state: companyStateTarget.state,
    })
  }

  function closeCompanyStateDialog() {
    if (changeCompanyState.isPending) return
    setCompanyStateTarget(null)
  }

  function getCompanyStateDialogCopy() {
    if (!companyStateTarget) return null

    if (companyStateTarget.state === 'suspended') {
      return {
        title: 'Suspender empresa',
        description: 'La empresa no podrá operar ni iniciar nuevas sesiones hasta que vuelva a activarse.',
        confirmLabel: 'Confirmar suspensión',
        confirmClassName: 'btn-danger',
      }
    }

    return {
      title: 'Inactivar empresa',
      description: 'La empresa quedará fuera del flujo operativo visible, pero seguirá registrada para control interno.',
      confirmLabel: 'Confirmar inactivación',
      confirmClassName: 'btn-secondary',
    }
  }

  function openCompanyEdit(company) {
    setSelectedCompany(company)
    setCompanyEditForm(buildEditCompanyState(company))
    setShowCompanyEditForm(true)
    setShowCompanyForm(false)
  }

  function submitCompanyEdit(event) {
    event.preventDefault()
    if (!selectedCompany?.id) return

    updateCompany.mutate({
      id: selectedCompany.id,
      data: {
        name: companyEditForm.name.trim(),
        plan: companyEditForm.plan,
        commercial_status: companyEditForm.commercial_status,
        commercial_name: companyEditForm.commercial_name.trim() || null,
        email: companyEditForm.email.trim() || null,
        phone: companyEditForm.phone.trim() || null,
        feature_flags: FEATURE_OPTIONS.reduce((acc, option) => {
          acc[option.key] = Boolean(companyEditForm.feature_flags?.[option.key])
          return acc
        }, {}),
        limits_config: LIMIT_FIELDS.reduce((acc, field) => {
          const rawValue = companyEditForm.limits_config?.[field.key]
          const parsedValue = Number(rawValue)
          acc[field.key] = rawValue === '' || Number.isNaN(parsedValue) ? null : parsedValue
          return acc
        }, {}),
        addons: Array.isArray(companyEditForm.addons) ? companyEditForm.addons : [],
      },
    })
  }

  function triggerProfileState(profile) {
    if (profile.state === 'suspended') {
      changeProfileState.mutate({ id: profile.id, action: 'activate' })
      return
    }

    setProfileToSuspend(profile)
    setSuspendReason('')
  }

  function confirmProfileSuspension(event) {
    event.preventDefault()
    if (!profileToSuspend || !suspendReason.trim()) return

    changeProfileState.mutate({
      id: profileToSuspend.id,
      action: 'suspend',
      reason: suspendReason.trim(),
    })
  }

  function closeSuspendDialog() {
    if (changeProfileState.isPending) return
    setProfileToSuspend(null)
    setSuspendReason('')
  }

  const companyStateDialog = getCompanyStateDialogCopy()

  return (
    <div>
      {companyStateTarget && companyStateDialog && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            zIndex: 45,
          }}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: 520,
              padding: 24,
              boxShadow: '0 24px 60px rgba(15, 23, 42, 0.24)',
            }}
          >
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{companyStateDialog.title}</h3>
            <p style={{ color: 'var(--muted)', fontSize: 13.5, lineHeight: 1.5, marginBottom: 8 }}>
              Vas a cambiar el estado de <strong style={{ color: 'var(--text)' }}>{companyStateTarget.company.name}</strong>.
            </p>
            <p style={{ color: 'var(--muted)', fontSize: 13.5, lineHeight: 1.5, marginBottom: 16 }}>
              {companyStateDialog.description}
            </p>
            {changeCompanyState.error && (
              <p style={{ color: 'var(--danger)', fontSize: 12.5, marginBottom: 12 }}>
                {changeCompanyState.error.message}
              </p>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn-secondary" onClick={closeCompanyStateDialog}>
                Cancelar
              </button>
              <button
                type="button"
                className={companyStateDialog.confirmClassName}
                onClick={confirmCompanyStateChange}
                disabled={changeCompanyState.isPending}
              >
                {changeCompanyState.isPending ? 'Guardando...' : companyStateDialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {profileToSuspend && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            zIndex: 50,
          }}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: 520,
              padding: 24,
              boxShadow: '0 24px 60px rgba(15, 23, 42, 0.24)',
            }}
          >
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Suspender perfil</h3>
            <p style={{ color: 'var(--muted)', fontSize: 13.5, lineHeight: 1.5, marginBottom: 16 }}>
              Vas a suspender a <strong style={{ color: 'var(--text)' }}>{profileToSuspend.full_name}</strong>.
              Dejá registrado un motivo para que quede claro en la operación.
            </p>
            <form onSubmit={confirmProfileSuspension}>
              <label
                htmlFor="suspend_reason"
                style={{ display: 'block', marginBottom: 6, fontSize: 12.5, fontWeight: 500, color: 'var(--text2)' }}
              >
                Motivo de suspensión *
              </label>
              <textarea
                id="suspend_reason"
                value={suspendReason}
                onChange={(event) => setSuspendReason(event.target.value)}
                placeholder="Ej: documentación incompleta, acceso pausado o solicitud del cliente"
                rows={4}
                style={{ width: '100%', resize: 'vertical', minHeight: 104, marginBottom: 14 }}
                required
                autoFocus
              />
              {changeProfileState.error && (
                <p style={{ color: 'var(--danger)', fontSize: 12.5, marginBottom: 12 }}>
                  {changeProfileState.error.message}
                </p>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="btn-secondary" onClick={closeSuspendDialog}>
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-danger"
                  disabled={changeProfileState.isPending || !suspendReason.trim()}
                >
                  {changeProfileState.isPending ? 'Suspendiendo...' : 'Confirmar suspensión'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 320px' }}>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Plataforma</h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 3 }}>
            Gestión global de empresas y perfiles operativos
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={() => setShowCompanyForm((current) => !current)}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flex: '1 1 220px' }}
        >
          <Plus size={15} strokeWidth={2.5} />
          Nueva empresa
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Empresas totales', value: companySummary.total, tone: 'var(--text)' },
          { label: 'Activas', value: companySummary.active, tone: 'var(--accent)' },
          { label: 'Suspendidas', value: companySummary.suspended, tone: 'var(--danger)' },
          { label: selectedCompany ? 'Perfiles visibles' : 'Inactivas', value: selectedCompany ? selectedProfilesSummary.total : companySummary.inactive, tone: 'var(--text)' },
        ].map((item) => (
          <div key={item.label} className="card" style={{ padding: '16px 18px' }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>{item.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: item.tone }}>{item.value}</div>
          </div>
        ))}
      </div>

      {selectedCompany && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Admins visibles', value: selectedProfilesSummary.admin, tone: 'var(--text)' },
            { label: 'Puntos de despacho', value: selectedProfilesSummary.location, tone: 'var(--text)' },
            { label: 'Con login registrado', value: selectedProfilesActivity.withLogin, tone: 'var(--accent)' },
            { label: 'Actividad últimos 7 días', value: selectedProfilesActivity.recent, tone: 'var(--accent)' },
          ].map((item) => (
            <div key={item.label} className="card" style={{ padding: '16px 18px' }}>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>{item.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: item.tone }}>{item.value}</div>
            </div>
          ))}
        </div>
      )}

      {showCompanyForm && (
        <div className="card" style={{ padding: 22, marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 18 }}>Crear empresa</h3>
          <form onSubmit={submitCompany}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 16 }}>
              <div>
                <label htmlFor="company_name" style={{ display: 'block', marginBottom: 5, fontSize: 12.5, fontWeight: 500, color: 'var(--text2)' }}>
                  Nombre *
                </label>
                <input
                  id="company_name"
                  name="name"
                  value={companyForm.name}
                  onChange={handleCompanyChange}
                  placeholder="Empresa Logística Sur"
                  required
                />
              </div>
              <div>
                <label htmlFor="company_plan" style={{ display: 'block', marginBottom: 5, fontSize: 12.5, fontWeight: 500, color: 'var(--text2)' }}>
                  Plan
                </label>
                <select id="company_plan" name="plan" value={companyForm.plan} onChange={handleCompanyChange}>
                  <option value="basic">basic</option>
                  <option value="pro">pro</option>
                  <option value="enterprise">enterprise</option>
                </select>
              </div>
              <div>
                <label htmlFor="company_commercial_status" style={{ display: 'block', marginBottom: 5, fontSize: 12.5, fontWeight: 500, color: 'var(--text2)' }}>
                  Estado comercial
                </label>
                <select id="company_commercial_status" name="commercial_status" value={companyForm.commercial_status} onChange={handleCompanyChange}>
                  <option value="trial">trial</option>
                  <option value="active">active</option>
                  <option value="past_due">past_due</option>
                  <option value="paused">paused</option>
                  <option value="cancelled">cancelled</option>
                </select>
              </div>
            </div>
            {createCompany.error && (
              <p style={{ color: 'var(--danger)', fontSize: 12.5, marginBottom: 12 }}>
                {createCompany.error.message}
              </p>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn-primary" disabled={createCompany.isPending}>
                {createCompany.isPending ? 'Creando...' : 'Crear empresa'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setShowCompanyForm(false)}>
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {showCompanyEditForm && selectedCompany && (
        <div className="card" style={{ padding: 22, marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 18 }}>
            Editar empresa: {selectedCompany.name}
          </h3>
          <form onSubmit={submitCompanyEdit}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 16 }}>
              <div>
                <label htmlFor="company_edit_name" style={{ display: 'block', marginBottom: 5, fontSize: 12.5, fontWeight: 500, color: 'var(--text2)' }}>
                  Nombre *
                </label>
                <input
                  id="company_edit_name"
                  name="name"
                  value={companyEditForm.name}
                  onChange={handleCompanyEditChange}
                  required
                />
              </div>
              <div>
                <label htmlFor="company_edit_plan" style={{ display: 'block', marginBottom: 5, fontSize: 12.5, fontWeight: 500, color: 'var(--text2)' }}>
                  Plan
                </label>
                <select id="company_edit_plan" name="plan" value={companyEditForm.plan} onChange={handleCompanyEditChange}>
                  <option value="basic">basic</option>
                  <option value="pro">pro</option>
                  <option value="enterprise">enterprise</option>
                </select>
              </div>
              <div>
                <label htmlFor="company_edit_commercial_status" style={{ display: 'block', marginBottom: 5, fontSize: 12.5, fontWeight: 500, color: 'var(--text2)' }}>
                  Estado comercial
                </label>
                <select
                  id="company_edit_commercial_status"
                  name="commercial_status"
                  value={companyEditForm.commercial_status}
                  onChange={handleCompanyEditChange}
                >
                  <option value="trial">trial</option>
                  <option value="active">active</option>
                  <option value="past_due">past_due</option>
                  <option value="paused">paused</option>
                  <option value="cancelled">cancelled</option>
                </select>
              </div>
              <div>
                <label htmlFor="company_edit_commercial_name" style={{ display: 'block', marginBottom: 5, fontSize: 12.5, fontWeight: 500, color: 'var(--text2)' }}>
                  Nombre comercial
                </label>
                <input
                  id="company_edit_commercial_name"
                  name="commercial_name"
                  value={companyEditForm.commercial_name}
                  onChange={handleCompanyEditChange}
                />
              </div>
              <div>
                <label htmlFor="company_edit_email" style={{ display: 'block', marginBottom: 5, fontSize: 12.5, fontWeight: 500, color: 'var(--text2)' }}>
                  Email
                </label>
                <input
                  id="company_edit_email"
                  name="email"
                  type="email"
                  value={companyEditForm.email}
                  onChange={handleCompanyEditChange}
                />
              </div>
              <div>
                <label htmlFor="company_edit_phone" style={{ display: 'block', marginBottom: 5, fontSize: 12.5, fontWeight: 500, color: 'var(--text2)' }}>
                  Teléfono
                </label>
                <input
                  id="company_edit_phone"
                  name="phone"
                  value={companyEditForm.phone}
                  onChange={handleCompanyEditChange}
                />
              </div>
            </div>
            <div
              style={{
                border: '1px solid rgba(148, 163, 184, 0.18)',
                borderRadius: 16,
                padding: 16,
                marginBottom: 16,
                display: 'grid',
                gap: 14,
                background: 'rgba(248, 250, 252, 0.82)',
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Membership activa</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  El plan define la base y desde aca ajustas permisos comerciales, limites y addons por empresa.
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text2)', marginBottom: 8 }}>Features habilitadas</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                  {FEATURE_OPTIONS.map((option) => (
                    <label
                      key={option.key}
                      htmlFor={`feature_${option.key}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 12px',
                        borderRadius: 12,
                        border: '1px solid rgba(148, 163, 184, 0.18)',
                        background: companyEditForm.feature_flags?.[option.key] ? 'rgba(14, 165, 233, 0.08)' : 'white',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        id={`feature_${option.key}`}
                        type="checkbox"
                        checked={Boolean(companyEditForm.feature_flags?.[option.key])}
                        onChange={() => handleCompanyFeatureToggle(option.key)}
                      />
                      <span style={{ fontSize: 12.5, color: 'var(--text)' }}>{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text2)', marginBottom: 8 }}>Limites operativos</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                  {LIMIT_FIELDS.map((field) => (
                    <div key={field.key}>
                      <label
                        htmlFor={`limit_${field.key}`}
                        style={{ display: 'block', marginBottom: 5, fontSize: 12.5, fontWeight: 500, color: 'var(--text2)' }}
                      >
                        {field.label}
                      </label>
                      <input
                        id={`limit_${field.key}`}
                        type="number"
                        min="0"
                        value={companyEditForm.limits_config?.[field.key] ?? ''}
                        onChange={(event) => handleCompanyLimitChange(field.key, event.target.value)}
                        placeholder="Vacio = sin tope"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text2)', marginBottom: 8 }}>Addons</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                  {ADDON_OPTIONS.map((option) => {
                    const checked = companyEditForm.addons?.includes(option.key)
                    return (
                      <label
                        key={option.key}
                        htmlFor={`addon_${option.key}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '10px 12px',
                          borderRadius: 12,
                          border: '1px solid rgba(148, 163, 184, 0.18)',
                          background: checked ? 'rgba(15, 23, 42, 0.06)' : 'white',
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          id={`addon_${option.key}`}
                          type="checkbox"
                          checked={checked}
                          onChange={() => handleCompanyAddonToggle(option.key)}
                        />
                        <span style={{ fontSize: 12.5, color: 'var(--text)' }}>{option.label}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
            </div>
            {updateCompany.error && (
              <p style={{ color: 'var(--danger)', fontSize: 12.5, marginBottom: 12 }}>
                {updateCompany.error.message}
              </p>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn-primary" disabled={updateCompany.isPending}>
                {updateCompany.isPending ? 'Guardando...' : 'Guardar cambios'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setShowCompanyEditForm(false)}>
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card" style={{ marginBottom: 26, overflow: 'hidden', border: '1px solid rgba(148, 163, 184, 0.18)' }}>
        <SectionHeading
          eyebrow="Bloque 1"
          title="Empresas"
          description="Base operativa del panel. Desde acá filtrás, seleccionás y cambiás el estado de cada cliente."
          icon={<Building2 size={18} />}
        />

        <div style={{ padding: '18px 20px 0', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          <input
            value={companySearch}
            onChange={(event) => setCompanySearch(event.target.value)}
            placeholder="Buscar por nombre, email o UUID"
          />
          <select value={companyStateFilter} onChange={(event) => setCompanyStateFilter(event.target.value)}>
            <option value="all">Todos los estados</option>
            <option value="active">Activas</option>
            <option value="suspended">Suspendidas</option>
            <option value="inactive">Inactivas</option>
          </select>
          <select value={companyPlanFilter} onChange={(event) => setCompanyPlanFilter(event.target.value)}>
            <option value="all">Todos los planes</option>
            <option value="basic">basic</option>
            <option value="pro">pro</option>
            <option value="enterprise">enterprise</option>
          </select>
        </div>

        {(companySearch || companyStateFilter !== 'all' || companyPlanFilter !== 'all') && (
          <div style={{ padding: '12px 20px 0', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <FilterChip label={`Búsqueda: ${companySearch || '—'}`} />
            {companyStateFilter !== 'all' && <FilterChip label={`Estado: ${STATE_LABELS[companyStateFilter]}`} />}
            {companyPlanFilter !== 'all' && <FilterChip label={`Plan: ${companyPlanFilter}`} />}
            <button
              type="button"
              className="btn-secondary"
              style={{ padding: '4px 10px', fontSize: 12 }}
              onClick={() => {
                setCompanySearch('')
                setCompanyStateFilter('all')
                setCompanyPlanFilter('all')
              }}
            >
              Resetear
            </button>
          </div>
        )}

        {companiesLoading ? (
          <p style={{ padding: 24, color: 'var(--muted)', textAlign: 'center' }}>Cargando empresas...</p>
        ) : companies.length === 0 ? (
          <div style={{ padding: '36px 20px', textAlign: 'center' }}>
            <Building2 size={32} color="var(--muted2)" style={{ marginBottom: 10 }} />
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>Todavía no hay empresas registradas</p>
          </div>
        ) : filteredCompanies.length === 0 ? (
          <div style={{ padding: '28px 20px 32px', textAlign: 'center' }}>
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>
              No hay empresas que coincidan con los filtros actuales.
            </p>
            <button
              type="button"
              className="btn-secondary"
              style={{ marginTop: 12 }}
              onClick={() => {
                setCompanySearch('')
                setCompanyStateFilter('all')
                setCompanyPlanFilter('all')
              }}
            >
              Limpiar filtros
            </button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto', padding: '0 20px 18px' }}>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', padding: '0 0 10px' }}>
              En tablet o móvil podés deslizar horizontalmente la tabla para ver todo el detalle sin perder acciones.
            </div>
            <table style={{ fontSize: 13.5, minWidth: 1180 }}>
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Plan</th>
                  <th>Estado</th>
                  <th>Membership</th>
                  <th>Creada</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredCompanies.map((company) => (
                <tr
                  key={company.id}
                  style={{
                    background:
                      selectedCompany?.id === company.id
                        ? 'var(--accent-l)'
                        : company.state === 'suspended'
                          ? '#fff7ed'
                          : company.state === 'inactive'
                            ? '#f8fafc'
                            : 'transparent',
                    boxShadow: selectedCompany?.id === company.id ? 'inset 3px 0 0 var(--accent)' : 'none',
                    opacity: company.state === 'inactive' ? 0.88 : 1,
                  }}
                >
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text)' }}>{company.name}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--muted)', fontFamily: 'monospace' }}>{company.id}</div>
                    </td>
                    <td style={{ textTransform: 'capitalize' }}>{company.plan || '—'}</td>
                    <td>
                      <span className={`badge ${company.state || 'active'}`}>{STATE_LABELS[company.state] || company.state}</span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text)' }}>
                        {COMMERCIAL_STATUS_LABELS[company.commercial_status] || company.commercial_status || 'Trial'}
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4 }}>
                        {countEnabledFeatures(company.feature_flags)} features · {(company.addons || []).length} addons
                      </div>
                    </td>
                    <td>{formatDate(company.created_at)}</td>
                    <td>
                      <div style={{ display: 'grid', gap: 8, minWidth: 210 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <ActionTag label="Gestión" />
                          <button
                            className="btn-secondary"
                            style={{ padding: '5px 10px', fontSize: 12 }}
                            onClick={() => {
                              setSelectedCompany(company)
                              setShowProfileForm(false)
                            }}
                          >
                            Ver perfiles
                          </button>
                          <button
                            className="btn-secondary"
                            style={{ padding: '5px 10px', fontSize: 12 }}
                            onClick={() => openCompanyEdit(company)}
                          >
                            Editar
                          </button>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <ActionTag label="Estado" tone="danger" />
                          {company.state !== 'active' && (
                            <button
                              className="btn-secondary"
                              style={{ padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}
                              onClick={() => triggerCompanyState(company, 'active')}
                              disabled={changeCompanyState.isPending}
                            >
                              <ShieldCheck size={12} />
                              Activar
                            </button>
                          )}
                          {company.state !== 'suspended' && (
                            <button
                              className="btn-danger"
                              style={{ padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}
                              onClick={() => triggerCompanyState(company, 'suspended')}
                              disabled={changeCompanyState.isPending}
                            >
                              <ShieldOff size={12} />
                              Suspender
                            </button>
                          )}
                          {company.state !== 'inactive' && (
                            <button
                              className="btn-secondary"
                              style={{ padding: '5px 10px', fontSize: 12 }}
                              onClick={() => triggerCompanyState(company, 'inactive')}
                              disabled={changeCompanyState.isPending}
                            >
                              Inactivar
                            </button>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!companyStateTarget && changeCompanyState.error && (
          <p style={{ color: 'var(--danger)', fontSize: 12.5, padding: '0 20px 18px' }}>
            {changeCompanyState.error.message}
          </p>
        )}
      </div>

      <div className="card" style={{ overflow: 'hidden', border: '1px solid rgba(14, 165, 233, 0.16)' }}>
        <SectionHeading
          eyebrow="Bloque 2"
          title={selectedCompany ? `Perfiles de ${selectedCompany.name}` : 'Perfiles'}
          description={
            selectedCompany
              ? 'Alta, suspensión y reactivación de usuarios con señales rápidas para detectar cuentas sin actividad.'
              : 'Seleccioná una empresa para abrir el bloque operativo de perfiles.'
          }
          icon={<Users size={18} />}
        />

        <div style={{ padding: '18px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
          <button
            className="btn-primary"
            onClick={() => setShowProfileForm((current) => !current)}
            disabled={!selectedCompany}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flex: '1 1 220px', maxWidth: 260 }}
          >
            <UserPlus size={15} strokeWidth={2.5} />
            Nuevo perfil
          </button>
        </div>

        {selectedCompany && (
          <div style={{
            margin: '18px 20px 0',
            padding: '14px 16px',
            border: '1px solid rgba(14, 165, 233, 0.18)',
            borderRadius: 14,
            background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.08), rgba(255, 255, 255, 0.88))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 3 }}>
                Empresa seleccionada
              </div>
              <div style={{ fontWeight: 700, color: 'var(--text)' }}>
                {selectedCompany.name}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                {selectedCompany.email || 'Sin email'} · {selectedCompany.phone || 'Sin teléfono'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
                {selectedProfilesSummary.admin} admin · {selectedProfilesSummary.location} puntos de despacho · {selectedProfilesSummary.suspended} suspendidos
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                {selectedProfilesActivity.withLogin} con login registrado · {selectedProfilesActivity.recent} con actividad reciente
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                {selectedCompany.plan || 'basic'} Â· {COMMERCIAL_STATUS_LABELS[selectedCompany.commercial_status] || selectedCompany.commercial_status || 'Trial'}
              </div>
              {selectedCompanyCommercialSummary && (
                <>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                    {selectedCompanyCommercialSummary.enabledFeatures} features activas Â· {selectedCompanyCommercialSummary.addonCount} addons
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                    LÃ­mites: {selectedCompanyCommercialSummary.limitSummary}
                  </div>
                </>
              )}
            </div>
            <span className={`badge ${selectedCompany.state || 'active'}`}>
              {STATE_LABELS[selectedCompany.state] || selectedCompany.state}
            </span>
          </div>
        )}

        {selectedCompany && (
          <div style={{ padding: '16px 20px 0', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <OperationalCallout
              title="Sin Login Todavía"
              value={profilesWithoutLogin.length}
              subtitle={
                profilesWithoutLogin.length
                  ? `${onboardingSummary.stale} con onboarding demorado y ${onboardingSummary.fresh} todavía en ventana normal.`
                  : 'Todos los perfiles de esta empresa ya tuvieron al menos un acceso registrado.'
              }
              tone={profilesWithoutLogin.length ? 'accent' : 'neutral'}
            >
              {profilesWithoutLogin.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                  <QuickActionButton
                    label="Ver pendientes"
                    active={profileQuickFilter === 'no_login'}
                    onClick={() => toggleQuickFilter('no_login')}
                  />
                  <QuickActionButton
                    label="Demorados +3 días"
                    active={profileQuickFilter === 'stale_onboarding'}
                    tone="danger"
                    onClick={() => toggleQuickFilter('stale_onboarding')}
                  />
                </div>
              )}
              {profilesWithoutLogin.slice(0, 3).map((profile) => (
                <div
                  key={profile.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    marginBottom: 8,
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', lineHeight: 1.4 }}>
                      {getProfileIdentity(profile)}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.4 }}>
                      Creado {formatDaysAgo(profile.created_at)}
                    </div>
                  </div>
                  <QuickActionButton label="Ver en tabla" onClick={() => focusProfile(profile, { quickFilter: 'no_login' })} />
                </div>
              ))}
              {profilesWithoutLogin.length > 0 && (
                <div style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.45 }}>
                  Antigüedad máxima detectada: {onboardingSummary.oldestDays ? `${onboardingSummary.oldestDays} días` : 'hoy'}.
                </div>
              )}
            </OperationalCallout>

            <OperationalCallout
              title="Últimos Suspendidos"
              value={recentlySuspendedProfiles.length}
              subtitle={
                recentlySuspendedProfiles.length
                  ? 'Los más recientes dentro de la empresa seleccionada para tener contexto operativo rápido.'
                  : 'No hay suspensiones recientes visibles en esta empresa.'
              }
              tone={recentlySuspendedProfiles.length ? 'danger' : 'neutral'}
            >
              {recentlySuspendedProfiles.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                  <QuickActionButton
                    label="Filtrar suspendidos"
                    active={profileQuickFilter === 'recently_suspended' || profileStateFilter === 'suspended'}
                    tone="danger"
                    onClick={toggleRecentSuspendedShortcut}
                  />
                </div>
              )}
              {recentlySuspendedProfiles.map((profile) => (
                <div key={profile.id} style={{ marginBottom: 8, display: 'grid', gap: 4 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>
                    {getProfileIdentity(profile)}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.4 }}>
                    {formatDate(profile.suspended_at)}
                    {profile.suspended_reason ? ` · ${profile.suspended_reason}` : ''}
                  </div>
                  <div>
                    <QuickActionButton
                      label="Revisar perfil"
                      tone="danger"
                      onClick={() => focusProfile(profile, { state: 'suspended', quickFilter: 'recently_suspended' })}
                    />
                  </div>
                </div>
              ))}
            </OperationalCallout>

            <OperationalCallout
              title="Actividad Reciente"
              value={selectedProfilesActivity.recent}
              subtitle={
                selectedProfilesActivity.recent
                  ? 'Perfiles con login en los últimos 7 días. Sirve para separar cuentas activas de onboarding pendiente.'
                  : 'No hay actividad reciente visible en esta empresa.'
              }
              tone={selectedProfilesActivity.recent ? 'accent' : 'neutral'}
            >
              {recentlyActiveProfiles.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                  <QuickActionButton
                    label="Ver activos recientes"
                    active={profileQuickFilter === 'recent_activity'}
                    onClick={() => toggleQuickFilter('recent_activity')}
                  />
                </div>
              )}
              {recentlyActiveProfiles.map((profile) => (
                <div
                  key={profile.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    marginBottom: 8,
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>
                      {getProfileIdentity(profile)}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.4 }}>
                      Último acceso: {formatDate(profile.last_login)}
                    </div>
                  </div>
                  <QuickActionButton label="Ubicar" onClick={() => focusProfile(profile, { quickFilter: 'recent_activity' })} />
                </div>
              ))}
            </OperationalCallout>
          </div>
        )}

        {showProfileForm && selectedCompany && (
          <div style={{ padding: '18px 20px 0' }}>
            <form onSubmit={submitProfile}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 16 }}>
                <div>
                  <label htmlFor="profile_full_name" style={{ display: 'block', marginBottom: 5, fontSize: 12.5, fontWeight: 500, color: 'var(--text2)' }}>
                    Nombre completo *
                  </label>
                  <input
                    id="profile_full_name"
                    name="full_name"
                    value={profileForm.full_name}
                    onChange={handleProfileChange}
                    placeholder="María Pérez"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="profile_email" style={{ display: 'block', marginBottom: 5, fontSize: 12.5, fontWeight: 500, color: 'var(--text2)' }}>
                    Email *
                  </label>
                  <input
                    id="profile_email"
                    name="email"
                    type="email"
                    value={profileForm.email}
                    onChange={handleProfileChange}
                    placeholder="maria@empresa.com"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="profile_password" style={{ display: 'block', marginBottom: 5, fontSize: 12.5, fontWeight: 500, color: 'var(--text2)' }}>
                    Contraseña inicial *
                  </label>
                  <input
                    id="profile_password"
                    name="password"
                    type="password"
                    value={profileForm.password}
                    onChange={handleProfileChange}
                    placeholder="Pass1234!"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="profile_role" style={{ display: 'block', marginBottom: 5, fontSize: 12.5, fontWeight: 500, color: 'var(--text2)' }}>
                    Rol *
                  </label>
                  <select id="profile_role" name="role" value={profileForm.role} onChange={handleProfileChange}>
                    <option value="admin">admin</option>
                    <option value="store">punto de despacho</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="profile_phone" style={{ display: 'block', marginBottom: 5, fontSize: 12.5, fontWeight: 500, color: 'var(--text2)' }}>
                    Teléfono
                  </label>
                  <input
                    id="profile_phone"
                    name="phone"
                    value={profileForm.phone}
                    onChange={handleProfileChange}
                    placeholder="+54 9 11 5555 5555"
                  />
                </div>
                <div>
                  <label htmlFor="profile_location_id" style={{ display: 'block', marginBottom: 5, fontSize: 12.5, fontWeight: 500, color: 'var(--text2)' }}>
                    Punto de Despacho / Location ID {profileForm.role === 'store' ? '*' : ''}
                  </label>
                  <input
                    id="profile_location_id"
                    name="location_id"
                    value={profileForm.location_id}
                    onChange={handleProfileChange}
                    placeholder="UUID de la ubicación"
                    required={profileForm.role === 'store'}
                    disabled={profileForm.role !== 'store'}
                  />
                </div>
              </div>
              {createProfile.error && (
                <p style={{ color: 'var(--danger)', fontSize: 12.5, marginBottom: 12 }}>
                  {createProfile.error.message}
                </p>
              )}
              <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
                <button type="submit" className="btn-primary" disabled={createProfile.isPending}>
                  {createProfile.isPending ? 'Creando...' : 'Crear perfil'}
                </button>
                <button type="button" className="btn-secondary" onClick={() => setShowProfileForm(false)}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        )}

        {selectedCompany && (
          <div style={{ padding: '18px 20px 0', display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <QuickActionButton
                  label={`Sin login (${profilesWithoutLogin.length})`}
                  active={profileQuickFilter === 'no_login'}
                  onClick={() => toggleQuickFilter('no_login')}
                />
                <QuickActionButton
                  label={`Demorados (${onboardingSummary.stale})`}
                  active={profileQuickFilter === 'stale_onboarding'}
                  tone="danger"
                  onClick={() => toggleQuickFilter('stale_onboarding')}
                />
                <QuickActionButton
                  label={`Suspendidos recientes (${recentlySuspendedProfiles.length})`}
                  active={profileQuickFilter === 'recently_suspended' || profileStateFilter === 'suspended'}
                  tone="danger"
                  onClick={toggleRecentSuspendedShortcut}
                />
                <QuickActionButton
                  label={`Actividad reciente (${selectedProfilesActivity.recent})`}
                  active={profileQuickFilter === 'recent_activity'}
                  onClick={() => toggleQuickFilter('recent_activity')}
                />
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                Atajos rápidos para cruzar widgets con la tabla de perfiles.
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
              <input
                value={profileSearch}
                onChange={(event) => setProfileSearch(event.target.value)}
                placeholder="Buscar perfil por nombre o email"
              />
              <select value={profileRoleFilter} onChange={(event) => setProfileRoleFilter(event.target.value)}>
                <option value="all">Todos los roles</option>
                <option value="admin">admin</option>
                <option value="store">punto de despacho</option>
              </select>
              <select value={profileStateFilter} onChange={(event) => setProfileStateFilter(event.target.value)}>
                <option value="all">Todos los estados</option>
                <option value="active">Activos</option>
                <option value="suspended">Suspendidos</option>
              </select>
            </div>
          </div>
        )}

        {selectedCompany && (profileSearch || profileRoleFilter !== 'all' || profileStateFilter !== 'all' || profileQuickFilter !== 'all') && (
          <div style={{ padding: '12px 20px 0', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {profileSearch && <FilterChip label={`Búsqueda: ${profileSearch}`} />}
            {profileRoleFilter !== 'all' && <FilterChip label={`Rol: ${getProfileRoleLabel(profileRoleFilter)}`} />}
            {profileStateFilter !== 'all' && (
              <FilterChip label={`Estado: ${profileStateFilter === 'active' ? 'Activos' : 'Suspendidos'}`} />
            )}
            {profileQuickFilter === 'no_login' && <FilterChip label="Atajo: sin login" />}
            {profileQuickFilter === 'stale_onboarding' && <FilterChip label="Atajo: onboarding demorado" />}
            {profileQuickFilter === 'recently_suspended' && <FilterChip label="Atajo: suspendidos recientes" />}
            {profileQuickFilter === 'recent_activity' && <FilterChip label="Atajo: actividad reciente" />}
            <button
              type="button"
              className="btn-secondary"
              style={{ padding: '4px 10px', fontSize: 12 }}
              onClick={resetProfileFilters}
            >
              Resetear
            </button>
          </div>
        )}

        {!selectedCompany ? (
          <div style={{ padding: '36px 20px', textAlign: 'center' }}>
            <Users size={32} color="var(--muted2)" style={{ marginBottom: 10 }} />
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>
              Elegí una empresa arriba para administrar sus perfiles
            </p>
          </div>
        ) : profilesLoading ? (
          <p style={{ padding: 24, color: 'var(--muted)', textAlign: 'center' }}>Cargando perfiles...</p>
        ) : profiles.length === 0 ? (
          <div style={{ padding: '36px 20px', textAlign: 'center' }}>
            <Users size={32} color="var(--muted2)" style={{ marginBottom: 10 }} />
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>Todavía no hay perfiles para esta empresa</p>
          </div>
        ) : filteredProfiles.length === 0 ? (
          <div style={{ padding: '28px 20px 32px', textAlign: 'center' }}>
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>
              No hay perfiles que coincidan con los filtros actuales.
            </p>
            <button
              type="button"
              className="btn-secondary"
              style={{ marginTop: 12 }}
              onClick={resetProfileFilters}
            >
              Limpiar filtros
            </button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto', padding: '0 20px 18px' }}>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', padding: '0 0 10px' }}>
              En tablet o móvil podés deslizar horizontalmente esta tabla para revisar login, estado y acciones.
            </div>
            <table style={{ fontSize: 13.5, minWidth: 820 }}>
              <thead>
                <tr>
                  <th>Perfil</th>
                  <th>Rol</th>
                  <th>Estado</th>
                  <th>Último login</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredProfiles.map((profile) => (
                <tr
                  key={profile.id}
                  style={{
                    background:
                      profile.state === 'suspended'
                        ? '#fff7ed'
                        : !profile.last_login
                          ? 'rgba(14, 165, 233, 0.06)'
                          : 'transparent',
                  }}
                >
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text)' }}>{profile.full_name}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{profile.email || 'Sin email'}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4 }}>
                        {getProfileLocationId(profile)
                          ? `Punto de Despacho / Location ID: ${getProfileLocationId(profile)}`
                          : 'Sin punto de despacho asignado'}
                      </div>
                      {!profile.last_login && (
                        <div style={{ fontSize: 11.5, color: 'var(--accent)', marginTop: 4 }}>
                          Onboarding pendiente · creado {formatDaysAgo(profile.created_at)}
                        </div>
                      )}
                      {profile.state === 'suspended' && profile.suspended_reason && (
                        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4 }}>
                          Motivo: {profile.suspended_reason}
                        </div>
                      )}
                    </td>
                    <td style={{ textTransform: 'capitalize' }}>{getProfileRoleLabel(profile.role)}</td>
                    <td>
                      <span className={`badge ${profile.state || 'active'}`}>
                        {profile.state === 'suspended' ? 'Suspendido' : 'Activo'}
                      </span>
                    </td>
                    <td>
                      <div>{formatDate(profile.last_login)}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4 }}>
                        {!profile.last_login
                          ? 'Todavía sin primer acceso'
                          : isRecentDate(profile.last_login, 7)
                            ? 'Actividad reciente'
                            : 'Sin actividad reciente'}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <ActionTag label="Estado" tone={profile.state === 'suspended' ? 'neutral' : 'danger'} />
                        <button
                          className={profile.state === 'suspended' ? 'btn-secondary' : 'btn-danger'}
                          style={{ padding: '5px 10px', fontSize: 12 }}
                          onClick={() => triggerProfileState(profile)}
                          disabled={changeProfileState.isPending}
                        >
                          {profile.state === 'suspended' ? 'Activar' : 'Suspender'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!profileToSuspend && changeProfileState.error && (
          <p style={{ color: 'var(--danger)', fontSize: 12.5, padding: '0 20px 18px' }}>
            {changeProfileState.error.message}
          </p>
        )}
      </div>
    </div>
  )
}
