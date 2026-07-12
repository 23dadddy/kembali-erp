/**
 * POST /api/deliveries/en-route
 *
 * Fired when a driver opens a pending delivery — marks it in_transit and
 * sends the customer a "your driver is on the way" WhatsApp. Idempotent:
 * only fires on the pending → in_transit transition.
 *
 * Body: { deliveryId }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendWhatsApp } from '@/lib/whatsapp'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const { deliveryId } = await req.json()
  if (!deliveryId) return NextResponse.json({ error: 'Missing deliveryId' }, { status: 400 })

  const { data: delivery } = await sb
    .from('deliveries')
    .select('id, status, customer:customers(name, contact_name, contact_phone), driver:staff(name)')
    .eq('id', deliveryId)
    .single()

  if (!delivery) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (delivery.status !== 'pending') return NextResponse.json({ ok: true, skipped: 'already in progress or completed' })

  await sb.from('deliveries').update({ status: 'in_transit' }).eq('id', deliveryId)

  const customer = delivery.customer as any
  const driver = delivery.driver as any
  let whatsapp = 'no phone'
  if (customer?.contact_phone) {
    const wa = await sendWhatsApp({
      to: customer.contact_phone,
      contactName: customer.contact_name,
      body: `Hi ${customer.contact_name ?? customer.name}! ${driver?.name ?? 'Your Kembali Water driver'} is on the way with your delivery. 🚚

Please have your empty bottles ready for collection. See you soon! 💧`,
    })
    whatsapp = wa.ok ? 'sent' : (wa.error ?? 'failed')
  }

  return NextResponse.json({ ok: true, whatsapp })
}
