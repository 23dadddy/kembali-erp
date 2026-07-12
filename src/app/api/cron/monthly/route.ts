/**
 * GET /api/cron/monthly
 *
 * Vercel Cron — runs on the 1st of each month at 02:00 UTC (10:00 Bali time).
 * vercel.json: { "path": "/api/cron/monthly", "schedule": "0 2 1 * *" }
 *
 * 1. Generates invoices for the PREVIOUS month via /api/invoices/generate
 *    (includes lost/unreturned bottle reconciliation)
 * 2. Marks them sent, emails each customer their invoice, and sends a
 *    WhatsApp notification with the amount + due date
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendInvoiceEmail } from '@/lib/email'
import { sendWhatsApp } from '@/lib/whatsapp'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Previous month
  const now = new Date()
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const month = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`

  // 1. Generate invoices (existing logic incl. lost-bottle charges)
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://kembali-erp.vercel.app'
  const genRes = await fetch(`${base}/api/invoices/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ month }),
  })
  const gen = await genRes.json()

  // 2. Send each newly created invoice
  const createdNumbers: string[] = (gen.results ?? [])
    .filter((r: any) => !r.skipped && r.invoiceNumber)
    .map((r: any) => r.invoiceNumber)

  let emailed = 0
  let whatsapped = 0

  for (const invNumber of createdNumbers) {
    const { data: inv } = await sb
      .from('invoices')
      .select('id, invoice_number, total, due_date, status, subtotal, tax, customer:customers(name, contact_email, contact_name, contact_phone), items:invoice_items(description, quantity, unit_price)')
      .eq('invoice_number', invNumber)
      .single()
    if (!inv) continue

    await sb.from('invoices').update({ status: 'sent' }).eq('id', inv.id)

    const customer = inv.customer as any

    if (customer?.contact_email) {
      await sendInvoiceEmail({
        id: inv.id,
        invoice_number: inv.invoice_number,
        total: Number(inv.total),
        due_date: inv.due_date,
        status: 'sent',
        subtotal: Number(inv.subtotal),
        tax_amount: Number(inv.tax ?? 0),
        customer: { name: customer.name, contact_email: customer.contact_email, contact_name: customer.contact_name },
        items: (inv.items as any[]) ?? [],
      }).then(() => { emailed++ }, () => null)
    }

    if (customer?.contact_phone) {
      const wa = await sendWhatsApp({
        to: customer.contact_phone,
        contactName: customer.contact_name,
        body: `Hi ${customer.contact_name ?? customer.name}! Your Kembali Water invoice ${inv.invoice_number} for ${month} is ready.

Amount: Rp ${Number(inv.total).toLocaleString('id-ID')}
Due date: ${inv.due_date}

The full invoice has been emailed to you. Thank you for being a Kembali partner! 💧`,
      })
      if (wa.ok) whatsapped++
    }
  }

  const result = { ok: true, month, invoices_created: gen.created ?? 0, skipped: gen.skipped ?? 0, emailed, whatsapped }
  console.log('[cron/monthly]', result)
  return NextResponse.json(result)
}
