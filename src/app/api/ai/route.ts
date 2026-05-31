import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function getContext(sb: any) {
  const today = new Date().toISOString().split('T')[0]
  const monthStart = new Date(); monthStart.setDate(1)
  const monthStartStr = monthStart.toISOString().split('T')[0]

  const [customers, deliveries, invoices, inventory, staff, vehicles] = await Promise.all([
    sb.from('customers').select('id, name, type, city, status, tier, active').eq('active', true).limit(200),
    sb.from('deliveries').select('id, customer_id, delivery_date, status, delivered_350ml, delivered_750ml, collected_350ml, collected_750ml').gte('delivery_date', monthStartStr).limit(500),
    sb.from('invoices').select('id, customer_id, invoice_number, status, total, due_date, issue_date').order('created_at', { ascending: false }).limit(200),
    sb.from('bottle_inventory').select('*'),
    sb.from('staff').select('id, name, role, active, phone').eq('active', true),
    sb.from('vehicles').select('id, name, plate_number, status, type'),
  ])

  return {
    customers: customers.data ?? [],
    deliveries: deliveries.data ?? [],
    invoices: invoices.data ?? [],
    inventory: inventory.data ?? [],
    staff: staff.data ?? [],
    vehicles: vehicles.data ?? [],
    today,
    monthStart: monthStartStr,
  }
}

export async function POST(req: NextRequest) {
  const { message, history = [] } = await req.json()

  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your_anthropic_api_key_here') {
    return NextResponse.json({
      response: "⚠️ AI Command Center needs an Anthropic API key. Add `ANTHROPIC_API_KEY=your_key` to your `.env.local` file and restart the server. Get a free key at console.anthropic.com",
      action: null,
    })
  }

  const sb = await createClient()
  const context = await getContext(sb)

  const systemPrompt = `You are the AI Command Center for Kembali Water ERP — a premium glass bottle water company in Bali, Indonesia.

You have full access to live business data and can answer questions, analyze trends, and provide actionable insights.

## Current Business Data
- Today: ${context.today}
- Active customers: ${context.customers.length}
- Active staff: ${context.staff.length}
- Vehicles: ${context.vehicles.length}

## Customers (${context.customers.length} active)
${JSON.stringify(context.customers.slice(0, 50), null, 2)}

## This Month's Deliveries (${context.deliveries.length} total)
${JSON.stringify(context.deliveries.slice(0, 100), null, 2)}

## Recent Invoices (${context.invoices.length} total)
${JSON.stringify(context.invoices.slice(0, 50), null, 2)}

## Bottle Inventory
${JSON.stringify(context.inventory, null, 2)}

## Staff
${JSON.stringify(context.staff, null, 2)}

## Business Rules
- Bottle sizes: 350ml (Rp 6,000) and 750ml (Rp 10,000)
- Lost bottle threshold: 8% — bottles above this are charged at replacement cost
- Monthly invoicing cycle
- All prices in Indonesian Rupiah (IDR)
- Operating in Bali, Indonesia

## Your Capabilities
- Answer any question about the business data above
- Analyze customer performance, revenue, bottle recovery rates
- Identify trends, problems, opportunities
- Calculate KPIs, totals, averages
- Give strategic recommendations
- When asked to perform an action (create delivery, generate invoice, etc.), describe what you would do and provide a direct link in format: [ACTION: /path/to/page]

Always be concise, data-driven, and formatted with markdown for readability. Use IDR currency formatting.`

  const messages = [
    ...history.map((h: any) => ({ role: h.role, content: h.content })),
    { role: 'user' as const, content: message },
  ]

  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''

    // Extract action links
    const actionMatch = text.match(/\[ACTION: ([^\]]+)\]/)
    const action = actionMatch ? actionMatch[1] : null
    const cleanText = text.replace(/\[ACTION: [^\]]+\]/g, '').trim()

    return NextResponse.json({ response: cleanText, action })
  } catch (err: any) {
    const msg = err?.error?.error?.message ?? err?.message ?? 'Unknown error'
    if (msg.includes('credit balance') || msg.includes('billing')) {
      return NextResponse.json({
        response: '💳 **Anthropic API credits needed.** Your API key is connected and working, but you need to add credits to your Anthropic account.\n\nVisit [console.anthropic.com/settings/billing](https://console.anthropic.com/settings/billing) to add credits, then the AI Command Center will be fully operational.',
        action: null,
      })
    }
    return NextResponse.json({
      response: `⚠️ AI error: ${msg}`,
      action: null,
    })
  }
}
