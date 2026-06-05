'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Truck, MapPin, Package, CheckCircle2, Clock, Navigation,
  Plus, RotateCcw, AlertCircle, Loader2, ExternalLink, Users, Zap,
  Route, User, Trash2, Play, Check, X, Calendar, ChevronLeft, ChevronRight,
  Sparkles, Map,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getDeliveries, getRoutes, getStaff, getCustomers, createDelivery, createRoute, updateDeliveryStatus } from '@/lib/db'
import type { Delivery, Staff, Customer } from '@/types'
import Link from 'next/link'
import { GoogleMap, useJsApiLoader, Marker, Polyline, InfoWindow } from '@react-google-maps/api'

type Tab = 'live' | 'routes' | 'calendar'

const DAYS_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const ROUTE_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

const statusConfig = {
  pending: { label: 'Pending', color: 'bg-amber-100 text-amber-700', icon: Clock },
  in_transit: { label: 'In Transit', color: 'bg-blue-100 text-blue-700', icon: Navigation },
  completed: { label: 'Completed', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  failed: { label: 'Failed', color: 'bg-red-100 text-red-700', icon: AlertCircle },
}

const STATUS_DOT: Record<string, string> = {
  pending: 'bg-amber-400',
  in_transit: 'bg-blue-400',
  completed: 'bg-emerald-400',
  failed: 'bg-red-400',
  cancelled: 'bg-slate-300',
}

const today = new Date().toLocaleDateString('en-US', { weekday: 'long' })

// ─── TAB: LIVE DISPATCH ────────────────────────────────────────────────────────
function LiveDispatch() {
  const [selectedDay, setSelectedDay] = useState(today)
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [routes, setRoutes] = useState<any[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [routeOpen, setRouteOpen] = useState(false)
  const [routeForm, setRouteForm] = useState({ name: '', driver_id: '', days: [] as string[] })
  const [savingRoute, setSavingRoute] = useState(false)
  const [deliveryOpen, setDeliveryOpen] = useState(false)
  const [deliveryForm, setDeliveryForm] = useState({
    customer_id: '', driver_id: '', delivery_date: new Date().toISOString().split('T')[0],
    delivered_350ml: 0, delivered_750ml: 0,
  })
  const [savingDelivery, setSavingDelivery] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generateResult, setGenerateResult] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [d, r, s, c] = await Promise.all([getDeliveries({ date: selectedDate }), getRoutes(), getStaff(), getCustomers()])
      setDeliveries(d); setRoutes(r); setStaff(s); setCustomers(c)
    } finally { setLoading(false) }
  }, [selectedDate])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const sb = createClient()
    const channel = sb.channel('dispatch-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, () => { load() })
      .subscribe()
    return () => { sb.removeChannel(channel) }
  }, [load])

  const todayRoutes = routes.filter((r) => r.day_of_week?.map((d: string) => d.toLowerCase()).includes(selectedDay.toLowerCase()))
  const counts = {
    pending: deliveries.filter((d) => d.status === 'pending').length,
    in_transit: deliveries.filter((d) => d.status === 'in_transit').length,
    completed: deliveries.filter((d) => d.status === 'completed').length,
    failed: deliveries.filter((d) => d.status === 'failed').length,
  }
  const drivers = staff.filter((s) => s.role === 'driver')

  const dispatchAll = async () => {
    const pendingIds = deliveries.filter(d => d.status === 'pending').map(d => d.id)
    if (pendingIds.length === 0) return
    setDeliveries(prev => prev.map(d => pendingIds.includes(d.id) ? { ...d, status: 'in_transit' as const } : d))
    const sb = createClient()
    await sb.from('deliveries').update({ status: 'in_transit' }).in('id', pendingIds)
  }

  const handleCreateRoute = async () => {
    setSavingRoute(true); setRouteOpen(false)
    try {
      const newRoute = await createRoute({ name: routeForm.name, driver_id: routeForm.driver_id || null, day_of_week: routeForm.days })
      setRouteForm({ name: '', driver_id: '', days: [] })
      if (newRoute) setRoutes(prev => [...prev, newRoute])
    } finally { setSavingRoute(false) }
  }

  const handleCreateDelivery = async () => {
    if (!deliveryForm.customer_id) return
    setSavingDelivery(true); setDeliveryOpen(false)
    try {
      const newDel = await createDelivery({
        customer_id: deliveryForm.customer_id, driver_id: deliveryForm.driver_id || null,
        route_id: null, order_id: null, delivery_date: deliveryForm.delivery_date,
        status: 'pending' as const, delivered_350ml: deliveryForm.delivered_350ml,
        delivered_750ml: deliveryForm.delivered_750ml, collected_350ml: 0, collected_750ml: 0,
        damaged_350ml: 0, damaged_750ml: 0, driver_notes: null, signature_data: null, signature_confirmed_by: null,
      })
      if (newDel) setDeliveries(prev => [newDel, ...prev])
    } finally { setSavingDelivery(false) }
  }

  const handleGenerateDeliveries = async () => {
    setGenerating(true); setGenerateResult(null)
    try {
      const sb = createClient()
      const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase()
      const dateStr = new Date().toISOString().split('T')[0]
      const { data: subs } = await sb.from('customer_subscriptions').select('*, customer:customers(id, name)').eq('status', 'active').contains('delivery_days', [todayName])
      const { data: existing } = await sb.from('deliveries').select('customer_id').eq('delivery_date', dateStr)
      const existingCustomerIds = new Set((existing ?? []).map((d: any) => d.customer_id))
      const toCreate = (subs ?? []).filter((s: any) => !existingCustomerIds.has(s.customer_id))
      let created = 0
      for (const sub of toCreate) {
        await createDelivery({ customer_id: sub.customer_id, driver_id: null, route_id: null, order_id: null, delivery_date: dateStr, status: 'pending' as const, delivered_350ml: sub.qty_350ml ?? 0, delivered_750ml: sub.qty_750ml ?? 0, collected_350ml: 0, collected_750ml: 0, damaged_350ml: 0, damaged_750ml: 0, driver_notes: sub.special_instructions ?? null, signature_data: null, signature_confirmed_by: null })
        created++
      }
      setGenerateResult(created === 0 ? `All ${(subs ?? []).length} subscription deliveries already exist for today` : `Created ${created} deliveries from subscriptions`)
      load()
    } catch (e: any) { setGenerateResult(`Error: ${e.message}`) } finally { setGenerating(false) }
  }

  const markInTransit = (id: string) => {
    setDeliveries(prev => prev.map(d => d.id === id ? { ...d, status: 'in_transit' as const } : d))
    updateDeliveryStatus(id, 'in_transit')
  }
  const markCompleted = (id: string) => {
    setDeliveries(prev => prev.map(d => d.id === id ? { ...d, status: 'completed' as const } : d))
    const sb = createClient()
    sb.from('deliveries').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', id)
  }
  const markFailed = (id: string) => {
    const reason = prompt('Reason for failure (optional):') ?? ''
    setDeliveries(prev => prev.map(d => d.id === id ? { ...d, status: 'failed' as const } : d))
    const sb = createClient()
    sb.from('deliveries').update({ status: 'failed', failure_reason: reason || null }).eq('id', id)
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 text-xs text-emerald-600 font-medium">
          <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
          Live — updates automatically
        </div>
        <div className="flex items-center gap-3">
          {generateResult && <span className="text-xs text-slate-500 bg-slate-100 rounded-lg px-3 py-1.5">{generateResult}</span>}
          {counts.pending > 0 && (
            <button onClick={dispatchAll} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              <Navigation className="w-4 h-4" /> Dispatch All ({counts.pending})
            </button>
          )}
          <button onClick={handleGenerateDeliveries} disabled={generating} className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />} Generate Today's
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {DAYS_LONG.map((day) => (
            <button key={day} onClick={() => setSelectedDay(day)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${selectedDay === day ? 'bg-cyan-600 text-white' : 'bg-white border text-slate-600 hover:bg-slate-50'}`}>
              {day.slice(0, 3)}{day === today && <span className="ml-1 text-xs opacity-70">today</span>}
            </button>
          ))}
        </div>
        <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-700">Routes on {selectedDay.slice(0, 3)}</h2>
            <Dialog open={routeOpen} onOpenChange={setRouteOpen}>
              <DialogTrigger className="inline-flex items-center gap-1.5 rounded-lg border text-sm px-3 py-1.5 hover:bg-slate-50">
                <Plus className="w-3.5 h-3.5" /> New Route
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>Create Route</DialogTitle></DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-1">
                    <Label>Route Name *</Label>
                    <Input placeholder="e.g. Seminyak North" value={routeForm.name} onChange={(e) => setRouteForm({ ...routeForm, name: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Assigned Driver</Label>
                    <Select value={routeForm.driver_id} onValueChange={(v) => setRouteForm({ ...routeForm, driver_id: v ?? '' })}>
                      <SelectTrigger><SelectValue placeholder="Select driver" /></SelectTrigger>
                      <SelectContent>{drivers.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Days of Week</Label>
                    <div className="flex flex-wrap gap-2">
                      {DAYS_LONG.map((day) => (
                        <button key={day} onClick={() => {
                          const d = day.toLowerCase()
                          setRouteForm((f) => ({ ...f, days: f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d] }))
                        }} className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${routeForm.days.includes(day.toLowerCase()) ? 'bg-cyan-600 text-white border-cyan-600' : 'bg-white text-slate-600 border-slate-200'}`}>
                          {day.slice(0, 3)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setRouteOpen(false)}>Cancel</Button>
                    <Button className="bg-cyan-600 hover:bg-cyan-700" onClick={handleCreateRoute} disabled={savingRoute || !routeForm.name}>
                      {savingRoute && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Create Route
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          {loading ? <div className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-300 mx-auto" /></div>
            : todayRoutes.length === 0 ? (
              <div className="bg-white rounded-xl border p-6 text-center">
                <Truck className="w-7 h-7 text-slate-200 mx-auto mb-2" />
                <p className="text-sm text-slate-400 font-medium">No routes on {selectedDay}</p>
              </div>
            ) : todayRoutes.map((route) => (
              <div key={route.id} className="bg-white rounded-xl border p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-semibold text-slate-800">{route.name}</p>
                    <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5"><Users className="w-3 h-3" />{(route.driver as any)?.name ?? 'Unassigned'}</p>
                  </div>
                  <Badge className="bg-blue-100 text-blue-700 text-xs">{route.stops?.length ?? 0} stops</Badge>
                </div>
                {route.stops?.length > 0 && (
                  <div className="space-y-1 mt-3 border-t pt-3">
                    {(route.stops as any[]).sort((a, b) => a.stop_order - b.stop_order).map((stop, i) => (
                      <div key={stop.id} className="flex items-center gap-2 text-xs text-slate-500">
                        <span className="w-4 h-4 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 font-mono flex-shrink-0">{i + 1}</span>
                        {stop.customer?.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
        </div>

        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-700">Deliveries — {selectedDate}</h2>
            <Dialog open={deliveryOpen} onOpenChange={setDeliveryOpen}>
              <DialogTrigger className="inline-flex items-center gap-2 rounded-md bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium px-4 py-2 transition-colors">
                <Plus className="w-4 h-4" /> Add Delivery
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>New Delivery</DialogTitle></DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-1">
                    <Label>Customer *</Label>
                    <Select value={deliveryForm.customer_id} onValueChange={(v) => setDeliveryForm({ ...deliveryForm, customer_id: v ?? '' })}>
                      <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                      <SelectContent>{customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} — {c.city}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Driver</Label>
                    <Select value={deliveryForm.driver_id} onValueChange={(v) => setDeliveryForm({ ...deliveryForm, driver_id: v ?? '' })}>
                      <SelectTrigger><SelectValue placeholder="Assign driver" /></SelectTrigger>
                      <SelectContent>{drivers.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Date</Label>
                    <Input type="date" value={deliveryForm.delivery_date} onChange={(e) => setDeliveryForm({ ...deliveryForm, delivery_date: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1"><Label>350ml qty</Label><Input type="number" min="0" value={deliveryForm.delivered_350ml} onChange={(e) => setDeliveryForm({ ...deliveryForm, delivered_350ml: parseInt(e.target.value) || 0 })} /></div>
                    <div className="space-y-1"><Label>750ml qty</Label><Input type="number" min="0" value={deliveryForm.delivered_750ml} onChange={(e) => setDeliveryForm({ ...deliveryForm, delivered_750ml: parseInt(e.target.value) || 0 })} /></div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setDeliveryOpen(false)}>Cancel</Button>
                    <Button className="bg-cyan-600 hover:bg-cyan-700" onClick={handleCreateDelivery} disabled={savingDelivery || !deliveryForm.customer_id}>
                      {savingDelivery && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Create
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid grid-cols-4 gap-3">
            {(Object.entries(statusConfig) as [string, typeof statusConfig[keyof typeof statusConfig]][]).map(([key, { label, icon: Icon }]) => (
              <div key={key} className="bg-white rounded-lg border p-3 text-center">
                <Icon className="w-4 h-4 mx-auto mb-1 text-slate-400" />
                <div className="text-xl font-bold">{counts[key as keyof typeof counts]}</div>
                <div className="text-xs text-slate-500">{label}</div>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            {loading ? <div className="bg-white rounded-xl border p-8 text-center"><Loader2 className="w-6 h-6 animate-spin text-slate-300 mx-auto" /></div>
              : deliveries.length === 0 ? (
                <div className="bg-white rounded-xl border p-8 text-center">
                  <MapPin className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                  <p className="text-sm font-medium text-slate-400">No deliveries on this date</p>
                </div>
              ) : deliveries.map((d) => {
                const cfg = statusConfig[d.status]
                const Icon = cfg.icon
                const customer = d.customer as any
                return (
                  <div key={d.id} className="bg-white rounded-xl border p-4 flex items-center gap-4">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${cfg.color}`}><Icon className="w-4 h-4" /></div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800 truncate">{customer?.name}</p>
                      <p className="text-xs text-slate-400">{customer?.city}</p>
                      <div className="flex gap-3 mt-1 text-xs text-slate-500">
                        {d.delivered_350ml > 0 && <span>📦 {d.delivered_350ml}×350ml</span>}
                        {d.delivered_750ml > 0 && <span>📦 {d.delivered_750ml}×750ml</span>}
                        {(d.driver as any)?.name && <span>🚛 {(d.driver as any).name}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {d.status === 'pending' && <button onClick={() => markInTransit(d.id)} className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded-lg hover:bg-blue-50">Start</button>}
                      {d.status === 'in_transit' && (
                        <div className="flex gap-1">
                          <button onClick={() => markCompleted(d.id)} className="text-xs text-emerald-600 hover:text-emerald-800 font-medium px-2 py-1 rounded-lg hover:bg-emerald-50">✓ Done</button>
                          <button onClick={() => markFailed(d.id)} className="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 rounded-lg hover:bg-red-50">✕ Fail</button>
                        </div>
                      )}
                      {(d.status === 'pending' || d.status === 'in_transit') && (
                        <Link href={`/deliver/${d.id}`} className="flex items-center gap-1 bg-cyan-600 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-cyan-700">
                          Log <ExternalLink className="w-3 h-3" />
                        </Link>
                      )}
                      {d.status === 'completed' && <span className="text-xs text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />{d.signature_confirmed_by ?? 'Done'}</span>}
                      {d.status === 'failed' && <span className="text-xs text-red-500 font-medium">✕ Failed</span>}
                    </div>
                  </div>
                )
              })}
          </div>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><RotateCcw className="w-4 h-4 text-cyan-600" />Bottle Totals — {selectedDate}</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Delivered 350ml', value: deliveries.reduce((s, d) => s + d.delivered_350ml, 0), color: 'text-emerald-600' },
              { label: 'Delivered 750ml', value: deliveries.reduce((s, d) => s + d.delivered_750ml, 0), color: 'text-emerald-600' },
              { label: 'Collected 350ml', value: deliveries.reduce((s, d) => s + d.collected_350ml, 0), color: 'text-amber-600' },
              { label: 'Collected 750ml', value: deliveries.reduce((s, d) => s + d.collected_750ml, 0), color: 'text-amber-600' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-slate-50 rounded-lg p-4 text-center">
                <div className={`text-2xl font-bold ${color}`}>{value}</div>
                <div className="text-xs text-slate-500 mt-1">{label}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── GOOGLE MAP COMPONENT ─────────────────────────────────────────────────────
const BALI_CENTER = { lat: -8.4095, lng: 115.1889 }
const STOP_COLORS = ['#0EA5E4', '#7C3AED', '#059669', '#DC2626', '#D97706', '#0891B2', '#DB2777', '#65A30D']

function RouteMapPanel({ stops, optimizeResult }: { stops: any[]; optimizeResult: any }) {
  const { isLoaded } = useJsApiLoader({ googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '', id: 'kembali-maps' })
  const [activeStop, setActiveStop] = useState<string | null>(null)
  const [geocoded, setGeocoded] = useState<Record<string, { lat: number; lng: number }>>({})
  const [geocoding, setGeocoding] = useState(false)

  // Geocode stop addresses when stops change
  useEffect(() => {
    if (!isLoaded || stops.length === 0) return
    const geocodeStops = async () => {
      setGeocoding(true)
      const results: Record<string, { lat: number; lng: number }> = {}
      for (const stop of stops) {
        const customer = stop.customer
        if (!customer) continue
        const addr = [customer.address, customer.city, 'Bali, Indonesia'].filter(Boolean).join(', ')
        try {
          const geocoder = new (window as any).google.maps.Geocoder()
          await new Promise<void>((resolve) => {
            geocoder.geocode({ address: addr }, (res: any, status: any) => {
              if (status === 'OK' && res[0]) {
                results[stop.id] = { lat: res[0].geometry.location.lat(), lng: res[0].geometry.location.lng() }
              }
              resolve()
            })
          })
        } catch { /* skip */ }
      }
      setGeocoded(results); setGeocoding(false)
    }
    geocodeStops()
  }, [isLoaded, stops])

  const path = stops
    .filter(s => geocoded[s.id])
    .sort((a, b) => a.stop_order - b.stop_order)
    .map(s => geocoded[s.id])

  if (!isLoaded) return (
    <div className="flex items-center justify-center h-full bg-slate-100 rounded-xl">
      <div className="text-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" /><p className="text-sm">Loading map…</p></div>
    </div>
  )

  if (!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY === 'YOUR_GOOGLE_MAPS_API_KEY_HERE') return (
    <div className="flex items-center justify-center h-full bg-slate-100 rounded-xl border-2 border-dashed border-slate-300">
      <div className="text-center px-6">
        <Map className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <p className="font-semibold text-slate-500 text-sm">Google Maps not configured</p>
        <p className="text-xs text-slate-400 mt-1">Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to your environment variables</p>
      </div>
    </div>
  )

  return (
    <div className="relative h-full">
      {geocoding && (
        <div className="absolute top-3 right-3 z-10 bg-white/90 backdrop-blur-sm rounded-lg px-3 py-1.5 flex items-center gap-2 shadow-md text-xs text-slate-600">
          <Loader2 className="w-3 h-3 animate-spin" /> Geocoding addresses…
        </div>
      )}
      <GoogleMap
        mapContainerStyle={{ width: '100%', height: '100%', borderRadius: '12px' }}
        center={path.length > 0 ? path[0] : BALI_CENTER}
        zoom={path.length > 0 ? 12 : 10}
        options={{ disableDefaultUI: false, streetViewControl: false, mapTypeControl: false, fullscreenControl: true }}
      >
        {/* Route path polyline */}
        {path.length > 1 && (
          <Polyline path={path} options={{ strokeColor: '#0EA5A4', strokeWeight: 3, strokeOpacity: 0.8, geodesic: true }} />
        )}
        {/* Stop markers */}
        {stops.map((stop, idx) => {
          const pos = geocoded[stop.id]
          if (!pos) return null
          const color = STOP_COLORS[idx % STOP_COLORS.length]
          return (
            <Marker
              key={stop.id}
              position={pos}
              label={{ text: String(stop.stop_order), color: 'white', fontSize: '11px', fontWeight: 'bold' }}
              icon={{ path: (window as any).google.maps.SymbolPath.CIRCLE, scale: 14, fillColor: color, fillOpacity: 1, strokeColor: 'white', strokeWeight: 2 }}
              onClick={() => setActiveStop(stop.id === activeStop ? null : stop.id)}
            >
              {activeStop === stop.id && (
                <InfoWindow onCloseClick={() => setActiveStop(null)}>
                  <div className="text-xs max-w-[180px]">
                    <p className="font-bold text-slate-800">{stop.stop_order}. {stop.customer?.name}</p>
                    <p className="text-slate-500 mt-0.5">{stop.customer?.city}</p>
                    {stop.customer?.address && <p className="text-slate-400 mt-0.5">{stop.customer.address}</p>}
                    {stop.estimated_arrival && <p className="text-cyan-600 font-medium mt-1">⏰ {stop.estimated_arrival.slice(0, 5)}</p>}
                    {optimizeResult?.optimizedStops?.[idx]?.leg && (
                      <p className="text-violet-600 font-medium mt-1">
                        📍 {optimizeResult.optimizedStops[idx].leg.distance} · {optimizeResult.optimizedStops[idx].leg.duration}
                      </p>
                    )}
                  </div>
                </InfoWindow>
              )}
            </Marker>
          )
        })}
      </GoogleMap>
    </div>
  )
}

// ─── GOOGLE MAPS SETUP BANNER ─────────────────────────────────────────────────
function MapsSetupBanner() {
  const configured = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY && process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY !== 'YOUR_GOOGLE_MAPS_API_KEY_HERE'
  if (configured) return null
  return (
    <div className="mx-4 mt-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
      <span className="text-amber-500 text-lg flex-shrink-0">⚠️</span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-amber-800 text-sm">Google Maps not set up yet</p>
        <p className="text-xs text-amber-600 mt-0.5">Route map display and stop optimization require a Google Maps API key. To activate: set up Google Cloud billing, enable Maps JavaScript API + Directions API + Geocoding API, then add <code className="bg-amber-100 px-1 rounded">GOOGLE_MAPS_API_KEY</code> and <code className="bg-amber-100 px-1 rounded">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> to Vercel environment variables.</p>
      </div>
    </div>
  )
}

// ─── TAB: ROUTES ──────────────────────────────────────────────────────────────
function RouteManager() {
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
  const [optimizing, setOptimizing] = useState(false)
  const [optimizeResult, setOptimizeResult] = useState<any>(null)
  const [startAddress, setStartAddress] = useState('Kembali Water, Bali, Indonesia')
  const [routeForm, setRouteForm] = useState({ name: '', driver_id: '', vehicle_id: '', day_of_week: [] as string[], estimated_duration_mins: '', estimated_km: '', notes: '' })
  const [stopForm, setStopForm] = useState({ customer_id: '', stop_order: 1, estimated_arrival: '', time_window_start: '', time_window_end: '', notes: '' })

  useEffect(() => { loadAll() }, [])
  useEffect(() => { if (selectedRoute) loadStops(selectedRoute.id) }, [selectedRoute])

  const loadAll = async () => {
    setLoading(true)
    const sb = createClient()
    const [routesRes, staffRes, vehiclesRes, customersRes] = await Promise.all([
      sb.from('routes').select('*, driver:staff(name), vehicle:vehicles(name, plate_number)').eq('active', true).order('name'),
      sb.from('staff').select('id, name, role').eq('active', true).in('role', ['driver', 'delivery']),
      sb.from('vehicles').select('id, name, plate_number').eq('status', 'active'),
      sb.from('customers').select('id, name, city, address').eq('active', true).order('name'),
    ])
    setRoutes(routesRes.data ?? []); setStaff(staffRes.data ?? [])
    setVehicles(vehiclesRes.data ?? []); setCustomers(customersRes.data ?? [])
    setLoading(false)
  }

  const loadStops = async (routeId: string) => {
    const sb = createClient()
    const { data } = await sb.from('route_stops').select('*, customer:customers(name, city, address)').eq('route_id', routeId).order('stop_order')
    setStops(data ?? [])
    setStopForm(f => ({ ...f, stop_order: (data?.length ?? 0) + 1 }))
  }

  const saveRoute = async () => {
    if (!routeForm.name) return
    setSaving(true)
    const sb = createClient()
    const { data } = await sb.from('routes').insert({ name: routeForm.name, driver_id: routeForm.driver_id || null, vehicle_id: routeForm.vehicle_id || null, day_of_week: routeForm.day_of_week, estimated_duration_mins: routeForm.estimated_duration_mins ? Number(routeForm.estimated_duration_mins) : null, estimated_km: routeForm.estimated_km ? Number(routeForm.estimated_km) : null, notes: routeForm.notes || null }).select('*, driver:staff(name), vehicle:vehicles(name, plate_number)').single()
    if (data) setRoutes([...routes, data])
    setShowRouteForm(false)
    setRouteForm({ name: '', driver_id: '', vehicle_id: '', day_of_week: [], estimated_duration_mins: '', estimated_km: '', notes: '' })
    setSaving(false)
  }

  const addStop = async () => {
    if (!stopForm.customer_id || !selectedRoute) return
    setSaving(true)
    const sb = createClient()
    const { data } = await sb.from('route_stops').insert({ route_id: selectedRoute.id, customer_id: stopForm.customer_id, stop_order: stopForm.stop_order, estimated_arrival: stopForm.estimated_arrival || null, time_window_start: stopForm.time_window_start || null, time_window_end: stopForm.time_window_end || null, notes: stopForm.notes || null }).select('*, customer:customers(name, city, address)').single()
    if (data) { const newStops = [...stops, data].sort((a, b) => a.stop_order - b.stop_order); setStops(newStops); setStopForm(f => ({ ...f, customer_id: '', stop_order: newStops.length + 1, estimated_arrival: '', notes: '' })) }
    setShowStopForm(false); setSaving(false)
  }

  const deleteStop = async (stopId: string) => {
    const sb = createClient()
    await sb.from('route_stops').delete().eq('id', stopId)
    setStops(stops.filter(s => s.id !== stopId))
  }

  const generateDeliveries = async () => {
    if (!selectedRoute) return
    setGenerating(true)
    const today = new Date().toISOString().split('T')[0]
    const sb = createClient()
    let created = 0
    for (const stop of stops) {
      const { data: existing } = await sb.from('deliveries').select('id').eq('customer_id', stop.customer_id).eq('delivery_date', today).limit(1)
      if (existing && existing.length > 0) continue
      await sb.from('deliveries').insert({ customer_id: stop.customer_id, route_id: selectedRoute.id, delivery_date: today, status: 'pending', delivered_350ml: 0, delivered_750ml: 0, collected_350ml: 0, collected_750ml: 0, damaged_350ml: 0, damaged_750ml: 0 })
      created++
    }
    setGenerating(false)
    alert(`Generated ${created} deliveries for ${selectedRoute.name}. ${stops.length - created} already existed.`)
  }

  const optimizeRoute = async () => {
    if (!selectedRoute || stops.length < 2) return
    if (!confirm(`Optimize stop order for "${selectedRoute.name}" using Google Maps?`)) return
    setOptimizing(true); setOptimizeResult(null)
    try {
      const res = await fetch('/api/routes/optimize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ routeId: selectedRoute.id, origin: startAddress }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setOptimizeResult(data); await loadStops(selectedRoute.id); await loadAll()
    } catch (e: any) { alert(`Optimization failed: ${e.message}`) } finally { setOptimizing(false) }
  }

  const toggleDay = (day: string) => setRouteForm(f => ({ ...f, day_of_week: f.day_of_week.includes(day) ? f.day_of_week.filter(d => d !== day) : [...f.day_of_week, day] }))

  return (
    <div className="flex flex-col h-[calc(100vh-113px)]">
      <MapsSetupBanner />
      <div className="flex flex-1 overflow-hidden">
      {/* Routes List */}
      <div className="w-72 border-r border-slate-200 bg-white flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-slate-100 space-y-2">
          <button onClick={() => setShowRouteForm(true)} className="w-full flex items-center justify-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white py-2 rounded-xl text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" /> New Route
          </button>
        </div>
        {loading ? <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div> : (
          <div className="flex-1 overflow-y-auto">
            {routes.length === 0 ? (
              <div className="text-center py-12 text-slate-400 px-4"><Route className="w-8 h-8 mx-auto mb-2 text-slate-200" /><p className="text-sm">No routes yet</p></div>
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
                    {route.day_of_week.map((d: string) => <span key={d} className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded capitalize">{d.slice(0, 3)}</span>)}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Route Detail */}
      <div className="flex-1 overflow-hidden bg-slate-50 flex flex-col">
        {!selectedRoute ? (
          <div className="flex items-center justify-center h-full text-slate-400">
            <div className="text-center"><MapPin className="w-12 h-12 mx-auto mb-3 text-slate-200" /><p className="font-medium">Select a route to view stops</p></div>
          </div>
        ) : (
          <div className="flex flex-col h-full overflow-hidden">
          {/* Map */}
          <div className="flex-shrink-0 h-72 p-4 pb-0">
            <RouteMapPanel stops={stops} optimizeResult={optimizeResult} />
          </div>
          <div className="flex-1 overflow-y-auto p-6 pt-4 space-y-6">
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
                      {ROUTE_DAYS.map(d => <span key={d} className={`text-xs px-2 py-1 rounded-lg capitalize font-medium ${selectedRoute.day_of_week.includes(d) ? 'bg-cyan-100 text-cyan-700' : 'bg-slate-100 text-slate-300'}`}>{d.slice(0, 3)}</span>)}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2 items-end">
                  <button onClick={generateDeliveries} disabled={generating || stops.length === 0} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
                    {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Generate Today's Deliveries
                  </button>
                  <button onClick={optimizeRoute} disabled={optimizing || stops.length < 2} className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
                    {optimizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Optimize with Maps
                  </button>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <label className="text-xs text-slate-500 whitespace-nowrap font-medium">Start from:</label>
                <input className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-xs bg-slate-50" value={startAddress} onChange={e => setStartAddress(e.target.value)} placeholder="Your depot address..." />
              </div>
            </div>

            {optimizeResult && (
              <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-violet-600 rounded-xl flex items-center justify-center flex-shrink-0"><Sparkles className="w-4 h-4 text-white" /></div>
                  <div>
                    <p className="font-semibold text-violet-800 text-sm">Route optimized ✓</p>
                    <p className="text-xs text-violet-600 mt-0.5">Total: <strong>{optimizeResult.totalDistance}</strong> · <strong>{optimizeResult.totalDuration}</strong></p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <a href={`https://www.google.com/maps/dir/${encodeURIComponent(startAddress)}/${optimizeResult.optimizedStops?.map((s: any) => encodeURIComponent(`${s.customer?.address}, ${s.customer?.city}, Bali`)).join('/')}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium">
                    <ExternalLink className="w-3.5 h-3.5" /> Open in Maps
                  </a>
                  <button onClick={() => setOptimizeResult(null)} className="text-violet-400 hover:text-violet-600"><X className="w-4 h-4" /></button>
                </div>
              </div>
            )}

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div><h3 className="font-semibold text-slate-800">Route Stops</h3><p className="text-xs text-slate-400 mt-0.5">{stops.length} stops · in delivery order</p></div>
                <button onClick={() => setShowStopForm(!showStopForm)} className="flex items-center gap-1.5 text-sm text-cyan-600 hover:text-cyan-700 font-medium"><Plus className="w-4 h-4" /> Add Stop</button>
              </div>
              {showStopForm && (
                <div className="mx-5 my-4 bg-slate-50 rounded-xl p-4 space-y-3 border border-slate-200">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="text-xs font-medium text-slate-600 block mb-1">Customer *</label>
                      <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white" value={stopForm.customer_id} onChange={e => setStopForm({ ...stopForm, customer_id: e.target.value })}>
                        <option value="">Select customer...</option>
                        {customers.map(c => <option key={c.id} value={c.id}>{c.name} — {c.city}</option>)}
                      </select>
                    </div>
                    <div><label className="text-xs font-medium text-slate-600 block mb-1">Stop Order</label><input type="number" min="1" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white" value={stopForm.stop_order} onChange={e => setStopForm({ ...stopForm, stop_order: Number(e.target.value) })} /></div>
                    <div><label className="text-xs font-medium text-slate-600 block mb-1">Est. Arrival</label><input type="time" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white" value={stopForm.estimated_arrival} onChange={e => setStopForm({ ...stopForm, estimated_arrival: e.target.value })} /></div>
                  </div>
                  <div><label className="text-xs font-medium text-slate-600 block mb-1">Notes</label><input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white" placeholder="Parking, access, special instructions..." value={stopForm.notes} onChange={e => setStopForm({ ...stopForm, notes: e.target.value })} /></div>
                  <div className="flex gap-2">
                    <button onClick={addStop} disabled={saving || !stopForm.customer_id} className="flex-1 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" />Add Stop</>}</button>
                    <button onClick={() => setShowStopForm(false)} className="border border-slate-200 bg-white px-3 py-2 rounded-lg text-sm hover:bg-slate-50"><X className="w-4 h-4" /></button>
                  </div>
                </div>
              )}
              <div className="divide-y divide-slate-50">
                {stops.length === 0 ? <div className="px-5 py-10 text-center text-slate-400"><MapPin className="w-6 h-6 mx-auto mb-2 text-slate-200" /><p className="text-sm">No stops on this route yet</p></div>
                  : stops.map((stop, idx) => (
                    <div key={stop.id} className="px-5 py-3.5 flex items-center gap-3">
                      <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-xs font-bold text-slate-500 flex-shrink-0">{stop.stop_order}</div>
                      <div className="w-1 self-stretch bg-slate-100 rounded-full flex-shrink-0 mx-1" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-800 text-sm">{stop.customer?.name}</p>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-xs text-slate-400">{stop.customer?.city}</span>
                          {stop.estimated_arrival && <span className="text-xs text-slate-400 flex items-center gap-1"><Clock className="w-3 h-3" /> {stop.estimated_arrival.slice(0, 5)}</span>}
                        </div>
                        {stop.notes && <p className="text-xs text-slate-400 mt-0.5 italic">{stop.notes}</p>}
                        {optimizeResult?.optimizedStops?.[idx]?.leg && <p className="text-xs text-violet-500 mt-0.5">{optimizeResult.optimizedStops[idx].leg.distance} · {optimizeResult.optimizedStops[idx].leg.duration}</p>}
                      </div>
                      <button onClick={() => deleteStop(stop.id)} className="text-slate-300 hover:text-red-400 transition-colors p-1"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
              </div>
            </div>
          </div>
          </div>
        )}
      </div>
      </div>

      {showRouteForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4">
            <h3 className="font-bold text-slate-800 text-lg">New Route</h3>
            <div><label className="text-xs font-medium text-slate-600 block mb-1">Route Name *</label><input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="e.g. Seminyak Morning Run" value={routeForm.name} onChange={e => setRouteForm({ ...routeForm, name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs font-medium text-slate-600 block mb-1">Driver</label><select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={routeForm.driver_id} onChange={e => setRouteForm({ ...routeForm, driver_id: e.target.value })}><option value="">Unassigned</option>{staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
              <div><label className="text-xs font-medium text-slate-600 block mb-1">Vehicle</label><select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={routeForm.vehicle_id} onChange={e => setRouteForm({ ...routeForm, vehicle_id: e.target.value })}><option value="">Unassigned</option>{vehicles.map(v => <option key={v.id} value={v.id}>{v.name} ({v.plate_number})</option>)}</select></div>
              <div><label className="text-xs font-medium text-slate-600 block mb-1">Est. Duration (min)</label><input type="number" min="0" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={routeForm.estimated_duration_mins} onChange={e => setRouteForm({ ...routeForm, estimated_duration_mins: e.target.value })} /></div>
              <div><label className="text-xs font-medium text-slate-600 block mb-1">Est. Distance (km)</label><input type="number" min="0" step="0.1" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={routeForm.estimated_km} onChange={e => setRouteForm({ ...routeForm, estimated_km: e.target.value })} /></div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1.5">Active Days</label>
              <div className="flex gap-2 flex-wrap">{ROUTE_DAYS.map(day => <button key={day} type="button" onClick={() => toggleDay(day)} className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${routeForm.day_of_week.includes(day) ? 'bg-cyan-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{day.slice(0, 3)}</button>)}</div>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={saveRoute} disabled={saving || !routeForm.name} className="flex-1 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" />Create Route</>}</button>
              <button onClick={() => setShowRouteForm(false)} className="border border-slate-200 px-4 py-2.5 rounded-xl text-sm hover:bg-slate-50">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── TAB: CALENDAR ─────────────────────────────────────────────────────────────
function DeliveryCalendar() {
  const nowDate = new Date()
  const [year, setYear] = useState(nowDate.getFullYear())
  const [month, setMonth] = useState(nowDate.getMonth())
  const [deliveries, setDeliveries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(nowDate.toISOString().split('T')[0])

  useEffect(() => { loadDeliveries() }, [year, month])

  const loadDeliveries = async () => {
    setLoading(true)
    const sb = createClient()
    const firstDay = `${year}-${String(month + 1).padStart(2, '0')}-01`
    const lastDay = new Date(year, month + 1, 0).toISOString().split('T')[0]
    const { data } = await sb.from('deliveries').select('id, delivery_date, status, customer:customers(name), delivered_350ml, delivered_750ml, driver:staff(name)').gte('delivery_date', firstDay).lte('delivery_date', lastDay).order('delivery_date')
    setDeliveries(data ?? []); setLoading(false)
  }

  const prevMonth = () => { if (month === 0) { setYear(y => y - 1); setMonth(11) } else setMonth(m => m - 1) }
  const nextMonth = () => { if (month === 11) { setYear(y => y + 1); setMonth(0) } else setMonth(m => m + 1) }

  const firstDayOfMonth = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [...Array(firstDayOfMonth).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  while (cells.length % 7 !== 0) cells.push(null)

  const byDate: Record<string, any[]> = {}
  deliveries.forEach(d => { if (!byDate[d.delivery_date]) byDate[d.delivery_date] = []; byDate[d.delivery_date].push(d) })

  const dateStr = (day: number) => `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const todayStr = nowDate.toISOString().split('T')[0]
  const selectedDeliveries = selected ? (byDate[selected] ?? []) : []

  return (
    <div className="flex h-[calc(100vh-113px)]">
      <div className="flex-1 flex flex-col p-6">
        <div className="flex items-center justify-between mb-4">
          <button onClick={prevMonth} className="p-2 hover:bg-slate-100 rounded-lg transition-colors"><ChevronLeft className="w-5 h-5 text-slate-600" /></button>
          <h2 className="text-xl font-bold text-slate-800">{MONTHS[month]} {year}</h2>
          <button onClick={nextMonth} className="p-2 hover:bg-slate-100 rounded-lg transition-colors"><ChevronRight className="w-5 h-5 text-slate-600" /></button>
        </div>
        <div className="flex gap-3 mb-4">
          {[
            { label: 'Total this month', value: deliveries.length, color: 'text-slate-800' },
            { label: 'Pending', value: deliveries.filter(d => d.status === 'pending').length, color: 'text-amber-600' },
            { label: 'Completed', value: deliveries.filter(d => d.status === 'completed').length, color: 'text-emerald-600' },
            { label: 'Failed', value: deliveries.filter(d => d.status === 'failed').length, color: 'text-red-600' },
          ].map(s => (
            <div key={s.label} className="bg-white border border-slate-100 rounded-xl px-4 py-2 shadow-sm">
              <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-slate-400">{s.label}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 mb-1">
          {DAYS_SHORT.map(d => <div key={d} className="text-center text-xs font-semibold text-slate-400 py-2">{d}</div>)}
        </div>
        {loading ? <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div> : (
          <div className="grid grid-cols-7 gap-1 flex-1">
            {cells.map((day, idx) => {
              if (!day) return <div key={idx} />
              const ds = dateStr(day)
              const dayDeliveries = byDate[ds] ?? []
              const isToday = ds === todayStr
              const isSelected = ds === selected
              const isPast = ds < todayStr
              return (
                <button key={idx} onClick={() => setSelected(ds)}
                  className={`min-h-[80px] rounded-xl p-2 text-left transition-colors border ${isSelected ? 'bg-cyan-50 border-cyan-300' : isToday ? 'bg-cyan-600 border-cyan-600 text-white' : 'bg-white border-slate-100 hover:bg-slate-50'}`}>
                  <p className={`text-sm font-semibold mb-1 ${isToday ? 'text-white' : isPast ? 'text-slate-400' : 'text-slate-700'}`}>{day}</p>
                  {dayDeliveries.slice(0, 3).map((d, i) => (
                    <div key={i} className="flex items-center gap-1 mb-0.5">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[d.status] ?? 'bg-slate-300'}`} />
                      <span className={`text-xs truncate ${isToday ? 'text-cyan-100' : 'text-slate-500'}`}>{d.customer?.name}</span>
                    </div>
                  ))}
                  {dayDeliveries.length > 3 && <p className={`text-xs ${isToday ? 'text-cyan-200' : 'text-slate-400'}`}>+{dayDeliveries.length - 3} more</p>}
                  {dayDeliveries.length === 0 && !isToday && <div className="text-xs text-slate-200">—</div>}
                </button>
              )
            })}
          </div>
        )}
      </div>
      <div className="w-72 border-l border-slate-200 bg-white flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-slate-100">
          <p className="font-semibold text-slate-800">{selected ? new Date(selected + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : 'Select a day'}</p>
          {selected && <p className="text-xs text-slate-400 mt-0.5">{selectedDeliveries.length} delivery{selectedDeliveries.length !== 1 ? 's' : ''}</p>}
        </div>
        <div className="flex-1 overflow-y-auto">
          {selectedDeliveries.length === 0 ? (
            <div className="text-center py-12 text-slate-400"><Truck className="w-8 h-8 mx-auto mb-2 text-slate-200" /><p className="text-sm">No deliveries</p></div>
          ) : selectedDeliveries.map(d => (
            <div key={d.id} className="w-full text-left px-4 py-3 border-b border-slate-50">
              <div className="flex items-center justify-between">
                <p className="font-medium text-slate-800 text-sm truncate flex-1">{d.customer?.name}</p>
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ml-2 ${STATUS_DOT[d.status] ?? 'bg-slate-300'}`} />
              </div>
              <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-400">
                <span className="flex items-center gap-0.5"><Package className="w-3 h-3" />{(d.delivered_350ml ?? 0) + (d.delivered_750ml ?? 0)} bottles</span>
                {d.driver?.name && <span className="flex items-center gap-0.5"><Truck className="w-3 h-3" />{d.driver.name}</span>}
              </div>
              <span className={`text-xs px-1.5 py-0.5 rounded-full capitalize mt-1 inline-block ${d.status === 'completed' ? 'bg-emerald-100 text-emerald-600' : d.status === 'pending' ? 'bg-amber-100 text-amber-600' : d.status === 'failed' ? 'bg-red-100 text-red-500' : 'bg-slate-100 text-slate-500'}`}>{d.status?.replace('_', ' ')}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── MAIN PAGE ─────────────────────────────────────────────────────────────────
const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'live', label: 'Live Dispatch', icon: Truck },
  { id: 'routes', label: 'Route Management', icon: Route },
  { id: 'calendar', label: 'Calendar', icon: Calendar },
]

export default function DispatchPage() {
  const [tab, setTab] = useState<Tab>('live')

  return (
    <>
      <Topbar title="Dispatch" />
      {/* Tab bar */}
      <div className="bg-white border-b border-slate-200 px-6">
        <div className="flex gap-1">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${tab === id ? 'border-cyan-600 text-cyan-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
              <Icon className="w-4 h-4" />{label}
            </button>
          ))}
        </div>
      </div>
      {tab === 'live' && <LiveDispatch />}
      {tab === 'routes' && <RouteManager />}
      {tab === 'calendar' && <DeliveryCalendar />}
    </>
  )
}
