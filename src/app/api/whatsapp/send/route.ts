import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const { conversationId, to, body } = await req.json()
  if (!conversationId || !to || !body) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const sb = await createClient()

  // Insert message into DB
  const { data: msg, error } = await sb.from('whatsapp_messages').insert({
    conversation_id: conversationId,
    direction: 'outbound',
    body,
    status: 'sent',
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Update conversation last_message
  await sb.from('whatsapp_conversations').update({
    last_message: body,
    last_message_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', conversationId)

  // Try to send via Twilio if configured
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_WHATSAPP_FROM // e.g. whatsapp:+14155238886

  if (accountSid && authToken && from) {
    try {
      const toNumber = to.startsWith('+') ? to : `+${to}`
      const params = new URLSearchParams({
        To: `whatsapp:${toNumber}`,
        From: from,
        Body: body,
      })

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

      const twilioData = await resp.json()
      if (resp.ok && twilioData.sid) {
        await sb.from('whatsapp_messages').update({ status: 'delivered', twilio_sid: twilioData.sid }).eq('id', msg.id)
      } else {
        await sb.from('whatsapp_messages').update({ status: 'failed' }).eq('id', msg.id)
      }
    } catch {
      // Non-fatal — message is still saved
    }
  }

  return NextResponse.json({ ok: true, id: msg.id })
}
