'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Topbar } from '@/components/layout/topbar'
import {
  MapPin, Plus, Loader2, Check, X, Truck, User, Clock,
  ChevronRight, GripVertical, Trash2, Play, Edit2, Route,
  Calendar, Navigation
} from 'lucide-react'

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

export default function RoutesPage() {
  const [routes, setRoutes] = useState<any[]>([])
  const [staff, setStaff] = useState<any[]>([])
  const [vehicles, setVehicles] = useState<any[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedRoute, setSelectedRoute] = useState<any>(null)
  const [stops, setStops] = useState<any[]>([])
  const [showRouteForm, setShowRouteForm] = useState(false)
  const [showStopForm, setShowStopForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)

  const [routeForm, setRouteForm] = useState({
    name: '',
    driver_id: '',
    vehicle_id: '',
    day_of_week: [] as string[],
    estimated_duration_mins: '',
    estimated_km: '',
    notes: '',
  })

  const [stopForm, setStopForm] = useState({
    customer_id: '',
    stop_order: 1,
    estimated_arrival: '',
    time_window_start: '',
    time_window_end: '',
    notes: '',
  })

  useEffect(() => {
    loadAll()
  }, [])

  useEffect(() => {
    if (selectedRoute) loadStops(selectedRoute.id)
  }, [selectedRoute])

  const loadAll = async () => {
    setLoading(true)
    const sb = createClient()
    const [routesRes, staffRes, vehiclesRes, customersRes] = await Promise.all([
      sb.from('routes').select('*, driver:staff(name), vehicle:vehicles(name, plate_number)').eq('active', true).order('name'),
      sb.from('staff').select('id, name, role').eq('active', true).in('role', ['driver', 'delivery']),
      sb.from('vehicles').select('id, name, plate_number').eq('status', 'active'),
      sb.from('customers').select('id, name, city, address').eq('active', true).order('name'),
    ])
    setRoutes(routesRes.data ?? [])
    setStaff(staffRes.data ?? [])
    setVehicles(vehiclesRes.data ?? [])
    setCustomers(customersRes.data ?? [])
    setLoading(false)
  }

  const loadStops = async (routeId: string) => {
    const sb = createClient()
    const { data } = await sb.from('route_stops')
      .select('*, customer:customers(name, city, address)')
      .eq('route_id', routeId)
      .order('stop_order')
    setStops(data ?? [])
    setStopForm(f => ({ ...f, stop_order: (data?.length ?? 0) + 1 }))
  }

  const saveRoute = async () => {
    if (!routeForm.name) return
    setSaving(true)
    const sb = createClient()
    const payload = {
      name: routeForm.name,
      driver_id: routeForm.driver_id || null,
      vehicle_id: routeForm.vehicle_id || null,
      day_of_week: routeForm.day_of_week,
      estimated_duration_mins: routeForm.estimated_duration_mins ? Number(routeForm.estimated_duration_mins) : null,
      estimated_km: routeForm.estimated_km ? Number(routeForm.estimated_km) : null,
      notes: routeForm.notes || null,
    }
    const { data } = await sb.from('routes').insert(payload).select('*, driver:staff(name), vehicle:vehicles(name, plate_number)').single()
    if (data) setRoutes([...routes, data])
    setShowRouteForm(false)
    setRouteForm({ name: '', driver_id: '', vehicle_id: '', day_of_week: [], estimated_duration_mins: '', estimated_km: '', notes: '' })
    setSaving(false)
  }

  const addStop = async () => {
    if (!stopForm.customer_id || !selectedRoute) return
    setSaving(true)
    const sb = createClient()
    const { data } = await sb.from('route_stops').insert({
      route_id: selectedRoute.id,
      customer_id: stopForm.customer_id,
      stop_order: stopForm.stop_order,
      estimated_arrival: stopForm.estimated_arrival || null,
      time_window_start: stopForm.time_window_start || null,
      time_window_end: stopForm.time_window_end || null,
      notes: stopForm.notes || null,
    }).select('*, customer:customers(name, city, address)').single()
    if (data) {
      const newStops = [...stops, data].sort((a, b) => a.stop_order - b.stop_order)
      setStops(newStops)
      setStopForm(f => ({ ...f, customer_id: '', stop_order: newStops.length + 1, estimated_arrival: '', notes: '' }))
    }
    setShowStopForm(false)
    setSaving(false)
  }

  const deleteStop = async (stopId: string) => {
    const sb = createClient()
    await sb.from('route_stops').delete().eq('id', stopId)
    const newStops = stops.filter(s => s.id !== stopId)
    setStops(newStops)
  }

  const generateDeliveries = async () => {
    if (!selectedRoute) return
    setGenerating(true)
    const today = new Date().toISOString().split('T')[0]
    const sb = createClient()
    let created = 0

    for (const stop of stops) {
      const { data: existing } = await sb.from('deliveries')
        .select('id').eq('customer_id', stop.customer_id).eq('delivery_date', today).limit(1)
      if (existing && existing.length > 0) continue

      await sb.from('deliveries').insert({
        customer_id: stop.customer_id,
        route_id: selectedRoute.id,
        delivery_date: today,
        status: 'pending',
        delivered_350ml: 0,
        delivered_750ml: 0,
        collected_350ml: 0,
        collected_750ml: 0,
        damaged_350ml: 0,
        damaged_750ml: 0,
      })
      created++
    }

    setGenerating(false)
    alert(`Generated ${created} deliveries for ${selectedRoute.name} today. ${stops.length - created} already existed.`)
  }

  const toggleDay = (day: string) => {
    setRouteForm(f => ({
      ...f,
      day_of_week: f.day_of_week.includes(day) ? f.day_of_week.filter(d => d !== day) : [...f.day_of_week, day]
    }))
  }

  return (
    <>
      <Topbar title="Route Management" />
      <div className="flex h-[calc(100vh-57px)]">
        {/* Routes List Panel */}
        <div className="w-72 border-r border-slate-200 bg-white flex flex-col flex-shrink-0">
          <div className="p-4 border-b border-slate-100">
            <button onClick={() => setShowRouteForm(true)}
              className="w-full flex items-center justify-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white py-2 rounded-xl text-sm font-medium transition-colors">
              <Plus className="w-4 h-4" /> New Route
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {routes.length === 0 ? (
                <div className="text-center py-12 text-slate-400 px-4">
                  <Route className="w-8 h-8 mx-auto mb-2 text-slate-200" />
                  <p className="text-sm">No routes yet</p>
                </div>
              ) : routes.map(route => (
                <button key={route.id} onClick={() => setSelectedRoute(route)}
                  className={`w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors ${selectedRoute?.id === route.id ? 'bg-cyan-50 border-l-2 border-l-cyan-500' : ''}`}>
                  <p className="font-medium text-slate-800 text-sm">{route.name}</p>
                  <div className="flex items-center gap-3 mt-1">
                    {route.driver && <span className="text-xs text-slate-400 flex items-center gap-1"><User className="w-3 h-3" />{route.driver.name}</span>}
                    {route.vehicle && <span className="text-xs text-slate-400 flex items-center gap-1"><Truck className="w-3 h-3" />{route.vehicle.name}</span>}
                  </div>
                  {route.day_of_week?.length > 0 && (
                    <div className="flex gap-1 mt-1.5 flex-wrap">
                      {route.day_of_week.map((d: string) => (
                        <span key={d} className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded capitalize">{d.slice(0, 3)}</span>
                      ))}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Route Detail Panel */}
        <div className="flex-1 overflow-y-auto bg-slate-50">
          {!selectedRoute ? (
            <div className="flex items-center justify-center h-full text-slate-400">
              <div className="text-center">
                <MapPin className="w-12 h-12 mx-auto mb-3 text-slate-200" />
                <p className="font-medium">Select a route to view stops</p>
                <p className="text-sm mt-1">or create a new route</p>
              </div>
            </div>
          ) : (
            <div className="p-6 space-y-6">
              {/* Route Header */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-slate-800">{selectedRoute.name}</h2>
                    <div className="flex items-center gap-4 mt-2 text-sm text-slate-500">
                      {selectedRoute.driver && <span className="flex items-center gap-1.5"><User className="w-4 h-4" />{selectedRoute.driver.name}</span>}
                      {selectedRoute.vehicle && <span className="flex items-center gap-1.5"><Truck className="w-4 h-4" />{selectedRoute.vehicle.name} · {selectedRoute.vehicle.plate_number}</span>}
                      {selectedRoute.estimated_duration_mins && <span className="flex items-center gap-1.5"><Clock className="w-4 h-4" />{selectedRoute.estimated_duration_mins} min</span>}
                      {selectedRoute.estimated_km && <span className="flex items-center gap-1.5"><Navigation className="w-4 h-4" />{selectedRoute.estimated_km} km</span>}
                    </div>
                    {selectedRoute.day_of_week?.length > 0 && (
                      <div className="flex gap-1.5 mt-3">
                        {DAYS.map(d => (
                          <span key={d} className={`text-xs px-2 py-1 rounded-lg capitalize font-medium ${selectedRoute.day_of_week.includes(d) ? 'bg-cyan-100 text-cyan-700' : 'bg-slate-100 text-slate-300'}`}>
                            {d.slice(0, 3)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <button onClick={generateDeliveries} disabled={generating || stops.length === 0}
                    className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
                    {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    Generate Today's Deliveries
                  </button>
                </div>
                {selectedRoute.notes && <p className="text-sm text-slate-500 mt-3 bg-slate-50 rounded-xl px-3 py-2">{selectedRoute.notes}</p>}
              </div>

              {/* Stops */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-slate-800">Route Stops</h3>
                    <p className="text-xs text-slate-400 mt-0.5">{stops.length} stops · in delivery order</p>
                  </div>
                  <button onClick={() => setShowStopForm(!showStopForm)}
                    className="flex items-center gap-1.5 text-sm text-cyan-600 hover:text-cyan-700 font-medium">
                    <Plus className="w-4 h-4" /> Add Stop
                  </button>
                </div>

                {showStopForm && (
                  <div className="mx-5 my-4 bg-slate-50 rounded-xl p-4 space-y-3 border border-slate-200">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2">
                        <label className="text-xs font-medium text-slate-600 block mb-1">Customer *</label>
                        <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
                          value={stopForm.customer_id} onChange={e => setStopForm({ ...stopForm, customer_id: e.target.value })}>
                          <option value="">Select customer...</option>
                          {customers.map(c => <option key={c.id} value={c.id}>{c.name} — {c.city}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-600 block mb-1">Stop Order</label>
                        <input type="number" min="1" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
                          value={stopForm.stop_order} onChange={e => setStopForm({ ...stopForm, stop_order: Number(e.target.value) })} />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-600 block mb-1">Est. Arrival</label>
                        <input type="time" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
                          value={stopForm.estimated_arrival} onChange={e => setStopForm({ ...stopForm, estimated_arrival: e.target.value })} />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-600 block mb-1">Time Window Start</label>
                        <input type="time" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
                          value={stopForm.time_window_start} onChange={e => setStopForm({ ...stopForm, time_window_start: e.target.value })} />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-600 block mb-1">Time Window End</label>
                        <input type="time" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
                          value={stopForm.time_window_end} onChange={e => setStopForm({ ...stopForm, time_window_end: e.target.value })} />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600 block mb-1">Notes</label>
                      <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
                        placeholder="Parking, access, special instructions..."
                        value={stopForm.notes} onChange={e => setStopForm({ ...stopForm, notes: e.target.value })} />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={addStop} disabled={saving || !stopForm.customer_id}
                        className="flex-1 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" />Add Stop</>}
                      </button>
                      <button onClick={() => setShowStopForm(false)} className="border border-slate-200 bg-white px-3 py-2 rounded-lg text-sm hover:bg-slate-50">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                <div className="divide-y divide-slate-50">
                  {stops.length === 0 ? (
                    <div className="px-5 py-10 text-center text-slate-400">
                      <MapPin className="w-6 h-6 mx-auto mb-2 text-slate-200" />
                      <p className="text-sm">No stops on this route yet</p>
                    </div>
                  ) : stops.map((stop, idx) => (
                    <div key={stop.id} className="px-5 py-3.5 flex items-center gap-3">
                      <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-xs font-bold text-slate-500 flex-shrink-0">
                        {stop.stop_order}
                      </div>
                      <div className="w-1 self-stretch bg-slate-100 rounded-full flex-shrink-0 mx-1" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-800 text-sm">{stop.customer?.name}</p>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-xs text-slate-400">{stop.customer?.city}</span>
                          {stop.estimated_arrival && (
                            <span className="text-xs text-slate-400 flex items-center gap-1">
                              <Clock className="w-3 h-3" /> {stop.estimated_arrival.slice(0, 5)}
                            </span>
                          )}
                          {stop.time_window_start && stop.time_window_end && (
                            <span className="text-xs text-slate-400">
                              {stop.time_window_start.slice(0, 5)} – {stop.time_window_end.slice(0, 5)}
                            </span>
                          )}
                        </div>
                        {stop.notes && <p className="text-xs text-slate-400 mt-0.5 italic">{stop.notes}</p>}
                      </div>
                      <button onClick={() => deleteStop(stop.id)} className="text-slate-300 hover:text-red-400 transition-colors p-1">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* New Route Modal */}
      {showRouteForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4">
            <h3 className="font-bold text-slate-800 text-lg">New Route</h3>

            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Route Name *</label>
              <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                placeholder="e.g. Seminyak Morning Run"
                value={routeForm.name} onChange={e => setRouteForm({ ...routeForm, name: e.target.value })} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Assign Driver</label>
                <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={routeForm.driver_id} onChange={e => setRouteForm({ ...routeForm, driver_id: e.target.value })}>
                  <option value="">Unassigned</option>
                  {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Assign Vehicle</label>
                <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={routeForm.vehicle_id} onChange={e => setRouteForm({ ...routeForm, vehicle_id: e.target.value })}>
                  <option value="">Unassigned</option>
                  {vehicles.map(v => <option key={v.id} value={v.id}>{v.name} ({v.plate_number})</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Est. Duration (min)</label>
                <input type="number" min="0" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={routeForm.estimated_duration_mins} onChange={e => setRouteForm({ ...routeForm, estimated_duration_mins: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Est. Distance (km)</label>
                <input type="number" min="0" step="0.1" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={routeForm.estimated_km} onChange={e => setRouteForm({ ...routeForm, estimated_km: e.target.value })} />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1.5">Active Days</label>
              <div className="flex gap-2 flex-wrap">
                {DAYS.map(day => (
                  <button key={day} type="button" onClick={() => toggleDay(day)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${routeForm.day_of_week.includes(day) ? 'bg-cyan-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                    {day.slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Notes</label>
              <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                placeholder="Any notes about this route..."
                value={routeForm.notes} onChange={e => setRouteForm({ ...routeForm, notes: e.target.value })} />
            </div>

            <div className="flex gap-2 pt-2">
              <button onClick={saveRoute} disabled={saving || !routeForm.name}
                className="flex-1 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" />Create Route</>}
              </button>
              <button onClick={() => setShowRouteForm(false)} className="border border-slate-200 px-4 py-2.5 rounded-xl text-sm hover:bg-slate-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
