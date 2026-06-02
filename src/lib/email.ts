/**
 * Email notification service — powered by Resend.
 * All emails are server-side only (called from API routes or server actions).
 * Logs every send to email_log table.
 */

const FROM = 'Kembali Water <noreply@kembaliwater.com>'
const RESEND_KEY = process.env.RESEND_API_KEY

async function sendEmail(payload: {
  to: string
  toName?: string
  subject: string
  html: string
  template?: string
  relatedType?: string
  relatedId?: string
}) {
  if (!RESEND_KEY || RESEND_KEY.startsWith('re_placeholder')) {
    console.warn('[email] RESEND_API_KEY not configured — skipping send to', payload.to)
    return { ok: false, error: 'RESEND_API_KEY not configured' }
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_KEY}` },
      body: JSON.stringify({ from: FROM, to: payload.to, subject: payload.subject, html: payload.html }),
    })
    const data = await res.json()
    await logEmail({ ...payload, status: res.ok ? 'sent' : 'failed', error: res.ok ? undefined : JSON.stringify(data) })
    return { ok: res.ok, data }
  } catch (e: any) {
    await logEmail({ ...payload, status: 'failed', error: e.message })
    return { ok: false, error: e.message }
  }
}

async function logEmail(payload: {
  to: string; toName?: string; subject: string
  template?: string; relatedType?: string; relatedId?: string
  status: string; error?: string
}) {
  try {
    // Dynamic import so this file stays server-safe without triggering browser bundle
    const { createClient } = await import('@/lib/supabase/server')
    const sb = await createClient()
    await sb.from('email_log').insert({
      to_email: payload.to,
      to_name: payload.toName,
      subject: payload.subject,
      template: payload.template,
      related_type: payload.relatedType,
      related_id: payload.relatedId,
      status: payload.status,
      error: payload.error,
    })
  } catch { /* non-critical */ }
}

// ── Templates ─────────────────────────────────────────────────────────────────

function baseTemplate(content: string) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
body{font-family:Inter,system-ui,sans-serif;background:#F8FAFC;margin:0;padding:32px 16px}
.card{background:#fff;border-radius:12px;padding:32px;max-width:560px;margin:0 auto;border:1px solid #E2E8F0}
.logo{font-weight:700;font-size:18px;color:#0EA5A4;margin-bottom:24px}
h2{margin:0 0 8px;color:#0F172A;font-size:20px}
p{color:#475569;line-height:1.6;margin:8px 0}
.btn{display:inline-block;background:#0EA5A4;color:#fff!important;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;margin:20px 0}
.table{width:100%;border-collapse:collapse;margin:16px 0}
.table th{text-align:left;padding:8px 12px;background:#F8FAFC;color:#64748B;font-size:13px;border-bottom:1px solid #E2E8F0}
.table td{padding:8px 12px;border-bottom:1px solid #E2E8F0;color:#0F172A;font-size:14px}
.badge{display:inline-block;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:600}
.footer{text-align:center;margin-top:24px;color:#94A3B8;font-size:12px}
</style></head>
<body><div class="card">
<div class="logo">💧 Kembali Water</div>
${content}
<div class="footer">Kembali Water · Bali, Indonesia<br>This is an automated message — please do not reply directly.</div>
</div></body></html>`
}

export async function sendInvoiceEmail(invoice: {
  id: string; invoice_number: string; total: number; due_date: string; status: string
  customer: { name: string; contact_email: string; contact_name?: string }
  items?: { description: string; quantity: number; unit_price: number }[]
  tax_amount?: number; subtotal?: number
}) {
  const { customer } = invoice
  if (!customer.contact_email) return

  const idr = (n: number) => `Rp ${n.toLocaleString('id-ID')}`
  const rows = (invoice.items ?? []).map(item =>
    `<tr><td>${item.description}</td><td style="text-align:right">${item.quantity}</td><td style="text-align:right">${idr(item.unit_price)}</td><td style="text-align:right">${idr(item.quantity * item.unit_price)}</td></tr>`
  ).join('')

  const html = baseTemplate(`
    <h2>Invoice ${invoice.invoice_number}</h2>
    <p>Dear ${customer.contact_name || customer.name},</p>
    <p>Please find your invoice from Kembali Water below. Payment is due by <strong>${new Date(invoice.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>.</p>
    ${rows ? `<table class="table"><thead><tr><th>Description</th><th style="text-align:right">Qty</th><th style="text-align:right">Unit Price</th><th style="text-align:right">Amount</th></tr></thead><tbody>${rows}</tbody></table>` : ''}
    ${invoice.subtotal ? `<p style="text-align:right;color:#64748B">Subtotal: ${idr(invoice.subtotal)}</p>` : ''}
    ${invoice.tax_amount ? `<p style="text-align:right;color:#64748B">PPN 11%: ${idr(invoice.tax_amount)}</p>` : ''}
    <p style="text-align:right;font-size:18px;font-weight:700;color:#0F172A">Total: ${idr(invoice.total)}</p>
    <p>Please transfer to:<br><strong>Bank BCA · 1234567890 · PT Kembali Air Bersih</strong></p>
  `)

  return sendEmail({
    to: customer.contact_email,
    toName: customer.contact_name || customer.name,
    subject: `Invoice ${invoice.invoice_number} — ${idr(invoice.total)} due ${invoice.due_date}`,
    html,
    template: 'invoice',
    relatedType: 'invoice',
    relatedId: invoice.id,
  })
}

export async function sendDeliveryConfirmationEmail(delivery: {
  id: string; delivery_date: string; delivered_350ml: number; delivered_750ml: number
  customer: { name: string; contact_email: string; contact_name?: string }
  driver?: { name: string } | null
}) {
  const { customer } = delivery
  if (!customer.contact_email) return

  const html = baseTemplate(`
    <h2>Delivery Confirmation</h2>
    <p>Dear ${customer.contact_name || customer.name},</p>
    <p>Your Kembali Water delivery on <strong>${new Date(delivery.delivery_date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</strong> has been completed.</p>
    <table class="table">
      <thead><tr><th>Product</th><th style="text-align:right">Delivered</th></tr></thead>
      <tbody>
        ${delivery.delivered_350ml > 0 ? `<tr><td>350ml Glass Bottles</td><td style="text-align:right">${delivery.delivered_350ml}</td></tr>` : ''}
        ${delivery.delivered_750ml > 0 ? `<tr><td>750ml Glass Bottles</td><td style="text-align:right">${delivery.delivered_750ml}</td></tr>` : ''}
      </tbody>
    </table>
    ${delivery.driver ? `<p style="color:#64748B;font-size:13px">Driver: ${delivery.driver.name}</p>` : ''}
    <p>Please ensure empty bottles are returned with your next delivery.</p>
  `)

  return sendEmail({
    to: customer.contact_email,
    toName: customer.contact_name || customer.name,
    subject: `Delivery confirmed — ${new Date(delivery.delivery_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`,
    html,
    template: 'delivery_confirmation',
    relatedType: 'delivery',
    relatedId: delivery.id,
  })
}

export async function sendOverdueReminderEmail(invoice: {
  id: string; invoice_number: string; total: number; due_date: string
  daysOverdue: number
  customer: { name: string; contact_email: string; contact_name?: string }
}) {
  const { customer } = invoice
  if (!customer.contact_email) return
  const idr = (n: number) => `Rp ${n.toLocaleString('id-ID')}`

  const html = baseTemplate(`
    <h2>Payment Reminder</h2>
    <p>Dear ${customer.contact_name || customer.name},</p>
    <p>This is a reminder that invoice <strong>${invoice.invoice_number}</strong> for <strong>${idr(invoice.total)}</strong> was due on ${new Date(invoice.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} and is now <strong style="color:#EF4444">${invoice.daysOverdue} days overdue</strong>.</p>
    <p>Please arrange payment at your earliest convenience to avoid service interruption.</p>
    <p>Transfer to: <strong>Bank BCA · 1234567890 · PT Kembali Air Bersih</strong></p>
    <p>If you have already paid, please disregard this notice and send your transfer receipt to billing@kembaliwater.com.</p>
  `)

  return sendEmail({
    to: customer.contact_email,
    toName: customer.contact_name || customer.name,
    subject: `⚠️ Payment overdue ${invoice.invoice_number} — ${invoice.daysOverdue} days past due`,
    html,
    template: 'overdue_reminder',
    relatedType: 'invoice',
    relatedId: invoice.id,
  })
}
