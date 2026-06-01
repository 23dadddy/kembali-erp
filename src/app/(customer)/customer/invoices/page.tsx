'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getPortalCustomer } from '@/lib/customer-auth'
import { FileText, Download, CheckCircle2, Clock, AlertCircle, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function CustomerInvoicesPage() {
  const router = useRouter()
  const [customer, setCustomer] = useState<any>(null)
  const [invoices, setInvoices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'unpaid' | 'paid'>('all')
  const [downloading, setDownloading] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const cust = await getPortalCustomer()
      if (!cust) { router.push('/customer/login'); return }
      setCustomer(cust)
      const sb = createClient()
      const { data } = await sb.from('invoices').select('*').eq('customer_id', cust.id).order('created_at', { ascending: false })
      setInvoices(data ?? [])
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
                      <button onClick={() => handleDownload(inv)} disabled={downloading === inv.id}
                        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-cyan-600 transition-colors disabled:opacity-50">
                        {downloading === inv.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                        PDF
                      </button>
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
            <p className="text-slate-700 font-medium">BCA — contact your account manager for details</p>
            <p className="text-slate-500">PT Kembali Air Bali</p>
          </div>
          <div>
            <p className="text-slate-400 text-xs uppercase tracking-wide mb-1">Reference</p>
            <p className="text-slate-600">Use your invoice number as payment reference</p>
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-3">After payment, send proof to <a href="mailto:contact@kembaliwater.com" className="text-cyan-600">contact@kembaliwater.com</a></p>
      </div>
    </div>
  )
}
