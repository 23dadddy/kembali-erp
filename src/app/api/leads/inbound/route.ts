/**
 * POST /api/leads/inbound
 *
 * Website lead form endpoint — kembaliwater.com posts partner enquiries here.
 * Creates the lead, logs the activity, and fires the AI WhatsApp agent
 * with a personalised opening message so the conversation starts instantly.
 *
 * Expected payload:
 * {
 *   business_name, contact_name, business_type, whatsapp, email,
 *   address, area, qty_350ml, qty_750ml, water_type ("still"|"sparkling"|"both"),
 *   preferred_days: string[], notes
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendWhatsApp, normalizePhone } from '@/lib/whatsapp'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.business_name || !body?.whatsapp) {
    return NextResponse.json({ error: 'business_name and whatsapp are required' }, { status: 400 })
  }

  const phone = normalizePhone(body.whatsapp)
  const intake = {
    qty_350ml: Number(body.qty_350ml) || 0,
    qty_750ml: Number(body.qty_750ml) || 0,
    water_type: body.water_type ?? 'both',
    preferred_days: body.preferred_days ?? [],
    delivery_address: body.address ?? '',
    billing_contact: body.contact_name ?? '',
    billing_email: body.email ?? '',
    special_notes: body.notes ?? '',
  }

  // Dedupe by WhatsApp number
  const last8 = phone.replace(/\D/g, '').slice(-8)
  const { data: existing } = await sb
    .from('sales_leads')
    .select('id, stage')
    .or(`whatsapp_number.ilike.%${last8}%,contact_phone.ilike.%${last8}%`)
    .limit(1)
    .maybeSingle()

  let leadId: string
  if (existing) {
    leadId = existing.id
    await sb.from('sales_leads').update({
      contact_email: body.email ?? undefined,
      stage: existing.stage === 'closed_won' ? existing.stage : 'interested',
      notes: `INTAKE: ${JSON.stringify(intake)}`,
      updated_at: new Date().toISOString(),
    }).eq('id', leadId)
  } else {
    const { data: lead, error } = await sb.from('sales_leads').insert({
      company_name: body.business_name,
      contact_name: body.contact_name ?? null,
      contact_email: body.email ?? null,
      contact_phone: phone,
      whatsapp_number: phone,
      address: body.address ?? null,
      area: body.area ?? null,
      business_type: body.business_type ?? null,
      stage: 'interested',
      source: 'website',
      priority: 'high',
      notes: `INTAKE: ${JSON.stringify(intake)}`,
    }).select('id').single()
    if (error || !lead) return NextResponse.json({ error: error?.message ?? 'Insert failed' }, { status: 500 })
    leadId = lead.id
  }

  await sb.from('sales_activities').insert({
    lead_id: leadId,
    channel: 'website',
    outcome: 'Inbound enquiry',
    notes: `Website form: ${intake.qty_350ml}×350ml + ${intake.qty_750ml}×750ml/week (${intake.water_type}). ${intake.special_notes}`,
  })

  // Open the WhatsApp conversation — the AI agent takes over from the first reply
  const firstName = (body.contact_name ?? '').split(' ')[0]
  const opening = `Hi${firstName ? ` ${firstName}` : ''}! 👋 Thanks for reaching out to Kembali Water about ${body.business_name}.

We received your enquiry${intake.qty_350ml || intake.qty_750ml ? ` for ${[intake.qty_350ml ? `${intake.qty_350ml}×350ml` : '', intake.qty_750ml ? `${intake.qty_750ml}×750ml` : ''].filter(Boolean).join(' + ')} bottles per week` : ''} and we'd love to get you set up.

${body.email ? 'Your personalised proposal is on its way to your email now. Any questions, just reply here!' : 'Could you share your billing email so we can send over your personalised proposal?'}

Pure. Natural. Delivered. 💧`

  const wa = await sendWhatsApp({ to: phone, body: opening, contactName: body.contact_name })

  // If they gave an email up front, fire the proposal immediately
  if (body.email) {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://kembali-erp.vercel.app'
    fetch(`${base}/api/sales/auto-proposal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId, email: body.email }),
    }).catch(() => null)
  }

  return NextResponse.json({ ok: true, leadId, whatsapp: wa.ok ? 'sent' : wa.error })
}
