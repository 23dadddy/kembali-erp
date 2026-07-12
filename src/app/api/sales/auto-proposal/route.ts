/**
 * POST /api/sales/auto-proposal
 *
 * Server-side proposal generation — called by the AI agent when it collects
 * a lead's email mid-conversation. Generates the branded PDF with jsPDF
 * (no browser needed), then delegates upload + WhatsApp + email + activity
 * logging to /api/sales/proposal.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function buildProposalPDF(lead: any, intake: any): string {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()

  doc.setFillColor(15, 23, 42)
  doc.rect(0, 0, pageW, 42, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(22)
  doc.setFont('helvetica', 'bold')
  doc.text('KEMBALI WATER', 14, 20)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(91, 163, 160)
  doc.text('Water Supply Proposal', 14, 30)
  doc.text(new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }), pageW - 14, 30, { align: 'right' })

  doc.setTextColor(30, 30, 30)
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.text(`Prepared for ${lead.company_name}`, 14, 56)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 116, 139)
  let y = 63
  if (lead.contact_name) { doc.text(`Attn: ${lead.contact_name}`, 14, y); y += 6 }
  if (lead.address) { doc.text(lead.address, 14, y); y += 6 }
  y += 4

  const rows: any[] = []
  const q350 = intake.qty_350ml ?? 0
  const q750 = intake.qty_750ml ?? 0
  if (q350 > 0) rows.push(['350ml Still & Sparkling', String(q350), 'Rp 6,000', `Rp ${(q350 * 6000 * 4).toLocaleString('id-ID')}`])
  if (q750 > 0) rows.push(['750ml Still & Sparkling', String(q750), 'Rp 10,000', `Rp ${(q750 * 10000 * 4).toLocaleString('id-ID')}`])
  if (!rows.length) {
    rows.push(['350ml Still & Sparkling', 'Per order', 'Rp 6,000', '-'])
    rows.push(['750ml Still & Sparkling', 'Per order', 'Rp 10,000', '-'])
  }

  autoTable(doc, {
    startY: y,
    head: [['Item', 'Weekly Qty', 'Unit Price', 'Monthly Estimate']],
    body: rows,
    headStyles: { fillColor: [15, 23, 42] },
    styles: { fontSize: 10 },
  })
  y = (doc as any).lastAutoTable.finalY + 10

  doc.setTextColor(30, 30, 30)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('What partners receive', 14, y); y += 7
  doc.setFontSize(9.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(71, 85, 105)
  const bullets = [
    'Scheduled weekly delivery on your preferred days',
    'Free access to the Kembali app: track deliveries, view invoices, manage orders',
    'Zero single-use plastic: premium reusable glass, collected, sanitised, refilled',
    'Monthly invoice with 15-day payment terms',
    'Real social impact: supporting Bali community and clean-water initiatives',
  ]
  for (const b of bullets) { doc.text(`•  ${b}`, 16, y); y += 6 }
  y += 4

  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 30, 30)
  doc.text('Lost / unreturned bottle policy', 14, y); y += 6
  doc.setFontSize(9.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(71, 85, 105)
  doc.text('Unreturned bottles are charged at replacement cost: 350ml Rp 6,000 | 750ml Rp 8,000, reconciled monthly.', 14, y); y += 12

  doc.setFillColor(240, 250, 249)
  doc.roundedRect(14, y, pageW - 28, 20, 3, 3, 'F')
  doc.setTextColor(15, 23, 42)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('To confirm: simply reply "Confirmed" on WhatsApp or email. We handle the rest.', pageW / 2, y + 12, { align: 'center' })

  doc.setFontSize(8)
  doc.setTextColor(148, 163, 184)
  doc.text('Kembali Water · Pure. Natural. Delivered. · Bali, Indonesia', pageW / 2, 285, { align: 'center' })

  return doc.output('datauristring').split(',')[1]
}

export async function POST(req: NextRequest) {
  const { leadId, email } = await req.json()
  if (!leadId) return NextResponse.json({ error: 'Missing leadId' }, { status: 400 })

  const { data: lead } = await sb.from('sales_leads').select('*').eq('id', leadId).single()
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

  // Pull intake from notes if the rep captured it, else defaults
  let intake: any = { qty_350ml: 0, qty_750ml: 0, billing_email: email ?? lead.contact_email }
  try {
    const m = (lead.notes ?? '').match(/INTAKE: (\{.*\})/)
    if (m) intake = { ...JSON.parse(m[1]), billing_email: email ?? lead.contact_email }
  } catch { /* defaults stand */ }

  const pdfBase64 = buildProposalPDF(lead, intake)

  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://kembali-erp.vercel.app'
  const res = await fetch(`${base}/api/sales/proposal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ leadId, intakeData: intake, pdfBase64, repName: 'AI Agent' }),
  })
  const data = await res.json()

  return NextResponse.json({ ok: res.ok, ...data })
}
