/**
 * GET /api/cron/daily
 *
 * Vercel Cron Job — runs daily at 01:00 UTC (08:00 Bali time, WITA = UTC+8).
 * Configured in vercel.json:
 *   { "crons": [{ "path": "/api/cron/daily", "schedule": "0 1 * * *" }] }
 *
 * Tasks:
 *  1. Mark eligible 'sent' invoices as 'overdue' (past due_date)
 *  2. Generate subscription deliveries for today (active subs that match today's day)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  // Protect endpoint — Vercel sends this header on cron requests
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === 'production') {
    // Allow through if CRON_SECRET not set (will rely on Vercel's own protection)
    if (process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const sb = await createClient()
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const results: Record<string, any> = {}

  // ── 1. Mark overdue invoices ────────────────────────────────────────────────
  const { data: toMarkOverdue, error: overdueErr } = await sb
    .from('invoices')
    .select('id')
    .eq('status', 'sent')
    .lt('due_date', todayStr)

  if (!overdueErr && toMarkOverdue?.length) {
    await sb
      .from('invoices')
      .update({ status: 'overdue' })
      .in('id', toMarkOverdue.map(i => i.id))
    results.invoices_marked_overdue = toMarkOverdue.length
  } else {
    results.invoices_marked_overdue = 0
  }

  // ── 2. Generate subscription deliveries for today ──────────────────────────
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const todayDayName = dayNames[today.getDay()]

  // Build a customer → driver map from active routes
  const { data: routeStops } = await sb
    .from('route_stops')
    .select('customer_id, route:routes(driver_id)')
    .not('routes', 'is', null)

  const customerDriverMap: Record<string, string> = {}
  for (const stop of (routeStops ?? [])) {
    const driverId = (stop.route as any)?.driver_id
    if (driverId && stop.customer_id) {
      customerDriverMap[stop.customer_id] = driverId
    }
  }

  const { data: activeSubs } = await sb
    .from('customer_subscriptions')
    .select('id, customer_id, qty_350ml, qty_750ml, delivery_days, frequency_days')
    .eq('status', 'active')

  let deliveriesCreated = 0

  for (const sub of (activeSubs ?? [])) {
    // Check if this sub delivers today
    const deliveryDays: string[] = sub.delivery_days ?? []
    const shouldDeliver = deliveryDays.length === 0 || deliveryDays.includes(todayDayName)
    if (!shouldDeliver) continue

    // Check if delivery already exists today for this customer
    const { data: existing } = await sb
      .from('deliveries')
      .select('id')
      .eq('customer_id', sub.customer_id)
      .eq('delivery_date', todayStr)
      .limit(1)

    if (existing && existing.length > 0) continue

    await sb.from('deliveries').insert({
      customer_id: sub.customer_id,
      driver_id: customerDriverMap[sub.customer_id] ?? null, // auto-assign from route
      delivery_date: todayStr,
      status: 'pending',
      delivered_350ml: sub.qty_350ml ?? 0,
      delivered_750ml: sub.qty_750ml ?? 0,
      collected_350ml: 0,
      collected_750ml: 0,
      damaged_350ml: 0,
      damaged_750ml: 0,
    })
    deliveriesCreated++
  }

  results.deliveries_created = deliveriesCreated

  // ── 3. Log run ──────────────────────────────────────────────────────────────
  console.log(`[cron/daily] ${todayStr}:`, results)

  return NextResponse.json({
    ok: true,
    date: todayStr,
    ...results,
  })
}
