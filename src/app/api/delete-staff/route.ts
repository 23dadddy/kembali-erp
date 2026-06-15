import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function DELETE(req: NextRequest) {
  const { staffId } = await req.json()
  if (!staffId) return NextResponse.json({ error: 'Missing staffId' }, { status: 400 })

  // Get the auth_user_id from staff record
  const { data: staff } = await sb.from('staff').select('auth_user_id, name').eq('id', staffId).single()

  // Delete from staff table
  const { error: staffErr } = await sb.from('staff').delete().eq('id', staffId)
  if (staffErr) return NextResponse.json({ error: staffErr.message }, { status: 500 })

  // Delete from Supabase Auth if linked
  if (staff?.auth_user_id) {
    const { error: authErr } = await sb.auth.admin.deleteUser(staff.auth_user_id)
    if (authErr) console.error('Auth delete failed:', authErr.message)
  }

  return NextResponse.json({ ok: true })
}
