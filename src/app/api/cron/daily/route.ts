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
import { sendOverdueReminderEmail, sendDailySummaryEmail } from '@/lib/email'

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

    // Send overdue reminder emails for newly overdue invoices
    const { data: newlyOverdue } = await sb
      .from('invoices')
      .select('id, invoice_number, total, due_date, customer:customers(name, contact_email, contact_name)')
      .in('id', toMarkOverdue.map(i => i.id))

    let remindersSent = 0
    for (const inv of (newlyOverdue ?? [])) {
      const customer = inv.customer as any
      if (!customer?.contact_email) continue
      const daysOverdue = Math.ceil((new Date(todayStr).getTime() - new Date(inv.due_date).getTime()) / (1000 * 60 * 60 * 24))
      await sendOverdueReminderEmail({
        id: inv.id, invoice_number: inv.invoice_number,
        total: Number(inv.total), due_date: inv.due_date, daysOverdue,
        customer: { name: customer.name, contact_email: customer.contact_email, contact_name: customer.contact_name },
      }).catch(() => {}) // non-blocking
      remindersSent++
    }
    results.overdue_reminders_sent = remindersSent
  } else {
    results.invoices_marked_overdue = 0
    results.overdue_reminders_sent = 0
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

  // ── 3. Fetch today's delivery completion count ──────────────────────────────
  const { data: todayDeliveries } = await sb
    .from('deliveries')
    .select('id, status')
    .eq('delivery_date', todayStr)

  const completedToday = (todayDeliveries ?? []).filter(d => d.status === 'completed').length
  const totalToday = (todayDeliveries ?? []).length

  // ── 4. Fetch overdue invoice totals ─────────────────────────────────────────
  const { data: allOverdue } = await sb
    .from('invoices')
    .select('total')
    .eq('status', 'overdue')

  const overdueValue = (allOverdue ?? []).reduce((s, i) => s + Number(i.total ?? 0), 0)

  // ── 5. Fetch low stock items ─────────────────────────────────────────────────
  const { data: allStock } = await sb
    .from('inventory_items')
    .select('name, quantity, reorder_point')
    .not('reorder_point', 'is', null)
    .gt('reorder_point', 0)

  const lowStock = (allStock ?? []).filter(i => Number(i.quantity ?? 0) <= Number(i.reorder_point ?? 0))

  // ── 6. Send daily summary email to admin ─────────────────────────────────────
  await sendDailySummaryEmail({
    date: todayStr,
    deliveriesTotal: totalToday,
    deliveriesCompleted: completedToday,
    deliveriesCreatedByCron: results.deliveries_created ?? 0,
    invoicesMarkedOverdue: results.invoices_marked_overdue ?? 0,
    overdueReminders: results.overdue_reminders_sent ?? 0,
    overdueInvoicesTotal: (allOverdue ?? []).length,
    overdueValue,
    lowStockItems: lowStock as any[],
  }).catch(e => console.error('[cron/daily] summary email failed:', e))

  results.daily_summary_sent = true

  // ── Log run ──────────────────────────────────────────────────────────────────
  console.log(`[cron/daily] ${todayStr}:`, results)

  return NextResponse.json({
    ok: true,
    date: todayStr,
    ...results,
  })
}
