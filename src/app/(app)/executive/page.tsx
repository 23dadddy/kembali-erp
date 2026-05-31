import { createClient } from '@/lib/supabase/server'
import { Topbar } from '@/components/layout/topbar'
import {
  TrendingUp, TrendingDown, Users, Truck, Package, DollarSign,
  AlertTriangle, CheckCircle2, BarChart3, Target, Zap, ArrowUpRight
} from 'lucide-react'

export default async function ExecutiveDashboardPage() {
  const sb = await createClient()
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]
  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString().split('T')[0]
  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0).toISOString().split('T')[0]
  const yearStart = new Date(today.getFullYear(), 0, 1).toISOString().split('T')[0]

  const [
    customersRes, delivThisMonthRes, delivLastMonthRes, delivTodayRes,
    invoicesRes, overdueRes, pricingRes, balancesRes, staffRes, vehiclesRes,
    delivYearRes, subscriptionsRes,
  ] = await Promise.all([
    sb.from('customers').select('id, type, tier, city, created_at').eq('active', true),
    sb.from('deliveries').select('delivered_350ml, delivered_750ml, collected_350ml, collected_750ml, status').gte('delivery_date', monthStart),
    sb.from('deliveries').select('delivered_350ml, delivered_750ml, status').gte('delivery_date', lastMonthStart).lte('delivery_date', lastMonthEnd),
    sb.from('deliveries').select('id, status, customer:customers(name)').eq('delivery_date', todayStr),
    sb.from('invoices').select('total, status, created_at').gte('created_at', `${monthStart}T00:00:00`),
    sb.from('invoices').select('total, due_date').eq('status', 'overdue'),
    sb.from('pricing').select('*').eq('active', true),
    sb.from('customer_bottle_balance').select('chargeable_lost_350ml, chargeable_lost_750ml, outstanding_350ml, outstanding_750ml, is_chargeable'),
    sb.from('staff').select('id, role, active').eq('active', true),
    sb.from('vehicles').select('id, status'),
    sb.from('deliveries').select('delivery_date, delivered_350ml, delivered_750ml').gte('delivery_date', yearStart).eq('status', 'completed'),
    sb.from('customer_subscriptions').select('id').eq('status', 'active'),
  ])

  const customers = customersRes.data ?? []
  const delivThisMonth = delivThisMonthRes.data ?? []
  const delivLastMonth = delivLastMonthRes.data ?? []
  const delivToday = delivTodayRes.data ?? []
  const invoices = invoicesRes.data ?? []
  const overdue = overdueRes.data ?? []
  const pricing = pricingRes.data ?? []
  const balances = balancesRes.data ?? []
  const staff = staffRes.data ?? []
  const vehicles = vehiclesRes.data ?? []
  const delivYear = delivYearRes.data ?? []
  const subscriptions = subscriptionsRes.data ?? []

  const p350 = (pricing.find((p: any) => p.bottle_size === '350ml')?.price_per_unit ?? 6000) as number
  const p750 = (pricing.find((p: any) => p.bottle_size === '750ml')?.price_per_unit ?? 10000) as number

  // Revenue calcs
  const revenueThisMonth = delivThisMonth.filter((d: any) => d.status === 'completed')
    .reduce((s: number, d: any) => s + (d.delivered_350ml ?? 0) * p350 + (d.delivered_750ml ?? 0) * p750, 0)
  const revenueLastMonth = delivLastMonth.filter((d: any) => d.status === 'completed')
    .reduce((s: number, d: any) => s + (d.delivered_350ml ?? 0) * p350 + (d.delivered_750ml ?? 0) * p750, 0)
  const revGrowth = revenueLastMonth > 0 ? ((revenueThisMonth - revenueLastMonth) / revenueLastMonth * 100) : 0

  // Delivery stats
  const completedToday = delivToday.filter((d: any) => d.status === 'completed' || d.status === 'delivered').length
  const pendingToday = delivToday.filter((d: any) => d.status === 'pending' || d.status === 'in_progress').length
  const completionRate = delivToday.length > 0 ? Math.round((completedToday / delivToday.length) * 100) : 0

  // Bottle stats
  const totalOutstanding = balances.reduce((s: number, b: any) => s + (b.outstanding_350ml ?? 0) + (b.outstanding_750ml ?? 0), 0)
  const chargeableCustomers = balances.filter((b: any) => b.is_chargeable).length

  // Invoices
  const overdueValue = overdue.reduce((s: number, i: any) => s + (i.total ?? 0), 0)
  const paidThisMonth = invoices.filter((i: any) => i.status === 'paid').reduce((s: number, i: any) => s + (i.total ?? 0), 0)

  // Monthly trend (last 6 months)
  const monthlyData: Record<string, { rev: number; deliveries: number }> = {}
  for (let i = 5; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
    const key = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
    monthlyData[key] = { rev: 0, deliveries: 0 }
  }
  for (const d of delivYear) {
    const date = new Date((d as any).delivery_date)
    const key = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
    if (monthlyData[key]) {
      monthlyData[key].rev += ((d as any).delivered_350ml ?? 0) * p350 + ((d as any).delivered_750ml ?? 0) * p750
      monthlyData[key].deliveries++
    }
  }
  const monthLabels = Object.keys(monthlyData)
  const maxRev = Math.max(...Object.values(monthlyData).map(m => m.rev), 1)

  // Customer breakdown
  const byType: Record<string, number> = {}
  for (const c of customers) {
    const t = (c as any).type ?? 'other'
    byType[t] = (byType[t] ?? 0) + 1
  }
  const topTypes = Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 5)

  const fmt = (n: number) => n >= 1_000_000
    ? `Rp ${(n / 1_000_000).toFixed(1)}M`
    : `Rp ${n.toLocaleString('id-ID')}`

  const Metric = ({ label, value, sub, trend, color = 'text-slate-800' }: any) => (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">{label}</p>
      <p className={`text-3xl font-bold mt-2 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
      {trend !== undefined && (
        <div className={`flex items-center gap-1 mt-2 text-xs font-medium ${trend >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
          {trend >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
          {Math.abs(trend).toFixed(1)}% vs last month
        </div>
      )}
    </div>
  )

  return (
    <>
      <Topbar title="Executive Dashboard" />
      <div className="p-6 max-w-7xl space-y-6">

        {/* Critical Alerts */}
        {(overdueValue > 0 || chargeableCustomers > 0) && (
          <div className="grid grid-cols-2 gap-4">
            {overdueValue > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-red-800">Overdue Invoices</p>
                  <p className="text-lg font-bold text-red-700">{fmt(overdueValue)}</p>
                  <p className="text-xs text-red-500">{overdue.length} invoices past due</p>
                </div>
              </div>
            )}
            {chargeableCustomers > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3">
                <Package className="w-5 h-5 text-amber-500 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-amber-800">Lost Bottle Charges</p>
                  <p className="text-lg font-bold text-amber-700">{chargeableCustomers} customers</p>
                  <p className="text-xs text-amber-500">exceeding 8% loss threshold</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Revenue KPIs */}
        <div>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Revenue</h2>
          <div className="grid grid-cols-4 gap-4">
            <Metric label="This Month Revenue" value={fmt(revenueThisMonth)} trend={revGrowth} color="text-cyan-700" />
            <Metric label="Last Month Revenue" value={fmt(revenueLastMonth)} />
            <Metric label="Collected This Month" value={fmt(paidThisMonth)} sub="from paid invoices" />
            <Metric label="Outstanding (Overdue)" value={fmt(overdueValue)} sub={`${overdue.length} invoices`} color={overdueValue > 0 ? 'text-red-600' : 'text-slate-800'} />
          </div>
        </div>

        {/* Operations KPIs */}
        <div>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Operations — Today</h2>
          <div className="grid grid-cols-4 gap-4">
            <Metric label="Total Deliveries Today" value={delivToday.length} />
            <Metric label="Completed" value={completedToday} color="text-emerald-600" />
            <Metric label="Pending" value={pendingToday} color={pendingToday > 0 ? 'text-amber-600' : 'text-slate-800'} />
            <Metric label="Completion Rate" value={`${completionRate}%`} color={completionRate >= 80 ? 'text-emerald-600' : completionRate >= 50 ? 'text-amber-600' : 'text-red-500'} />
          </div>
        </div>

        {/* Business KPIs */}
        <div>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Business Health</h2>
          <div className="grid grid-cols-4 gap-4">
            <Metric label="Active Customers" value={customers.length} sub={`${subscriptions.length} with subscriptions`} />
            <Metric label="Active Staff" value={staff.length} sub={`${vehicles.filter((v: any) => v.status === 'active').length} vehicles active`} />
            <Metric label="Bottles Outstanding" value={totalOutstanding.toLocaleString()} sub="across all customers" />
            <Metric label="Active Subscriptions" value={subscriptions.length} sub="standing orders" color="text-violet-600" />
          </div>
        </div>

        {/* Revenue Chart + Customer Mix */}
        <div className="grid grid-cols-3 gap-6">
          {/* Revenue Trend */}
          <div className="col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <h3 className="font-semibold text-slate-800 mb-4">Revenue Trend — Last 6 Months</h3>
            <div className="flex items-end gap-3 h-32">
              {monthLabels.map(label => {
                const d = monthlyData[label]
                const height = maxRev > 0 ? Math.round((d.rev / maxRev) * 100) : 0
                const isCurrent = label === monthLabels[monthLabels.length - 1]
                return (
                  <div key={label} className="flex-1 flex flex-col items-center gap-1.5">
                    <span className="text-xs text-slate-500">{fmt(d.rev)}</span>
                    <div className="w-full relative flex items-end justify-center" style={{ height: '80px' }}>
                      <div
                        className={`w-full rounded-t-lg transition-all ${isCurrent ? 'bg-cyan-500' : 'bg-slate-200'}`}
                        style={{ height: `${Math.max(height, 4)}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-400">{label}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Customer Mix */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <h3 className="font-semibold text-slate-800 mb-4">Customer Mix</h3>
            <div className="space-y-2.5">
              {topTypes.map(([type, count]) => {
                const pct = Math.round((count / customers.length) * 100)
                return (
                  <div key={type}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-600 capitalize">{type}</span>
                      <span className="font-medium text-slate-700">{count} ({pct}%)</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-cyan-400 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="mt-4 pt-4 border-t border-slate-100 text-xs text-slate-400">
              {customers.length} total active accounts
            </div>
          </div>
        </div>

        {/* Today's Deliveries */}
        {delivToday.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <h3 className="font-semibold text-slate-800 mb-4">Today's Delivery Roster</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {delivToday.slice(0, 12).map((d: any) => (
                <div key={d.id} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm ${
                  d.status === 'completed' || d.status === 'delivered' ? 'bg-emerald-50 text-emerald-700' :
                  d.status === 'in_progress' ? 'bg-cyan-50 text-cyan-700' :
                  'bg-amber-50 text-amber-700'
                }`}>
                  {d.status === 'completed' || d.status === 'delivered' ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" /> : <Truck className="w-3.5 h-3.5 flex-shrink-0" />}
                  <span className="truncate">{(d.customer as any)?.name}</span>
                </div>
              ))}
              {delivToday.length > 12 && <div className="px-3 py-2 text-sm text-slate-400">+{delivToday.length - 12} more</div>}
            </div>
          </div>
        )}

      </div>
    </>
  )
}
