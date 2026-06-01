import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Supabase auth callback handler.
 * Handles magic-link redirects for both admin and customer portal logins.
 *
 * After Supabase verifies the OTP/magic-link token, it redirects here with
 * `code` or `token_hash` query params. We exchange them for a session, then
 * redirect the user to the appropriate destination.
 */
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url)
  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const next = searchParams.get('next') ?? '/'

  const sb = await createClient()

  if (code) {
    const { error } = await sb.auth.exchangeCodeForSession(code)
    if (error) {
      return NextResponse.redirect(`${origin}/customer/login?error=${encodeURIComponent(error.message)}`)
    }
  } else if (tokenHash && type) {
    const { error } = await sb.auth.verifyOtp({ token_hash: tokenHash, type: type as any })
    if (error) {
      return NextResponse.redirect(`${origin}/customer/login?error=${encodeURIComponent(error.message)}`)
    }
  }

  // Determine where to redirect based on who just logged in
  const { data: { user } } = await sb.auth.getUser()
  if (user?.email) {
    // Check if this is a customer portal user
    const { data: customer } = await sb
      .from('customers')
      .select('id')
      .eq('contact_email', user.email.toLowerCase())
      .eq('portal_enabled', true)
      .eq('active', true)
      .single()

    if (customer) {
      // Backfill auth_user_id
      await sb.from('customers').update({ auth_user_id: user.id }).eq('id', customer.id)
      return NextResponse.redirect(`${origin}/customer/dashboard`)
    }
  }

  // Default: redirect to next param or admin dashboard
  return NextResponse.redirect(`${origin}${next}`)
}
