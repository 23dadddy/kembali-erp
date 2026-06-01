'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getPortalCustomer } from '@/lib/customer-auth'
import {
  Package, FileText, Truck, RefreshCw, AlertCircle,
  CheckCircle2, Clock, Droplets, ChevronRight,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function CustomerDashboardPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [customerName, setCustomerName] = useState('')
  const [stats, setStats] = useState({
    bottlesOut: 0, openInvoices: 0, openInvoiceTotal: 0,
    nextDelivery: null as string | null, activeSubscriptions: 0,
  })
  const [recentDeliveries, setRecentDeliveries] = useState<any[]>([])
  const [openInvoices, setOpenInvoices] = useState<any[]>([])

  useEffect(() => {
    const load = async () => {
      const customer = await getPortalCustomer()
      if (!customer) { router.push('/customer/login'); return }
      setCustomerName(customer.name)

      const sb = createClient()
      const today = new Date().toISOString().split('T')[0]

      const [deliveriesRes, invoicesRes, bottleRes, subsRes] = await Promise.all([
        sb.from('deliveries').select('*').eq('customer_id', customer.id).order('delivery_date', { ascending: false }).limit(10),
        sb.from('invoices').select('*').eq('customer_id', customer.id).in('status', ['sent', 'overdue']).order('due_date', { ascending: true }),
        sb.from('customer_bottle_balance').select('*').eq('customer_id', customer.id).single(),
        sb.from('customer_subscriptions').select('*').eq('customer_id', customer.id).eq('status', 'active'),
      ])

      const deliveries = deliveriesRes.data ?? []
      const invoices = invoicesRes.data ?? []
      const bottle = bottleRes.data
      const subs = subsRes.data ?? []
      const upcoming = deliveries.find((d: any) => d.delivery_date >= today)

      setRecentDeliveries(deliveries.slice(0, 5))
      setOpenInvoices(invoices.slice(0, 3))
      setStats({
        bottlesOut: (bottle?.outstanding_350ml ?? 0) + (bottle?.outstanding_750ml ?? 0),
        openInvoices: invoices.length,
        openInvoiceTotal: invoices.reduce((s: number, i: any) => s + (i.total || 0), 0),
        nextDelivery: upcoming?.delivery_date ?? null,
        activeSubscriptions: subs.length,
      })
      setLoading(false)
    }
    load()
  }, [router])

  const fmt = (n: number) => `Rp ${n.toLocaleString('id-ID')}`
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="flex gap-1">
        {[0, 150, 300].map(d => <div key={d} className="w-2.5 h-2.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Welcome back, {customerName.split(' ')[0]}</h1>
        <p className="text-slate-500 text-sm mt-0.5">Here's your account overview</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Bottles Out', value: stats.bottlesOut, sub: 'currently with you', icon: Package, color: 'text-cyan-600' },
          { label: 'Open Invoices', value: stats.openInvoices, sub: fmt(stats.openInvoiceTotal) + ' outstanding', icon: FileText, color: 'text-amber-500' },
          { label: 'Next Delivery', value: stats.nextDelivery ? fmtDate(stats.nextDelivery) : '—', sub: 'scheduled', icon: Truck, color: 'text-emerald-500' },
          { label: 'Subscriptions', value: stats.activeSubscriptions, sub: 'active standing orders', icon: RefreshCw, color: 'text-violet-500' },
        ].map(({ label, value, sub, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <div className={`flex items-center gap-2 ${color} mb-3`}>
              <Icon className="w-5 h-5" />
              <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
            </div>
            <p className="text-2xl font-bold text-slate-800 truncate">{value}</p>
            <p className="text-xs text-slate-400 mt-1">{sub}</p>
          </div>
        ))}
      </div>

      {stats.openInvoices > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800">You have {stats.openInvoices} unpaid invoice{stats.openInvoices > 1 ? 's' : ''}</p>
            <p className="text-xs text-amber-600 mt-0.5">Total outstanding: {fmt(stats.openInvoiceTotal)}</p>
          </div>
          <Link href="/customer/invoices" className="text-sm font-medium text-amber-700 hover:text-amber-900 flex items-center gap-1">
            View <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">Recent Deliveries</h2>
            <Link href="/customer/orders" className="text-xs text-cyan-600 hover:text-cyan-700 flex items-center gap-1">View all <ChevronRight className="w-3 h-3" /></Link>
          </div>
          <div className="divide-y divide-slate-50">
            {recentDeliveries.length === 0
              ? <p className="text-sm text-slate-400 text-center py-8">No deliveries yet</p>
              : recentDeliveries.map((d: any) => (
                <div key={d.id} className="px-5 py-3 flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${d.status === 'completed' ? 'bg-emerald-50' : d.status === 'pending' ? 'bg-amber-50' : 'bg-slate-100'}`}>
                    {d.status === 'completed' ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : d.status === 'pending' ? <Clock className="w-4 h-4 text-amber-500" /> : <Truck className="w-4 h-4 text-slate-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700">{fmtDate(d.delivery_date)}</p>
                    <p className="text-xs text-slate-400">
                      {d.delivered_350ml > 0 && `${d.delivered_350ml}×350ml`}
                      {d.delivered_350ml > 0 && d.delivered_750ml > 0 && ' + '}
                      {d.delivered_750ml > 0 && `${d.delivered_750ml}×750ml`}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${d.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : d.status === 'in_transit' ? 'bg-cyan-100 text-cyan-700' : 'bg-amber-100 text-amber-700'}`}>
                    {d.status === 'in_transit' ? 'On the way' : d.status === 'completed' ? 'Delivered' : 'Scheduled'}
                  </span>
                </div>
              ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">Outstanding Invoices</h2>
            <Link href="/customer/invoices" className="text-xs text-cyan-600 hover:text-cyan-700 flex items-center gap-1">View all <ChevronRight className="w-3 h-3" /></Link>
          </div>
          <div className="divide-y divide-slate-50">
            {openInvoices.length === 0
              ? <div className="px-5 py-8 text-center"><CheckCircle2 className="w-8 h-8 text-emerald-300 mx-auto mb-2" /><p className="text-sm text-slate-400">All invoices paid!</p></div>
              : openInvoices.map((inv: any) => (
                <div key={inv.id} className="px-5 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700">{inv.invoice_number}</p>
                    <p className="text-xs text-slate-400">Due {fmtDate(inv.due_date)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-800">{fmt(inv.total)}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${inv.status === 'overdue' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'}`}>{inv.status}</span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Place Order', href: '/customer/orders', icon: Package, color: 'bg-cyan-50 text-cyan-700 border-cyan-100' },
          { label: 'View Bottles', href: '/customer/bottles', icon: Droplets, color: 'bg-violet-50 text-violet-700 border-violet-100' },
          { label: 'Pay Invoice', href: '/customer/invoices', icon: FileText, color: 'bg-amber-50 text-amber-700 border-amber-100' },
          { label: 'Get Support', href: '/customer/support', icon: AlertCircle, color: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
        ].map(({ label, href, icon: Icon, color }) => (
          <Link key={href} href={href} className={`border rounded-2xl p-4 flex items-center gap-3 hover:shadow-md transition-shadow ${color}`}>
            <Icon className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm font-medium">{label}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
