'use client'

import { useState, useEffect } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { createClient } from '@/lib/supabase/client'
import {
  Smartphone, QrCode, Truck, CheckCircle2, Clock, AlertCircle, Navigation,
  Package, RotateCcw, MapPin, Loader2, ExternalLink,
} from 'lucide-react'
import Link from 'next/link'

export default function PortalPage() {
  const [drivers, setDrivers] = useState<any[]>([])
  const [deliveries, setDeliveries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDriver, setSelectedDriver] = useState<string>('all')

  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const sb = createClient()
      const [st, dl] = await Promise.all([
        sb.from('staff').select('id, name, phone').eq('role', 'driver').eq('active', true),
        sb.from('deliveries')
          .select('*, customer:customers(name, city, address), driver:staff(name, phone)')
          .eq('delivery_date', today)
          .order('created_at'),
      ])
      setDrivers(st.data ?? [])
      setDeliveries(dl.data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const filtered = selectedDriver === 'all'
    ? deliveries
    : deliveries.filter(d => d.driver_id === selectedDriver)

  const byDriver: Record<string, any[]> = {}
  for (const d of filtered) {
    const driverId = d.driver_id ?? '__unassigned__'
    if (!byDriver[driverId]) byDriver[driverId] = []
    byDriver[driverId].push(d)
  }

  const statusIcon = (s: string) => {
    if (s === 'completed') return <CheckCircle2 className="w-4 h-4 text-emerald-500" />
    if (s === 'in_transit') return <Navigation className="w-4 h-4 text-blue-500" />
    if (s === 'failed') return <AlertCircle className="w-4 h-4 text-red-500" />
    return <Clock className="w-4 h-4 text-amber-500" />
  }

  return (
    <>
      <Topbar title="Driver App Portal" />
      <div className="p-6 space-y-6">

        {/* Info banner */}
        <div className="bg-cyan-50 border border-cyan-200 rounded-xl p-4 flex items-start gap-3">
          <Smartphone className="w-5 h-5 text-cyan-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-cyan-800 text-sm">Driver Mobile Access</p>
            <p className="text-xs text-cyan-700 mt-0.5">
              Drivers access their deliveries at <strong>kembali-erp.vercel.app/deliver/[delivery-id]. Driver portal: /driver/portal</strong>.
              Share the direct link or scan QR from the TrakOps board.
            </p>
          </div>
        </div>

        {/* Stats */}
        {!loading && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Active Drivers', value: drivers.length, color: 'text-cyan-600' },
              { label: "Today's Deliveries", value: deliveries.length, color: 'text-slate-700' },
              { label: 'Completed', value: deliveries.filter(d => d.status === 'completed').length, color: 'text-emerald-600' },
              { label: 'Pending / Transit', value: deliveries.filter(d => ['pending', 'in_transit'].includes(d.status)).length, color: 'text-amber-600' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white rounded-xl border p-4 text-center">
                <div className={`text-2xl font-bold ${color}`}>{value}</div>
                <div className="text-xs text-slate-500 mt-1">{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Filter */}
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-sm font-medium text-slate-600">Filter by driver:</label>
          <select
            value={selectedDriver}
            onChange={e => setSelectedDriver(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value="all">All Drivers</option>
            {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="text-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-300 mx-auto" /></div>
        ) : deliveries.length === 0 ? (
          <div className="bg-white rounded-xl border p-10 text-center">
            <Truck className="w-8 h-8 text-slate-200 mx-auto mb-2" />
            <p className="text-sm text-slate-400">No deliveries scheduled for today</p>
            <Link href="/trakops" className="text-xs text-cyan-600 hover:underline mt-2 inline-block">
              Go to TrakOps →
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(byDriver).map(([driverId, dls]) => {
              const driver = dls[0]?.driver
              const driverName = driver?.name ?? (driverId === '__unassigned__' ? 'Unassigned' : 'Unknown')
              const completed = dls.filter(d => d.status === 'completed').length
              return (
                <div key={driverId} className="bg-white rounded-xl border overflow-hidden">
                  <div className="bg-slate-50 border-b px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Truck className="w-4 h-4 text-slate-500" />
                      <span className="font-semibold text-slate-800">{driverName}</span>
                      {driver?.phone && <span className="text-xs text-slate-400">· {driver.phone}</span>}
                    </div>
                    <span className="text-xs text-slate-500 bg-white border rounded-full px-3 py-1">
                      {completed}/{dls.length} done
                    </span>
                  </div>
                  <div className="divide-y">
                    {dls.map(d => (
                      <div key={d.id} className="flex items-center gap-3 px-4 py-3">
                        {statusIcon(d.status)}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-slate-800 truncate">{d.customer?.name}</p>
                          <p className="text-xs text-slate-400 truncate">{d.customer?.city}</p>
                          <div className="flex gap-3 mt-1 text-xs text-slate-500">
                            {d.delivered_350ml > 0 && <span>{d.delivered_350ml}×350ml</span>}
                            {d.delivered_750ml > 0 && <span>{d.delivered_750ml}×750ml</span>}
                          </div>
                        </div>
                        {['pending', 'in_transit'].includes(d.status) && (
                          <Link
                            href={`/deliver/${d.id}`}
                            className="flex items-center gap-1 text-xs text-cyan-600 hover:text-cyan-800 font-medium whitespace-nowrap"
                          >
                            Open App <ExternalLink className="w-3 h-3" />
                          </Link>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
