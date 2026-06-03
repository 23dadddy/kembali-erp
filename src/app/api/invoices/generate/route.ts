/**
 * POST /api/invoices/generate
 *
 * Generates monthly invoices for all active customers based on their
 * completed deliveries in the specified period. Skips customers who
 * already have a non-cancelled invoice for that period.
 *
 * Body: { month: "2026-06", dryRun?: boolean }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const { month, dryRun = false } = await req.json()
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'Invalid month format. Use YYYY-MM' }, { status: 400 })
  }

  const sb = await createClient()

  const periodStart = `${month}-01`
  const year = parseInt(month.split('-')[0])
  const mo = parseInt(month.split('-')[1])
  const periodEnd = new Date(year, mo, 0).toISOString().split('T')[0] // last day

  // Get active pricing
  const { data: pricingRows } = await sb.from('pricing').select('*').eq('active', true)
  const pricing: Record<string, number> = {}
  for (const p of pricingRows ?? []) pricing[p.bottle_size] = p.price_per_unit
  const p350 = pricing['350ml'] ?? 6000
  const p750 = pricing['750ml'] ?? 10000

  // Lost bottle replacement pricing (typically 3× regular)
  const lost350Price = p350 * 3
  const lost750Price = p750 * 3

  // Get all customers with completed deliveries in this period
  const { data: deliveries } = await sb
    .from('deliveries')
    .select('customer_id, delivered_350ml, delivered_750ml, collected_350ml, collected_750ml')
    .gte('delivery_date', periodStart)
    .lte('delivery_date', periodEnd)
    .eq('status', 'completed')

  if (!deliveries?.length) {
    return NextResponse.json({ ok: true, created: 0, skipped: 0, message: 'No completed deliveries in this period' })
  }

  // Aggregate deliveries per customer
  const customerTotals: Record<string, { del350: number; del750: number; col350: number; col750: number }> = {}
  for (const d of deliveries) {
    if (!customerTotals[d.customer_id]) customerTotals[d.customer_id] = { del350: 0, del750: 0, col350: 0, col750: 0 }
    customerTotals[d.customer_id].del350 += d.delivered_350ml ?? 0
    customerTotals[d.customer_id].del750 += d.delivered_750ml ?? 0
    customerTotals[d.customer_id].col350 += d.collected_350ml ?? 0
    customerTotals[d.customer_id].col750 += d.collected_750ml ?? 0
  }

  const customerIds = Object.keys(customerTotals)

  // Fetch customer details
  const { data: customers } = await sb
    .from('customers')
    .select('id, name, contact_email, payment_terms_days')
    .in('id', customerIds)
    .eq('active', true)

  // Get app settings for invoice config
  const { data: settingsRow } = await sb.from('app_settings').select('value').eq('key', 'invoice').single()
  const settings = (settingsRow?.value as any) ?? {}
  const invoicePrefix = settings.invoice_prefix ?? 'INV'
  const paymentTermsDays = settings.payment_terms ?? 30

  // Get last invoice number
  const { data: lastInv } = await sb
    .from('invoices')
    .select('invoice_number')
    .ilike('invoice_number', `${invoicePrefix}-%`)
    .order('invoice_number', { ascending: false })
    .limit(1)
    .single()

  let nextNum = 1
  if (lastInv?.invoice_number) {
    const parts = lastInv.invoice_number.split('-')
    const num = parseInt(parts[parts.length - 1], 10)
    if (!isNaN(num)) nextNum = num + 1
  }

  // Check which customers already have invoices for this period
  const { data: existingInvoices } = await sb
    .from('invoices')
    .select('customer_id, invoice_number')
    .in('customer_id', customerIds)
    .gte('issue_date', periodStart)
    .lte('issue_date', periodEnd)
    .not('status', 'eq', 'cancelled')

  const alreadyInvoiced = new Set((existingInvoices ?? []).map(i => i.customer_id))

  const results: { customerId: string; customerName: string; total: number; invoiceNumber: string; skipped?: boolean; reason?: string }[] = []
  let created = 0
  let skipped = 0

  const issueDate = new Date().toISOString().split('T')[0]

  for (const customer of (customers ?? [])) {
    const totals = customerTotals[customer.id]
    if (!totals) continue

    if (alreadyInvoiced.has(customer.id)) {
      skipped++
      results.push({ customerId: customer.id, customerName: customer.name, total: 0, invoiceNumber: '', skipped: true, reason: 'Invoice already exists for this period' })
      continue
    }

    // Build line items
    const lineItems: { description: string; bottle_size?: string; quantity: number; unit_price: number }[] = []

    if (totals.del350 > 0) {
      lineItems.push({ description: '350ml Glass Bottle Water', bottle_size: '350ml', quantity: totals.del350, unit_price: p350 })
    }
    if (totals.del750 > 0) {
      lineItems.push({ description: '750ml Glass Bottle Water', bottle_size: '750ml', quantity: totals.del750, unit_price: p750 })
    }

    // Bottle loss charges (bottles delivered but not collected = outstanding)
    const outstanding350 = totals.del350 - totals.col350
    const outstanding750 = totals.del750 - totals.col750
    const lostThreshold = 0.08

    const chargeable350 = totals.del350 > 0 ? Math.max(0, outstanding350 - Math.floor(totals.del350 * lostThreshold)) : 0
    const chargeable750 = totals.del750 > 0 ? Math.max(0, outstanding750 - Math.floor(totals.del750 * lostThreshold)) : 0

    if (chargeable350 > 0) {
      lineItems.push({ description: `Lost Bottle Charge — 350ml (${chargeable350} bottles)`, bottle_size: '350ml', quantity: chargeable350, unit_price: lost350Price })
    }
    if (chargeable750 > 0) {
      lineItems.push({ description: `Lost Bottle Charge — 750ml (${chargeable750} bottles)`, bottle_size: '750ml', quantity: chargeable750, unit_price: lost750Price })
    }

    if (lineItems.length === 0) {
      skipped++
      results.push({ customerId: customer.id, customerName: customer.name, total: 0, invoiceNumber: '', skipped: true, reason: 'No chargeable items' })
      continue
    }

    const subtotal = lineItems.reduce((s, item) => s + item.quantity * item.unit_price, 0)
    const dueDate = new Date()
    dueDate.setDate(dueDate.getDate() + (customer.payment_terms_days ?? paymentTermsDays))
    const dueDateStr = dueDate.toISOString().split('T')[0]

    const invoiceNumber = `${invoicePrefix}-${String(nextNum).padStart(5, '0')}`
    nextNum++

    if (!dryRun) {
      // Insert invoice
      const { data: inv, error: invErr } = await sb.from('invoices').insert({
        invoice_number: invoiceNumber,
        customer_id: customer.id,
        issue_date: issueDate,
        due_date: dueDateStr,
        status: 'draft',
        subtotal,
        tax: 0,
        total: subtotal,
        notes: `Auto-generated for deliveries in ${month}. Period: ${periodStart} to ${periodEnd}.`,
      }).select().single()

      if (invErr || !inv) {
        results.push({ customerId: customer.id, customerName: customer.name, total: 0, invoiceNumber, skipped: true, reason: invErr?.message ?? 'Insert failed' })
        continue
      }

      // Insert line items
      await sb.from('invoice_items').insert(
        lineItems.map(item => ({
          invoice_id: inv.id,
          description: item.description,
          bottle_size: item.bottle_size ?? null,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total: item.quantity * item.unit_price,
        }))
      )
    }

    created++
    results.push({ customerId: customer.id, customerName: customer.name, total: subtotal, invoiceNumber })
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    period: { start: periodStart, end: periodEnd },
    created,
    skipped,
    results,
    pricing: { p350, p750 },
  })
}
