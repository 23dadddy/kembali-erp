'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { updateInvoiceStatus, createPayment } from '@/lib/db'
import { idr } from '@/lib/format'
import { ChevronLeft, Download, Send, Check, Loader2, FileText, AlertCircle } from 'lucide-react'
import type { Invoice, Customer } from '@/types'
import { useLanguage } from '@/components/providers/language-provider'

export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { t } = useLanguage()
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const load = async () => {
      const sb = createClient()
      const { data } = await sb
        .from('invoices')
        .select('*, items:invoice_items(*), customer:customers(*)')
        .eq('id', id)
        .single()
      if (data) {
        setInvoice(data)
        setCustomer(data.customer)
      }
      setLoading(false)
    }
    load()
  }, [id])

  const handleDownloadPDF = async () => {
    if (!invoice || !customer) return
    const { downloadInvoicePDF } = await import('@/lib/pdf')
    downloadInvoicePDF(invoice, customer)
  }

  const handleMarkSent = async () => {
    if (!invoice) return
    setSaving(true)
    await updateInvoiceStatus(invoice.id, 'sent')
    setInvoice({ ...invoice, status: 'sent' })
    setSaving(false)
  }

  const handleMarkPaid = async () => {
    if (!invoice || !customer) return
    setSaving(true)
    await createPayment({
      customer_id: customer.id,
      invoice_id: invoice.id,
      amount: invoice.total,
      method: 'bank_transfer',
      payment_date: new Date().toISOString().split('T')[0],
      notes: `Payment for ${invoice.invoice_number}`,
    })
    setInvoice({ ...invoice, status: 'paid' })
    setSaving(false)
  }

  if (loading) return <><Topbar title="Invoice" /><div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div></>
  if (!invoice || !customer) return <><Topbar title="Invoice" /><div className="p-6 text-slate-400">{t('inv_not_found')}</div></>

  const STATUS_COLORS: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-600',
    sent: 'bg-blue-100 text-blue-700',
    paid: 'bg-emerald-100 text-emerald-700',
    overdue: 'bg-red-100 text-red-600',
    cancelled: 'bg-slate-100 text-slate-400',
  }

  return (
    <>
      <Topbar title={invoice.invoice_number} />
      <div className="p-6 max-w-4xl space-y-6">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-slate-500 hover:text-slate-800 text-sm">
          <ChevronLeft className="w-4 h-4" /> {t('inv_back')}
        </button>

        {/* Action bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={`text-sm px-3 py-1 rounded-full font-medium ${STATUS_COLORS[invoice.status]}`}>{invoice.status}</span>
            <span className="text-sm text-slate-400">Due {new Date(invoice.due_date).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
            {new Date(invoice.due_date) < new Date() && invoice.status !== 'paid' && (
              <span className="text-xs text-red-500 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{t('inv_overdue')}</span>
            )}
          </div>
          <div className="flex gap-2">
            {invoice.status === 'draft' && (
              <Button variant="outline" onClick={handleMarkSent} disabled={saving}>
                <Send className="w-4 h-4 mr-1.5" /> {t('inv_mark_sent')}
              </Button>
            )}
            {invoice.status !== 'paid' && invoice.status !== 'cancelled' && (
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleMarkPaid} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4 mr-1.5" />{t('inv_mark_paid')}</>}
              </Button>
            )}
            <Button variant="outline" onClick={handleDownloadPDF}>
              <Download className="w-4 h-4 mr-1.5" /> {t('inv_download_pdf')}
            </Button>
          </div>
        </div>

        {/* Invoice preview */}
        <Card>
          <CardContent className="pt-6">
            {/* Header */}
            <div className="flex justify-between items-start mb-8">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-8 h-8 bg-cyan-500 rounded-lg flex items-center justify-center">
                    <FileText className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-800">Kembali Water</p>
                    <p className="text-xs text-slate-400">Premium Glass Bottle Water · Bali</p>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <p className="text-3xl font-black text-slate-800">INVOICE</p>
                <p className="text-slate-500 font-mono text-sm">{invoice.invoice_number}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-8 mb-8">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{t('inv_bill_to')}</p>
                <p className="font-bold text-slate-800">{customer.name}</p>
                <p className="text-sm text-slate-500">{customer.address}</p>
                <p className="text-sm text-slate-500">{customer.city}, Bali</p>
                {customer.contact_phone && <p className="text-sm text-slate-500">{customer.contact_phone}</p>}
                {customer.tax_id && <p className="text-sm text-slate-400">NPWP: {customer.tax_id}</p>}
              </div>
              <div className="bg-slate-50 rounded-xl p-4 space-y-2">
                {[
                  [t('inv_invoice_num'), invoice.invoice_number],
                  [t('inv_issue_date'), new Date(invoice.created_at).toLocaleDateString()],
                  [t('inv_due_date'), new Date(invoice.due_date).toLocaleDateString()],
                  [t('inv_payment_terms'), `${customer.payment_terms_days ?? 30} days`],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between text-sm">
                    <span className="text-slate-400">{k}</span>
                    <span className="font-medium text-slate-700">{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Items */}
            <table className="w-full mb-6">
              <thead>
                <tr className="bg-cyan-500 text-white">
                  <th className="text-left text-xs font-semibold p-3 rounded-tl-lg">{t('inv_description')}</th>
                  <th className="text-center text-xs font-semibold p-3">{t('inv_size')}</th>
                  <th className="text-center text-xs font-semibold p-3">{t('inv_qty')}</th>
                  <th className="text-right text-xs font-semibold p-3">{t('inv_unit_price')}</th>
                  <th className="text-right text-xs font-semibold p-3 rounded-tr-lg">{t('total')}</th>
                </tr>
              </thead>
              <tbody>
                {(invoice.items ?? []).map((item, i) => (
                  <tr key={item.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="text-sm text-slate-700 p-3">{item.description}</td>
                    <td className="text-sm text-slate-500 p-3 text-center">{item.bottle_size ?? '—'}</td>
                    <td className="text-sm text-slate-700 p-3 text-center font-medium">{item.quantity}</td>
                    <td className="text-sm text-slate-500 p-3 text-right">{idr(item.unit_price)}</td>
                    <td className="text-sm font-semibold text-slate-800 p-3 text-right">{idr(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totals */}
            <div className="flex justify-end">
              <div className="w-64 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">{t('inv_subtotal')}</span>
                  <span className="text-slate-700">{idr(Number(invoice.subtotal))}</span>
                </div>
                {Number(invoice.tax) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">{t('inv_tax')}</span>
                    <span className="text-slate-700">{idr(Number(invoice.tax))}</span>
                  </div>
                )}
                <div className="flex justify-between items-center bg-cyan-500 text-white rounded-xl px-4 py-3 mt-2">
                  <span className="font-bold">{t('inv_total_due')}</span>
                  <span className="font-black text-lg">{idr(Number(invoice.total))}</span>
                </div>
              </div>
            </div>

            {/* Notes */}
            {invoice.notes && (
              <div className="mt-6 bg-slate-50 rounded-xl p-4">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">{t('inv_notes_label')}</p>
                <p className="text-sm text-slate-600">{invoice.notes}</p>
              </div>
            )}

            {/* Payment info */}
            <div className="mt-6 bg-emerald-50 border border-emerald-100 rounded-xl p-4">
              <p className="text-xs font-semibold text-emerald-700 mb-1">{t('inv_payment_instructions')}</p>
              <p className="text-sm text-slate-600">Bank Transfer · BCA · Account: 123-456-7890 · PT Kembali Air Bali</p>
              <p className="text-xs text-slate-400 mt-1">{t('inv_include_ref')} <strong>{invoice.invoice_number}</strong> {t('inv_as_ref')}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
