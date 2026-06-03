/**
 * POST /api/whatsapp/broadcast
 *
 * Send a WhatsApp message to multiple conversations (or all active customers).
 * Requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM.
 *
 * Body: { message: string, conversationIds?: string[] }
 * If conversationIds is empty/undefined, sends to ALL conversations with phone numbers.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const { message, conversationIds } = await req.json()
  if (!message?.trim()) return NextResponse.json({ error: 'Missing message' }, { status: 400 })

  const sb = await createClient()

  // Fetch conversations to send to
  let query = sb.from('whatsapp_conversations').select('id, phone, contact_name')
  if (conversationIds?.length) {
    query = query.in('id', conversationIds)
  }
  const { data: conversations } = await query

  if (!conversations?.length) {
    return NextResponse.json({ ok: true, sent: 0, failed: 0, message: 'No conversations found' })
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_WHATSAPP_FROM

  let sent = 0
  let failed = 0
  const results: { phone: string; status: 'sent' | 'failed'; error?: string }[] = []

  for (const conv of conversations) {
    // Store message in DB
    const { data: msg } = await sb.from('whatsapp_messages').insert({
      conversation_id: conv.id,
      direction: 'outbound',
      body: message,
      status: 'sending',
    }).select().single()

    let msgStatus: 'sent' | 'failed' = 'sent'
    let errorMsg: string | undefined

    if (accountSid && authToken && from) {
      try {
        const toNumber = conv.phone.startsWith('+') ? conv.phone : `+${conv.phone}`
        const params = new URLSearchParams({
          To: `whatsapp:${toNumber}`,
          From: from,
          Body: message,
        })

        const res = await fetch(
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

        const data = await res.json()
        if (!res.ok) {
          msgStatus = 'failed'
          errorMsg = data.message
          failed++
        } else {
          if (msg) await sb.from('whatsapp_messages').update({ status: 'delivered', twilio_sid: data.sid }).eq('id', msg.id)
          sent++
        }
      } catch (e: any) {
        msgStatus = 'failed'
        errorMsg = e.message
        failed++
      }
    } else {
      // No Twilio config — just save to DB as "sent" (preview mode)
      sent++
    }

    if (msgStatus === 'failed' && msg) {
      await sb.from('whatsapp_messages').update({ status: 'failed' }).eq('id', msg.id)
    }

    // Update conversation last_message
    await sb.from('whatsapp_conversations').update({
      last_message: message,
      last_message_at: new Date().toISOString(),
    }).eq('id', conv.id)

    results.push({ phone: conv.phone, status: msgStatus, error: errorMsg })
  }

  return NextResponse.json({ ok: true, sent, failed, results })
}
