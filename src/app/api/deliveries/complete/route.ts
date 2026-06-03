/**
 * POST /api/deliveries/complete
 *
 * Completes a delivery, updates bottle inventory (via RPC), and sends
 * a delivery confirmation email to the customer.
 *
 * Called by the driver app (/deliver/[id]) on delivery completion.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendDeliveryConfirmationEmail } from '@/lib/email'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const {
    id,
    delivered_350ml = 0, delivered_750ml = 0,
    collected_350ml = 0, collected_750ml = 0,
    damaged_350ml = 0, damaged_750ml = 0,
    driver_notes = '',
    signature_data = '',
    signature_confirmed_by = '',
  } = body

  if (!id) return NextResponse.json({ error: 'Missing delivery id' }, { status: 400 })

  const sb = await createClient()
  const now = new Date().toISOString()

  // Update delivery
  const { error } = await sb.from('deliveries').update({
    delivered_350ml, delivered_750ml,
    collected_350ml, collected_750ml,
    damaged_350ml, damaged_750ml,
    driver_notes,
    signature_data,
    signature_confirmed_by,
    status: 'completed',
    completed_at: now,
    confirmed_at: now,
  }).eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Update bottle inventory via RPCs (server-side so they definitely fire)
  await Promise.allSettled([
    delivered_350ml > 0 && sb.rpc('increment_inventory', { p_size: '350ml', p_status: 'at_customer', p_qty: delivered_350ml }),
    delivered_350ml > 0 && sb.rpc('decrement_inventory', { p_size: '350ml', p_status: 'filled', p_qty: delivered_350ml }),
    delivered_750ml > 0 && sb.rpc('increment_inventory', { p_size: '750ml', p_status: 'at_customer', p_qty: delivered_750ml }),
    delivered_750ml > 0 && sb.rpc('decrement_inventory', { p_size: '750ml', p_status: 'filled', p_qty: delivered_750ml }),
    collected_350ml > 0 && sb.rpc('increment_inventory', { p_size: '350ml', p_status: 'dirty', p_qty: collected_350ml }),
    collected_350ml > 0 && sb.rpc('decrement_inventory', { p_size: '350ml', p_status: 'at_customer', p_qty: collected_350ml }),
    collected_750ml > 0 && sb.rpc('increment_inventory', { p_size: '750ml', p_status: 'dirty', p_qty: collected_750ml }),
    collected_750ml > 0 && sb.rpc('decrement_inventory', { p_size: '750ml', p_status: 'at_customer', p_qty: collected_750ml }),
    damaged_350ml > 0 && sb.rpc('increment_inventory', { p_size: '350ml', p_status: 'damaged', p_qty: damaged_350ml }),
    damaged_350ml > 0 && sb.rpc('decrement_inventory', { p_size: '350ml', p_status: 'at_customer', p_qty: damaged_350ml }),
    damaged_750ml > 0 && sb.rpc('increment_inventory', { p_size: '750ml', p_status: 'damaged', p_qty: damaged_750ml }),
    damaged_750ml > 0 && sb.rpc('decrement_inventory', { p_size: '750ml', p_status: 'at_customer', p_qty: damaged_750ml }),
  ])

  // Fetch delivery + customer for confirmation email
  const { data: delivery } = await sb
    .from('deliveries')
    .select('*, customer:customers(name, contact_email, contact_name), driver:staff(name)')
    .eq('id', id)
    .single()

  // Send confirmation email (non-blocking)
  if (delivery?.customer?.contact_email) {
    sendDeliveryConfirmationEmail({
      id: delivery.id,
      delivery_date: delivery.delivery_date,
      delivered_350ml,
      delivered_750ml,
      customer: delivery.customer,
      driver: delivery.driver,
    }).catch(console.error)
  }

  return NextResponse.json({ ok: true })
}
