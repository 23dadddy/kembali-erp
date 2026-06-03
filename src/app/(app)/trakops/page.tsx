'use client'

import { useState, useEffect, useCallback } from 'react'
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
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getDeliveries, getRoutes, getStaff, getCustomers, createDelivery, createRoute, addRouteStop, updateDeliveryStatus } from '@/lib/db'
import type { Delivery, Route, Staff, Customer } from '@/types'
import Link from 'next/link'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const statusConfig = {
  pending: { label: 'Pending', color: 'bg-amber-100 text-amber-700', icon: Clock },
  in_transit: { label: 'In Transit', color: 'bg-blue-100 text-blue-700', icon: Navigation },
  completed: { label: 'Completed', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  failed: { label: 'Failed', color: 'bg-red-100 text-red-700', icon: AlertCircle },
}

const today = new Date().toLocaleDateString('en-US', { weekday: 'long' })

export default function TrakOpsPage() {
  const [selectedDay, setSelectedDay] = useState(today)
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [routes, setRoutes] = useState<Route[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)

  // New route dialog
  const [routeOpen, setRouteOpen] = useState(false)
  const [routeForm, setRouteForm] = useState({ name: '', driver_id: '', days: [] as string[] })
  const [savingRoute, setSavingRoute] = useState(false)

  // New delivery dialog
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
      const [d, r, s, c] = await Promise.all([
        getDeliveries({ date: selectedDate }),
        getRoutes(),
        getStaff(),
        getCustomers(),
      ])
      setDeliveries(d)
      setRoutes(r)
      setStaff(s)
      setCustomers(c)
    } finally { setLoading(false) }
  }, [selectedDate])

  useEffect(() => { load() }, [load])

  // Real-time: subscribe to delivery updates and auto-refresh
  useEffect(() => {
    const sb = createClient()
    const channel = sb
      .channel('trakops-deliveries')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, () => { load() })
      .subscribe()
    return () => { sb.removeChannel(channel) }
  }, [load])

  const todayRoutes = routes.filter((r) =>
    r.day_of_week?.map((d) => d.toLowerCase()).includes(selectedDay.toLowerCase())
  )

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
    setSavingRoute(true)
    setRouteOpen(false)
    try {
      const newRoute = await createRoute({ name: routeForm.name, driver_id: routeForm.driver_id || null, day_of_week: routeForm.days })
      setRouteForm({ name: '', driver_id: '', days: [] })
      if (newRoute) setRoutes(prev => [...prev, newRoute])
    } finally { setSavingRoute(false) }
  }

  const handleCreateDelivery = async () => {
    if (!deliveryForm.customer_id) return
    setSavingDelivery(true)
    setDeliveryOpen(false)
    try {
      const newDel = await createDelivery({
        customer_id: deliveryForm.customer_id,
        driver_id: deliveryForm.driver_id || null,
        route_id: null, order_id: null,
        delivery_date: deliveryForm.delivery_date,
        status: 'pending' as const,
        delivered_350ml: deliveryForm.delivered_350ml,
        delivered_750ml: deliveryForm.delivered_750ml,
        collected_350ml: 0, collected_750ml: 0,
        damaged_350ml: 0, damaged_750ml: 0,
        driver_notes: null, signature_data: null,
        signature_confirmed_by: null,
      })
      if (newDel) setDeliveries(prev => [newDel, ...prev])
    } finally { setSavingDelivery(false) }
  }

  const handleGenerateDeliveries = async () => {
    setGenerating(true)
    setGenerateResult(null)
    try {
      const sb = createClient()
      const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase()
      const dateStr = new Date().toISOString().split('T')[0]

      // Get active subscriptions that include today in delivery_days
      const { data: subs, error } = await sb
        .from('customer_subscriptions')
        .select('*, customer:customers(id, name)')
        .eq('status', 'active')
        .contains('delivery_days', [todayName])

      if (error) throw error

      // Get existing deliveries for today to avoid duplicates
      const { data: existing } = await sb
        .from('deliveries')
        .select('customer_id')
        .eq('delivery_date', dateStr)

      const existingCustomerIds = new Set((existing ?? []).map((d: any) => d.customer_id))

      const toCreate = (subs ?? []).filter((s: any) => !existingCustomerIds.has(s.customer_id))

      let created = 0
      for (const sub of toCreate) {
        await createDelivery({
          customer_id: sub.customer_id,
          driver_id: null,
          route_id: null,
          order_id: null,
          delivery_date: dateStr,
          status: 'pending' as const,
          delivered_350ml: sub.qty_350ml ?? 0,
          delivered_750ml: sub.qty_750ml ?? 0,
          collected_350ml: 0,
          collected_750ml: 0,
          damaged_350ml: 0,
          damaged_750ml: 0,
          driver_notes: sub.special_instructions ?? null,
          signature_data: null,
          signature_confirmed_by: null,
        })
        created++
      }

      setGenerateResult(
        created === 0
          ? `All ${(subs ?? []).length} subscription deliveries already exist for today`
          : `Created ${created} delivery${created !== 1 ? 'ies' : ''} from subscriptions`
      )
      load() // refresh in background after bulk create
    } catch (e: any) {
      setGenerateResult(`Error: ${e.message}`)
    } finally {
      setGenerating(false)
    }
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
    <>
      <Topbar title="TrakOps — Route & Delivery Tracker" />
      <div className="p-6 space-y-6">

        {/* Live indicator + Generate */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 text-xs text-emerald-600 font-medium">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            Live — updates automatically when delivery statuses change
          </div>
          <div className="flex items-center gap-3">
            {generateResult && (
              <span className="text-xs text-slate-500 bg-slate-100 rounded-lg px-3 py-1.5">{generateResult}</span>
            )}
            {counts.pending > 0 && (
              <button
                onClick={dispatchAll}
                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                <Navigation className="w-4 h-4" />
                Dispatch All ({counts.pending})
              </button>
            )}
            <button
              onClick={handleGenerateDeliveries}
              disabled={generating}
              className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              Generate Today's Deliveries
            </button>
          </div>
        </div>

        {/* Day selector + date */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {DAYS.map((day) => (
              <button
                key={day}
                onClick={() => setSelectedDay(day)}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  selectedDay === day ? 'bg-cyan-600 text-white' : 'bg-white border text-slate-600 hover:bg-slate-50'
                }`}
              >
                {day.slice(0, 3)}
                {day === today && <span className="ml-1 text-xs opacity-70">today</span>}
              </button>
            ))}
          </div>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Routes sidebar */}
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
                        <SelectContent>
                          {drivers.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Days of Week</Label>
                      <div className="flex flex-wrap gap-2">
                        {DAYS.map((day) => (
                          <button
                            key={day}
                            onClick={() => {
                              const d = day.toLowerCase()
                              setRouteForm((f) => ({
                                ...f,
                                days: f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d],
                              }))
                            }}
                            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                              routeForm.days.includes(day.toLowerCase())
                                ? 'bg-cyan-600 text-white border-cyan-600'
                                : 'bg-white text-slate-600 border-slate-200'
                            }`}
                          >
                            {day.slice(0, 3)}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setRouteOpen(false)}>Cancel</Button>
                      <Button className="bg-cyan-600 hover:bg-cyan-700" onClick={handleCreateRoute} disabled={savingRoute || !routeForm.name}>
                        {savingRoute && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                        Create Route
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {loading ? (
              <div className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-300 mx-auto" /></div>
            ) : todayRoutes.length === 0 ? (
              <div className="bg-white rounded-xl border p-6 text-center">
                <Truck className="w-7 h-7 text-slate-200 mx-auto mb-2" />
                <p className="text-sm text-slate-400 font-medium">No routes on {selectedDay}</p>
              </div>
            ) : (
              todayRoutes.map((route) => (
                <div key={route.id} className="bg-white rounded-xl border p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-semibold text-slate-800">{route.name}</p>
                      <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                        <Users className="w-3 h-3" />
                        {(route.driver as any)?.name ?? 'Unassigned'}
                      </p>
                    </div>
                    <Badge className="bg-blue-100 text-blue-700 text-xs">
                      {route.stops?.length ?? 0} stops
                    </Badge>
                  </div>
                  {route.stops && route.stops.length > 0 && (
                    <div className="space-y-1 mt-3 border-t pt-3">
                      {(route.stops as any[])
                        .sort((a, b) => a.stop_order - b.stop_order)
                        .map((stop, i) => (
                          <div key={stop.id} className="flex items-center gap-2 text-xs text-slate-500">
                            <span className="w-4 h-4 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 font-mono flex-shrink-0">
                              {i + 1}
                            </span>
                            {stop.customer?.name}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Delivery board */}
          <div className="lg:col-span-2 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-700">
                Deliveries — {selectedDate}
              </h2>
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
                        <SelectContent>
                          {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} — {c.city}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Driver</Label>
                      <Select value={deliveryForm.driver_id} onValueChange={(v) => setDeliveryForm({ ...deliveryForm, driver_id: v ?? '' })}>
                        <SelectTrigger><SelectValue placeholder="Assign driver" /></SelectTrigger>
                        <SelectContent>
                          {drivers.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Date</Label>
                      <Input type="date" value={deliveryForm.delivery_date} onChange={(e) => setDeliveryForm({ ...deliveryForm, delivery_date: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label>350ml to deliver</Label>
                        <Input type="number" min="0" value={deliveryForm.delivered_350ml} onChange={(e) => setDeliveryForm({ ...deliveryForm, delivered_350ml: parseInt(e.target.value) || 0 })} />
                      </div>
                      <div className="space-y-1">
                        <Label>750ml to deliver</Label>
                        <Input type="number" min="0" value={deliveryForm.delivered_750ml} onChange={(e) => setDeliveryForm({ ...deliveryForm, delivered_750ml: parseInt(e.target.value) || 0 })} />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setDeliveryOpen(false)}>Cancel</Button>
                      <Button className="bg-cyan-600 hover:bg-cyan-700" onClick={handleCreateDelivery} disabled={savingDelivery || !deliveryForm.customer_id}>
                        {savingDelivery && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                        Create
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {/* Status counts */}
            <div className="grid grid-cols-4 gap-3">
              {(Object.entries(statusConfig) as [string, typeof statusConfig[keyof typeof statusConfig]][]).map(([key, { label, icon: Icon }]) => (
                <div key={key} className="bg-white rounded-lg border p-3 text-center">
                  <Icon className="w-4 h-4 mx-auto mb-1 text-slate-400" />
                  <div className="text-xl font-bold">{counts[key as keyof typeof counts]}</div>
                  <div className="text-xs text-slate-500">{label}</div>
                </div>
              ))}
            </div>

            {/* Delivery list */}
            <div className="space-y-2">
              {loading ? (
                <div className="bg-white rounded-xl border p-8 text-center">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-300 mx-auto" />
                </div>
              ) : deliveries.length === 0 ? (
                <div className="bg-white rounded-xl border p-8 text-center">
                  <MapPin className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                  <p className="text-sm font-medium text-slate-400">No deliveries on this date</p>
                </div>
              ) : (
                deliveries.map((d) => {
                  const cfg = statusConfig[d.status]
                  const Icon = cfg.icon
                  const customer = d.customer as any
                  return (
                    <div key={d.id} className="bg-white rounded-xl border p-4 flex items-center gap-4">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${cfg.color}`}>
                        <Icon className="w-4 h-4" />
                      </div>
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
                        {d.status === 'pending' && (
                          <button onClick={() => markInTransit(d.id)}
                            className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded-lg hover:bg-blue-50">
                            Start
                          </button>
                        )}
                        {d.status === 'in_transit' && (
                          <div className="flex gap-1">
                            <button onClick={() => markCompleted(d.id)}
                              className="text-xs text-emerald-600 hover:text-emerald-800 font-medium px-2 py-1 rounded-lg hover:bg-emerald-50">
                              ✓ Done
                            </button>
                            <button onClick={() => markFailed(d.id)}
                              className="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 rounded-lg hover:bg-red-50">
                              ✕ Fail
                            </button>
                          </div>
                        )}
                        {(d.status === 'pending' || d.status === 'in_transit') && (
                          <Link href={`/deliver/${d.id}`}
                            className="flex items-center gap-1 bg-cyan-600 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-cyan-700">
                            Log <ExternalLink className="w-3 h-3" />
                          </Link>
                        )}
                        {d.status === 'completed' && (
                          <span className="text-xs text-emerald-600 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            {d.signature_confirmed_by ?? 'Done'}
                          </span>
                        )}
                        {d.status === 'failed' && (
                          <span className="text-xs text-red-500 font-medium">✕ Failed</span>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>

        {/* Bottle collection summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-cyan-600" />
              Bottle Totals — {selectedDate}
            </CardTitle>
          </CardHeader>
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
    </>
  )
}
