export const dynamic = 'force-dynamic'
export const revalidate = 0

import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Package, Truck, Users, FileText, TrendingUp, AlertCircle,
  CheckCircle2, Clock, DollarSign, Target, Wrench, AlertTriangle,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import type { BottleInventory } from '@/types'
import Link from 'next/link'

function formatIDR(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)
}

export default async function DashboardPage() {
  const sb = await createClient()
  const today = new Date().toISOString().split('T')[0]

  // Rolling 30-day range for revenue
  const now = new Date()
  const thirtyDaysAgo = new Date(now); thirtyDaysAgo.setDate(now.getDate() - 30)
  const monthStart = thirtyDaysAgo.toISOString().split('T')[0]
  const monthEnd = today

  const currentPeriod = now.toISOString().slice(0, 7)

  const [
    customersRes, deliveriesRes, inventoryRes, invoicesRes, todayDeliveriesRes,
    overdueRes, monthInvoicesRes, vehiclesRes, staffRes, bottleAlertRes, kpiRes,
    monthDeliveriesRes, newCustomersRes,
  ] = await Promise.all([
    sb.from('customers').select('*', { count: 'exact', head: true }).eq('active', true),
    sb.from('deliveries').select('*', { count: 'exact', head: true }).eq('delivery_date', today),
    sb.from('bottle_inventory').select('*'),
    sb.from('invoices').select('*', { count: 'exact', head: true }).in('status', ['sent', 'overdue']),
    sb.from('deliveries').select('*, customer:customers(name, city)').eq('delivery_date', today).order('created_at').limit(8),
    sb.from('invoices').select('total, due_date, customer:customers(name)').eq('status', 'overdue').order('due_date'),
    sb.from('payments').select('amount').gte('payment_date', monthStart).lte('payment_date', monthEnd),
    sb.from('vehicles').select('status, registration_expiry, insurance_expiry, name, plate_number'),
    sb.from('staff').select('role, active, license_expiry, name').eq('active', true),
    sb.from('customer_bottle_balance').select('*').gt('chargeable_lost_350ml', 0).limit(5),
    sb.from('kpi_targets').select('*').eq('period', currentPeriod),
    sb.from('deliveries').select('*', { count: 'exact', head: true }).gte('delivery_date', monthStart).lte('delivery_date', monthEnd).eq('status', 'completed'),
    sb.from('customers').select('*', { count: 'exact', head: true }).gte('created_at', `${monthStart}-01`),
  ])

  const inventory = (inventoryRes.data ?? []) as BottleInventory[]
  const bottlesAtCustomer = inventory.filter(r => r.status === 'at_customer').reduce((s, r) => s + r.quantity, 0)
  const bottlesFilled = inventory.filter(r => r.status === 'filled').reduce((s, r) => s + r.quantity, 0)

  const monthRevenue = (monthInvoicesRes.data ?? []).reduce((s: number, i: any) => s + Number(i.amount), 0)
  const overdueTotal = (overdueRes.data ?? []).reduce((s: number, i: any) => s + Number(i.total), 0)

  const vehicles = (vehiclesRes.data ?? []) as any[]
  const activeVehicles = vehicles.filter(v => v.status === 'active').length
  const maintVehicles = vehicles.filter(v => v.status === 'maintenance').length

  const staff = (staffRes.data ?? []) as any[]
  const drivers = staff.filter(s => s.role === 'driver').length

  const thirtyDays = new Date(); thirtyDays.setDate(thirtyDays.getDate() + 30)
  const expiringDocs = vehicles.filter(v =>
    (v.registration_expiry && new Date(v.registration_expiry) < thirtyDays) ||
    (v.insurance_expiry && new Date(v.insurance_expiry) < thirtyDays)
  )
  const expiringLicenses = staff.filter(s => s.role === 'driver' && s.license_expiry && new Date(s.license_expiry) < thirtyDays)

  const bottleAlerts = (bottleAlertRes.data ?? []) as any[]
  const kpiTargets: Record<string, number> = {}
  for (const k of (kpiRes.data ?? [])) kpiTargets[k.metric] = Number(k.target)
  const monthDeliveries = monthDeliveriesRes.count ?? 0
  const newCustomers = newCustomersRes.count ?? 0

  // Build inventory map
  const invMap: Record<string, { qty_350: number; qty_750: number }> = {}
  for (const row of inventory) {
    if (!invMap[row.status]) invMap[row.status] = { qty_350: 0, qty_750: 0 }
    if (row.bottle_size === '350ml') invMap[row.status].qty_350 = row.quantity
    else invMap[row.status].qty_750 = row.quantity
  }

  const todayDeliveries = todayDeliveriesRes.data ?? []
  const completedToday = todayDeliveries.filter((d: any) => d.status === 'completed').length
  const completionRate = todayDeliveries.length > 0 ? Math.round((completedToday / todayDeliveries.length) * 100) : 0

  return (
    <>
      <Topbar title="Executive Dashboard" />
      <div className="p-6 space-y-6">

        {/* Alerts bar */}
        {(expiringDocs.length > 0 || expiringLicenses.length > 0 || bottleAlerts.length > 0) && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-1">
            <p className="text-sm font-semibold text-amber-800 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" />Attention Required</p>
            {expiringDocs.map((v: any) => (
              <p key={v.plate_number} className="text-xs text-amber-700">
                🚗 {v.name} ({v.plate_number}) — document expiring soon
              </p>
            ))}
            {expiringLicenses.map((s: any) => (
              <p key={s.name} className="text-xs text-amber-700">🪪 Driver {s.name} — license expiring {new Date(s.license_expiry).toLocaleDateString()}</p>
            ))}
            {bottleAlerts.map((b: any) => (
              <p key={b.customer_id} className="text-xs text-amber-700">
                📦 {b.customer_name} — {b.chargeable_lost_350ml + b.chargeable_lost_750ml} chargeable lost bottles
              </p>
            ))}
          </div>
        )}

        {/* Primary KPIs */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {[
            { label: 'Active Customers', value: customersRes.count ?? 0, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50', href: '/customers' },
            { label: "Today's Deliveries", value: `${completedToday}/${deliveriesRes.count ?? 0}`, icon: Truck, color: 'text-cyan-600', bg: 'bg-cyan-50', href: '/trakops' },
            { label: 'Bottles in Circulation', value: bottlesAtCustomer, icon: Package, color: 'text-emerald-600', bg: 'bg-emerald-50', href: '/inventory' },
            { label: 'Unpaid Invoices', value: invoicesRes.count ?? 0, icon: FileText, color: 'text-orange-600', bg: 'bg-orange-50', href: '/invoices' },
          ].map(({ label, value, icon: Icon, color, bg, href }) => (
            <Link key={label} href={href}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-500">{label}</p>
                      <p className="text-3xl font-bold mt-1">{value}</p>
                    </div>
                    <div className={`${bg} p-3 rounded-xl`}>
                      <Icon className={`w-6 h-6 ${color}`} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {/* KPI Targets vs Actuals */}
        {Object.keys(kpiTargets).length > 0 && (
          <div className="bg-white rounded-xl border p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2"><Target className="w-4 h-4 text-cyan-600" />Monthly Targets — {currentPeriod}</h3>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              {[
                { metric: 'revenue', label: 'Revenue', actual: monthRevenue, format: (n: number) => formatIDR(n) },
                { metric: 'deliveries', label: 'Deliveries', actual: monthDeliveries, format: (n: number) => n.toString() },
                { metric: 'new_customers', label: 'New Customers', actual: newCustomers, format: (n: number) => n.toString() },
              ].filter(k => kpiTargets[k.metric]).map(({ metric, label, actual, format }) => {
                const target = kpiTargets[metric]
                const pct = target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : 0
                const color = pct >= 100 ? 'bg-emerald-500' : pct >= 70 ? 'bg-amber-400' : 'bg-red-400'
                return (
                  <div key={metric} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">{label}</span>
                      <span className="font-semibold text-slate-700">{pct}%</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>{format(actual)}</span>
                      <span>Target: {format(target)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Revenue + Overdue */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {[
            { label: 'Revenue (30 days)', value: formatIDR(monthRevenue), icon: DollarSign, color: 'text-emerald-700', bg: 'bg-emerald-50' },
            { label: 'Overdue AR', value: formatIDR(overdueTotal), icon: AlertCircle, color: overdueTotal > 0 ? 'text-red-600' : 'text-slate-400', bg: overdueTotal > 0 ? 'bg-red-50' : 'bg-slate-50' },
            { label: 'Active Vehicles', value: `${activeVehicles} (${maintVehicles} in maint.)`, icon: Wrench, color: 'text-slate-700', bg: 'bg-slate-50' },
            { label: 'Drivers on Team', value: drivers, icon: Target, color: 'text-cyan-700', bg: 'bg-cyan-50' },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <Card key={label}>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-500">{label}</p>
                    <p className="text-base font-bold mt-0.5">{value}</p>
                  </div>
                  <div className={`${bg} p-2.5 rounded-xl`}>
                    <Icon className={`w-5 h-5 ${color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Bottle Lifecycle */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Package className="w-4 h-4" /> Bottle Lifecycle
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {[
                { status: 'filled', label: 'Filled & Ready', color: 'bg-emerald-500' },
                { status: 'at_customer', label: 'At Customers', color: 'bg-blue-500' },
                { status: 'dirty', label: 'Dirty (Collected)', color: 'bg-amber-500' },
                { status: 'cleaning', label: 'In Cleaning', color: 'bg-purple-500' },
                { status: 'clean_empty', label: 'Clean & Empty', color: 'bg-slate-300' },
                { status: 'damaged', label: 'Damaged', color: 'bg-red-400' },
              ].map(({ status, label, color }) => {
                const row = invMap[status] ?? { qty_350: 0, qty_750: 0 }
                const total = row.qty_350 + row.qty_750
                return (
                  <div key={status} className="flex items-center gap-3 text-sm">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${color}`} />
                    <span className="flex-1 text-slate-600">{label}</span>
                    <div className="flex gap-2 text-xs text-slate-500">
                      <span>{row.qty_350}×350</span>
                      <span>{row.qty_750}×750</span>
                    </div>
                    <span className="font-semibold text-slate-700 w-8 text-right">{total}</span>
                  </div>
                )
              })}
              <div className="border-t pt-2 text-xs text-slate-400 flex items-center justify-between">
                <span>Ready to deliver</span>
                <span className="font-semibold text-slate-600">{bottlesFilled}</span>
              </div>
            </CardContent>
          </Card>

          {/* Today's deliveries */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2"><Truck className="w-4 h-4" />Today's Deliveries</CardTitle>
                {todayDeliveries.length > 0 && (
                  <span className="text-xs text-slate-400">{completionRate}% done</span>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {todayDeliveries.length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-sm">
                  <Truck className="w-6 h-6 mx-auto mb-2 text-slate-200" />
                  No deliveries today
                  <p className="text-xs mt-1"><Link href="/trakops" className="text-cyan-600 hover:underline">Go to TrakOps →</Link></p>
                </div>
              ) : (
                <div className="space-y-2">
                  {todayDeliveries.map((d: any) => (
                    <div key={d.id} className="flex items-center gap-2 text-sm">
                      {d.status === 'completed' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" /> :
                       d.status === 'in_transit' ? <Truck className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" /> :
                       d.status === 'failed' ? <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" /> :
                       <Clock className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />}
                      <span className="flex-1 truncate text-slate-700">{d.customer?.name}</span>
                      <span className="text-xs text-slate-400">{d.delivered_350ml > 0 ? `${d.delivered_350ml}×350` : ''}{d.delivered_750ml > 0 ? ` ${d.delivered_750ml}×750` : ''}</span>
                    </div>
                  ))}
                  {completionRate === 100 && (
                    <div className="mt-2 text-xs text-emerald-600 bg-emerald-50 rounded-lg p-2 text-center">✓ All deliveries complete!</div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Overdue invoices */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2"><AlertCircle className="w-4 h-4 text-red-400" />Overdue Invoices</CardTitle>
            </CardHeader>
            <CardContent>
              {(overdueRes.data ?? []).length === 0 ? (
                <div className="text-center py-6 text-emerald-600 text-sm">
                  <CheckCircle2 className="w-6 h-6 mx-auto mb-2" />
                  All invoices current!
                </div>
              ) : (
                <div className="space-y-2">
                  {(overdueRes.data ?? []).slice(0, 6).map((inv: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                      <span className="flex-1 truncate text-slate-700">{inv.customer?.name}</span>
                      <span className="font-medium text-red-600 text-xs">{formatIDR(Number(inv.total))}</span>
                    </div>
                  ))}
                  {(overdueRes.data ?? []).length > 6 && (
                    <p className="text-xs text-slate-400 text-center">+{(overdueRes.data ?? []).length - 6} more</p>
                  )}
                  <div className="border-t pt-2 flex justify-between text-xs font-semibold">
                    <span className="text-slate-500">Total overdue</span>
                    <span className="text-red-600">{formatIDR(overdueTotal)}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Links */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Bulk Invoice', desc: 'Generate all monthly invoices', href: '/invoices/bulk', icon: FileText },
            { label: 'Import Customers', desc: 'Upload CSV customer list', href: '/customers/import', icon: Users },
            { label: 'CRM Pipeline', desc: 'View sales leads', href: '/crm', icon: Target },
            { label: 'Fleet Status', desc: 'Vehicles & maintenance', href: '/fleet', icon: Wrench },
          ].map(({ label, desc, href, icon: Icon }) => (
            <Link key={href} href={href}>
              <div className="border border-slate-200 rounded-xl p-4 hover:border-cyan-300 hover:bg-cyan-50/30 transition-colors cursor-pointer">
                <Icon className="w-5 h-5 text-slate-400 mb-2" />
                <p className="text-sm font-semibold text-slate-700">{label}</p>
                <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </>
  )
}
