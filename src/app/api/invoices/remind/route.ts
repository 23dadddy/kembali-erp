/**
 * POST /api/invoices/remind
 *
 * Send overdue payment reminder emails to all customers with overdue invoices.
 * Body: { invoiceId?: string }  — omit to send to all overdue invoices
 *
 * Returns: { ok, sent, skipped, errors }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendOverdueReminderEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { invoiceId } = body

  const sb = await createClient()
  const today = new Date().toISOString().split('T')[0]

  let query = sb
    .from('invoices')
    .select('id, invoice_number, total, due_date, customer:customers(id, name, contact_email, contact_name)')
    .eq('status', 'overdue')
    .lt('due_date', today)

  if (invoiceId) query = query.eq('id', invoiceId)

  const { data: invoices, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const results: { invoiceId: string; invoiceNumber: string; customerName: string; status: 'sent' | 'skipped' | 'error'; reason?: string }[] = []

  for (const inv of (invoices ?? [])) {
    const customer = inv.customer as any
    if (!customer?.contact_email) {
      results.push({ invoiceId: inv.id, invoiceNumber: inv.invoice_number, customerName: customer?.name ?? 'Unknown', status: 'skipped', reason: 'no email' })
      continue
    }

    const daysOverdue = Math.ceil((Date.now() - new Date(inv.due_date).getTime()) / (1000 * 60 * 60 * 24))

    try {
      const result = await sendOverdueReminderEmail({
        id: inv.id,
        invoice_number: inv.invoice_number,
        total: Number(inv.total),
        due_date: inv.due_date,
        daysOverdue,
        customer: {
          name: customer.name,
          contact_email: customer.contact_email,
          contact_name: customer.contact_name,
        },
      })
      results.push({ invoiceId: inv.id, invoiceNumber: inv.invoice_number, customerName: customer.name, status: result?.ok ? 'sent' : 'error', reason: result?.ok ? undefined : String(result?.error) })
    } catch (e: any) {
      results.push({ invoiceId: inv.id, invoiceNumber: inv.invoice_number, customerName: customer.name, status: 'error', reason: e.message })
    }
  }

  return NextResponse.json({
    ok: true,
    sent: results.filter(r => r.status === 'sent').length,
    skipped: results.filter(r => r.status === 'skipped').length,
    errors: results.filter(r => r.status === 'error').length,
    results,
  })
}
