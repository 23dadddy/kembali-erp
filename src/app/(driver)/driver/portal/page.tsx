'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import {
  Truck, CheckCircle2, Clock, Package, Loader2, MapPin,
  Droplets, User, ChevronDown, Route, Navigation, Phone
} from 'lucide-react'

export default function DriverPortalPage() {
  const [drivers, setDrivers] = useState<any[]>([])
  const [routes, setRoutes] = useState<any[]>([])
  const [deliveries, setDeliveries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDriver, setSelectedDriver] = useState<string>('')
  const [selectedRoute, setSelectedRoute] = useState<string>('all')
  const [showDriverPicker, setShowDriverPicker] = useState(false)
  const today = new Date().toISOString().split('T')[0]
  const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long' })

  useEffect(() => { loadDriversAndRoutes() }, [])
  useEffect(() => { if (selectedDriver || selectedDriver === '') loadDeliveries() }, [selectedDriver, selectedRoute])

  // Auto-refresh when delivery records change
  useEffect(() => {
    const sb = createClient()
    const channel = sb
      .channel('driver-portal-deliveries')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, () => { loadDeliveries() })
      .subscribe()
    return () => { sb.removeChannel(channel) }
  }, [])

  // GPS beacon: send the driver's position every 30s while the portal is open
  useEffect(() => {
    if (!selectedDriver || typeof navigator === 'undefined' || !navigator.geolocation) return
    let lastSent = 0
    const send = (pos: GeolocationPosition) => {
      const now = Date.now()
      if (now - lastSent < 25000) return // throttle to ~30s
      lastSent = now
      fetch('/api/driver/location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driverId: selectedDriver,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          heading: pos.coords.heading,
          speed_kmh: pos.coords.speed != null ? pos.coords.speed * 3.6 : null,
          accuracy_m: pos.coords.accuracy,
        }),
      }).catch(() => null)
    }
    const watchId = navigator.geolocation.watchPosition(send, () => null, {
      enableHighAccuracy: true, maximumAge: 15000, timeout: 20000,
    })
    return () => navigator.geolocation.clearWatch(watchId)
  }, [selectedDriver])

  const loadDriversAndRoutes = async () => {
    const sb = createClient()
    const [driversRes, routesRes] = await Promise.all([
      sb.from('staff').select('id, name, role, phone').eq('active', true),
      sb.from('routes').select('id, name, driver_id').eq('active', true),
    ])
    setDrivers(driversRes.data ?? [])
    setRoutes(routesRes.data ?? [])

    // Auto-select first driver
    const firstDriver = driversRes.data?.[0]
    if (firstDriver) setSelectedDriver(firstDriver.id)
    else loadDeliveries()
  }

  const loadDeliveries = async () => {
    setLoading(true)
    const sb = createClient()
    let query = sb.from('deliveries')
      .select('*, customer:customers(name, city, address, contact_phone)')
      .eq('delivery_date', today)
      .order('created_at')

    if (selectedRoute !== 'all') {
      query = query.eq('route_id', selectedRoute)
    }

    const { data } = await query
    setDeliveries(data ?? [])
    setLoading(false)
  }

  const currentDriver = drivers.find(d => d.id === selectedDriver)
  const driverRoutes = routes.filter(r => r.driver_id === selectedDriver || selectedDriver === '')
  const pending = deliveries.filter(d => ['pending', 'in_progress', 'in_transit'].includes(d.status))
  const completed = deliveries.filter(d => ['completed', 'delivered'].includes(d.status))
  const failed = deliveries.filter(d => d.status === 'failed')

  const totalBottles = deliveries.reduce((s, d) => s + (d.delivered_350ml ?? 0) + (d.delivered_750ml ?? 0), 0)

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col max-w-md mx-auto relative">

      {/* Driver Picker Overlay */}
      {showDriverPicker && (
        <div className="absolute inset-0 bg-slate-900 z-50 p-5 pt-12">
          <h2 className="text-xl font-bold mb-6">Who's driving today?</h2>
          <div className="space-y-2">
            {drivers.map(d => (
              <button key={d.id} onClick={() => { setSelectedDriver(d.id); setShowDriverPicker(false) }}
                className={`w-full flex items-center gap-4 px-4 py-4 rounded-2xl text-left transition-colors ${selectedDriver === d.id ? 'bg-cyan-600' : 'bg-slate-800 hover:bg-slate-700'}`}>
                <div className="w-10 h-10 bg-slate-700 rounded-xl flex items-center justify-center flex-shrink-0">
                  <User className="w-5 h-5 text-slate-300" />
                </div>
                <div>
                  <p className="font-semibold">{d.name}</p>
                  <p className="text-xs text-slate-400 capitalize">{d.role}</p>
                </div>
                {selectedDriver === d.id && <CheckCircle2 className="w-5 h-5 ml-auto text-white" />}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="px-5 pt-12 pb-5 bg-slate-900">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-cyan-500 rounded-xl flex items-center justify-center">
              <Droplets className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xs text-slate-400">Driver Portal</p>
              <h1 className="font-bold text-base leading-tight">Kembali Water</h1>
            </div>
          </div>
          <button onClick={() => setShowDriverPicker(true)}
            className="flex items-center gap-2 bg-slate-800 rounded-xl px-3 py-2 text-sm">
            <User className="w-4 h-4 text-slate-400" />
            <span className="text-slate-200">{currentDriver?.name ?? 'Select Driver'}</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>
        </div>

        <p className="text-slate-400 text-sm">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>

        {/* Route Filter */}
        {driverRoutes.length > 0 && (
          <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
            <button onClick={() => setSelectedRoute('all')}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${selectedRoute === 'all' ? 'bg-cyan-500 text-white' : 'bg-slate-700 text-slate-300'}`}>
              All Routes
            </button>
            {driverRoutes.map(r => (
              <button key={r.id} onClick={() => setSelectedRoute(r.id)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${selectedRoute === r.id ? 'bg-cyan-500 text-white' : 'bg-slate-700 text-slate-300'}`}>
                {r.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2 px-5 pb-5">
        <div className="bg-slate-800 rounded-2xl p-3 text-center">
          <div className="text-2xl font-bold text-amber-400">{pending.length}</div>
          <div className="text-xs text-slate-400 mt-0.5">Pending</div>
        </div>
        <div className="bg-slate-800 rounded-2xl p-3 text-center">
          <div className="text-2xl font-bold text-emerald-400">{completed.length}</div>
          <div className="text-xs text-slate-400 mt-0.5">Done</div>
        </div>
        <div className="bg-slate-800 rounded-2xl p-3 text-center">
          <div className="text-2xl font-bold text-red-400">{failed.length}</div>
          <div className="text-xs text-slate-400 mt-0.5">Failed</div>
        </div>
        <div className="bg-slate-800 rounded-2xl p-3 text-center">
          <div className="text-xl font-bold text-cyan-400">{totalBottles}</div>
          <div className="text-xs text-slate-400 mt-0.5">Bottles</div>
        </div>
      </div>

      {/* Progress Bar */}
      {deliveries.length > 0 && (
        <div className="px-5 pb-4">
          <div className="flex justify-between text-xs text-slate-400 mb-1.5">
            <span>Progress</span>
            <span>{completed.length}/{deliveries.length} deliveries</span>
          </div>
          <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full transition-all"
              style={{ width: `${deliveries.length > 0 ? (completed.length / deliveries.length * 100) : 0}%` }} />
          </div>
        </div>
      )}

      {/* Deliveries List */}
      <div className="flex-1 bg-slate-100 rounded-t-3xl px-4 pt-6 pb-8 space-y-3">
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
          </div>
        ) : deliveries.length === 0 ? (
          <div className="text-center py-16">
            <Truck className="w-10 h-10 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 font-medium">No deliveries today</p>
            <p className="text-slate-300 text-sm mt-1">Check back after routes are generated</p>
          </div>
        ) : (
          <>
            {pending.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 px-1">To Do ({pending.length})</p>
                <div className="space-y-2">
                  {pending.map((d, idx) => (
                    <div key={d.id} className="bg-white rounded-2xl p-4 shadow-sm">
                      <div className="flex items-start gap-3 mb-3">
                        <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-xs font-bold text-slate-500 flex-shrink-0 mt-0.5">
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-slate-800 text-base">{d.customer?.name}</p>
                          <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">{d.customer?.address}, {d.customer?.city}</span>
                          </p>
                          {d.customer?.contact_phone && (
                            <div className="flex items-center gap-2 mt-0.5">
                              <a href={`tel:${d.customer.contact_phone}`} className="text-xs text-cyan-600 flex items-center gap-1">
                                <Phone className="w-3 h-3" />{d.customer.contact_phone}
                              </a>
                              <a href={`https://wa.me/${d.customer.contact_phone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer"
                                className="text-xs text-emerald-600 font-medium">
                                💬 WA
                              </a>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500 mb-3 px-1">
                        {d.delivered_350ml > 0 && <span className="bg-slate-100 px-2 py-1 rounded-lg">{d.delivered_350ml}×350ml</span>}
                        {d.delivered_750ml > 0 && <span className="bg-slate-100 px-2 py-1 rounded-lg">{d.delivered_750ml}×750ml</span>}
                        {d.notes && <span className="text-slate-400 italic truncate">📋 {d.notes}</span>}
                      </div>
                      <div className="flex gap-2">
                        <a href={`https://maps.google.com/?q=${encodeURIComponent((d.customer?.address ?? '') + ' ' + (d.customer?.city ?? ''))}`}
                          target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1.5 border border-slate-200 text-slate-600 px-3 py-2.5 rounded-xl text-sm font-medium">
                          <Navigation className="w-4 h-4" /> Maps
                        </a>
                        <Link href={`/deliver/${d.id}`}
                          className="flex-1 bg-cyan-600 active:bg-cyan-700 text-white text-center py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-1.5">
                          <Truck className="w-4 h-4" /> Start Delivery
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {failed.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-2 px-1 mt-4">Failed ({failed.length})</p>
                <div className="space-y-2">
                  {failed.map(d => (
                    <div key={d.id} className="bg-red-50 border border-red-100 rounded-2xl p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
                          <span className="text-xs">✕</span>
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-slate-700">{d.customer?.name}</p>
                          <p className="text-xs text-red-500 mt-0.5">{d.failure_reason ?? 'Delivery failed'}</p>
                        </div>
                        <Link href={`/deliver/${d.id}`} className="text-xs text-cyan-600 font-medium">Retry</Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {completed.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 px-1 mt-4">Completed ({completed.length})</p>
                <div className="space-y-2">
                  {completed.map(d => (
                    <div key={d.id} className="bg-white rounded-2xl p-4 shadow-sm opacity-60">
                      <div className="flex items-center gap-3">
                        <CheckCircle2 className="w-6 h-6 text-emerald-500 flex-shrink-0" />
                        <div className="flex-1">
                          <p className="font-medium text-slate-700">{d.customer?.name}</p>
                          {d.signature_confirmed_by && (
                            <p className="text-xs text-slate-400">Signed: {d.signature_confirmed_by}</p>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 text-right">
                          {d.delivered_350ml > 0 && <div>{d.delivered_350ml}×350ml</div>}
                          {d.delivered_750ml > 0 && <div>{d.delivered_750ml}×750ml</div>}
                          {d.collected_350ml + d.collected_750ml > 0 && (
                            <div className="text-emerald-500">↩ {d.collected_350ml + d.collected_750ml} back</div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
