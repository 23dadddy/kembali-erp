/**
 * GET /api/cron/weekly
 *
 * Vercel Cron — Mondays 01:30 UTC (09:30 Bali time).
 * vercel.json: { "path": "/api/cron/weekly", "schedule": "30 1 * * 1" }
 *
 * 1. Driver scorecards for last week: stops completed, completion rate,
 *    damage rate, signature rate — WhatsApp'd to each driver
 * 2. Sales rep scorecards: visits, interested leads, deals closed — WhatsApp'd to each rep
 * 3. Combined leadership summary emailed to admin
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendWhatsApp } from '@/lib/whatsapp'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const weekEnd = new Date(now); weekEnd.setDate(now.getDate() - 1) // yesterday (Sunday)
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - 7) // last Monday
  const startStr = weekStart.toISOString().split('T')[0]
  const endStr = weekEnd.toISOString().split('T')[0]
  const weekLabel = `${startStr} to ${endStr}`

  // ── Driver scorecards ─────────────────────────────────────────────────────
  const [{ data: weekDeliveries }, { data: staff }] = await Promise.all([
    sb.from('deliveries')
      .select('driver_id, status, delivered_350ml, delivered_750ml, damaged_350ml, damaged_750ml, signature_data')
      .gte('delivery_date', startStr)
      .lte('delivery_date', endStr),
    sb.from('staff').select('id, name, role, phone').eq('active', true),
  ])

  type DriverStats = { total: number; completed: number; bottles: number; damaged: number; signed: number }
  const driverStats: Record<string, DriverStats> = {}
  for (const d of (weekDeliveries ?? [])) {
    if (!d.driver_id) continue
    const s = driverStats[d.driver_id] ??= { total: 0, completed: 0, bottles: 0, damaged: 0, signed: 0 }
    s.total++
    if (d.status === 'completed') {
      s.completed++
      s.bottles += (d.delivered_350ml ?? 0) + (d.delivered_750ml ?? 0)
      s.damaged += (d.damaged_350ml ?? 0) + (d.damaged_750ml ?? 0)
      if (d.signature_data) s.signed++
    }
  }

  const staffById = Object.fromEntries((staff ?? []).map(s => [s.id, s]))
  const driverLines: string[] = []
  let driverMessagesSent = 0

  for (const [driverId, s] of Object.entries(driverStats)) {
    const driver = staffById[driverId]
    if (!driver) continue
    const completionRate = s.total ? Math.round((s.completed / s.total) * 100) : 0
    const signRate = s.completed ? Math.round((s.signed / s.completed) * 100) : 0
    driverLines.push(`${driver.name}: ${s.completed}/${s.total} stops (${completionRate}%), ${s.bottles} bottles, ${s.damaged} damaged, ${signRate}% signed`)

    if (driver.phone) {
      const wa = await sendWhatsApp({
        to: driver.phone,
        contactName: driver.name,
        body: `Hi ${driver.name}! Your Kembali Water weekly summary (${weekLabel}):

✅ Deliveries completed: ${s.completed}/${s.total} (${completionRate}%)
📦 Bottles delivered: ${s.bottles}
💔 Damaged: ${s.damaged}
✍️ Signature rate: ${signRate}%

Thank you for your hard work! 💧`,
      })
      if (wa.ok) driverMessagesSent++
    }
  }

  // ── Sales rep scorecards ──────────────────────────────────────────────────
  const [{ data: weekVisits }, { data: weekActivities }, { data: weekWon }] = await Promise.all([
    sb.from('sales_visits').select('staff_id, outcome').gte('visited_at', weekStart.toISOString()),
    sb.from('sales_activities').select('created_by, outcome, channel').gte('created_at', weekStart.toISOString()),
    sb.from('sales_leads').select('id, assigned_to, estimated_value').eq('stage', 'closed_won').gte('updated_at', weekStart.toISOString()),
  ])

  type RepStats = { visits: number; interested: number; closed: number }
  const repStats: Record<string, RepStats> = {}
  for (const v of (weekVisits ?? [])) {
    if (!v.staff_id) continue
    const s = repStats[v.staff_id] ??= { visits: 0, interested: 0, closed: 0 }
    s.visits++
    if ((v.outcome ?? '').toLowerCase().includes('interest')) s.interested++
  }
  for (const l of (weekWon ?? [])) {
    if (!l.assigned_to) continue
    const s = repStats[l.assigned_to] ??= { visits: 0, interested: 0, closed: 0 }
    s.closed++
  }

  const repLines: string[] = []
  let repMessagesSent = 0
  for (const [repId, s] of Object.entries(repStats)) {
    const rep = staffById[repId]
    if (!rep) continue
    repLines.push(`${rep.name}: ${s.visits} visits, ${s.interested} interested, ${s.closed} closed`)
    if (rep.phone) {
      const wa = await sendWhatsApp({
        to: rep.phone,
        contactName: rep.name,
        body: `Hi ${rep.name}! Your Kembali Water sales week (${weekLabel}):

🚶 Visits: ${s.visits}
🤝 Interested: ${s.interested}
🎉 Deals closed: ${s.closed}

Keep it up! 💧`,
      })
      if (wa.ok) repMessagesSent++
    }
  }

  // ── Leadership summary email ──────────────────────────────────────────────
  const newPartners = (weekWon ?? []).length
  const totalDeliveries = (weekDeliveries ?? []).filter(d => d.status === 'completed').length

  if (process.env.RESEND_API_KEY) {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL ?? 'Kembali Water <onboarding@resend.dev>',
        to: ['admin@kembaliwater.com'],
        subject: `Weekly Report — ${weekLabel}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:560px">
          <h2>Kembali Water — Week of ${startStr}</h2>
          <p><strong>${totalDeliveries}</strong> deliveries completed · <strong>${newPartners}</strong> new partners</p>
          <h3>Drivers</h3>
          <p>${driverLines.join('<br>') || 'No delivery activity'}</p>
          <h3>Sales Reps</h3>
          <p>${repLines.join('<br>') || 'No sales activity'}</p>
        </div>`,
      }),
    }).catch(() => null)
  }

  const result = {
    ok: true, week: weekLabel,
    drivers_reported: Object.keys(driverStats).length,
    driver_messages_sent: driverMessagesSent,
    reps_reported: Object.keys(repStats).length,
    rep_messages_sent: repMessagesSent,
    new_partners: newPartners,
  }
  console.log('[cron/weekly]', result)
  return NextResponse.json(result)
}
