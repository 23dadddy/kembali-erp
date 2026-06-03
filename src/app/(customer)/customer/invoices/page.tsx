'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getPortalCustomer } from '@/lib/customer-auth'
import { FileText, Download, CheckCircle2, Clock, AlertCircle, Loader2, CreditCard, X } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function CustomerInvoicesPage() {
  const router = useRouter()
  const [customer, setCustomer] = useState<any>(null)
  const [invoices, setInvoices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'unpaid' | 'paid'>('all')
  const [downloading, setDownloading] = useState<string | null>(null)
  const [bankSettings, setBankSettings] = useState({ bank_name: 'BCA', bank_account: '—', bank_holder: 'PT Kembali Air Bali' })
  const [payNotifInv, setPayNotifInv] = useState<any | null>(null)
  const [payForm, setPayForm] = useState({ transfer_date: new Date().toISOString().split('T')[0], bank_name: 'BCA', notes: '' })
  const [paySubmitting, setPaySubmitting] = useState(false)
  const [payDone, setPayDone] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const cust = await getPortalCustomer()
      if (!cust) { router.push('/customer/login'); return }
      setCustomer(cust)
      const sb = createClient()
      const [{ data: invData }, { data: settingsData }] = await Promise.all([
        sb.from('invoices').select('*').eq('customer_id', cust.id).order('created_at', { ascending: false }),
        sb.from('app_settings').select('value').eq('key', 'invoice').single(),
      ])
      setInvoices(invData ?? [])
      if (settingsData?.value) {
        const s = settingsData.value as any
        setBankSettings({ bank_name: s.bank_name ?? 'BCA', bank_account: s.bank_account ?? '—', bank_holder: s.bank_holder ?? 'PT Kembali Air Bali' })
      }
      setLoading(false)
    }
    load()
  }, [router])

  const handleDownload = async (invoice: any) => {
    setDownloading(invoice.id)
    try {
      const { downloadInvoicePDF } = await import('@/lib/pdf')
      downloadInvoicePDF(invoice, customer)
    } catch (e) { console.error(e) }
    setDownloading(null)
  }

  const submitPaymentNotification = async () => {
    if (!payNotifInv || !customer) return
    setPaySubmitting(true)
    const sb = createClient()
    await sb.from('payments').insert({
      customer_id: customer.id,
      invoice_id: payNotifInv.id,
      amount: payNotifInv.total,
      currency: 'IDR',
      method: 'bank_transfer',
      payment_date: payForm.transfer_date,
      status: 'pending_verification',
      notes: `Customer payment notification. Bank: ${payForm.bank_name}. ${payForm.notes}`.trim(),
    })
    setPayDone(payNotifInv.id)
    setPayNotifInv(null)
    setPaySubmitting(false)
  }

  const fmt = (n: number) => `Rp ${n.toLocaleString('id-ID')}`
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  const filtered = invoices.filter(inv => {
    if (filter === 'unpaid') return ['sent', 'overdue', 'draft'].includes(inv.status)
    if (filter === 'paid') return inv.status === 'paid'
    return true
  })

  const totalOutstanding = invoices
    .filter(i => ['sent', 'overdue'].includes(i.status))
    .reduce((s, i) => s + (i.total || 0), 0)

  const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
    draft: { label: 'Draft', color: 'bg-slate-100 text-slate-500', icon: FileText },
    sent: { label: 'Unpaid', color: 'bg-amber-100 text-amber-700', icon: Clock },
    overdue: { label: 'Overdue', color: 'bg-red-100 text-red-600', icon: AlertCircle },
    paid: { label: 'Paid', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
    cancelled: { label: 'Cancelled', color: 'bg-slate-100 text-slate-400', icon: FileText },
  }

  if (loading) return <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Invoices</h1>
        <p className="text-slate-500 text-sm mt-0.5">View and download your invoices</p>
      </div>

      {totalOutstanding > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <AlertCircle className="w-6 h-6 text-amber-600" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-amber-800">Outstanding Balance</p>
            <p className="text-2xl font-bold text-amber-700 mt-0.5">{fmt(totalOutstanding)}</p>
            <p className="text-xs text-amber-600 mt-1">Please contact your account manager to arrange payment</p>
          </div>
        </div>
      )}

      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {(['all', 'unpaid', 'paid'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${filter === f ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {f === 'all' ? `All (${invoices.length})` : f === 'unpaid' ? `Unpaid (${invoices.filter(i => ['sent','overdue'].includes(i.status)).length})` : `Paid (${invoices.filter(i => i.status === 'paid').length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <FileText className="w-8 h-8 mx-auto mb-2 text-slate-200" />
          <p>No invoices found</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Invoice</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide hidden sm:table-cell">Issued</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Due Date</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Amount</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Status</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(inv => {
                const cfg = statusConfig[inv.status] ?? statusConfig.draft
                const StatusIcon = cfg.icon
                return (
                  <tr key={inv.id} className="hover:bg-slate-50">
                    <td className="px-5 py-4">
                      <p className="font-medium text-slate-800">{inv.invoice_number}</p>
                    </td>
                    <td className="px-4 py-4 text-slate-500 hidden sm:table-cell">{inv.issue_date ? fmtDate(inv.issue_date) : '—'}</td>
                    <td className="px-4 py-4 text-slate-600">{inv.due_date ? fmtDate(inv.due_date) : '—'}</td>
                    <td className="px-4 py-4 text-right font-semibold text-slate-800">{fmt(inv.total || 0)}</td>
                    <td className="px-4 py-4 text-center">
                      <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium ${cfg.color}`}>
                        <StatusIcon className="w-3 h-3" />{cfg.label}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleDownload(inv)} disabled={downloading === inv.id}
                          className="flex items-center gap-1 text-xs text-slate-400 hover:text-cyan-600 transition-colors disabled:opacity-50">
                          {downloading === inv.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                          PDF
                        </button>
                        {['sent', 'overdue'].includes(inv.status) && (
                          payDone === inv.id ? (
                            <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                              <CheckCircle2 className="w-3 h-3" /> Notified
                            </span>
                          ) : (
                            <button onClick={() => { setPayNotifInv(inv); setPayForm({ transfer_date: new Date().toISOString().split('T')[0], bank_name: 'BCA', notes: '' }) }}
                              className="flex items-center gap-1 text-xs text-cyan-600 hover:text-cyan-700 font-medium bg-cyan-50 hover:bg-cyan-100 px-2 py-1 rounded-lg transition-colors">
                              <CreditCard className="w-3 h-3" /> I've Paid
                            </button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
        <h3 className="font-semibold text-slate-700 mb-3">Payment Information</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-slate-400 text-xs uppercase tracking-wide mb-1">Bank Transfer</p>
            <p className="text-slate-700 font-medium">{bankSettings.bank_name} — {bankSettings.bank_account}</p>
            <p className="text-slate-500">{bankSettings.bank_holder}</p>
          </div>
          <div>
            <p className="text-slate-400 text-xs uppercase tracking-wide mb-1">Reference</p>
            <p className="text-slate-600">Use your invoice number as payment reference</p>
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-3">Click <strong>"I've Paid"</strong> on an invoice to notify us, or email proof to <a href="mailto:contact@kembaliwater.com" className="text-cyan-600">contact@kembaliwater.com</a></p>
      </div>

      {/* Payment notification modal */}
      {payNotifInv && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-800">Notify Payment</h3>
                <p className="text-xs text-slate-500 mt-0.5">{payNotifInv.invoice_number} · {fmt(payNotifInv.total)}</p>
              </div>
              <button onClick={() => setPayNotifInv(null)} className="text-slate-400 hover:text-slate-600 p-1"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-slate-600">Tell us about your transfer so we can verify and update your account quickly.</p>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Transfer Date</label>
                <input type="date" value={payForm.transfer_date} onChange={e => setPayForm({ ...payForm, transfer_date: e.target.value })}
                  className="border rounded-xl px-3 py-2 text-sm w-full" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Bank Used</label>
                <select value={payForm.bank_name} onChange={e => setPayForm({ ...payForm, bank_name: e.target.value })}
                  className="border rounded-xl px-3 py-2 text-sm w-full">
                  {['BCA', 'BNI', 'BRI', 'Mandiri', 'CIMB', 'Danamon', 'OCBC', 'Other'].map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Notes (optional)</label>
                <input type="text" value={payForm.notes} onChange={e => setPayForm({ ...payForm, notes: e.target.value })}
                  placeholder="e.g. transfer reference number, amount paid..."
                  className="border rounded-xl px-3 py-2 text-sm w-full" />
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setPayNotifInv(null)} className="flex-1 border border-slate-200 rounded-xl py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
                  Cancel
                </button>
                <button onClick={submitPaymentNotification} disabled={paySubmitting}
                  className="flex-1 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded-xl py-2.5 text-sm font-bold flex items-center justify-center gap-2">
                  {paySubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Notify Payment
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
