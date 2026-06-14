'use client'

import { useState } from 'react'
import { X, Send, FileText, CheckCircle, RefreshCw, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

const PRICE_350 = 6000
const PRICE_750 = 10000
const REPLACE_350 = 6000
const REPLACE_750 = 8000

const ALL_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

type Lead = {
  id: string
  company_name: string
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  whatsapp_number: string | null
  address: string | null
  area: string | null
}

type Props = {
  lead: Lead
  repName?: string
  onClose: () => void
  onSent: () => void
}

export function ProposalModal({ lead, repName: initialRep, onClose, onSent }: Props) {
  const [step, setStep] = useState<'form' | 'preview' | 'sending' | 'done'>('form')
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    billing_contact: lead.contact_name ?? '',
    billing_email: lead.contact_email ?? '',
    delivery_address: lead.address ?? '',
    qty_350ml: 0,
    qty_750ml: 0,
    preferred_days: ['Monday', 'Wednesday', 'Friday'] as string[],
    special_notes: '',
    contract_type: 'monthly' as 'monthly' | 'quarterly' | 'annual',
    rep_name: initialRep ?? '',
  })

  const monthly350 = form.qty_350ml * PRICE_350 * 4
  const monthly750 = form.qty_750ml * PRICE_750 * 4
  const monthlyTotal = monthly350 + monthly750

  function toggleDay(day: string) {
    setForm(f => ({
      ...f,
      preferred_days: f.preferred_days.includes(day)
        ? f.preferred_days.filter(d => d !== day)
        : [...f.preferred_days, day],
    }))
  }

  async function generateAndSend() {
    if (form.qty_350ml === 0 && form.qty_750ml === 0) {
      setError('Please enter at least one bottle quantity.')
      return
    }
    setError('')
    setStep('sending')

    try {
      // Generate PDF client-side using jsPDF
      const { jsPDF } = await import('jspdf')
      const doc = new jsPDF({ unit: 'mm', format: 'a4' })
      const W = 210
      const margin = 20

      // Header background
      doc.setFillColor(26, 26, 46)
      doc.rect(0, 0, W, 45, 'F')

      // Logo / company name
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(22)
      doc.setFont('helvetica', 'bold')
      doc.text('KEMBALI WATER', W / 2, 18, { align: 'center' })

      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(91, 163, 160)
      doc.text('Premium Purified Water Supply', W / 2, 26, { align: 'center' })

      doc.setFontSize(13)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(255, 255, 255)
      doc.text('WATER SUPPLY PROPOSAL', W / 2, 37, { align: 'center' })

      // Meta row
      let y = 55
      doc.setTextColor(100, 100, 100)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.text(`Date: ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`, margin, y)
      doc.text(`Prepared by: ${form.rep_name || 'Kembali Water Team'}`, W - margin, y, { align: 'right' })

      // Divider
      y += 6
      doc.setDrawColor(229, 231, 235)
      doc.line(margin, y, W - margin, y)

      // Client info section
      y += 10
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(26, 26, 46)
      doc.text('CLIENT INFORMATION', margin, y)

      y += 7
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(55, 65, 81)

      const clientLines: [string, string][] = [
        ['Business', lead.company_name],
        ['Contact', form.billing_contact || lead.contact_name || '—'],
        ['Email', form.billing_email || lead.contact_email || '—'],
        ['Phone', lead.contact_phone || lead.whatsapp_number || '—'],
        ['Delivery Address', form.delivery_address || lead.address || '—'],
      ]

      for (const [label, value] of clientLines) {
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(107, 114, 128)
        doc.text(`${label}:`, margin, y)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(55, 65, 81)
        const wrapped = doc.splitTextToSize(value, W - margin - 55)
        doc.text(wrapped, margin + 35, y)
        y += 6 * wrapped.length
      }

      // Proposed package
      y += 6
      doc.setDrawColor(229, 231, 235)
      doc.line(margin, y, W - margin, y)
      y += 8

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(26, 26, 46)
      doc.text('PROPOSED PACKAGE', margin, y)
      y += 6

      doc.setFillColor(248, 250, 252)
      doc.roundedRect(margin, y, W - margin * 2, form.qty_350ml > 0 && form.qty_750ml > 0 ? 52 : 32, 3, 3, 'F')
      y += 6

      // Table header
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(107, 114, 128)
      doc.text('Item', margin + 4, y)
      doc.text('Qty/Week', margin + 70, y, { align: 'right' })
      doc.text('Unit Price', margin + 100, y, { align: 'right' })
      doc.text('Monthly (×4 weeks)', W - margin - 4, y, { align: 'right' })
      y += 5
      doc.setDrawColor(229, 231, 235)
      doc.line(margin + 4, y, W - margin - 4, y)
      y += 5

      doc.setFont('helvetica', 'normal')
      doc.setTextColor(55, 65, 81)
      doc.setFontSize(10)

      if (form.qty_350ml > 0) {
        doc.text('350ml Still & Sparkling', margin + 4, y)
        doc.text(`${form.qty_350ml}`, margin + 70, y, { align: 'right' })
        doc.text('Rp 6,000', margin + 100, y, { align: 'right' })
        doc.setFont('helvetica', 'bold')
        doc.text(`Rp ${monthly350.toLocaleString('id-ID')}`, W - margin - 4, y, { align: 'right' })
        doc.setFont('helvetica', 'normal')
        y += 8
      }

      if (form.qty_750ml > 0) {
        doc.text('750ml Still & Sparkling', margin + 4, y)
        doc.text(`${form.qty_750ml}`, margin + 70, y, { align: 'right' })
        doc.text('Rp 10,000', margin + 100, y, { align: 'right' })
        doc.setFont('helvetica', 'bold')
        doc.text(`Rp ${monthly750.toLocaleString('id-ID')}`, W - margin - 4, y, { align: 'right' })
        doc.setFont('helvetica', 'normal')
        y += 8
      }

      // Total row
      doc.setDrawColor(229, 231, 235)
      doc.line(margin + 4, y - 2, W - margin - 4, y - 2)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.setTextColor(26, 26, 46)
      doc.text('Total Monthly Estimate', margin + 4, y + 4)
      doc.setTextColor(91, 163, 160)
      doc.text(`Rp ${monthlyTotal.toLocaleString('id-ID')}`, W - margin - 4, y + 4, { align: 'right' })
      y += 16

      // Lost bottle policy
      y += 4
      doc.setFillColor(255, 251, 235)
      doc.roundedRect(margin, y, W - margin * 2, 24, 3, 3, 'F')
      doc.setDrawColor(245, 158, 11)
      doc.roundedRect(margin, y, 3, 24, 1, 1, 'F')
      y += 6
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(146, 64, 14)
      doc.text('LOST / UNRETURNED BOTTLE POLICY', margin + 6, y)
      y += 5
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(146, 64, 14)
      doc.text('Unreturned bottles are charged at replacement cost and reconciled monthly based on delivery records.', margin + 6, y, { maxWidth: W - margin * 2 - 8 })
      y += 5
      doc.text(`Replacement cost: 350ml — Rp ${REPLACE_350.toLocaleString('id-ID')}  |  750ml — Rp ${REPLACE_750.toLocaleString('id-ID')}`, margin + 6, y)
      y += 14

      // Payment terms
      doc.setFillColor(240, 253, 244)
      doc.roundedRect(margin, y, W - margin * 2, 20, 3, 3, 'F')
      doc.setDrawColor(16, 185, 129)
      doc.roundedRect(margin, y, 3, 20, 1, 1, 'F')
      y += 6
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(6, 95, 70)
      doc.text('PAYMENT TERMS', margin + 6, y)
      y += 5
      doc.setFont('helvetica', 'normal')
      doc.text('Monthly invoice issued at the start of each month. Payment due within 15 days of invoice date.', margin + 6, y, { maxWidth: W - margin * 2 - 8 })
      y += 12

      // Delivery info
      if (form.preferred_days.length > 0) {
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(9)
        doc.setTextColor(107, 114, 128)
        doc.text('Preferred Delivery Days:', margin, y)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(55, 65, 81)
        doc.text(form.preferred_days.join(', '), margin + 44, y)
        y += 6
      }

      if (form.special_notes) {
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(9)
        doc.setTextColor(107, 114, 128)
        doc.text('Special Notes:', margin, y)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(55, 65, 81)
        const noteLines = doc.splitTextToSize(form.special_notes, W - margin - 44)
        doc.text(noteLines, margin + 30, y)
        y += 6 * noteLines.length
      }

      // Confirmation CTA
      y += 6
      doc.setDrawColor(229, 231, 235)
      doc.line(margin, y, W - margin, y)
      y += 8
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(26, 26, 46)
      doc.text('TO CONFIRM THIS PROPOSAL', margin, y)
      y += 6
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(55, 65, 81)
      doc.text('Simply reply "Confirmed" to this message, or contact:', margin, y)
      y += 5
      if (form.rep_name) {
        doc.setFont('helvetica', 'bold')
        doc.text(form.rep_name, margin, y)
        doc.setFont('helvetica', 'normal')
      }

      // Footer
      const footerY = 282
      doc.setFillColor(26, 26, 46)
      doc.rect(0, footerY - 4, W, 20, 'F')
      doc.setTextColor(91, 163, 160)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.text('Pure. Natural. Delivered.  |  Kembali Water', W / 2, footerY + 4, { align: 'center' })

      // Convert to base64
      const pdfBase64 = doc.output('datauristring').split(',')[1]

      // Send via API
      const res = await fetch('/api/sales/proposal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: lead.id,
          intakeData: form,
          pdfBase64,
          repName: form.rep_name,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to send proposal')
      }

      setStep('done')
      setTimeout(() => { onSent(); onClose() }, 2500)
    } catch (e: any) {
      setError(e.message)
      setStep('form')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center">
              <FileText className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 text-sm">Generate Proposal</h2>
              <p className="text-xs text-gray-500">{lead.company_name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {step === 'done' ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <p className="font-bold text-gray-900">Proposal Sent!</p>
            <p className="text-sm text-gray-500">Delivered via WhatsApp + Email</p>
          </div>
        ) : step === 'sending' ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <RefreshCw className="w-8 h-8 text-[#5BA3A0] animate-spin" />
            <p className="text-sm text-gray-600">Generating PDF and sending…</p>
          </div>
        ) : (
          <div className="p-6 space-y-6">

            {/* Rep info */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Rep Name</label>
              <input
                value={form.rep_name}
                onChange={e => setForm(f => ({ ...f, rep_name: e.target.value }))}
                placeholder="Your name"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#5BA3A0]"
              />
            </div>

            {/* Billing contact */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Billing Contact Name</label>
                <input
                  value={form.billing_contact}
                  onChange={e => setForm(f => ({ ...f, billing_contact: e.target.value }))}
                  placeholder={lead.contact_name ?? 'Contact name'}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#5BA3A0]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Billing Email</label>
                <input
                  type="email"
                  value={form.billing_email}
                  onChange={e => setForm(f => ({ ...f, billing_email: e.target.value }))}
                  placeholder={lead.contact_email ?? 'billing@business.com'}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#5BA3A0]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Delivery Address</label>
              <input
                value={form.delivery_address}
                onChange={e => setForm(f => ({ ...f, delivery_address: e.target.value }))}
                placeholder={lead.address ?? 'Full delivery address'}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#5BA3A0]"
              />
            </div>

            {/* Bottle quantities */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Weekly Bottle Quantities</label>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-xs font-semibold text-gray-700 mb-1">350ml — Still & Sparkling</p>
                  <p className="text-xs text-gray-400 mb-3">Rp 6,000 / bottle</p>
                  <input
                    type="number" min={0}
                    value={form.qty_350ml || ''}
                    onChange={e => setForm(f => ({ ...f, qty_350ml: Math.max(0, parseInt(e.target.value) || 0) }))}
                    placeholder="0"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#5BA3A0] bg-white text-center font-bold text-lg"
                  />
                  {form.qty_350ml > 0 && (
                    <p className="text-xs text-[#5BA3A0] font-medium text-center mt-2">
                      Rp {monthly350.toLocaleString('id-ID')}/month
                    </p>
                  )}
                </div>
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-xs font-semibold text-gray-700 mb-1">750ml — Still & Sparkling</p>
                  <p className="text-xs text-gray-400 mb-3">Rp 10,000 / bottle</p>
                  <input
                    type="number" min={0}
                    value={form.qty_750ml || ''}
                    onChange={e => setForm(f => ({ ...f, qty_750ml: Math.max(0, parseInt(e.target.value) || 0) }))}
                    placeholder="0"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#5BA3A0] bg-white text-center font-bold text-lg"
                  />
                  {form.qty_750ml > 0 && (
                    <p className="text-xs text-[#5BA3A0] font-medium text-center mt-2">
                      Rp {monthly750.toLocaleString('id-ID')}/month
                    </p>
                  )}
                </div>
              </div>
              {monthlyTotal > 0 && (
                <div className="mt-3 bg-[#5BA3A0]/10 rounded-xl px-4 py-3 flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-700">Total Monthly Estimate</span>
                  <span className="text-lg font-bold text-[#5BA3A0]">Rp {monthlyTotal.toLocaleString('id-ID')}</span>
                </div>
              )}
            </div>

            {/* Delivery days */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Preferred Delivery Days</label>
              <div className="flex flex-wrap gap-2">
                {ALL_DAYS.map(day => (
                  <button key={day} onClick={() => toggleDay(day)}
                    className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                      form.preferred_days.includes(day)
                        ? 'bg-[#5BA3A0] text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
                    {day.slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>

            {/* Contract type */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Contract Type</label>
              <div className="flex gap-2">
                {(['monthly', 'quarterly', 'annual'] as const).map(t => (
                  <button key={t} onClick={() => setForm(f => ({ ...f, contract_type: t }))}
                    className={cn('flex-1 py-2 rounded-xl text-xs font-medium border transition-all capitalize',
                      form.contract_type === t
                        ? 'bg-[#1a1a2e] text-white border-[#1a1a2e]'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300')}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Special Requirements / Notes</label>
              <textarea
                value={form.special_notes}
                onChange={e => setForm(f => ({ ...f, special_notes: e.target.value }))}
                rows={3}
                placeholder="Any specific requirements, access instructions, or notes for the proposal…"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#5BA3A0] resize-none"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        {step === 'form' && (
          <div className="px-6 pb-6 flex items-center justify-between gap-3 border-t pt-4">
            <p className="text-xs text-gray-400">PDF will be auto-generated and sent via WhatsApp + Email</p>
            <div className="flex gap-2 flex-shrink-0">
              <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={generateAndSend}
                disabled={form.qty_350ml === 0 && form.qty_750ml === 0}
                className="flex items-center gap-2 px-5 py-2 text-sm text-white font-medium rounded-xl disabled:opacity-40"
                style={{ background: '#5BA3A0' }}>
                <Send className="w-4 h-4" /> Send Proposal
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
