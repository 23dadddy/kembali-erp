import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function getContext(sb: any) {
  const today = new Date().toISOString().split('T')[0]
  const monthStart = new Date(); monthStart.setDate(1)
  const monthStartStr = monthStart.toISOString().split('T')[0]

  const [customers, deliveries, invoices, inventory, staff, vehicles, payments, tickets, subscriptions, pricing, routes] = await Promise.all([
    sb.from('customers').select('id, name, type, city, status, tier, active, created_at').eq('active', true).limit(200),
    sb.from('deliveries').select('id, customer_id, delivery_date, status, delivered_350ml, delivered_750ml, collected_350ml, collected_750ml, driver_id').gte('delivery_date', monthStartStr).limit(500),
    sb.from('invoices').select('id, customer_id, invoice_number, status, total, due_date, issue_date').order('created_at', { ascending: false }).limit(200),
    sb.from('bottle_inventory').select('*'),
    sb.from('staff').select('id, name, role, active, phone').eq('active', true),
    sb.from('vehicles').select('id, name, plate_number, status, type'),
    sb.from('payments').select('id, customer_id, amount, payment_date, method').gte('payment_date', monthStartStr).limit(100),
    sb.from('support_tickets').select('id, subject, status, priority, category, created_at').order('created_at', { ascending: false }).limit(50),
    sb.from('customer_subscriptions').select('id, customer_id, status, plan_name, frequency_days').eq('status', 'active').limit(100),
    sb.from('pricing').select('*').eq('active', true),
    sb.from('routes').select('id, name, driver_id, active').eq('active', true).limit(20),
  ])

  const overdue = (invoices.data ?? []).filter((i: any) => i.status === 'overdue')
  const revenueThisMonth = (payments.data ?? []).reduce((s: number, p: any) => s + Number(p.amount), 0)

  return {
    customers: customers.data ?? [],
    deliveries: deliveries.data ?? [],
    invoices: invoices.data ?? [],
    inventory: inventory.data ?? [],
    staff: staff.data ?? [],
    vehicles: vehicles.data ?? [],
    payments: payments.data ?? [],
    tickets: tickets.data ?? [],
    subscriptions: subscriptions.data ?? [],
    pricing: pricing.data ?? [],
    routes: routes.data ?? [],
    today,
    monthStart: monthStartStr,
    summary: {
      activeCustomers: (customers.data ?? []).length,
      deliveriesThisMonth: (deliveries.data ?? []).length,
      completedDeliveries: (deliveries.data ?? []).filter((d: any) => d.status === 'completed').length,
      overdueInvoices: overdue.length,
      overdueValue: overdue.reduce((s: number, i: any) => s + Number(i.total), 0),
      revenueThisMonth,
      activeSubscriptions: (subscriptions.data ?? []).length,
      openTickets: (tickets.data ?? []).filter((t: any) => t.status === 'open').length,
    },
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

## LIVE BUSINESS SUMMARY
- Today: ${context.today} (Month starts: ${context.monthStart})
- Active customers: ${context.summary.activeCustomers}
- Active staff: ${context.staff.length} | Vehicles: ${context.vehicles.length}
- Deliveries this month: ${context.summary.deliveriesThisMonth} (${context.summary.completedDeliveries} completed)
- Revenue this month: Rp ${context.summary.revenueThisMonth.toLocaleString('id-ID')}
- Overdue invoices: ${context.summary.overdueInvoices} (Rp ${context.summary.overdueValue.toLocaleString('id-ID')} outstanding)
- Active subscriptions: ${context.summary.activeSubscriptions}
- Open support tickets: ${context.summary.openTickets}

## Customers (${context.customers.length} active)
${JSON.stringify(context.customers.slice(0, 60), null, 2)}

## This Month's Deliveries (${context.deliveries.length} total)
${JSON.stringify(context.deliveries.slice(0, 100), null, 2)}

## Recent Invoices (${context.invoices.length} total)
${JSON.stringify(context.invoices.slice(0, 60), null, 2)}

## This Month's Payments (${context.payments.length} total)
${JSON.stringify(context.payments, null, 2)}

## Support Tickets (recent ${context.tickets.length})
${JSON.stringify(context.tickets.slice(0, 20), null, 2)}

## Active Subscriptions (${context.subscriptions.length})
${JSON.stringify(context.subscriptions.slice(0, 50), null, 2)}

## Pricing
${JSON.stringify(context.pricing, null, 2)}

## Bottle Inventory
${JSON.stringify(context.inventory, null, 2)}

## Staff
${JSON.stringify(context.staff, null, 2)}

## Vehicles
${JSON.stringify(context.vehicles, null, 2)}

## Routes
${JSON.stringify(context.routes, null, 2)}

## Business Rules
- Bottle sizes: 350ml (Rp ${context.pricing.find((p: any) => p.bottle_size === '350ml')?.price_per_unit?.toLocaleString('id-ID') ?? '6,000'}) and 750ml (Rp ${context.pricing.find((p: any) => p.bottle_size === '750ml')?.price_per_unit?.toLocaleString('id-ID') ?? '10,000'})
- Lost bottle threshold: 8% — bottles above this are charged at replacement cost (3× normal price)
- Monthly invoicing cycle — invoices generated from delivery data
- All prices in Indonesian Rupiah (IDR)
- Operating in Bali, Indonesia (Timezone: WITA = UTC+8)
- Customer types: hotel, restaurant, resort, cafe, office, retail, business
- Delivery statuses: pending, in_transit, completed, failed
- Invoice statuses: draft, sent, paid, overdue, cancelled

## ERP Module Map (for ACTION links)
- /invoices — Invoices (generate monthly, send, track payments)
- /trakops — TrakOps board (today's deliveries, assign drivers)
- /customers — Customer list
- /customers/[id] — Customer detail
- /crm — CRM pipeline (leads)
- /deliveries — Delivery history
- /inventory — Bottle inventory
- /bottles — Bottle tracking (lost, chargeable)
- /routes — Route management
- /subscriptions — Standing orders
- /communications — Email & WhatsApp
- /support — Support tickets
- /reports — Business reports
- /finance — Finance & payments
- /fleet — Vehicles & maintenance
- /hr — Staff management
- /attendance — Attendance tracking
- /payroll — Payroll runs
- /performance — Driver performance
- /settings — System settings

## Your Capabilities
- Answer any question about the live business data above
- Identify the top/bottom performing customers, drivers, routes
- Calculate revenue, AR, collection rates, bottle recovery rates
- Spot trends, warn about problems (overdue AR, low collection rates)
- Give specific, actionable recommendations with numbers
- When asked to perform an action, describe what you'd do and include: [ACTION: /path/to/page]

Always respond in a clear, direct, data-driven way. Format numbers as IDR (e.g., Rp 1.500.000). Use markdown bullet points and headers for clarity.`

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
