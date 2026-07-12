import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const { leadId, repName } = await req.json()
  if (!leadId) return NextResponse.json({ error: 'Missing leadId' }, { status: 400 })

  const { data: lead } = await sb.from('sales_leads').select('*').eq('id', leadId).single()
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

  // Parse intake data saved on lead notes
  let intake: any = {}
  try {
    const match = lead.notes?.match(/INTAKE: ({.*})/)
    if (match) intake = JSON.parse(match[1])
  } catch {}

  // 1. Create customer record
  const { data: customer, error: custErr } = await sb.from('customers').insert({
    name: lead.company_name,
    contact_name: lead.contact_name ?? null,
    contact_email: intake.billing_email || lead.contact_email,
    contact_phone: lead.whatsapp_number || lead.contact_phone,
    address: intake.delivery_address || lead.address || 'TBC',
    city: lead.area ?? null,
    type: 'business',
    status: 'active',
    active: true,
  }).select().single()

  if (custErr) {
    return NextResponse.json({ error: `Customer creation failed: ${custErr.message}` }, { status: 500 })
  }

  // 1b. Create the delivery subscription from the intake quantities
  if ((intake.qty_350ml ?? 0) > 0 || (intake.qty_750ml ?? 0) > 0) {
    await sb.from('customer_subscriptions').insert({
      customer_id: customer.id,
      status: 'active',
      qty_350ml: intake.qty_350ml ?? 0,
      qty_750ml: intake.qty_750ml ?? 0,
      delivery_days: intake.preferred_days?.length ? intake.preferred_days : null,
      start_date: new Date().toISOString().split('T')[0],
      special_instructions: intake.special_notes || null,
    }).then(r => { if (r.error) console.error('Subscription creation failed:', r.error.message) })
  }

  // 2. Mark lead as closed_won
  await sb.from('sales_leads').update({
    stage: 'closed_won',
    last_contacted_at: new Date().toISOString(),
    next_follow_up: null,
  }).eq('id', leadId)

  // 3. Log activity
  await sb.from('sales_activities').insert({
    lead_id: leadId,
    channel: 'other',
    outcome: 'Closed Won',
    notes: `Partner confirmed. Customer record created (ID: ${customer.id}). Rep: ${repName ?? 'unknown'}.`,
    staff_name: repName,
  })

  // 4. Send welcome WhatsApp
  const waNumber = lead.whatsapp_number || lead.contact_phone
  if (waNumber && process.env.TWILIO_ACCOUNT_SID) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const twilio = require('twilio')
      const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
      const cleanNumber = waNumber.replace(/\D/g, '')
      const toNumber = cleanNumber.startsWith('0') ? `+62${cleanNumber.slice(1)}` : `+${cleanNumber}`
      await client.messages.create({
        from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
        to: `whatsapp:${toNumber}`,
        body: `Welcome to the Kembali Water family, ${lead.company_name}! 🎉💧

Your account is now active and our team will be in touch shortly to confirm your first delivery schedule.

${intake.preferred_days?.length ? `Your preferred delivery days: ${intake.preferred_days.join(', ')}` : ''}

Any questions? Reply here anytime.

Pure. Natural. Delivered.
*Kembali Water*`,
      })
    } catch (e) {
      console.error('Welcome WhatsApp failed:', e)
    }
  }

  // 5. Send welcome email
  const email = intake.billing_email || lead.contact_email
  if (email && process.env.RESEND_API_KEY) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Kembali Water <hello@kembaliwater.com>',
          to: [email],
          subject: `Welcome to Kembali Water — ${lead.company_name}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
              <div style="background: #1a1a2e; padding: 30px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 24px; letter-spacing: 2px;">KEMBALI WATER</h1>
                <p style="color: #5BA3A0; margin: 5px 0 0; font-size: 13px;">Premium Purified Water Supply</p>
              </div>
              <div style="padding: 30px;">
                <h2>Welcome to the family! 🎉</h2>
                <p>Dear ${intake.billing_contact || lead.contact_name || lead.company_name},</p>
                <p>Your partnership with Kembali Water is now confirmed. We're excited to have <strong>${lead.company_name}</strong> on board.</p>
                <div style="background: #f0fdf4; border-radius: 12px; padding: 20px; margin: 20px 0;">
                  <h3 style="margin: 0 0 10px; color: #065f46;">Your Package</h3>
                  ${intake.qty_350ml > 0 ? `<p style="margin: 5px 0;">• 350ml: ${intake.qty_350ml} bottles/week</p>` : ''}
                  ${intake.qty_750ml > 0 ? `<p style="margin: 5px 0;">• 750ml: ${intake.qty_750ml} bottles/week</p>` : ''}
                  ${intake.preferred_days?.length ? `<p style="margin: 5px 0;">• Delivery days: ${intake.preferred_days.join(', ')}</p>` : ''}
                </div>
                <p>Our team will contact you within 24 hours to confirm your first delivery date.</p>
                <p>Questions? Reply to this email or WhatsApp us anytime.</p>
                <p style="color: #6b7280; font-size: 13px; margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
                  Pure. Natural. Delivered.<br><strong>Kembali Water</strong>
                </p>
              </div>
            </div>`,
        }),
      })
    } catch (e) {
      console.error('Welcome email failed:', e)
    }
  }

  return NextResponse.json({ success: true, customerId: customer.id })
}
