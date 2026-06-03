import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Webhook secret to verify requests are from Postmark
const WEBHOOK_SECRET = process.env.INBOUND_EMAIL_SECRET ?? ''

// Anon client — support_tickets table has anon_all RLS policy
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

function guessPriority(subject: string, body: string): 'low' | 'medium' | 'high' | 'urgent' {
  const text = (subject + ' ' + body).toLowerCase()
  if (/urgent|asap|emergency|broken|not working|no water|stop/i.test(text)) return 'urgent'
  if (/issue|problem|wrong|missing|damaged|complaint/i.test(text)) return 'high'
  if (/question|help|how|when|where/i.test(text)) return 'low'
  return 'medium'
}

function guessCategory(subject: string, body: string): string {
  const text = (subject + ' ' + body).toLowerCase()
  if (/deliver|late|missing delivery|not arrived/i.test(text)) return 'delivery'
  if (/invoice|payment|charge|billing|price/i.test(text)) return 'billing'
  if (/bottle|broken|damage|crack|leak/i.test(text)) return 'bottles'
  if (/cancel|pause|stop|end|subscription/i.test(text)) return 'other'
  return 'other'
}

export async function POST(req: NextRequest) {
  // Optional: verify webhook secret header
  if (WEBHOOK_SECRET) {
    const secret = req.headers.get('x-webhook-secret') ?? req.headers.get('x-postmark-secret') ?? ''
    if (secret !== WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Supports both Postmark webhook format and Gmail Apps Script format
  const rawFrom: string = body.FromFull?.Email ?? body.From ?? body.from ?? ''
  const fromName: string = body.FromFull?.Name ?? body.FromName ?? body.fromName ?? ''
  // Parse "Name <email>" format if needed
  const emailMatch = rawFrom.match(/<([^>]+)>/)
  const fromEmail = (emailMatch ? emailMatch[1] : rawFrom).toLowerCase().trim()
  const subject: string = body.Subject ?? body.subject ?? '(No subject)'
  const textBody: string = body.TextBody ?? body.StrippedTextReply ?? body.body ?? body.textBody ?? body.plainBody ?? ''
  const htmlBody: string = body.HtmlBody ?? body.htmlBody ?? ''
  const messageId: string | null = body.MessageID ?? body.messageId ?? body.id ?? body.Headers?.find((h: any) => h.Name === 'Message-ID')?.Value ?? null
  const inReplyTo: string | null = body.inReplyTo ?? body.in_reply_to ?? body.Headers?.find((h: any) => h.Name === 'In-Reply-To')?.Value ?? null
  const gmailThreadId: string | null = body.gmailThreadId ?? null

  if (!fromEmail) {
    return NextResponse.json({ error: 'No sender email' }, { status: 400 })
  }

  const description = textBody || htmlBody.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

  // Try to match sender to an existing customer by contact email
  const { data: customer } = await supabase
    .from('customers')
    .select('id, name')
    .ilike('contact_email', fromEmail)
    .single()

  // ── Thread matching: find existing conversation to reply into ──────────────
  let resolvedThreadId: string = messageId ?? `email-${fromEmail}-${Date.now()}`

  // 1. Match by In-Reply-To → look for a communications row with that external_id
  if (inReplyTo) {
    const { data: parentMsg } = await supabase
      .from('communications')
      .select('thread_id')
      .eq('external_id', inReplyTo.replace(/^<|>$/g, ''))
      .limit(1)
      .maybeSingle()
    if (parentMsg) resolvedThreadId = parentMsg.thread_id
  }

  // 2. Fallback: match by Gmail thread ID stored in metadata
  if (resolvedThreadId === (messageId ?? `email-${fromEmail}-${Date.now()}`) && gmailThreadId) {
    const { data: gmailThread } = await supabase
      .from('communications')
      .select('thread_id')
      .eq('channel', 'email')
      .contains('metadata', { gmailThreadId })
      .limit(1)
      .maybeSingle()
    if (gmailThread) resolvedThreadId = gmailThread.thread_id
  }

  // ── Log to unified communications inbox ───────────────────────────────────
  await supabase.from('communications').insert({
    channel: 'email',
    direction: 'inbound',
    customer_id: customer?.id ?? null,
    thread_id: resolvedThreadId,
    from_address: fromEmail,
    from_name: fromName || null,
    subject,
    body: description.slice(0, 10000),
    html_body: htmlBody.slice(0, 50000) || null,
    status: 'unread',
    external_id: messageId,
    metadata: gmailThreadId ? { gmailThreadId } : {},
  })

  // Create new ticket
  const { data: ticket, error } = await supabase
    .from('support_tickets')
    .insert({
      customer_id: customer?.id ?? null,
      subject: subject.slice(0, 200),
      description: description.slice(0, 5000),
      status: 'open',
      priority: guessPriority(subject, description),
      category: guessCategory(subject, description),
      source: 'email',
      from_email: fromEmail,
      from_name: fromName || null,
      email_thread_id: messageId,
    })
    .select()
    .single()

  if (error) {
    console.error('Failed to create ticket:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    action: 'created',
    ticketId: ticket.id,
    customerId: customer?.id ?? null,
    priority: ticket.priority,
    category: ticket.category,
  })
}

// Health check
export async function GET() {
  return NextResponse.json({ ok: true, endpoint: 'inbound-email webhook' })
}
