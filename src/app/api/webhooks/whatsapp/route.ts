import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN ?? 'kembali-wa-verify'

// Meta webhook verification (GET)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 })
  }
  return new NextResponse('Forbidden', { status: 403 })
}

// Incoming WhatsApp message (POST)
export async function POST(req: NextRequest) {
  const payload = await req.json()
  const sb = await createClient()

  try {
    const entry = payload.entry?.[0]
    const changes = entry?.changes?.[0]?.value
    const messages = changes?.messages ?? []
    const contacts = changes?.contacts ?? []

    for (const msg of messages) {
      if (msg.type !== 'text') continue // handle text only for now
      const phone = msg.from // e.g. "628123456789"
      const contact = contacts.find((c: any) => c.wa_id === phone)
      const fromName = contact?.profile?.name ?? null
      const body = msg.text?.body ?? ''

      // Try to match to a customer by phone
      const { data: customer } = await sb
        .from('customers')
        .select('id, name')
        .or(`contact_phone.ilike.%${phone.slice(-8)}%`)
        .limit(1)
        .single()

      await sb.from('communications').insert({
        channel: 'whatsapp',
        direction: 'inbound',
        customer_id: customer?.id ?? null,
        thread_id: phone, // use phone as thread identifier
        from_address: phone,
        from_name: fromName ?? customer?.name ?? phone,
        to_address: changes?.metadata?.display_phone_number ?? null,
        body,
        status: 'unread',
        external_id: msg.id,
        metadata: { wa_id: phone, timestamp: msg.timestamp },
      })
    }
  } catch (e) {
    console.error('[whatsapp webhook]', e)
  }

  return NextResponse.json({ ok: true })
}
