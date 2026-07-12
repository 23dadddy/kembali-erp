/**
 * Executive dashboard — growth & board metrics.
 * Server component: MRR, partner growth, sales funnel conversion,
 * pipeline value, AR health, bottles in field, top areas.
 */

import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import {
  TrendingUp, Users, Target, DollarSign, Package, AlertCircle, MapPin, Droplets,
} from 'lucide-react'

export const dynamic = 'force-dynamic'

function idr(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)
}

export default async function ExecutivePage() {
  const sb = await createClient()
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0]

  const [
    { data: subs },
    { count: activePartners },
    { count: newPartnersThisMonth },
    { data: leads },
    { data: overdue },
    { data: inventory },
    { data: monthPayments },
    { data: prevMonthPayments },
    { data: customers },
  ] = await Promise.all([
    sb.from('customer_subscriptions').select('qty_350ml, qty_750ml').eq('status', 'active'),
    sb.from('customers').select('*', { count: 'exact', head: true }).eq('active', true),
    sb.from('customers').select('*', { count: 'exact', head: true }).eq('active', true).gte('created_at', monthStart),
    sb.from('sales_leads').select('stage, estimated_value, area'),
    sb.from('invoices').select('total').eq('status', 'overdue'),
    sb.from('bottle_inventory').select('*'),
    sb.from('payments').select('amount').gte('payment_date', monthStart),
    sb.from('payments').select('amount').gte('payment_date', prevMonthStart).lt('payment_date', monthStart),
    sb.from('customers').select('city').eq('active', true),
  ])

  // MRR from active subscriptions (weekly qty × 4 weeks)
  const mrr = (subs ?? []).reduce((s, x) => s + ((x.qty_350ml ?? 0) * 6000 + (x.qty_750ml ?? 0) * 10000) * 4, 0)

  // Funnel
  const allLeads = leads ?? []
  const totalLeads = allLeads.length
  const contacted = allLeads.filter(l => !['prospect'].includes(l.stage)).length
  const interested = allLeads.filter(l => ['interested', 'proposal', 'negotiation'].includes(l.stage)).length
  const won = allLeads.filter(l => l.stage === 'closed_won').length
  const conversionRate = totalLeads ? ((won / totalLeads) * 100).toFixed(1) : '0'
  const pipelineValue = allLeads
    .filter(l => ['interested', 'proposal', 'negotiation'].includes(l.stage))
    .reduce((s, l) => s + Number(l.estimated_value ?? 0), 0)

  // AR + revenue
  const overdueAR = (overdue ?? []).reduce((s, i) => s + Number(i.total), 0)
  const revenue = (monthPayments ?? []).reduce((s, p) => s + Number(p.amount), 0)
  const prevRevenue = (prevMonthPayments ?? []).reduce((s, p) => s + Number(p.amount), 0)
  const revenueGrowth = prevRevenue ? (((revenue - prevRevenue) / prevRevenue) * 100).toFixed(0) : null

  // Bottles
  const inField = (inventory ?? []).filter(i => i.status === 'at_customer').reduce((s, i) => s + (i.quantity ?? 0), 0)
  const inWarehouse = (inventory ?? []).filter(i => ['filled', 'clean'].includes(i.status)).reduce((s, i) => s + (i.quantity ?? 0), 0)

  // Top areas by partner count
  const areaCounts: Record<string, number> = {}
  for (const c of (customers ?? [])) {
    const city = c.city ?? 'Unknown'
    areaCounts[city] = (areaCounts[city] ?? 0) + 1
  }
  const topAreas = Object.entries(areaCounts).sort((a, b) => b[1] - a[1]).slice(0, 6)

  const kpis = [
    { label: 'Monthly Recurring Revenue', value: idr(mrr), sub: 'from active subscriptions', icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Revenue This Month', value: idr(revenue), sub: revenueGrowth != null ? `${Number(revenueGrowth) >= 0 ? '+' : ''}${revenueGrowth}% vs last month` : 'collected payments', icon: DollarSign, color: 'text-cyan-600', bg: 'bg-cyan-50' },
    { label: 'Active Partners', value: String(activePartners ?? 0), sub: `+${newPartnersThisMonth ?? 0} this month`, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Lead Conversion', value: `${conversionRate}%`, sub: `${won} won of ${totalLeads} leads`, icon: Target, color: 'text-violet-600', bg: 'bg-violet-50' },
    { label: 'Pipeline Value', value: idr(pipelineValue), sub: `${interested} leads in play`, icon: TrendingUp, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Overdue AR', value: idr(overdueAR), sub: `${(overdue ?? []).length} invoices`, icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50' },
    { label: 'Bottles In Field', value: String(inField), sub: `${inWarehouse} ready in warehouse`, icon: Package, color: 'text-teal-600', bg: 'bg-teal-50' },
    { label: 'Plastic Bottles Saved', value: String(inField * 12), sub: 'estimated monthly equivalent', icon: Droplets, color: 'text-sky-600', bg: 'bg-sky-50' },
  ]

  const funnel = [
    { label: 'Total Leads', value: totalLeads, pct: 100 },
    { label: 'Contacted', value: contacted, pct: totalLeads ? (contacted / totalLeads) * 100 : 0 },
    { label: 'Interested / Proposal', value: interested, pct: totalLeads ? (interested / totalLeads) * 100 : 0 },
    { label: 'Closed Won', value: won, pct: totalLeads ? (won / totalLeads) * 100 : 0 },
  ]

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Executive Overview</h1>
        <p className="text-sm text-slate-500 mt-1">Growth, revenue, and pipeline health at a glance</p>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-slate-200 p-5">
            <div className={`w-9 h-9 rounded-lg ${k.bg} flex items-center justify-center mb-3`}>
              <k.icon className={`w-5 h-5 ${k.color}`} />
            </div>
            <p className="text-2xl font-bold text-slate-800 leading-tight">{k.value}</p>
            <p className="text-sm font-medium text-slate-600 mt-1">{k.label}</p>
            <p className="text-xs text-slate-400 mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid xl:grid-cols-2 gap-6">
        {/* Sales funnel */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <Target className="w-4 h-4 text-violet-500" /> Sales Funnel
          </h2>
          <div className="space-y-3">
            {funnel.map(f => (
              <div key={f.label}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-600">{f.label}</span>
                  <span className="font-semibold text-slate-800">{f.value}</span>
                </div>
                <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-cyan-500 to-violet-500 rounded-full" style={{ width: `${Math.max(f.pct, 2)}%` }} />
                </div>
              </div>
            ))}
          </div>
          <Link href="/sales/leads" className="text-xs text-cyan-600 font-medium mt-4 inline-block">View pipeline →</Link>
        </div>

        {/* Top areas */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-cyan-500" /> Partners by Area
          </h2>
          <div className="space-y-3">
            {topAreas.length === 0 && <p className="text-sm text-slate-400">No active partners yet</p>}
            {topAreas.map(([area, count]) => {
              const max = topAreas[0]?.[1] ?? 1
              return (
                <div key={area}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-600">{area}</span>
                    <span className="font-semibold text-slate-800">{count}</span>
                  </div>
                  <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-teal-500 rounded-full" style={{ width: `${(count / max) * 100}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
          <Link href="/customers" className="text-xs text-cyan-600 font-medium mt-4 inline-block">View partners →</Link>
        </div>
      </div>
    </div>
  )
}
