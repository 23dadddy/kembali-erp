/**
 * POST /api/invoices/statement
 *
 * Send monthly account statements to customers.
 * Body: { month: "YYYY-MM", customerId?: string }
 *   - omit customerId to send to ALL active customers with an email
 *
 * Returns: { ok, sent, skipped, errors }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendMonthlyStatementEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { month, customerId } = await req.json()
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 })
  }

  const sb = await createClient()
  const startDate = `${month}-01`
  const endDate = new Date(parseInt(month.slice(0, 4)), parseInt(month.slice(5, 7)), 0)
    .toISOString().split('T')[0] // last day of month

  // ── Fetch customers ──────────────────────────────────────────────────────────
  let customersQuery = sb
    .from('customers')
    .select('id, name, contact_email, contact_name')
    .eq('active', true)
    .not('contact_email', 'is', null)

  if (customerId) customersQuery = customersQuery.eq('id', customerId)

  const { data: customers, error: custErr } = await customersQuery
  if (custErr) return NextResponse.json({ error: custErr.message }, { status: 500 })

  // ── Fetch pricing ──────────────────────────────────────────────────────────
  const { data: pricing } = await sb.from('pricing').select('bottle_size, price_per_unit').eq('active', true)
  const p350 = (pricing ?? []).find((p: any) => p.bottle_size === '350ml')?.price_per_unit ?? 6000
  const p750 = (pricing ?? []).find((p: any) => p.bottle_size === '750ml')?.price_per_unit ?? 10000

  const results: { customerId: string; name: string; status: 'sent' | 'skipped' | 'error'; reason?: string }[] = []

  for (const customer of (customers ?? [])) {
    if (!customer.contact_email) {
      results.push({ customerId: customer.id, name: customer.name, status: 'skipped', reason: 'no email' })
      continue
    }

    // Fetch per-customer data in parallel
    const [deliveriesRes, invoicesRes, paymentsRes, balanceRes] = await Promise.all([
      sb.from('deliveries')
        .select('delivery_date, delivered_350ml, delivered_750ml, status')
        .eq('customer_id', customer.id)
        .gte('delivery_date', startDate)
        .lte('delivery_date', endDate),
      sb.from('invoices')
        .select('invoice_number, total, status, due_date')
        .eq('customer_id', customer.id)
        .gte('issue_date', startDate)
        .lte('issue_date', endDate),
      sb.from('payments')
        .select('payment_date, amount, method')
        .eq('customer_id', customer.id)
        .gte('payment_date', startDate)
        .lte('payment_date', endDate),
      sb.from('customer_bottle_balance')
        .select('outstanding_350ml, outstanding_750ml')
        .eq('customer_id', customer.id)
        .single(),
    ])

    const deliveries = deliveriesRes.data ?? []
    const invoices = invoicesRes.data ?? []
    const payments = paymentsRes.data ?? []
    const bottleBalance = balanceRes.data ?? { outstanding_350ml: 0, outstanding_750ml: 0 }

    // Skip if nothing to report (no deliveries AND no invoices this month)
    if (deliveries.length === 0 && invoices.length === 0) {
      results.push({ customerId: customer.id, name: customer.name, status: 'skipped', reason: 'no activity' })
      continue
    }

    try {
      const result = await sendMonthlyStatementEmail({
        customer: {
          id: customer.id,
          name: customer.name,
          contact_email: customer.contact_email,
          contact_name: customer.contact_name,
        },
        month,
        deliveries: deliveries as any[],
        invoices: invoices as any[],
        payments: payments as any[],
        bottleBalance: bottleBalance as any,
        pricing: { p350, p750 },
      })
      results.push({ customerId: customer.id, name: customer.name, status: result?.ok ? 'sent' : 'error', reason: result?.ok ? undefined : String(result?.error) })
    } catch (e: any) {
      results.push({ customerId: customer.id, name: customer.name, status: 'error', reason: e.message })
    }
  }

  return NextResponse.json({
    ok: true,
    month,
    sent: results.filter(r => r.status === 'sent').length,
    skipped: results.filter(r => r.status === 'skipped').length,
    errors: results.filter(r => r.status === 'error').length,
    results,
  })
}
