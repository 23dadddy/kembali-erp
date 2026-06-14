import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  // Allow Vercel cron OR manual trigger with secret
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    // Vercel cron calls don't need auth header — check if it's an internal call
    const isVercelCron = req.headers.get('x-vercel-cron') === '1'
    if (!isVercelCron) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const date = new Date().toISOString().split('T')[0]

  // Load settings
  const { data: settings } = await sb
    .from('sales_route_settings')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()

  const stopsPerRep = settings?.stops_per_rep ?? 20
  const requireConfirm = settings?.require_manager_confirm ?? false

  // Load active reps for today
  const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase()
  const { data: reps } = await sb
    .from('sales_reps')
    .select('id, name, area_cluster')
    .eq('active', true)
    .contains('active_days', [dayName])
    .order('created_at')

  if (!reps?.length) {
    return NextResponse.json({ message: `No active reps for ${dayName}`, date })
  }

  // Check if routes already exist today
  const { data: existing } = await sb
    .from('sales_routes')
    .select('id')
    .eq('date', date)

  if (existing?.length) {
    return NextResponse.json({ message: 'Routes already generated for today', date, skipped: true })
  }

  // Call the generate logic directly (reuse the same algorithm)
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    ? `https://${req.headers.get('host')}`
    : 'http://localhost:3000'

  const res = await fetch(`${baseUrl}/api/sales/generate-routes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-cron': '1',
    },
    body: JSON.stringify({
      date,
      reps: reps.map(r => ({ id: r.id, name: r.name, area_cluster: r.area_cluster })),
      leads_per_rep: stopsPerRep,
      replace_existing: false,
    }),
  })

  const result = await res.json()

  if (!res.ok) {
    return NextResponse.json({ error: result.error, date }, { status: 500 })
  }

  // If manager confirmation required, mark routes as pending_confirm
  if (requireConfirm && result.routes?.length) {
    const routeIds = result.routes.map((r: any) => r.id)
    await sb.from('sales_routes')
      .update({ status: 'pending_confirm' })
      .in('id', routeIds)
  }

  return NextResponse.json({
    message: `Generated ${result.routes_created} routes for ${dayName}`,
    date,
    reps: reps.length,
    stops_per_rep: stopsPerRep,
    total_assigned: result.total_leads_assigned,
    require_confirm: requireConfirm,
  })
}
