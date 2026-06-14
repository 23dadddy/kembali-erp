import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const { leadId, intakeData, pdfBase64, repName } = await req.json()

  if (!leadId || !pdfBase64) {
    return NextResponse.json({ error: 'Missing leadId or pdfBase64' }, { status: 400 })
  }

  const { data: lead } = await sb.from('sales_leads').select('*').eq('id', leadId).single()
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

  // Upload PDF to Supabase Storage
  let pdfUrl: string | null = null
  try {
    // Ensure bucket exists
    await sb.storage.createBucket('proposals', { public: true }).catch(() => {})

    const pdfBuffer = Buffer.from(pdfBase64, 'base64')
    const filename = `proposal-${leadId}-${Date.now()}.pdf`
    const { error: uploadError } = await sb.storage
      .from('proposals')
      .upload(filename, pdfBuffer, { contentType: 'application/pdf', upsert: true })

    if (!uploadError) {
      const { data: { publicUrl } } = sb.storage.from('proposals').getPublicUrl(filename)
      pdfUrl = publicUrl
    }
  } catch (e) {
    console.error('PDF upload failed:', e)
  }

  const results: Record<string, any> = {}

  // Send WhatsApp
  const waNumber = lead.whatsapp_number || lead.contact_phone
  if (waNumber && process.env.TWILIO_ACCOUNT_SID) {
    try {
      const message = `Hi ${lead.contact_name ?? lead.company_name}! 👋

Thank you for your interest in Kembali Water. We've prepared a water supply proposal for ${lead.company_name}.

${pdfUrl ? `📄 View your proposal here: ${pdfUrl}` : ''}

*Proposed Package:*
${intakeData.qty_350ml > 0 ? `• 350ml: ${intakeData.qty_350ml} bottles/week — Rp ${(intakeData.qty_350ml * 6000 * 4).toLocaleString('id-ID')}/month` : ''}
${intakeData.qty_750ml > 0 ? `• 750ml: ${intakeData.qty_750ml} bottles/week — Rp ${(intakeData.qty_750ml * 10000 * 4).toLocaleString('id-ID')}/month` : ''}

Monthly invoice, 15-day payment terms.

To confirm, simply reply *"Confirmed"* or contact ${repName ?? 'our team'}.

Pure. Natural. Delivered. 💧
*Kembali Water*`

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const twilio = require('twilio')
      const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
      const cleanNumber = waNumber.replace(/\D/g, '')
      const toNumber = cleanNumber.startsWith('0') ? `+62${cleanNumber.slice(1)}` : `+${cleanNumber}`
      await client.messages.create({
        from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
        to: `whatsapp:${toNumber}`,
        body: message,
        ...(pdfUrl ? { mediaUrl: [pdfUrl] } : {}),
      })
      results.whatsapp = 'sent'
    } catch (e: any) {
      results.whatsapp_error = e.message
    }
  }

  // Send Email
  const email = intakeData.billing_email || lead.contact_email
  if (email && process.env.RESEND_API_KEY) {
    try {
      const monthlyTotal = (intakeData.qty_350ml * 6000 * 4) + (intakeData.qty_750ml * 10000 * 4)
      const emailBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
          <div style="background: #1a1a2e; padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px; letter-spacing: 2px;">KEMBALI WATER</h1>
            <p style="color: #5BA3A0; margin: 5px 0 0; font-size: 13px;">Premium Purified Water Supply</p>
          </div>

          <div style="padding: 30px;">
            <h2 style="color: #1a1a2e;">Water Supply Proposal</h2>
            <p>Dear ${intakeData.billing_contact || lead.contact_name || lead.company_name},</p>
            <p>Thank you for your interest in partnering with Kembali Water. Please find your customised proposal below.</p>

            <div style="background: #f8fafc; border-radius: 12px; padding: 20px; margin: 20px 0;">
              <h3 style="margin: 0 0 15px; color: #1a1a2e;">Proposed Package for ${lead.company_name}</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr style="border-bottom: 1px solid #e5e7eb;">
                  <th style="text-align: left; padding: 8px 0; color: #6b7280; font-size: 13px;">Item</th>
                  <th style="text-align: right; padding: 8px 0; color: #6b7280; font-size: 13px;">Weekly Qty</th>
                  <th style="text-align: right; padding: 8px 0; color: #6b7280; font-size: 13px;">Unit Price</th>
                  <th style="text-align: right; padding: 8px 0; color: #6b7280; font-size: 13px;">Monthly</th>
                </tr>
                ${intakeData.qty_350ml > 0 ? `
                <tr style="border-bottom: 1px solid #f3f4f6;">
                  <td style="padding: 10px 0; font-size: 14px;">350ml Still &amp; Sparkling</td>
                  <td style="text-align: right; padding: 10px 0; font-size: 14px;">${intakeData.qty_350ml}</td>
                  <td style="text-align: right; padding: 10px 0; font-size: 14px;">Rp 6,000</td>
                  <td style="text-align: right; padding: 10px 0; font-size: 14px; font-weight: bold;">Rp ${(intakeData.qty_350ml * 6000 * 4).toLocaleString('id-ID')}</td>
                </tr>` : ''}
                ${intakeData.qty_750ml > 0 ? `
                <tr style="border-bottom: 1px solid #f3f4f6;">
                  <td style="padding: 10px 0; font-size: 14px;">750ml Still &amp; Sparkling</td>
                  <td style="text-align: right; padding: 10px 0; font-size: 14px;">${intakeData.qty_750ml}</td>
                  <td style="text-align: right; padding: 10px 0; font-size: 14px;">Rp 10,000</td>
                  <td style="text-align: right; padding: 10px 0; font-size: 14px; font-weight: bold;">Rp ${(intakeData.qty_750ml * 10000 * 4).toLocaleString('id-ID')}</td>
                </tr>` : ''}
                <tr>
                  <td colspan="3" style="padding: 12px 0; font-weight: bold; font-size: 15px;">Total Monthly Estimate</td>
                  <td style="text-align: right; padding: 12px 0; font-weight: bold; font-size: 15px; color: #5BA3A0;">Rp ${monthlyTotal.toLocaleString('id-ID')}</td>
                </tr>
              </table>
            </div>

            <div style="background: #fffbeb; border-left: 3px solid #F59E0B; padding: 15px; border-radius: 0 8px 8px 0; margin: 20px 0;">
              <p style="margin: 0; font-size: 13px; color: #92400e;"><strong>Lost/Unreturned Bottle Policy</strong><br>
              Unreturned bottles are charged at replacement cost: 350ml — Rp 6,000 | 750ml — Rp 8,000. Counted monthly from delivery records.</p>
            </div>

            <div style="background: #f0fdf4; border-left: 3px solid #10B981; padding: 15px; border-radius: 0 8px 8px 0; margin: 20px 0;">
              <p style="margin: 0; font-size: 13px; color: #065f46;"><strong>Payment Terms</strong><br>
              Monthly invoice issued at the start of each month. Payment due within 15 days of invoice date.</p>
            </div>

            ${intakeData.delivery_address ? `<p style="font-size: 13px; color: #6b7280;"><strong>Delivery Address:</strong> ${intakeData.delivery_address}</p>` : ''}
            ${intakeData.preferred_days?.length ? `<p style="font-size: 13px; color: #6b7280;"><strong>Preferred Delivery Days:</strong> ${intakeData.preferred_days.join(', ')}</p>` : ''}
            ${intakeData.special_notes ? `<p style="font-size: 13px; color: #6b7280;"><strong>Notes:</strong> ${intakeData.special_notes}</p>` : ''}

            ${pdfUrl ? `<div style="text-align: center; margin: 30px 0;"><a href="${pdfUrl}" style="background: #5BA3A0; color: white; padding: 12px 30px; border-radius: 8px; text-decoration: none; font-weight: bold;">📄 Download Full Proposal PDF</a></div>` : ''}

            <p>To confirm this proposal, simply reply to this email with <strong>"Confirmed"</strong> or contact ${repName ?? 'our team'} directly.</p>

            <p style="color: #6b7280; font-size: 13px; margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
              Pure. Natural. Delivered.<br>
              <strong>Kembali Water</strong>
            </p>
          </div>
        </div>
      `

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Kembali Water <proposals@kembaliwater.com>',
          to: [email],
          subject: `Water Supply Proposal — ${lead.company_name}`,
          html: emailBody,
        }),
      })
      results.email = 'sent'
    } catch (e: any) {
      results.email_error = e.message
    }
  }

  // Log activity on the lead
  await sb.from('sales_activities').insert({
    lead_id: leadId,
    channel: 'email',
    outcome: 'Proposal Requested',
    notes: `Proposal sent via ${Object.keys(results).filter(k => !k.includes('error')).join(' + ')}. Package: ${intakeData.qty_350ml || 0}×350ml + ${intakeData.qty_750ml || 0}×750ml per week.`,
    staff_name: repName,
    next_action: 'Wait for confirmation',
    next_action_date: new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0],
  })

  // Update lead stage to proposal + save intake data
  await sb.from('sales_leads').update({
    stage: 'proposal',
    last_contacted_at: new Date().toISOString(),
    next_follow_up: new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0],
    notes: `INTAKE: ${JSON.stringify(intakeData)}`,
  }).eq('id', leadId)

  // Save proposal record
  // Non-blocking — table may not exist yet
  sb.from('sales_proposals').insert({
    lead_id: leadId,
    intake_data: intakeData,
    pdf_url: pdfUrl,
    rep_name: repName,
    qty_350ml: intakeData.qty_350ml || 0,
    qty_750ml: intakeData.qty_750ml || 0,
    monthly_total: (intakeData.qty_350ml * 6000 * 4) + (intakeData.qty_750ml * 10000 * 4),
    sent_channels: Object.keys(results).filter(k => !k.includes('error')),
    status: 'sent',
  }).then(() => null, () => null)

  return NextResponse.json({ success: true, pdfUrl, results })
}
