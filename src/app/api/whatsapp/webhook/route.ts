import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { handleInboundMessage } from '@/lib/sales-agent'

export const maxDuration = 60

// Twilio WhatsApp inbound webhook
// Configure in Twilio Console → Messaging → WhatsApp → Sandbox/Number → "A message comes in" webhook URL
// URL: https://kembali-erp.vercel.app/api/whatsapp/webhook

export async function POST(req: NextRequest) {
  const body = await req.text()
  const params = new URLSearchParams(body)

  const from = params.get('From') ?? '' // e.g. whatsapp:+628123456789
  const msgBody = params.get('Body') ?? ''
  const profileName = params.get('ProfileName') ?? null

  if (!from || !msgBody) return NextResponse.json({ ok: false })

  // Strip "whatsapp:" prefix
  const phone = from.replace('whatsapp:', '')

  const sb = await createClient()

  // Find or create conversation
  let { data: conv } = await sb
    .from('whatsapp_conversations')
    .select('*')
    .eq('phone', phone)
    .single()

  if (!conv) {
    // Try to match customer by phone
    const { data: customer } = await sb
      .from('customer_contacts')
      .select('customer_id, customers(name)')
      .eq('whatsapp', phone)
      .single()

    const { data: newConv } = await sb.from('whatsapp_conversations').insert({
      phone,
      contact_name: profileName,
      customer_id: customer?.customer_id ?? null,
      last_message: msgBody,
      last_message_at: new Date().toISOString(),
      unread_count: 1,
    }).select().single()
    conv = newConv
  } else {
    // Update last message + unread
    await sb.from('whatsapp_conversations').update({
      last_message: msgBody,
      last_message_at: new Date().toISOString(),
      unread_count: (conv.unread_count ?? 0) + 1,
      updated_at: new Date().toISOString(),
    }).eq('id', conv.id)
  }

  if (!conv) return NextResponse.json({ ok: false })

  // Insert message
  await sb.from('whatsapp_messages').insert({
    conversation_id: conv.id,
    direction: 'inbound',
    body: msgBody,
    status: 'received',
  })

  // AI agent handles the conversation and replies via Twilio.
  // Awaited so the serverless function isn't frozen before the reply sends.
  await handleInboundMessage(phone, msgBody).catch(e => console.error('[webhook] agent error:', e))

  return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    headers: { 'Content-Type': 'text/xml' },
  })
}

export async function GET() {
  return NextResponse.json({ status: 'WhatsApp webhook active' })
}
