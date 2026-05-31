'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Package, FileText, Truck, RefreshCw, AlertCircle,
  CheckCircle2, Clock, TrendingUp, Droplets, ChevronRight,
  Calendar, MapPin
} from 'lucide-react'
import Link from 'next/link'

// Demo: hardcode a customer_id for the portal (in production this would come from auth)
const DEMO_CUSTOMER_ID = null // null = show aggregate demo data

export default function CustomerDashboardPage() {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    bottlesOut: 0,
    openInvoices: 0,
    openInvoiceTotal: 0,
    nextDelivery: null as string | null,
    lastDelivery: null as string | null,
    activeSubscriptions: 0,
  })
  const [recentDeliveries, setRecentDeliveries] = useState<any[]>([])
  const [openInvoices, setOpenInvoices] = useState<any[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<string>('')

  useEffect(() => {
    loadData()
  }, [selectedCustomer])

  const loadData = async () => {
    setLoading(true)
    const sb = createClient()

    // Load customers for the demo selector
    const { data: custs } = await sb.from('customers').select('id, name, city').eq('active', true).limit(50)
    if (custs && customers.length === 0) setCustomers(custs)

    const custId = selectedCustomer || custs?.[0]?.id
    if (!custId) { setLoading(false); return }
    if (!selectedCustomer && custs?.[0]) setSelectedCustomer(custs[0].id)

    const today = new Date().toISOString().split('T')[0]

    const [deliveriesRes, invoicesRes, bottleRes, subsRes] = await Promise.all([
      sb.from('deliveries').select('*').eq('customer_id', custId).order('delivery_date', { ascending: false }).limit(10),
      sb.from('invoices').select('*').eq('customer_id', custId).in('status', ['sent', 'overdue']).order('due_date', { ascending: true }),
      sb.from('customer_bottle_balance').select('*').eq('customer_id', custId).single(),
      sb.from('customer_subscriptions').select('*').eq('customer_id', custId).eq('status', 'active'),
    ])

    const deliveries = deliveriesRes.data ?? []
    const invoices = invoicesRes.data ?? []
    const bottle = bottleRes.data
    const subs = subsRes.data ?? []

    const upcoming = deliveries.find(d => d.delivery_date >= today)
    const past = deliveries.filter(d => d.delivery_date < today)

    setRecentDeliveries(deliveries.slice(0, 5))
    setOpenInvoices(invoices.slice(0, 3))
    setStats({
      bottlesOut: (bottle?.outstanding_350ml ?? 0) + (bottle?.outstanding_750ml ?? 0),
      openInvoices: invoices.length,
      openInvoiceTotal: invoices.reduce((s: number, i: any) => s + (i.total || 0), 0),
      nextDelivery: upcoming?.delivery_date ?? null,
      lastDelivery: past[0]?.delivery_date ?? null,
      activeSubscriptions: subs.length,
    })
    setLoading(false)
  }

  const fmt = (n: number) => `Rp ${n.toLocaleString('id-ID')}`
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="flex gap-1">
        {[0, 150, 300].map(d => (
          <div key={d} className="w-2.5 h-2.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
        ))}
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Welcome back</h1>
          <p className="text-slate-500 text-sm mt-0.5">Here's your account overview</p>
        </div>
        <select
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white"
          value={selectedCustomer}
          onChange={e => setSelectedCustomer(e.target.value)}
        >
          {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-center gap-2 text-cyan-600 mb-3">
            <Package className="w-5 h-5" />
            <span className="text-xs font-medium uppercase tracking-wide">Bottles Out</span>
          </div>
          <p className="text-3xl font-bold text-slate-800">{stats.bottlesOut}</p>
          <p className="text-xs text-slate-400 mt-1">currently with you</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-center gap-2 text-amber-500 mb-3">
            <FileText className="w-5 h-5" />
            <span className="text-xs font-medium uppercase tracking-wide">Open Invoices</span>
          </div>
          <p className="text-3xl font-bold text-slate-800">{stats.openInvoices}</p>
          <p className="text-xs text-slate-400 mt-1">{fmt(stats.openInvoiceTotal)} outstanding</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-center gap-2 text-emerald-500 mb-3">
            <Truck className="w-5 h-5" />
            <span className="text-xs font-medium uppercase tracking-wide">Next Delivery</span>
          </div>
          <p className="text-lg font-bold text-slate-800">{stats.nextDelivery ? fmtDate(stats.nextDelivery) : '—'}</p>
          <p className="text-xs text-slate-400 mt-1">scheduled</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-center gap-2 text-violet-500 mb-3">
            <RefreshCw className="w-5 h-5" />
            <span className="text-xs font-medium uppercase tracking-wide">Subscriptions</span>
          </div>
          <p className="text-3xl font-bold text-slate-800">{stats.activeSubscriptions}</p>
          <p className="text-xs text-slate-400 mt-1">active standing orders</p>
        </div>
      </div>

      {/* Open Invoices Alert */}
      {stats.openInvoices > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800">You have {stats.openInvoices} unpaid invoice{stats.openInvoices > 1 ? 's' : ''}</p>
            <p className="text-xs text-amber-600 mt-0.5">Total outstanding: {fmt(stats.openInvoiceTotal)}</p>
          </div>
          <Link href="/customer/invoices" className="text-sm font-medium text-amber-700 hover:text-amber-900 flex items-center gap-1">
            Pay now <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Recent Deliveries */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">Recent Deliveries</h2>
            <Link href="/customer/orders" className="text-xs text-cyan-600 hover:text-cyan-700 flex items-center gap-1">
              View all <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y divide-slate-50">
            {recentDeliveries.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">No deliveries yet</p>
            ) : recentDeliveries.map(d => (
              <div key={d.id} className="px-5 py-3 flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  ['delivered','completed'].includes(d.status) ? 'bg-emerald-50' : d.status === 'pending' ? 'bg-amber-50' : 'bg-slate-100'
                }`}>
                  {['delivered','completed'].includes(d.status) ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> :
                   d.status === 'pending' ? <Clock className="w-4 h-4 text-amber-500" /> :
                   <Truck className="w-4 h-4 text-slate-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700">{fmtDate(d.delivery_date)}</p>
                  <p className="text-xs text-slate-400">
                    {d.delivered_350ml > 0 && `${d.delivered_350ml}×350ml`}
                    {d.delivered_350ml > 0 && d.delivered_750ml > 0 && ' + '}
                    {d.delivered_750ml > 0 && `${d.delivered_750ml}×750ml`}
                  </p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  ['delivered','completed'].includes(d.status) ? 'bg-emerald-100 text-emerald-700' :
                  d.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                  d.status === 'in_transit' ? 'bg-cyan-100 text-cyan-700' :
                  'bg-slate-100 text-slate-500'
                }`}>{d.status === 'in_transit' ? 'On the way' : d.status === 'completed' ? 'Delivered' : d.status === 'pending' ? 'Scheduled' : d.status}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Open Invoices List */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">Outstanding Invoices</h2>
            <Link href="/customer/invoices" className="text-xs text-cyan-600 hover:text-cyan-700 flex items-center gap-1">
              View all <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y divide-slate-50">
            {openInvoices.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-300 mx-auto mb-2" />
                <p className="text-sm text-slate-400">All invoices paid — nice!</p>
              </div>
            ) : openInvoices.map(inv => (
              <div key={inv.id} className="px-5 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700">{inv.invoice_number}</p>
                  <p className="text-xs text-slate-400">Due {fmtDate(inv.due_date)}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-slate-800">{fmt(inv.total)}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    inv.status === 'overdue' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'
                  }`}>{inv.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
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
