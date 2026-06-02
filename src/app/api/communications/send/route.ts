import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { channel, to, toName, subject, body: msgBody, threadId, customerId, staffId } = body

  if (!channel || !to || !msgBody) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const sb = await createClient()
  let externalId: string | null = null
  let error: string | null = null

  // ── Send via channel ──────────────────────────────────────────────────────
  if (channel === 'email') {
    const RESEND_KEY = process.env.RESEND_API_KEY
    if (!RESEND_KEY || RESEND_KEY.startsWith('re_placeholder')) {
      error = 'RESEND_API_KEY not configured'
    } else {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_KEY}` },
        body: JSON.stringify({
          from: process.env.RESEND_FROM_EMAIL ?? 'Kembali Water <onboarding@resend.dev>',
          to,
          subject: subject || 'Message from Kembali Water',
          html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f8fafc"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc"><tr><td align="center" style="padding:32px 16px"><table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;border:1px solid #e2e8f0"><tr><td style="padding:32px"><p style="margin:0 0 16px 0;font-family:Inter,Arial,sans-serif;font-size:14px;line-height:1.6;color:#0f172a;letter-spacing:0.01em">${msgBody.replace(/\n/g, '</p><p style="margin:0 0 16px 0;font-family:Inter,Arial,sans-serif;font-size:14px;line-height:1.6;color:#0f172a;letter-spacing:0.01em">')}</p><hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"><p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:12px;color:#64748b">Kembali Water · Jakarta</p></td></tr></table></td></tr></table></body></html>`,
          text: msgBody,
        }),
      })
      const data = await res.json()
      if (res.ok) externalId = data.id
      else error = data.message ?? 'Send failed'
    }
  } else if (channel === 'whatsapp') {
    const WA_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN
    const WA_PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID
    if (!WA_TOKEN || !WA_PHONE_ID) {
      error = 'WhatsApp credentials not configured'
    } else {
      const phone = to.replace(/\D/g, '')
      const res = await fetch(`https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${WA_TOKEN}` },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: phone,
          type: 'text',
          text: { body: msgBody },
        }),
      })
      const data = await res.json()
      if (res.ok) externalId = data.messages?.[0]?.id
      else error = data.error?.message ?? 'Send failed'
    }
  }

  // ── Log to communications table ───────────────────────────────────────────
  const { data: comm, error: dbErr } = await sb.from('communications').insert({
    channel,
    direction: 'outbound',
    customer_id: customerId ?? null,
    thread_id: threadId,
    to_address: to,
    from_address: channel === 'email' ? 'noreply@kembaliwater.com' : process.env.WHATSAPP_PHONE_NUMBER_ID,
    from_name: 'Kembali Water',
    subject: subject ?? null,
    body: msgBody,
    status: 'replied',
    external_id: externalId,
    sent_by: staffId ?? null,
    metadata: error ? { send_error: error } : {},
  }).select().single()

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })
  if (error) return NextResponse.json({ warning: error, comm }, { status: 207 })
  return NextResponse.json({ ok: true, comm })
}
