'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Topbar } from '@/components/layout/topbar'
import { Plus, X, MapPin, CheckCircle2, Clock, Navigation, Phone, Building2, Route, Calendar, AlertCircle, ChevronRight, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type Lead = { id: string; company_name: string; contact_name: string | null; contact_phone: string | null; address: string | null; stage: string }
type Stop = { id: string; route_id: string; lead_id: string; order_index: number; status: string; arrived_at: string | null; departed_at: string | null; notes: string | null; lead?: Lead }
type Route = { id: string; name: string; date: string; salesperson_id: string | null; status: string; notes: string | null; stops?: Stop[] }

const STATUS_COLORS: Record<string, string> = {
  planned: '#94A3B8',
  in_progress: '#F59E0B',
  completed: '#10B981',
}

export default function RoutesPage() {
  const [routes, setRoutes] = useState<Route[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [activeRoute, setActiveRoute] = useState<Route | null>(null)
  const [showNewRoute, setShowNewRoute] = useState(false)
  const [showAddStop, setShowAddStop] = useState(false)
  const [loading, setLoading] = useState(true)
  const [routeName, setRouteName] = useState('')
  const [routeDate, setRouteDate] = useState(new Date().toISOString().split('T')[0])
  const [routeNotes, setRouteNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [selectedLeadId, setSelectedLeadId] = useState('')
  const [trackingActive, setTrackingActive] = useState(false)
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null)
  const watchRef = useRef<number | null>(null)
  const sb = createClient()

  const load = async () => {
    const { data: routeData } = await sb
      .from('sales_routes')
      .select('*')
      .eq('date', selectedDate)
      .order('created_at')

    const routeIds = (routeData ?? []).map(r => r.id)
    let stops: any[] = []
    if (routeIds.length) {
      const { data: stopData } = await sb
        .from('sales_route_stops')
        .select('*, lead:sales_leads(id, company_name, contact_name, contact_phone, address, stage)')
        .in('route_id', routeIds)
        .order('order_index')
      stops = stopData ?? []
    }

    const { data: leadData } = await sb
      .from('sales_leads')
      .select('id, company_name, contact_name, contact_phone, address, stage')
      .not('stage', 'in', '("closed_lost")')
      .order('company_name')

    const enriched = (routeData ?? []).map(r => ({
      ...r,
      stops: stops.filter(s => s.route_id === r.id),
    }))

    setRoutes(enriched)
    setLeads(leadData ?? [])
    setLoading(false)

    if (activeRoute) {
      setActiveRoute(enriched.find(r => r.id === activeRoute.id) ?? null)
    }
  }

  useEffect(() => { load() }, [selectedDate])

  const createRoute = async () => {
    if (!routeName.trim()) return
    setSaving(true)
    const { data } = await sb.from('sales_routes').insert({ name: routeName.trim(), date: routeDate, notes: routeNotes || null }).select().single()
    await load()
    setActiveRoute({ ...data, stops: [] })
    setShowNewRoute(false)
    setRouteName('')
    setRouteDate(new Date().toISOString().split('T')[0])
    setRouteNotes('')
    setSaving(false)
  }

  const addStop = async () => {
    if (!activeRoute || !selectedLeadId) return
    setSaving(true)
    const maxOrder = (activeRoute.stops ?? []).reduce((m, s) => Math.max(m, s.order_index), -1)
    await sb.from('sales_route_stops').insert({ route_id: activeRoute.id, lead_id: selectedLeadId, order_index: maxOrder + 1 })
    await load()
    setShowAddStop(false)
    setSelectedLeadId('')
    setSaving(false)
  }

  const updateStopStatus = async (stopId: string, status: string) => {
    const now = new Date().toISOString()
    const update: any = { status }
    if (status === 'visiting') update.arrived_at = now
    if (status === 'done') update.departed_at = now
    await sb.from('sales_route_stops').update(update).eq('id', stopId)
    await load()
  }

  const removeStop = async (stopId: string) => {
    await sb.from('sales_route_stops').delete().eq('id', stopId)
    await load()
  }

  const startRouteTracking = async (route: Route) => {
    await sb.from('sales_routes').update({ status: 'in_progress' }).eq('id', route.id)
    setTrackingActive(true)
    if (navigator.geolocation) {
      watchRef.current = navigator.geolocation.watchPosition(pos => {
        setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude })
      }, null, { enableHighAccuracy: true })
    }
    await load()
  }

  const finishRoute = async (route: Route) => {
    await sb.from('sales_routes').update({ status: 'completed' }).eq('id', route.id)
    if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current)
    setTrackingActive(false)
    await load()
  }

  const openMaps = (address: string) => {
    const enc = encodeURIComponent(address)
    window.open(`https://maps.google.com/?q=${enc}`, '_blank')
  }

  const stopLeads = (activeRoute?.stops ?? []).map(s => s.lead_id)
  const availableLeads = leads.filter(l => !stopLeads.includes(l.id))

  return (
    <>
      <Topbar title="Daily Routes" />
      <div className="flex-1 flex overflow-hidden">
        {/* Route list panel */}
        <div className="w-72 border-r border-gray-100 flex flex-col bg-gray-50 flex-shrink-0">
          <div className="p-4 border-b border-gray-100 bg-white space-y-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
                className="flex-1 text-sm border border-gray-200 rounded-xl px-2 py-1.5 focus:outline-none focus:border-[#5BA3A0]" />
            </div>
            <button onClick={() => setShowNewRoute(true)}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-white text-sm font-medium"
              style={{ background: '#5BA3A0' }}>
              <Plus className="w-4 h-4" /> New Route
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 text-[#5BA3A0] animate-spin" /></div>
            ) : routes.length === 0 ? (
              <div className="text-center py-8">
                <Route className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No routes for this date</p>
              </div>
            ) : routes.map(r => (
              <button key={r.id} onClick={() => setActiveRoute(r)}
                className={cn('w-full text-left p-3 rounded-xl border transition-all', activeRoute?.id === r.id ? 'bg-white border-[#5BA3A0] shadow-sm' : 'bg-white border-gray-100 hover:border-gray-200')}>
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-sm text-gray-900 truncate">{r.name}</p>
                  <div className="w-2 h-2 rounded-full flex-shrink-0 ml-2" style={{ background: STATUS_COLORS[r.status] ?? '#94A3B8' }} />
                </div>
                <p className="text-xs text-gray-400 mt-0.5 capitalize">{r.status.replace('_', ' ')} · {(r.stops ?? []).length} stops</p>
              </button>
            ))}
          </div>
        </div>

        {/* Route detail panel */}
        <div className="flex-1 overflow-y-auto">
          {!activeRoute ? (
            <div className="flex-1 flex items-center justify-center h-full">
              <div className="text-center">
                <Route className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">Select a route to view details</p>
              </div>
            </div>
          ) : (
            <div className="p-6 space-y-5 max-w-2xl">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{activeRoute.name}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full capitalize"
                      style={{ background: STATUS_COLORS[activeRoute.status] + '20', color: STATUS_COLORS[activeRoute.status] }}>
                      {activeRoute.status.replace('_', ' ')}
                    </span>
                    <span className="text-xs text-gray-400">{(activeRoute.stops ?? []).length} stops</span>
                    {trackingActive && userPos && (
                      <span className="text-xs text-green-600 flex items-center gap-1 font-medium">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                        Live tracking
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  {activeRoute.status === 'planned' && (
                    <button onClick={() => startRouteTracking(activeRoute)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-sm font-medium"
                      style={{ background: '#F59E0B' }}>
                      <Navigation className="w-4 h-4" /> Start Route
                    </button>
                  )}
                  {activeRoute.status === 'in_progress' && (
                    <button onClick={() => finishRoute(activeRoute)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-sm font-medium"
                      style={{ background: '#10B981' }}>
                      <CheckCircle2 className="w-4 h-4" /> Finish Route
                    </button>
                  )}
                  <button onClick={() => setShowAddStop(true)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border border-gray-200 hover:bg-gray-50 text-gray-700">
                    <Plus className="w-4 h-4" /> Add Stop
                  </button>
                </div>
              </div>

              {/* Live position */}
              {userPos && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-2">
                  <Navigation className="w-4 h-4 text-green-600" />
                  <span className="text-sm text-green-700 font-medium">Your location: {userPos.lat.toFixed(5)}, {userPos.lng.toFixed(5)}</span>
                </div>
              )}

              {/* Stops */}
              {(activeRoute.stops ?? []).length === 0 ? (
                <div className="bg-gray-50 rounded-2xl p-8 text-center border-2 border-dashed border-gray-200">
                  <MapPin className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">No stops yet. Add leads to visit.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {(activeRoute.stops ?? []).sort((a, b) => a.order_index - b.order_index).map((stop, idx) => {
                    const lead = stop.lead as Lead | undefined
                    const isDone = stop.status === 'done'
                    const isVisiting = stop.status === 'visiting'
                    return (
                      <div key={stop.id}
                        className={cn('bg-white rounded-2xl border p-4 transition-all', isDone ? 'border-green-200 opacity-70' : isVisiting ? 'border-[#5BA3A0] shadow-md' : 'border-gray-100 shadow-sm')}>
                        <div className="flex items-start gap-3">
                          <div className={cn('w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-bold',
                            isDone ? 'bg-green-100 text-green-700' : isVisiting ? 'bg-[#5BA3A0] text-white' : 'bg-gray-100 text-gray-600')}>
                            {isDone ? '✓' : idx + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={cn('font-semibold text-sm', isDone ? 'line-through text-gray-400' : 'text-gray-900')}>
                              {lead?.company_name ?? 'Unknown'}
                            </p>
                            {lead?.contact_name && <p className="text-xs text-gray-500">{lead.contact_name}</p>}
                            {lead?.address && (
                              <button onClick={() => lead?.address && openMaps(lead.address)}
                                className="text-xs text-[#5BA3A0] hover:underline flex items-center gap-1 mt-0.5">
                                <MapPin className="w-3 h-3" />{lead.address}
                              </button>
                            )}
                            {stop.arrived_at && (
                              <p className="text-xs text-gray-400 mt-1">
                                Arrived: {new Date(stop.arrived_at).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}
                                {stop.departed_at && ` · Left: ${new Date(stop.departed_at).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}`}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {lead?.contact_phone && (
                              <a href={`tel:${lead.contact_phone}`}
                                className="w-8 h-8 rounded-lg bg-gray-50 hover:bg-[#EBF7F7] flex items-center justify-center transition-colors"
                                onClick={e => e.stopPropagation()}>
                                <Phone className="w-3.5 h-3.5 text-gray-500" />
                              </a>
                            )}
                            {!isDone && activeRoute.status === 'in_progress' && (
                              <button onClick={() => updateStopStatus(stop.id, isVisiting ? 'done' : 'visiting')}
                                className={cn('text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors', isVisiting ? 'bg-green-500 text-white' : 'bg-[#5BA3A0] text-white')}>
                                {isVisiting ? 'Mark Done' : 'Arrive'}
                              </button>
                            )}
                            <button onClick={() => removeStop(stop.id)} className="w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center text-gray-300 hover:text-red-400 transition-colors">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* New Route Modal */}
      {showNewRoute && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">New Route</h2>
              <button onClick={() => setShowNewRoute(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Route Name *</label>
                <input value={routeName} onChange={e => setRouteName(e.target.value)}
                  placeholder="e.g. Seminyak Morning Run"
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#5BA3A0]" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</label>
                <input type="date" value={routeDate} onChange={e => setRouteDate(e.target.value)}
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#5BA3A0]" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Notes</label>
                <textarea value={routeNotes} onChange={e => setRouteNotes(e.target.value)} rows={2}
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#5BA3A0] resize-none" />
              </div>
            </div>
            <div className="px-5 pb-5 flex justify-end gap-2">
              <button onClick={() => setShowNewRoute(false)} className="px-4 py-2 rounded-xl text-sm text-gray-600 border border-gray-200 hover:bg-gray-50">Cancel</button>
              <button onClick={createRoute} disabled={saving || !routeName.trim()}
                className="px-5 py-2 rounded-xl text-sm text-white font-medium disabled:opacity-50"
                style={{ background: '#5BA3A0' }}>
                {saving ? 'Creating...' : 'Create Route'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Stop Modal */}
      {showAddStop && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">Add Stop</h2>
              <button onClick={() => setShowAddStop(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="p-5">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Select Lead</label>
              <select value={selectedLeadId} onChange={e => setSelectedLeadId(e.target.value)}
                className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#5BA3A0] bg-white">
                <option value="">Choose a lead...</option>
                {availableLeads.map(l => (
                  <option key={l.id} value={l.id}>{l.company_name}{l.address ? ` — ${l.address}` : ''}</option>
                ))}
              </select>
            </div>
            <div className="px-5 pb-5 flex justify-end gap-2">
              <button onClick={() => setShowAddStop(false)} className="px-4 py-2 rounded-xl text-sm text-gray-600 border border-gray-200 hover:bg-gray-50">Cancel</button>
              <button onClick={addStop} disabled={saving || !selectedLeadId}
                className="px-5 py-2 rounded-xl text-sm text-white font-medium disabled:opacity-50"
                style={{ background: '#5BA3A0' }}>
                {saving ? 'Adding...' : 'Add Stop'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
