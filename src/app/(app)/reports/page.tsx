'use client'

import { useState, useEffect } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'
import { idr } from '@/lib/format'
import {
  TrendingUp, Package, RotateCcw, AlertTriangle,
  DollarSign, Truck, Users, BarChart3, Loader2, Download
} from 'lucide-react'
import { useLanguage } from '@/components/providers/language-provider'

interface ReportData {
  totalRevenue: number
  totalDeliveries: number
  totalDelivered350: number
  totalDelivered750: number
  totalCollected350: number
  totalCollected750: number
  totalDamaged350: number
  totalDamaged750: number
  recoveryRate350: number
  recoveryRate750: number
  topCustomers: { name: string; deliveries: number; revenue: number }[]
  monthlyRevenue: { month: string; revenue: number; deliveries: number }[]
  bottleLossAlerts: { name: string; city: string; outstanding350: number; outstanding750: number; chargeable: number }[]
  overdueInvoices: number
  overdueValue: number
}

function exportCSV(rows: Record<string, any>[], filename: string) {
  if (!rows.length) return
  const headers = Object.keys(rows[0])
  const csv = [headers.join(','), ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export default function ReportsPage() {
  const { t } = useLanguage()
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('30') // days

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const sb = createClient()
      const since = new Date()
      since.setDate(since.getDate() - parseInt(period))
      const sinceStr = since.toISOString().split('T')[0]

      const [deliveriesRes, invoicesRes, balancesRes, pricingRes] = await Promise.all([
        sb.from('deliveries').select('*, customer:customers(name, city)').eq('status', 'completed').gte('delivery_date', sinceStr),
        sb.from('invoices').select('*, customer:customers(name)').gte('created_at', since.toISOString()),
        sb.from('customer_bottle_balance').select('*').gt('chargeable_lost_350ml', 0),
        sb.from('pricing').select('*').eq('active', true),
      ])

      const deliveries = deliveriesRes.data ?? []
      const invoices = invoicesRes.data ?? []
      const balances = balancesRes.data ?? []
      const pricing = pricingRes.data ?? []

      const p350 = pricing.find((p: any) => p.bottle_size === '350ml')?.price_per_unit ?? 6000
      const p750 = pricing.find((p: any) => p.bottle_size === '750ml')?.price_per_unit ?? 10000

      const tot350 = deliveries.reduce((s: number, d: any) => s + (d.delivered_350ml ?? 0), 0)
      const tot750 = deliveries.reduce((s: number, d: any) => s + (d.delivered_750ml ?? 0), 0)
      const col350 = deliveries.reduce((s: number, d: any) => s + (d.collected_350ml ?? 0), 0)
      const col750 = deliveries.reduce((s: number, d: any) => s + (d.collected_750ml ?? 0), 0)
      const dam350 = deliveries.reduce((s: number, d: any) => s + (d.damaged_350ml ?? 0), 0)
      const dam750 = deliveries.reduce((s: number, d: any) => s + (d.damaged_750ml ?? 0), 0)

      const totalRevenue = tot350 * p350 + tot750 * p750

      // Top customers by delivery count
      const custMap: Record<string, { name: string; deliveries: number; revenue: number }> = {}
      for (const d of deliveries) {
        const name = (d.customer as any)?.name ?? 'Unknown'
        if (!custMap[name]) custMap[name] = { name, deliveries: 0, revenue: 0 }
        custMap[name].deliveries++
        custMap[name].revenue += (d.delivered_350ml ?? 0) * p350 + (d.delivered_750ml ?? 0) * p750
      }
      const topCustomers = Object.values(custMap).sort((a, b) => b.revenue - a.revenue).slice(0, 8)

      // Monthly revenue (last 6 months)
      const monthMap: Record<string, { revenue: number; deliveries: number }> = {}
      for (const d of deliveries) {
        const m = (d.delivery_date as string).slice(0, 7)
        if (!monthMap[m]) monthMap[m] = { revenue: 0, deliveries: 0 }
        monthMap[m].revenue += (d.delivered_350ml ?? 0) * p350 + (d.delivered_750ml ?? 0) * p750
        monthMap[m].deliveries++
      }
      const monthlyRevenue = Object.entries(monthMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, v]) => ({ month, ...v }))

      // Bottle loss alerts
      const bottleLossAlerts = (balances as any[]).map((b) => ({
        name: b.customer_name,
        city: b.city,
        outstanding350: b.outstanding_350ml,
        outstanding750: b.outstanding_750ml,
        chargeable: b.chargeable_lost_350ml * p350 + b.chargeable_lost_750ml * p750,
      })).sort((a, b) => b.chargeable - a.chargeable).slice(0, 10)

      const overdueInvoices = invoices.filter((i: any) => i.status === 'overdue')
      const overdueValue = overdueInvoices.reduce((s: number, i: any) => s + Number(i.total), 0)

      setData({
        totalRevenue,
        totalDeliveries: deliveries.length,
        totalDelivered350: tot350,
        totalDelivered750: tot750,
        totalCollected350: col350,
        totalCollected750: col750,
        totalDamaged350: dam350,
        totalDamaged750: dam750,
        recoveryRate350: tot350 > 0 ? Math.round((col350 / tot350) * 100) : 0,
        recoveryRate750: tot750 > 0 ? Math.round((col750 / tot750) * 100) : 0,
        topCustomers,
        monthlyRevenue,
        bottleLossAlerts,
        overdueInvoices: overdueInvoices.length,
        overdueValue,
      })
      setLoading(false)
    }
    load()
  }, [period])

  return (
    <>
      <Topbar title={t('rep_title')} />
      <div className="p-6 space-y-6">

        {/* Period selector + export */}
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            {[['7', t('rep_7days')], ['30', t('rep_30days')], ['90', t('rep_90days')], ['365', t('rep_all_time')]].map(([v, label]) => (
              <button
                key={v}
                onClick={() => setPeriod(v)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  period === v ? 'bg-cyan-600 text-white' : 'bg-white border text-slate-600 hover:bg-slate-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {data && (
            <div className="flex gap-2">
              <button
                onClick={() => exportCSV(data.topCustomers.map(c => ({ Customer: c.name, Deliveries: c.deliveries, Revenue_IDR: c.revenue })), `top-customers-${period}d.csv`)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border rounded-lg hover:bg-slate-50 transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> {t('rep_customers_csv')}
              </button>
              <button
                onClick={() => exportCSV(data.monthlyRevenue.map(m => ({ Month: m.month, Revenue_IDR: m.revenue, Deliveries: m.deliveries })), 'monthly-revenue.csv')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border rounded-lg hover:bg-slate-50 transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> {t('rep_revenue_csv')}
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-slate-300" />
          </div>
        ) : data ? (
          <>
            {/* KPI row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: t('rep_revenue'), value: idr(data.totalRevenue), icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                { label: t('rep_deliveries'), value: data.totalDeliveries.toLocaleString(), icon: Truck, color: 'text-blue-600', bg: 'bg-blue-50' },
                { label: t('rep_overdue_invoices'), value: `${data.overdueInvoices} (${idr(data.overdueValue)})`, icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-50' },
                { label: t('rep_customers_with_loss'), value: data.bottleLossAlerts.length.toString(), icon: Package, color: 'text-amber-600', bg: 'bg-amber-50' },
              ].map(({ label, value, icon: Icon, color, bg }) => (
                <Card key={label}>
                  <CardContent className="pt-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-slate-500">{label}</p>
                        <p className="text-lg font-bold mt-1 leading-tight">{value}</p>
                      </div>
                      <div className={`${bg} p-2.5 rounded-xl`}>
                        <Icon className={`w-5 h-5 ${color}`} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Bottle recovery */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <RotateCcw className="w-4 h-4" /> {t('rep_bottle_recovery')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {[
                    { label: '350ml', delivered: data.totalDelivered350, collected: data.totalCollected350, rate: data.recoveryRate350, damaged: data.totalDamaged350 },
                    { label: '750ml', delivered: data.totalDelivered750, collected: data.totalCollected750, rate: data.recoveryRate750, damaged: data.totalDamaged750 },
                  ].map(({ label, delivered, collected, rate, damaged }) => (
                    <div key={label}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium text-slate-700">{label}</span>
                        <span className={`font-bold ${rate >= 92 ? 'text-emerald-600' : 'text-red-500'}`}>{rate}% {t('rep_recovered')}</span>
                      </div>
                      <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-3 rounded-full ${rate >= 92 ? 'bg-emerald-500' : 'bg-red-400'}`}
                          style={{ width: `${rate}%` }}
                        />
                      </div>
                      <div className="flex gap-4 mt-1.5 text-xs text-slate-400">
                        <span>{t('rep_delivered')} {delivered.toLocaleString()}</span>
                        <span>{t('rep_collected')} {collected.toLocaleString()}</span>
                        <span>{t('rep_damaged')} {damaged}</span>
                        <span>{t('rep_outstanding')} {delivered - collected}</span>
                      </div>
                    </div>
                  ))}
                  <div className="pt-2 border-t text-xs text-slate-400">
                    {t('rep_recovery_target')}
                  </div>
                </CardContent>
              </Card>

              {/* Monthly revenue */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" /> {t('rep_monthly_revenue')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data.monthlyRevenue.length === 0 ? (
                    <p className="text-sm text-slate-400">{t('rep_no_data')}</p>
                  ) : (
                    <div className="space-y-2">
                      {data.monthlyRevenue.map(({ month, revenue, deliveries }) => {
                        const max = Math.max(...data.monthlyRevenue.map((m) => m.revenue), 1)
                        return (
                          <div key={month}>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="text-slate-600">{new Date(month + '-01').toLocaleString('default', { month: 'short', year: 'numeric' })}</span>
                              <span className="font-medium">{idr(revenue)} <span className="text-slate-400 text-xs">({deliveries} deliveries)</span></span>
                            </div>
                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-2 bg-cyan-500 rounded-full" style={{ width: `${(revenue / max) * 100}%` }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Top customers */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="w-4 h-4" /> {t('rep_top_customers')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.topCustomers.length === 0 ? (
                  <p className="text-sm text-slate-400">{t('rep_no_delivery_data')}</p>
                ) : (
                  <div className="space-y-2">
                    {data.topCustomers.map((c, i) => {
                      const max = data.topCustomers[0]?.revenue ?? 1
                      return (
                        <div key={c.name} className="flex items-center gap-3">
                          <span className="text-slate-400 text-sm w-5 text-right">{i + 1}</span>
                          <div className="flex-1">
                            <div className="flex justify-between text-sm mb-1">
                              <span className="font-medium text-slate-700">{c.name}</span>
                              <span>{idr(c.revenue)} <span className="text-slate-400 text-xs">· {c.deliveries} deliveries</span></span>
                            </div>
                            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-1.5 bg-cyan-500 rounded-full" style={{ width: `${(c.revenue / max) * 100}%` }} />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Bottle loss alerts */}
            {data.bottleLossAlerts.length > 0 && (
              <Card className="border-amber-200">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2 text-amber-700">
                    <AlertTriangle className="w-4 h-4" /> {t('rep_bottle_loss_alerts')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {data.bottleLossAlerts.map((c) => (
                      <div key={c.name} className="flex items-center gap-4 p-3 bg-amber-50 rounded-lg text-sm">
                        <div className="flex-1">
                          <span className="font-medium text-slate-800">{c.name}</span>
                          <span className="text-slate-400 ml-2 text-xs">{c.city}</span>
                        </div>
                        <div className="flex gap-4 text-xs text-slate-500">
                          {c.outstanding350 > 0 && <span>{t('rep_350ml_outstanding')} <strong>{c.outstanding350}</strong></span>}
                          {c.outstanding750 > 0 && <span>{t('rep_750ml_outstanding')} <strong>{c.outstanding750}</strong></span>}
                        </div>
                        <span className="font-bold text-amber-700">{idr(c.chargeable)}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        ) : null}
      </div>
    </>
  )
}
