/**
 * Kembali Water AI Sales Agent
 *
 * Handles the full WhatsApp conversation with a lead or customer:
 *  - matches the inbound phone to a sales lead or existing customer
 *  - loads conversation history + business context
 *  - calls Claude with tools for structured actions
 *  - executes actions: send proposal, mark confirmed, schedule follow-up, escalate
 *
 * Invoked from the Twilio WhatsApp webhook after each inbound message.
 */

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { sendWhatsApp, normalizePhone } from './whatsapp'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── Context loading ───────────────────────────────────────────────────────────

async function matchContact(phone: string) {
  const last8 = phone.replace(/\D/g, '').slice(-8)

  const [{ data: lead }, { data: customer }] = await Promise.all([
    sb.from('sales_leads')
      .select('*')
      .or(`whatsapp_number.ilike.%${last8}%,contact_phone.ilike.%${last8}%`)
      .neq('stage', 'closed_lost')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    sb.from('customers')
      .select('id, name, contact_name, contact_email, contact_phone, address, status')
      .ilike('contact_phone', `%${last8}%`)
      .limit(1)
      .maybeSingle(),
  ])

  return { lead, customer }
}

async function loadHistory(phone: string, limit = 30) {
  const { data: conv } = await sb
    .from('whatsapp_conversations')
    .select('id')
    .eq('phone', normalizePhone(phone))
    .single()
  if (!conv) return []
  const { data: msgs } = await sb
    .from('whatsapp_messages')
    .select('direction, body, created_at')
    .eq('conversation_id', conv.id)
    .order('created_at', { ascending: false })
    .limit(limit)
  return (msgs ?? []).reverse()
}

async function loadCustomerContext(customerId: string) {
  const [{ data: invoices }, { data: deliveries }, { data: sub }] = await Promise.all([
    sb.from('invoices').select('invoice_number, status, total, due_date').eq('customer_id', customerId).order('created_at', { ascending: false }).limit(5),
    sb.from('deliveries').select('delivery_date, status, delivered_350ml, delivered_750ml').eq('customer_id', customerId).order('delivery_date', { ascending: false }).limit(5),
    sb.from('customer_subscriptions').select('qty_350ml, qty_750ml, delivery_days, status').eq('customer_id', customerId).eq('status', 'active').maybeSingle(),
  ])
  return { invoices: invoices ?? [], deliveries: deliveries ?? [], subscription: sub }
}

// ── Agent tools ───────────────────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'save_email',
    description: 'Save the billing email address the contact just provided. Call this the moment they share an email address.',
    input_schema: {
      type: 'object' as const,
      properties: { email: { type: 'string' } },
      required: ['email'],
    },
  },
  {
    name: 'mark_confirmed',
    description: 'The contact has clearly confirmed they want to become a Kembali Water partner (e.g. replied "Confirmed", "yes let\'s do it", "deal"). This activates their partner account.',
    input_schema: {
      type: 'object' as const,
      properties: {
        qty_350ml: { type: 'number', description: 'Weekly 350ml bottle quantity if stated, else 0' },
        qty_750ml: { type: 'number', description: 'Weekly 750ml bottle quantity if stated, else 0' },
      },
      required: [],
    },
  },
  {
    name: 'schedule_follow_up',
    description: 'The contact asked to be contacted later or is not ready now. Schedule a follow-up.',
    input_schema: {
      type: 'object' as const,
      properties: {
        days_from_now: { type: 'number' },
        reason: { type: 'string' },
      },
      required: ['days_from_now'],
    },
  },
  {
    name: 'escalate_to_human',
    description: 'The conversation needs a human: complaint, custom pricing negotiation, complex request, or the contact explicitly asks for a person.',
    input_schema: {
      type: 'object' as const,
      properties: { reason: { type: 'string' } },
      required: ['reason'],
    },
  },
]

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(ctx: {
  lead: any
  customer: any
  customerData: any
}): string {
  const { lead, customer, customerData } = ctx

  let contactBlock = ''
  if (lead) {
    contactBlock = `## Who you are talking to — SALES LEAD
Business: ${lead.company_name}${lead.business_type ? ` (${lead.business_type})` : ''}
Contact: ${lead.contact_name ?? 'unknown'} | Area: ${lead.area ?? 'unknown'}
Pipeline stage: ${lead.stage} | Email on file: ${lead.contact_email ?? 'NOT YET COLLECTED'}
Your goal: answer their questions warmly, collect their billing email (so the proposal can be sent), and close the deal. When they confirm, use mark_confirmed.`
  } else if (customer) {
    contactBlock = `## Who you are talking to — EXISTING PARTNER
Business: ${customer.name} | Contact: ${customer.contact_name ?? ''}
Recent invoices: ${JSON.stringify(customerData?.invoices ?? [])}
Recent deliveries: ${JSON.stringify(customerData?.deliveries ?? [])}
Subscription: ${JSON.stringify(customerData?.subscription ?? 'none')}
Your goal: support them — delivery questions, invoice questions, order changes. For order changes or complaints, use escalate_to_human.`
  } else {
    contactBlock = `## Who you are talking to — UNKNOWN CONTACT
This phone number doesn't match any lead or customer. They may be a new prospect reaching out directly. Treat them as a potential partner: introduce Kembali Water, learn about their business, and collect their business name, their name, and email.`
  }

  return `You are the WhatsApp assistant for Kembali Water — a premium glass-bottle water company in Bali, Indonesia. You handle sales and support conversations end to end.

## Product & pricing
- 350ml glass bottles (still & sparkling): Rp 6,000 per bottle
- 750ml glass bottles (still & sparkling): Rp 10,000 per bottle
- Weekly delivery on the partner's preferred days
- Monthly invoice, 15-day payment terms
- Unreturned/lost bottles charged at replacement cost (350ml Rp 6,000 | 750ml Rp 8,000)
- Delivery areas: Canggu, Berawa, Pererenan, Seminyak, Legian, Kuta, Petitenget, Ubud, Denpasar, Sanur, Nusa Dua, Jimbaran, Uluwatu
- Partners get free access to the Kembali app: track deliveries, view invoices, manage orders, see plastic saved

## Why partners choose Kembali
- Zero single-use plastic — reusable premium glass, collected, sanitised, refilled
- Social impact: supporting Bali community events and clean-water initiatives
- Reliable scheduled delivery with real-time tracking

${contactBlock}

## Style rules
- WhatsApp tone: short, warm, human. 1-3 short paragraphs max. Emoji sparingly (💧 is on-brand).
- Never use em dashes.
- Match the contact's language (English or Bahasa Indonesia).
- Never invent prices, areas, or policies not listed above. If unsure, use escalate_to_human.
- Do not promise discounts. Custom pricing requests → escalate_to_human.
- If they give an email address, immediately call save_email. The proposal PDF is then sent automatically to that email; tell them it's on the way.
- If they clearly confirm partnership, call mark_confirmed.`
}

// ── Action execution ──────────────────────────────────────────────────────────

async function executeAction(
  name: string,
  input: any,
  ctx: { phone: string; lead: any; customer: any }
): Promise<string> {
  const { lead } = ctx

  switch (name) {
    case 'save_email': {
      if (lead) {
        await sb.from('sales_leads').update({
          contact_email: input.email,
          stage: lead.stage === 'prospect' ? 'interested' : lead.stage,
          updated_at: new Date().toISOString(),
        }).eq('id', lead.id)
        await sb.from('sales_activities').insert({
          lead_id: lead.id, channel: 'whatsapp', outcome: 'Email collected',
          notes: `AI agent collected email: ${input.email}`,
        })
        // Fire the proposal automatically
        try {
          const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://kembali-erp.vercel.app'
          await fetch(`${base}/api/sales/auto-proposal`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ leadId: lead.id, email: input.email }),
          })
        } catch { /* proposal send is best-effort; agent continues */ }
        return `Email saved and proposal is being sent to ${input.email}.`
      }
      return 'Email noted (no lead record to update).'
    }

    case 'mark_confirmed': {
      if (lead) {
        const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://kembali-erp.vercel.app'
        try {
          await fetch(`${base}/api/sales/activate-partner`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ leadId: lead.id, repName: 'AI Agent' }),
          })
          return 'Partner activated. Welcome messages are being sent.'
        } catch {
          await sb.from('sales_leads').update({ stage: 'negotiation' }).eq('id', lead.id)
          return 'Confirmation recorded; activation queued.'
        }
      }
      return 'Confirmation noted.'
    }

    case 'schedule_follow_up': {
      const date = new Date(Date.now() + (input.days_from_now ?? 7) * 86400000)
        .toISOString().split('T')[0]
      if (lead) {
        await sb.from('sales_leads').update({ next_follow_up: date }).eq('id', lead.id)
        await sb.from('sales_activities').insert({
          lead_id: lead.id, channel: 'whatsapp', outcome: 'Follow-up scheduled',
          notes: `AI agent scheduled follow-up for ${date}. ${input.reason ?? ''}`,
        })
      }
      return `Follow-up scheduled for ${date}.`
    }

    case 'escalate_to_human': {
      await sb.from('notifications').insert({
        title: 'WhatsApp escalation',
        body: `AI agent escalated conversation with ${ctx.phone}: ${input.reason}`,
        type: 'whatsapp_escalation',
      }).then(() => null, () => null)
      if (lead) {
        await sb.from('sales_activities').insert({
          lead_id: lead.id, channel: 'whatsapp', outcome: 'Escalated to human',
          notes: input.reason,
        })
      }
      return 'A team member has been notified and will follow up personally.'
    }

    default:
      return 'Unknown action.'
  }
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function handleInboundMessage(phone: string, _body: string): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) return

  const { lead, customer } = await matchContact(phone)
  const customerData = customer ? await loadCustomerContext(customer.id) : null
  const history = await loadHistory(phone)
  if (!history.length) return

  const messages: Anthropic.MessageParam[] = history.map(m => ({
    role: m.direction === 'inbound' ? 'user' as const : 'assistant' as const,
    content: m.body,
  }))
  // Anthropic requires the first message to be from the user
  while (messages.length && messages[0].role !== 'user') messages.shift()
  if (!messages.length) return

  const system = buildSystemPrompt({ lead, customer, customerData })

  try {
    let response = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1024,
      system,
      messages,
      tools: TOOLS,
    })

    // Tool-use loop (max 3 rounds)
    for (let round = 0; round < 3 && response.stop_reason === 'tool_use'; round++) {
      const toolResults: Anthropic.ToolResultBlockParam[] = []
      for (const block of response.content) {
        if (block.type === 'tool_use') {
          const result = await executeAction(block.name, block.input, { phone, lead, customer })
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result })
        }
      }
      messages.push({ role: 'assistant', content: response.content })
      messages.push({ role: 'user', content: toolResults })
      response = await anthropic.messages.create({
        model: 'claude-opus-4-8',
        max_tokens: 1024,
        system,
        messages,
        tools: TOOLS,
      })
    }

    const replyText = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim()

    if (replyText) {
      await sendWhatsApp({
        to: phone,
        body: replyText,
        customerId: customer?.id ?? null,
        contactName: lead?.contact_name ?? customer?.contact_name ?? null,
      })
      if (lead) {
        await sb.from('sales_leads').update({
          last_contacted_at: new Date().toISOString(),
        }).eq('id', lead.id)
      }
    }
  } catch (e) {
    console.error('[sales-agent] failed:', e)
  }
}
