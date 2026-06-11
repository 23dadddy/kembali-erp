'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Package, Truck, Users, FileText, TrendingUp, AlertCircle,
  CheckCircle2, Clock, DollarSign, Target, Wrench, AlertTriangle,
} from 'lucide-react'
import Link from 'next/link'
import { useLanguage } from '@/components/providers/language-provider'

function formatIDR(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)
}

interface DashboardClientProps {
  customersCount: number
  deliveriesCount: number
  bottlesAtCustomer: number
  bottlesFilled: number
  unpaidCount: number
  monthRevenue: number
  overdueTotal: number
  activeVehicles: number
  maintVehicles: number
  drivers: number
  expiringDocs: any[]
  expiringLicenses: any[]
  bottleAlerts: any[]
  kpiTargets: Record<string, number>
  monthDeliveries: number
  newCustomers: number
  currentPeriod: string
  invMap: Record<string, { qty_350: number; qty_750: number }>
  todayDeliveries: any[]
  completedToday: number
  completionRate: number
  overdueInvoices: any[]
}

export function DashboardClient({
  customersCount, deliveriesCount, bottlesAtCustomer, bottlesFilled,
  unpaidCount, monthRevenue, overdueTotal, activeVehicles, maintVehicles,
  drivers, expiringDocs, expiringLicenses, bottleAlerts, kpiTargets,
  monthDeliveries, newCustomers, currentPeriod, invMap, todayDeliveries,
  completedToday, completionRate, overdueInvoices,
}: DashboardClientProps) {
  const { t } = useLanguage()

  return (
    <div className="p-6 space-y-6">
      {/* Alerts bar */}
      {(expiringDocs.length > 0 || expiringLicenses.length > 0 || bottleAlerts.length > 0) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-1">
          <p className="text-sm font-semibold text-amber-800 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" />{t('dashboard_attention')}
          </p>
          {expiringDocs.map((v: any) => (
            <p key={v.plate_number} className="text-xs text-amber-700">
              🚗 {v.name} ({v.plate_number}) — {t('dashboard_doc_expiring')}
            </p>
          ))}
          {expiringLicenses.map((s: any) => (
            <p key={s.name} className="text-xs text-amber-700">
              🪪 {s.name} — {t('dashboard_license_expiring')} {new Date(s.license_expiry).toLocaleDateString()}
            </p>
          ))}
          {bottleAlerts.map((b: any) => (
            <p key={b.customer_id} className="text-xs text-amber-700">
              📦 {b.customer_name} — {b.chargeable_lost_350ml + b.chargeable_lost_750ml} {t('dashboard_lost_bottles')}
            </p>
          ))}
        </div>
      )}

      {/* Primary KPIs */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { labelKey: 'dashboard_active_customers' as const, value: customersCount, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50', href: '/customers' },
          { labelKey: 'dashboard_todays_deliveries' as const, value: `${completedToday}/${deliveriesCount}`, icon: Truck, color: 'text-cyan-600', bg: 'bg-cyan-50', href: '/dispatch' },
          { labelKey: 'dashboard_bottles_in_circulation' as const, value: bottlesAtCustomer, icon: Package, color: 'text-emerald-600', bg: 'bg-emerald-50', href: '/inventory' },
          { labelKey: 'dashboard_unpaid_invoices' as const, value: unpaidCount, icon: FileText, color: 'text-orange-600', bg: 'bg-orange-50', href: '/billing' },
        ].map(({ labelKey, value, icon: Icon, color, bg, href }) => (
          <Link key={labelKey} href={href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500">{t(labelKey)}</p>
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
          <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <Target className="w-4 h-4 text-cyan-600" />{t('dashboard_monthly_targets')} — {currentPeriod}
          </h3>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            {[
              { metric: 'revenue', labelKey: 'dashboard_revenue' as const, actual: monthRevenue, format: (n: number) => formatIDR(n) },
              { metric: 'deliveries', labelKey: 'dashboard_deliveries' as const, actual: monthDeliveries, format: (n: number) => n.toString() },
              { metric: 'new_customers', labelKey: 'dashboard_new_customers' as const, actual: newCustomers, format: (n: number) => n.toString() },
            ].filter(k => kpiTargets[k.metric]).map(({ metric, labelKey, actual, format }) => {
              const target = kpiTargets[metric]
              const pct = target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : 0
              const color = pct >= 100 ? 'bg-emerald-500' : pct >= 70 ? 'bg-amber-400' : 'bg-red-400'
              return (
                <div key={metric} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">{t(labelKey)}</span>
                    <span className="font-semibold text-slate-700">{pct}%</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>{format(actual)}</span>
                    <span>{t('dashboard_target')}: {format(target)}</span>
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
          { labelKey: 'dashboard_revenue_30' as const, value: formatIDR(monthRevenue), icon: DollarSign, color: 'text-emerald-700', bg: 'bg-emerald-50' },
          { labelKey: 'dashboard_overdue_ar' as const, value: formatIDR(overdueTotal), icon: AlertCircle, color: overdueTotal > 0 ? 'text-red-600' : 'text-slate-400', bg: overdueTotal > 0 ? 'bg-red-50' : 'bg-slate-50' },
          { labelKey: 'dashboard_active_vehicles' as const, value: `${activeVehicles} (${maintVehicles} ${t('dashboard_in_maint')})`, icon: Wrench, color: 'text-slate-700', bg: 'bg-slate-50' },
          { labelKey: 'dashboard_drivers_on_team' as const, value: drivers, icon: Target, color: 'text-cyan-700', bg: 'bg-cyan-50' },
        ].map(({ labelKey, value, icon: Icon, color, bg }) => (
          <Card key={labelKey}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500">{t(labelKey)}</p>
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
              <Package className="w-4 h-4" /> {t('dashboard_bottle_lifecycle')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {[
              { status: 'filled', labelKey: 'dashboard_filled_ready' as const, color: 'bg-emerald-500' },
              { status: 'at_customer', labelKey: 'dashboard_at_customers' as const, color: 'bg-blue-500' },
              { status: 'dirty', labelKey: 'dashboard_dirty_collected' as const, color: 'bg-amber-500' },
              { status: 'cleaning', labelKey: 'dashboard_in_cleaning' as const, color: 'bg-purple-500' },
              { status: 'clean_empty', labelKey: 'dashboard_clean_empty' as const, color: 'bg-slate-300' },
              { status: 'damaged', labelKey: 'dashboard_damaged' as const, color: 'bg-red-400' },
            ].map(({ status, labelKey, color }) => {
              const row = invMap[status] ?? { qty_350: 0, qty_750: 0 }
              const total = row.qty_350 + row.qty_750
              return (
                <div key={status} className="flex items-center gap-3 text-sm">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${color}`} />
                  <span className="flex-1 text-slate-600">{t(labelKey)}</span>
                  <div className="flex gap-2 text-xs text-slate-500">
                    <span>{row.qty_350}×350</span>
                    <span>{row.qty_750}×750</span>
                  </div>
                  <span className="font-semibold text-slate-700 w-8 text-right">{total}</span>
                </div>
              )
            })}
            <div className="border-t pt-2 text-xs text-slate-400 flex items-center justify-between">
              <span>{t('dashboard_ready_to_deliver')}</span>
              <span className="font-semibold text-slate-600">{bottlesFilled}</span>
            </div>
          </CardContent>
        </Card>

        {/* Today's deliveries */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2"><Truck className="w-4 h-4" />{t('dashboard_todays_deliveries_card')}</CardTitle>
              {todayDeliveries.length > 0 && (
                <span className="text-xs text-slate-400">{completionRate}% {t('dashboard_done_pct')}</span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {todayDeliveries.length === 0 ? (
              <div className="text-center py-6 text-slate-400 text-sm">
                <Truck className="w-6 h-6 mx-auto mb-2 text-slate-200" />
                {t('dashboard_no_deliveries')}
                <p className="text-xs mt-1">
                  <Link href="/dispatch" className="text-cyan-600 hover:underline">{t('dashboard_go_dispatch')}</Link>
                </p>
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
                    <span className="text-xs text-slate-400">
                      {d.delivered_350ml > 0 ? `${d.delivered_350ml}×350` : ''}
                      {d.delivered_750ml > 0 ? ` ${d.delivered_750ml}×750` : ''}
                    </span>
                  </div>
                ))}
                {completionRate === 100 && (
                  <div className="mt-2 text-xs text-emerald-600 bg-emerald-50 rounded-lg p-2 text-center">
                    {t('dashboard_all_complete')}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Overdue invoices */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400" />{t('dashboard_overdue_invoices')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {overdueInvoices.length === 0 ? (
              <div className="text-center py-6 text-emerald-600 text-sm">
                <CheckCircle2 className="w-6 h-6 mx-auto mb-2" />
                {t('dashboard_all_current')}
              </div>
            ) : (
              <div className="space-y-2">
                {overdueInvoices.slice(0, 6).map((inv: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                    <span className="flex-1 truncate text-slate-700">{inv.customer?.name}</span>
                    <span className="font-medium text-red-600 text-xs">{formatIDR(Number(inv.total))}</span>
                  </div>
                ))}
                {overdueInvoices.length > 6 && (
                  <p className="text-xs text-slate-400 text-center">+{overdueInvoices.length - 6} more</p>
                )}
                <div className="border-t pt-2 flex justify-between text-xs font-semibold">
                  <span className="text-slate-500">{t('dashboard_total_overdue')}</span>
                  <span className="text-red-600">{formatIDR(overdueInvoices.reduce((s: number, i: any) => s + Number(i.total), 0))}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { labelKey: 'dashboard_generate_invoices' as const, descKey: 'dashboard_generate_invoices_desc' as const, href: '/billing', icon: FileText, accent: 'border-violet-200 hover:border-violet-400 hover:bg-violet-50/30' },
          { labelKey: 'dashboard_dispatch_board' as const, descKey: 'dashboard_dispatch_board_desc' as const, href: '/dispatch', icon: Truck, accent: 'border-cyan-200 hover:border-cyan-400 hover:bg-cyan-50/30' },
          { labelKey: 'dashboard_crm_pipeline' as const, descKey: 'dashboard_crm_pipeline_desc' as const, href: '/crm', icon: Target, accent: 'border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50/30' },
          { labelKey: 'dashboard_fleet_status' as const, descKey: 'dashboard_fleet_status_desc' as const, href: '/fleet', icon: Wrench, accent: 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/30' },
        ].map(({ labelKey, descKey, href, icon: Icon, accent }) => (
          <Link key={href} href={href}>
            <div className={`border rounded-xl p-4 transition-colors cursor-pointer ${accent}`}>
              <Icon className="w-5 h-5 text-slate-400 mb-2" />
              <p className="text-sm font-semibold text-slate-700">{t(labelKey)}</p>
              <p className="text-xs text-slate-400 mt-0.5">{t(descKey)}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
