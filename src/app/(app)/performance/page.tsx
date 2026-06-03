'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Topbar } from '@/components/layout/topbar'
import {
  TrendingUp, Star, Truck, Package, CheckCircle2,
  AlertTriangle, Loader2, Plus, Check, X, User, BarChart3, Zap
} from 'lucide-react'

export default function PerformancePage() {
  const [records, setRecords] = useState<any[]>([])
  const [staff, setStaff] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [autoCalcing, setAutoCalcing] = useState(false)
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7)) // YYYY-MM

  const [form, setForm] = useState({
    driver_id: '',
    period_date: new Date().toISOString().split('T')[0],
    deliveries_completed: 0,
    deliveries_failed: 0,
    on_time_rate: 0,
    bottles_delivered: 0,
    bottles_collected: 0,
    collection_rate: 0,
    customer_rating: '',
    incidents: 0,
    fuel_used: 0,
    km_driven: 0,
  })

  useEffect(() => { loadAll() }, [period])

  const loadAll = async () => {
    setLoading(true)
    const sb = createClient()
    const monthStart = `${period}-01`
    const monthEnd = new Date(parseInt(period.split('-')[0]), parseInt(period.split('-')[1]), 0).toISOString().split('T')[0]

    const [perfRes, staffRes] = await Promise.all([
      sb.from('driver_performance')
        .select('*, driver:staff(name, role)')
        .gte('period_date', monthStart)
        .lte('period_date', monthEnd)
        .order('period_date', { ascending: false }),
      sb.from('staff').select('id, name, role').eq('active', true),
    ])
    setRecords(perfRes.data ?? [])
    setStaff(staffRes.data ?? [])
    setLoading(false)
  }

  const saveRecord = async () => {
    if (!form.driver_id) return
    setSaving(true)
    const sb = createClient()
    const collectionRate = form.bottles_delivered > 0
      ? Math.round((form.bottles_collected / form.bottles_delivered) * 100)
      : 0

    const { data } = await sb.from('driver_performance').upsert({
      driver_id: form.driver_id,
      period_date: form.period_date,
      deliveries_completed: form.deliveries_completed,
      deliveries_failed: form.deliveries_failed,
      on_time_rate: form.on_time_rate,
      bottles_delivered: form.bottles_delivered,
      bottles_collected: form.bottles_collected,
      collection_rate: collectionRate,
      customer_rating: form.customer_rating ? Number(form.customer_rating) : null,
      incidents: form.incidents,
      fuel_used: form.fuel_used,
      km_driven: form.km_driven,
    }, { onConflict: 'driver_id,period_date' }).select('*, driver:staff(name, role)').single()

    if (data) {
      setRecords(prev => {
        const exists = prev.findIndex(r => r.driver_id === data.driver_id && r.period_date === data.period_date)
        if (exists >= 0) return prev.map((r, i) => i === exists ? data : r)
        return [data, ...prev]
      })
    }
    setShowForm(false)
    setSaving(false)
  }

  const autoCalculate = async () => {
    setAutoCalcing(true)
    const sb = createClient()
    const monthStart = `${period}-01`
    const monthEnd = new Date(parseInt(period.split('-')[0]), parseInt(period.split('-')[1]), 0).toISOString().split('T')[0]

    // Pull all completed deliveries for this period grouped by driver
    const { data: deliveries } = await sb
      .from('deliveries')
      .select('driver_id, status, delivered_350ml, delivered_750ml, collected_350ml, collected_750ml')
      .gte('delivery_date', monthStart)
      .lte('delivery_date', monthEnd)
      .not('driver_id', 'is', null)

    // Aggregate
    const byDriver: Record<string, { completed: number; failed: number; del350: number; del750: number; col350: number; col750: number }> = {}
    for (const d of (deliveries ?? [])) {
      if (!byDriver[d.driver_id]) byDriver[d.driver_id] = { completed: 0, failed: 0, del350: 0, del750: 0, col350: 0, col750: 0 }
      if (d.status === 'completed') {
        byDriver[d.driver_id].completed++
        byDriver[d.driver_id].del350 += d.delivered_350ml ?? 0
        byDriver[d.driver_id].del750 += d.delivered_750ml ?? 0
        byDriver[d.driver_id].col350 += d.collected_350ml ?? 0
        byDriver[d.driver_id].col750 += d.collected_750ml ?? 0
      } else if (d.status === 'failed') {
        byDriver[d.driver_id].failed++
      }
    }

    // Upsert one record per driver per month
    for (const [driverId, totals] of Object.entries(byDriver)) {
      const bottlesDelivered = totals.del350 + totals.del750
      const bottlesCollected = totals.col350 + totals.col750
      const collectionRate = bottlesDelivered > 0 ? Math.round((bottlesCollected / bottlesDelivered) * 100) : 0
      await sb.from('driver_performance').upsert({
        driver_id: driverId,
        period_date: monthStart,
        deliveries_completed: totals.completed,
        deliveries_failed: totals.failed,
        bottles_delivered: bottlesDelivered,
        bottles_collected: bottlesCollected,
        collection_rate: collectionRate,
      }, { onConflict: 'driver_id,period_date' })
    }

    await loadAll()
    setAutoCalcing(false)
    alert(`Auto-calculated performance for ${Object.keys(byDriver).length} drivers from delivery data.`)
  }

  // Aggregate by driver for the selected period
  const driverSummary = staff.map(s => {
    const driverRecords = records.filter(r => r.driver_id === s.id)
    return {
      ...s,
      records: driverRecords,
      total_deliveries: driverRecords.reduce((sum, r) => sum + (r.deliveries_completed ?? 0), 0),
      total_failed: driverRecords.reduce((sum, r) => sum + (r.deliveries_failed ?? 0), 0),
      avg_on_time: driverRecords.length > 0
        ? Math.round(driverRecords.reduce((sum, r) => sum + (r.on_time_rate ?? 0), 0) / driverRecords.length)
        : 0,
      avg_collection: driverRecords.length > 0
        ? Math.round(driverRecords.reduce((sum, r) => sum + (r.collection_rate ?? 0), 0) / driverRecords.length)
        : 0,
      avg_rating: driverRecords.filter(r => r.customer_rating).length > 0
        ? (driverRecords.reduce((sum, r) => sum + (r.customer_rating ?? 0), 0) / driverRecords.filter(r => r.customer_rating).length).toFixed(1)
        : null,
      total_incidents: driverRecords.reduce((sum, r) => sum + (r.incidents ?? 0), 0),
      total_km: driverRecords.reduce((sum, r) => sum + (r.km_driven ?? 0), 0),
    }
  }).filter(s => s.records.length > 0 || true)

  const ScoreBadge = ({ value, threshold, label }: { value: number; threshold: number; label: string }) => (
    <div className={`text-center p-2 rounded-xl ${value >= threshold ? 'bg-emerald-50' : value >= threshold * 0.7 ? 'bg-amber-50' : 'bg-red-50'}`}>
      <p className={`text-lg font-bold ${value >= threshold ? 'text-emerald-700' : value >= threshold * 0.7 ? 'text-amber-700' : 'text-red-600'}`}>{value}%</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  )

  return (
    <>
      <Topbar title="Driver Performance" />
      <div className="p-6 max-w-6xl space-y-6">

        {/* Controls */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600">Period:</label>
            <input type="month" className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
              value={period} onChange={e => setPeriod(e.target.value)} />
          </div>
          <div className="flex-1" />
          <button onClick={autoCalculate} disabled={autoCalcing}
            className="flex items-center gap-2 border border-violet-200 bg-violet-50 hover:bg-violet-100 text-violet-700 px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-50">
            {autoCalcing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />} Auto-Calculate
          </button>
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" /> Log Performance
          </button>
        </div>

        {/* Log Form */}
        {showForm && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
            <h3 className="font-semibold text-slate-800">Log Driver Performance</h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Driver *</label>
                <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={form.driver_id} onChange={e => setForm({ ...form, driver_id: e.target.value })}>
                  <option value="">Select driver...</option>
                  {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Period Date</label>
                <input type="date" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={form.period_date} onChange={e => setForm({ ...form, period_date: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Customer Rating (1-5)</label>
                <input type="number" min="1" max="5" step="0.1" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={form.customer_rating} onChange={e => setForm({ ...form, customer_rating: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Deliveries Completed</label>
                <input type="number" min="0" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={form.deliveries_completed} onChange={e => setForm({ ...form, deliveries_completed: Number(e.target.value) })} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Deliveries Failed</label>
                <input type="number" min="0" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={form.deliveries_failed} onChange={e => setForm({ ...form, deliveries_failed: Number(e.target.value) })} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">On-Time Rate (%)</label>
                <input type="number" min="0" max="100" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={form.on_time_rate} onChange={e => setForm({ ...form, on_time_rate: Number(e.target.value) })} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Bottles Delivered</label>
                <input type="number" min="0" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={form.bottles_delivered} onChange={e => setForm({ ...form, bottles_delivered: Number(e.target.value) })} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Bottles Collected</label>
                <input type="number" min="0" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={form.bottles_collected} onChange={e => setForm({ ...form, bottles_collected: Number(e.target.value) })} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Safety Incidents</label>
                <input type="number" min="0" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={form.incidents} onChange={e => setForm({ ...form, incidents: Number(e.target.value) })} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Fuel Used (L)</label>
                <input type="number" min="0" step="0.1" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={form.fuel_used} onChange={e => setForm({ ...form, fuel_used: Number(e.target.value) })} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">KM Driven</label>
                <input type="number" min="0" step="0.1" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={form.km_driven} onChange={e => setForm({ ...form, km_driven: Number(e.target.value) })} />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={saveRecord} disabled={saving || !form.driver_id}
                className="flex-1 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" />Save Record</>}
              </button>
              <button onClick={() => setShowForm(false)} className="border border-slate-200 px-4 py-2 rounded-xl text-sm hover:bg-slate-50"><X className="w-4 h-4" /></button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
        ) : (
          <div className="space-y-4">
            {driverSummary.filter(d => d.records.length > 0).length === 0 ? (
              <div className="text-center py-16 text-slate-400 bg-white border border-slate-100 rounded-2xl">
                <BarChart3 className="w-10 h-10 mx-auto mb-3 text-slate-200" />
                <p className="font-medium">No performance data for this period</p>
                <p className="text-sm mt-1">Log driver performance to see stats here</p>
              </div>
            ) : driverSummary.filter(d => d.records.length > 0).map(driver => (
              <div key={driver.id} className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-5 py-4 flex items-center gap-4 border-b border-slate-100">
                  <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <User className="w-5 h-5 text-slate-500" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-slate-800">{driver.name}</p>
                    <p className="text-xs text-slate-400 capitalize">{driver.role}</p>
                  </div>
                  {driver.avg_rating && (
                    <div className="flex items-center gap-1">
                      <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                      <span className="font-bold text-slate-800">{driver.avg_rating}</span>
                      <span className="text-xs text-slate-400">/5</span>
                    </div>
                  )}
                  {driver.total_incidents > 0 && (
                    <span className="flex items-center gap-1 text-xs bg-red-100 text-red-600 px-2 py-1 rounded-full">
                      <AlertTriangle className="w-3 h-3" />{driver.total_incidents} incident{driver.total_incidents > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <div className="p-4 grid grid-cols-5 gap-3">
                  <div className="text-center p-2 bg-slate-50 rounded-xl">
                    <p className="text-xl font-bold text-slate-800">{driver.total_deliveries}</p>
                    <p className="text-xs text-slate-400">Deliveries</p>
                  </div>
                  <div className={`text-center p-2 rounded-xl ${driver.total_failed > 0 ? 'bg-red-50' : 'bg-emerald-50'}`}>
                    <p className={`text-xl font-bold ${driver.total_failed > 0 ? 'text-red-600' : 'text-emerald-700'}`}>{driver.total_failed}</p>
                    <p className="text-xs text-slate-400">Failed</p>
                  </div>
                  <ScoreBadge value={driver.avg_on_time} threshold={90} label="On-Time %" />
                  <ScoreBadge value={driver.avg_collection} threshold={92} label="Collection %" />
                  <div className="text-center p-2 bg-slate-50 rounded-xl">
                    <p className="text-xl font-bold text-slate-800">{driver.total_km.toFixed(0)}</p>
                    <p className="text-xs text-slate-400">KM Driven</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
