/**
 * Customer portal auth helper.
 * Returns the customer record linked to the currently logged-in Supabase user.
 * Used by all /customer/* pages to scope data to the correct partner.
 */
import { createClient } from '@/lib/supabase/client'

export interface PortalCustomer {
  id: string
  name: string
  city: string
  type: string
  contact_email: string | null
  contact_name: string | null
  contact_phone: string | null
  address: string | null
  payment_terms_days: number | null
  tier: string | null
}

export async function getPortalCustomer(): Promise<PortalCustomer | null> {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return null

  const { data } = await sb
    .from('customers')
    .select('id, name, city, type, contact_email, contact_name, contact_phone, address, payment_terms_days, tier')
    .eq('auth_user_id', user.id)
    .eq('active', true)
    .single()

  return (data as PortalCustomer | null)
}

export async function signOutCustomer() {
  const sb = createClient()
  await sb.auth.signOut()
}
