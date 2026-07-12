/**
 * Outbound WhatsApp via Twilio — shared server-side helper.
 * Used by the AI agent, cron notifications, and payment reminders.
 * Logs every message to whatsapp_conversations / whatsapp_messages.
 */

import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('0')) return `+62${digits.slice(1)}`
  if (digits.startsWith('62')) return `+${digits}`
  return `+${digits}`
}

export async function sendWhatsApp(opts: {
  to: string
  body: string
  mediaUrl?: string
  customerId?: string | null
  contactName?: string | null
}): Promise<{ ok: boolean; sid?: string; error?: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_WHATSAPP_FROM

  const phone = normalizePhone(opts.to)

  // Find or create conversation (always log, even if Twilio isn't configured yet)
  let { data: conv } = await sb.from('whatsapp_conversations').select('id').eq('phone', phone).single()
  if (!conv) {
    const { data: newConv } = await sb.from('whatsapp_conversations').insert({
      phone,
      contact_name: opts.contactName ?? null,
      customer_id: opts.customerId ?? null,
      last_message: opts.body,
      last_message_at: new Date().toISOString(),
    }).select('id').single()
    conv = newConv
  }

  if (!accountSid || !authToken || !from) {
    if (conv) {
      await sb.from('whatsapp_messages').insert({
        conversation_id: conv.id, direction: 'outbound', body: opts.body, status: 'failed',
      })
    }
    return { ok: false, error: 'Twilio not configured' }
  }

  try {
    const params = new URLSearchParams({
      To: `whatsapp:${phone}`,
      From: from,
      Body: opts.body,
    })
    if (opts.mediaUrl) params.append('MediaUrl', opts.mediaUrl)

    const resp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      }
    )
    const data = await resp.json()
    const ok = resp.ok && !!data.sid

    if (conv) {
      await sb.from('whatsapp_messages').insert({
        conversation_id: conv.id,
        direction: 'outbound',
        body: opts.body,
        status: ok ? 'sent' : 'failed',
        twilio_sid: data.sid ?? null,
      })
      await sb.from('whatsapp_conversations').update({
        last_message: opts.body,
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', conv.id)
    }

    return ok ? { ok: true, sid: data.sid } : { ok: false, error: data.message ?? 'Twilio error' }
  } catch (e: any) {
    return { ok: false, error: e.message }
  }
}
