import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, Plus, ShieldCheck, ShieldOff, Users, UserPlus } from 'lucide-react'
import { api } from '../services/api'

const EMPTY_COMPANY = {
  name: '',
  plan: 'basic',
}

const EMPTY_PROFILE = {
  email: '',
  password: '',
  role: 'admin',
  full_name: '',
  phone: '',
  store_id: '',
}

const STATE_LABELS = {
  active: 'Activa',
  suspended: 'Suspendida',
  inactive: 'Inactiva',
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('es-AR')
}

export default function SuperAdminPage() {
  const qc = useQueryClient()
  const [selectedCompany, setSelectedCompany] = useState(null)
  const [showCompanyForm, setShowCompanyForm] = useState(false)
  const [showProfileForm, setShowProfileForm] = useState(false)
  const [companyForm, setCompanyForm] = useState(EMPTY_COMPANY)
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
      if (selectedCompany?.id === variables.id) {
        const updated = companyById.get(variables.id)
        if (updated) setSelectedCompany({ ...updated, state: variables.state })
      }
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

  function submitCompany(event) {
    event.preventDefault()
    createCompany.mutate({
      name: companyForm.name.trim(),
      plan: companyForm.plan,
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
        store_id: profileForm.role === 'store' ? profileForm.store_id.trim() : undefined,
      },
    })
  }

  function triggerCompanyState(company, state) {
    changeCompanyState.mutate({ id: company.id, state })
  }

  function triggerProfileState(profile) {
    if (profile.state === 'suspended') {
      changeProfileState.mutate({ id: profile.id, action: 'activate' })
      return
    }

    const reason = window.prompt('Motivo de suspensión')
    if (!reason?.trim()) return
    changeProfileState.mutate({ id: profile.id, action: 'suspend', reason })
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Plataforma</h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 3 }}>
            Gestión global de empresas y perfiles operativos
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={() => setShowCompanyForm((current) => !current)}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Plus size={15} strokeWidth={2.5} />
          Nueva empresa
        </button>
      </div>

      {showCompanyForm && (
        <div className="card" style={{ padding: 22, marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 18 }}>Crear empresa</h3>
          <form onSubmit={submitCompany}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginBottom: 16 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 5, fontSize: 12.5, fontWeight: 500, color: 'var(--text2)' }}>
                  Nombre *
                </label>
                <input
                  name="name"
                  value={companyForm.name}
                  onChange={handleCompanyChange}
                  placeholder="Empresa Logística Sur"
                  required
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 5, fontSize: 12.5, fontWeight: 500, color: 'var(--text2)' }}>
                  Plan
                </label>
                <select name="plan" value={companyForm.plan} onChange={handleCompanyChange}>
                  <option value="basic">basic</option>
                  <option value="pro">pro</option>
                  <option value="enterprise">enterprise</option>
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

      <div className="card" style={{ marginBottom: 22 }}>
        <div style={{ padding: '18px 20px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Building2 size={18} color="var(--accent)" />
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700 }}>Empresas</h2>
            <p style={{ color: 'var(--muted)', fontSize: 12.5, marginTop: 2 }}>
              Seleccioná una empresa para administrar sus perfiles
            </p>
          </div>
        </div>

        {companiesLoading ? (
          <p style={{ padding: 24, color: 'var(--muted)', textAlign: 'center' }}>Cargando empresas...</p>
        ) : companies.length === 0 ? (
          <div style={{ padding: '36px 20px', textAlign: 'center' }}>
            <Building2 size={32} color="var(--muted2)" style={{ marginBottom: 10 }} />
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>Todavía no hay empresas registradas</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Empresa</th>
                <th>Plan</th>
                <th>Estado</th>
                <th>Creada</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((company) => (
                <tr
                  key={company.id}
                  style={{
                    background: selectedCompany?.id === company.id ? 'var(--accent-l)' : 'transparent',
                  }}
                >
                  <td>
                    <div style={{ fontWeight: 600, color: 'var(--text)' }}>{company.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'monospace' }}>{company.id}</div>
                  </td>
                  <td style={{ textTransform: 'capitalize' }}>{company.plan || '—'}</td>
                  <td>
                    <span className={`badge ${company.state || 'active'}`}>{STATE_LABELS[company.state] || company.state}</span>
                  </td>
                  <td>{formatDate(company.created_at)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {changeCompanyState.error && (
          <p style={{ color: 'var(--danger)', fontSize: 12.5, padding: '0 20px 18px' }}>
            {changeCompanyState.error.message}
          </p>
        )}
      </div>

      <div className="card">
        <div style={{ padding: '18px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Users size={18} color="var(--accent)" />
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700 }}>
                {selectedCompany ? `Perfiles de ${selectedCompany.name}` : 'Perfiles'}
              </h2>
              <p style={{ color: 'var(--muted)', fontSize: 12.5, marginTop: 2 }}>
                {selectedCompany ? 'Alta, suspensión y reactivación de usuarios' : 'Seleccioná una empresa para ver sus perfiles'}
              </p>
            </div>
          </div>
          <button
            className="btn-primary"
            onClick={() => setShowProfileForm((current) => !current)}
            disabled={!selectedCompany}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <UserPlus size={15} strokeWidth={2.5} />
            Nuevo perfil
          </button>
        </div>

        {showProfileForm && selectedCompany && (
          <div style={{ padding: '18px 20px 0' }}>
            <form onSubmit={submitProfile}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, marginBottom: 16 }}>
                <div>
                  <label style={{ display: 'block', marginBottom: 5, fontSize: 12.5, fontWeight: 500, color: 'var(--text2)' }}>
                    Nombre completo *
                  </label>
                  <input
                    name="full_name"
                    value={profileForm.full_name}
                    onChange={handleProfileChange}
                    placeholder="María Pérez"
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 5, fontSize: 12.5, fontWeight: 500, color: 'var(--text2)' }}>
                    Email *
                  </label>
                  <input
                    name="email"
                    type="email"
                    value={profileForm.email}
                    onChange={handleProfileChange}
                    placeholder="maria@empresa.com"
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 5, fontSize: 12.5, fontWeight: 500, color: 'var(--text2)' }}>
                    Contraseña inicial *
                  </label>
                  <input
                    name="password"
                    type="password"
                    value={profileForm.password}
                    onChange={handleProfileChange}
                    placeholder="Pass1234!"
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 5, fontSize: 12.5, fontWeight: 500, color: 'var(--text2)' }}>
                    Rol *
                  </label>
                  <select name="role" value={profileForm.role} onChange={handleProfileChange}>
                    <option value="admin">admin</option>
                    <option value="store">store</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 5, fontSize: 12.5, fontWeight: 500, color: 'var(--text2)' }}>
                    Teléfono
                  </label>
                  <input
                    name="phone"
                    value={profileForm.phone}
                    onChange={handleProfileChange}
                    placeholder="+54 9 11 5555 5555"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 5, fontSize: 12.5, fontWeight: 500, color: 'var(--text2)' }}>
                    Store ID {profileForm.role === 'store' ? '*' : ''}
                  </label>
                  <input
                    name="store_id"
                    value={profileForm.store_id}
                    onChange={handleProfileChange}
                    placeholder="UUID de la tienda"
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
        ) : (
          <table>
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
              {profiles.map((profile) => (
                <tr key={profile.id}>
                  <td>
                    <div style={{ fontWeight: 600, color: 'var(--text)' }}>{profile.full_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{profile.email || 'Sin email'}</div>
                  </td>
                  <td style={{ textTransform: 'capitalize' }}>{profile.role}</td>
                  <td>
                    <span className={`badge ${profile.state || 'active'}`}>
                      {profile.state === 'suspended' ? 'Suspendido' : 'Activo'}
                    </span>
                  </td>
                  <td>{formatDate(profile.last_login)}</td>
                  <td>
                    <button
                      className={profile.state === 'suspended' ? 'btn-secondary' : 'btn-danger'}
                      style={{ padding: '5px 10px', fontSize: 12 }}
                      onClick={() => triggerProfileState(profile)}
                      disabled={changeProfileState.isPending}
                    >
                      {profile.state === 'suspended' ? 'Activar' : 'Suspender'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {changeProfileState.error && (
          <p style={{ color: 'var(--danger)', fontSize: 12.5, padding: '0 20px 18px' }}>
            {changeProfileState.error.message}
          </p>
        )}
      </div>
    </div>
  )
}
