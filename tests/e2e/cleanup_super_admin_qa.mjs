import { createClient } from '../../src/backend/node_modules/@supabase/supabase-js/dist/index.mjs'

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const COMPANY_PREFIX = 'Codex QA'
const PROFILE_EMAIL_FRAGMENT = 'codex.superadmin.qa.'

async function main() {
  const { data: companies, error: companiesError } = await supabaseAdmin
    .from('companies')
    .select('id, name')
    .ilike('name', `${COMPANY_PREFIX}%`)

  if (companiesError) throw companiesError

  const { data: profiles, error: profilesError } = await supabaseAdmin
    .from('profiles')
    .select('id, email')
    .ilike('email', `%${PROFILE_EMAIL_FRAGMENT}%`)

  if (profilesError) throw profilesError

  for (const profile of profiles || []) {
    const { error: bultosUnassignError } = await supabaseAdmin
      .from('bultos')
      .update({ active_driver_profile_id: null })
      .eq('active_driver_profile_id', profile.id)

    if (bultosUnassignError) throw bultosUnassignError

    const { error: accesosDeleteError } = await supabaseAdmin
      .from('accesos_lote')
      .delete()
      .eq('profile_id', profile.id)

    if (accesosDeleteError) throw accesosDeleteError

    const { error: profileDeleteError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', profile.id)

    if (profileDeleteError) throw profileDeleteError

    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(profile.id)
    if (authDeleteError) throw authDeleteError
  }

  for (const company of companies || []) {
    const { error: companyDeleteError } = await supabaseAdmin
      .from('companies')
      .delete()
      .eq('id', company.id)

    if (companyDeleteError) throw companyDeleteError
  }

  console.log(
    JSON.stringify(
      {
        removedCompanies: (companies || []).map((company) => ({ id: company.id, name: company.name })),
        removedProfiles: (profiles || []).map((profile) => ({ id: profile.id, email: profile.email })),
      },
      null,
      2
    )
  )
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})
