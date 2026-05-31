import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Invoice, Customer } from '@/types'

function formatIDR(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)
}

export function generateInvoicePDF(invoice: Invoice, customer: Customer) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()

  // Header background
  doc.setFillColor(6, 182, 212) // cyan-500
  doc.rect(0, 0, pageW, 40, 'F')

  // Company name
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(22)
  doc.setFont('helvetica', 'bold')
  doc.text('Kembali Water', 14, 18)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text('Premium Glass Bottle Water · Bali, Indonesia', 14, 26)
  doc.text('kembaliwater.com', 14, 32)

  // INVOICE label
  doc.setFontSize(28)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text('INVOICE', pageW - 14, 22, { align: 'right' })
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(invoice.invoice_number, pageW - 14, 30, { align: 'right' })

  // Reset colors
  doc.setTextColor(30, 30, 30)

  // Bill To
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(100, 116, 139)
  doc.text('BILL TO', 14, 52)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(15, 23, 42)
  doc.text(customer.name, 14, 59)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(71, 85, 105)
  doc.text(customer.address || '', 14, 65)
  doc.text(customer.city || 'Bali', 14, 70)
  if (customer.contact_phone) doc.text(customer.contact_phone, 14, 75)
  if (customer.contact_email) doc.text(customer.contact_email, 14, 80)

  // Invoice details box
  const detailsX = pageW - 80
  doc.setFillColor(248, 250, 252)
  doc.roundedRect(detailsX - 4, 46, 84, 40, 3, 3, 'F')

  const details = [
    ['Invoice #', invoice.invoice_number],
    ['Issue Date', new Date(invoice.issue_date || invoice.created_at).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })],
    ['Due Date', new Date(invoice.due_date).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })],
    ['Status', invoice.status.toUpperCase()],
  ]

  let dy = 53
  for (const [label, value] of details) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(100, 116, 139)
    doc.text(label, detailsX, dy)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(15, 23, 42)
    doc.text(String(value), detailsX + 30, dy)
    dy += 7
  }

  // Items table
  const items = (invoice.items ?? []).map(item => [
    item.description,
    item.bottle_size ?? '',
    String(item.quantity),
    formatIDR(item.unit_price),
    formatIDR(item.total),
  ])

  autoTable(doc, {
    startY: 94,
    head: [['Description', 'Size', 'Qty', 'Unit Price', 'Total']],
    body: items,
    theme: 'plain',
    headStyles: {
      fillColor: [6, 182, 212],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
    },
    bodyStyles: { fontSize: 9, textColor: [30, 30, 30] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 80 },
      1: { cellWidth: 20, halign: 'center' },
      2: { cellWidth: 20, halign: 'center' },
      3: { cellWidth: 30, halign: 'right' },
      4: { cellWidth: 30, halign: 'right' },
    },
    margin: { left: 14, right: 14 },
  })

  const finalY = (doc as any).lastAutoTable.finalY + 6

  // Totals
  const totalsX = pageW - 80
  doc.setDrawColor(226, 232, 240)
  doc.line(totalsX - 4, finalY, pageW - 14, finalY)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 116, 139)
  doc.text('Subtotal', totalsX, finalY + 7)
  doc.setTextColor(15, 23, 42)
  doc.text(formatIDR(Number(invoice.subtotal)), pageW - 14, finalY + 7, { align: 'right' })

  if (Number(invoice.tax) > 0) {
    doc.setTextColor(100, 116, 139)
    doc.text('Tax', totalsX, finalY + 14)
    doc.setTextColor(15, 23, 42)
    doc.text(formatIDR(Number(invoice.tax)), pageW - 14, finalY + 14, { align: 'right' })
  }

  // Total box
  doc.setFillColor(6, 182, 212)
  doc.roundedRect(totalsX - 4, finalY + 18, 84, 12, 2, 2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(255, 255, 255)
  doc.text('TOTAL DUE', totalsX, finalY + 26)
  doc.text(formatIDR(Number(invoice.total)), pageW - 14, finalY + 26, { align: 'right' })

  // Payment instructions
  const noteY = finalY + 40
  doc.setFillColor(240, 253, 244)
  doc.roundedRect(14, noteY, pageW - 28, 28, 3, 3, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(22, 163, 74)
  doc.text('Payment Instructions', 20, noteY + 8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(71, 85, 105)
  doc.text('Bank Transfer: BCA · Account: 123-456-7890 · Account Name: PT Kembali Air Bali', 20, noteY + 15)
  doc.text('Please include invoice number as payment reference. Thank you for your business!', 20, noteY + 21)

  // Footer
  const footY = doc.internal.pageSize.getHeight() - 12
  doc.setDrawColor(226, 232, 240)
  doc.line(14, footY - 4, pageW - 14, footY - 4)
  doc.setFontSize(8)
  doc.setTextColor(148, 163, 184)
  doc.text('Kembali Water · Bali, Indonesia · kembaliwater.com', pageW / 2, footY, { align: 'center' })

  return doc
}

export function downloadInvoicePDF(invoice: Invoice, customer: Customer) {
  const doc = generateInvoicePDF(invoice, customer)
  doc.save(`${invoice.invoice_number}.pdf`)
}
