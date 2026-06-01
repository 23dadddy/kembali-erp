'use client'

import { useState, useEffect, useCallback } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Plus, Search, MapPin, Loader2, CheckCircle2, XCircle, Download, AlertTriangle, Package, RotateCcw } from 'lucide-react'
import { Delivery, Customer, Staff, DeliveryStatus } from '@/types'
import { getDeliveries, createDelivery, updateDeliveryStatus, getCustomers, getStaff } from '@/lib/db'

const statusColors: Record<DeliveryStatus, string> = {
  pending: 'bg-amber-100 text-amber-700',
  in_transit: 'bg-blue-100 text-blue-700',
  completed: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
}

interface DeliveryForm {
  customer_id: string
  driver_id: string
  delivery_date: string
  delivered_350ml: number
  delivered_750ml: number
  driver_notes: string
}

const today = new Date().toISOString().split('T')[0]
const emptyForm: DeliveryForm = {
  customer_id: '', driver_id: '', delivery_date: today,
  delivered_350ml: 0, delivered_750ml: 0, driver_notes: '',
}

const getDateRange = (range: string) => {
  const now = new Date()
  const tod = now.toISOString().split('T')[0]
  if (range === 'today') return { from: tod, to: tod }
  if (range === 'week') {
    const from = new Date(now); from.setDate(from.getDate() - 7)
    return { from: from.toISOString().split('T')[0], to: tod }
  }
  if (range === 'month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1)
    return { from: from.toISOString().split('T')[0], to: tod }
  }
  return null
}

export default function DeliveriesPage() {
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [dateRange, setDateRange] = useState('month')
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  // Per-customer damage totals (all time) keyed by customer_id
  const [damageTotals, setDamageTotals] = useState<Record<string, number>>({})
  const [discrepancyLimits, setDiscrepancyLimits] = useState<Record<string, number>>({})
  // Bottle collection targets: expected = bottles out at customer per subscription
  const [bottleBalance, setBottleBalance] = useState<Record<string, { out: number }>>({})
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<DeliveryForm>(emptyForm)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const range = getDateRange(dateRange)
      const sb = (await import('@/lib/supabase/client')).createClient()

      const [deliveriesRes, customersRes, staffRes, allDamageRes, customerDataRes, balanceRes] = await Promise.all([
        // Main deliveries query
        (() => {
          let q = sb.from('deliveries').select('*, customer:customers(*), driver:staff(*)').order('delivery_date', { ascending: false })
          if (range) q = q.gte('delivery_date', range.from).lte('delivery_date', range.to)
          return q
        })(),
        getCustomers(),
        getStaff(),
        // All-time damage per customer
        sb.from('deliveries').select('customer_id, damaged_350ml, damaged_750ml'),
        // Customer discrepancy limits
        sb.from('customers').select('id, bottle_discrepancy_limit'),
        // Bottle balance: how many are currently out at customers
        sb.from('customer_bottle_balance').select('customer_id, chargeable_lost_350ml, chargeable_lost_750ml'),
      ])

      // Build damage totals per customer
      const dmg: Record<string, number> = {}
      for (const row of (allDamageRes.data ?? []) as any[]) {
        const cid = row.customer_id
        if (!cid) continue
        dmg[cid] = (dmg[cid] ?? 0) + (row.damaged_350ml ?? 0) + (row.damaged_750ml ?? 0)
      }
      setDamageTotals(dmg)

      // Build discrepancy limits
      const limits: Record<string, number> = {}
      for (const row of (customerDataRes.data ?? []) as any[]) {
        limits[row.id] = row.bottle_discrepancy_limit ?? 5
      }
      setDiscrepancyLimits(limits)

      // Bottle balance
      const bal: Record<string, { out: number }> = {}
      for (const row of (balanceRes.data ?? []) as any[]) {
        bal[row.customer_id] = { out: (row.chargeable_lost_350ml ?? 0) + (row.chargeable_lost_750ml ?? 0) }
      }
      setBottleBalance(bal)

      setDeliveries((deliveriesRes.data ?? []) as Delivery[])
      setCustomers(customersRes)
      setStaff(staffRes.filter(s => s.role === 'driver'))
    } finally { setLoading(false) }
  }, [dateRange])

  useEffect(() => { load() }, [load])

  const handleSave = async () => {
    if (!form.customer_id) return
    setSaving(true)
    try {
      await createDelivery({
        customer_id: form.customer_id,
        driver_id: form.driver_id || null,
        route_id: null,
        order_id: null,
        delivery_date: form.delivery_date,
        status: 'pending' as const,
        delivered_350ml: form.delivered_350ml,
        delivered_750ml: form.delivered_750ml,
        collected_350ml: 0,
        collected_750ml: 0,
        damaged_350ml: 0,
        damaged_750ml: 0,
        driver_notes: form.driver_notes || null,
        signature_data: null,
        signature_confirmed_by: null,
      })
      setOpen(false)
      setForm(emptyForm)
      await load()
    } finally { setSaving(false) }
  }

  const markComplete = async (id: string) => { await updateDeliveryStatus(id, 'completed'); await load() }
  const markFailed = async (id: string) => { await updateDeliveryStatus(id, 'failed'); await load() }

  const filtered = deliveries.filter((d) => {
    const matchStatus = statusFilter === 'all' || d.status === statusFilter
    const matchSearch = search === '' || (d.customer as any)?.name?.toLowerCase().includes(search.toLowerCase())
    return matchStatus && matchSearch
  })

  // Summary stats
  const totalDelivered350 = filtered.reduce((s, d) => s + (d.delivered_350ml ?? 0), 0)
  const totalDelivered750 = filtered.reduce((s, d) => s + (d.delivered_750ml ?? 0), 0)
  const totalCollected = filtered.reduce((s, d) => s + (d.collected_350ml ?? 0) + (d.collected_750ml ?? 0), 0)
  const totalExpected = filtered.reduce((s, d) => s + (d.delivered_350ml ?? 0) + (d.delivered_750ml ?? 0), 0) // simplified: collected should equal delivered
  const totalDamaged = filtered.reduce((s, d) => s + (d.damaged_350ml ?? 0) + (d.damaged_750ml ?? 0), 0)
  const remainingToCollect = Math.max(0, totalExpected - totalCollected)

  const exportCSV = () => {
    const rows = filtered.map(d => ({
      Date: d.delivery_date,
      Customer: (d.customer as any)?.name ?? '',
      Status: d.status,
      Delivered_350ml: d.delivered_350ml ?? 0,
      Delivered_750ml: d.delivered_750ml ?? 0,
      Collected_350ml: d.collected_350ml ?? 0,
      Collected_750ml: d.collected_750ml ?? 0,
      Damaged_350ml: d.damaged_350ml ?? 0,
      Damaged_750ml: d.damaged_750ml ?? 0,
    }))
    const headers = Object.keys(rows[0] ?? {})
    const csv = [headers.join(','), ...rows.map(r => headers.map(h => JSON.stringify((r as any)[h] ?? '')).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'deliveries.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <Topbar title="Deliveries" />
      <div className="p-6 space-y-4">

        {/* Filters */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <Input placeholder="Search customer..." className="pl-8 w-56" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? 'all')}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in_transit">In Transit</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex gap-1 rounded-lg border bg-white p-0.5">
              {[['today', 'Today'], ['week', '7 days'], ['month', 'This month'], ['all', 'All time']].map(([v, label]) => (
                <button key={v} onClick={() => setDateRange(v)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${dateRange === v ? 'bg-cyan-600 text-white' : 'text-slate-500 hover:text-slate-700'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={exportCSV} disabled={filtered.length === 0} className="inline-flex items-center gap-2 rounded-md border bg-white text-slate-600 hover:bg-slate-50 text-sm font-medium px-3 py-2 transition-colors disabled:opacity-40">
              <Download className="w-4 h-4" /> Export CSV
            </button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger className="inline-flex items-center gap-2 rounded-md bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium px-4 py-2 transition-colors">
                <Plus className="w-4 h-4" /> New Delivery
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>New Delivery</DialogTitle></DialogHeader>
                <div className="grid gap-4 py-2">
                  <div className="space-y-1">
                    <Label>Customer *</Label>
                    <Select value={form.customer_id} onValueChange={(v) => setForm({ ...form, customer_id: v ?? '' })}>
                      <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                      <SelectContent>
                        {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Driver</Label>
                    <Select value={form.driver_id} onValueChange={(v) => setForm({ ...form, driver_id: v ?? '' })}>
                      <SelectTrigger><SelectValue placeholder="Assign driver" /></SelectTrigger>
                      <SelectContent>
                        {staff.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Delivery Date</Label>
                    <Input type="date" value={form.delivery_date} onChange={(e) => setForm({ ...form, delivery_date: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>350ml bottles</Label>
                      <Input type="number" min="0" value={form.delivered_350ml} onChange={(e) => setForm({ ...form, delivered_350ml: parseInt(e.target.value) || 0 })} />
                    </div>
                    <div className="space-y-1">
                      <Label>750ml bottles</Label>
                      <Input type="number" min="0" value={form.delivered_750ml} onChange={(e) => setForm({ ...form, delivered_750ml: parseInt(e.target.value) || 0 })} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>Notes</Label>
                    <Input placeholder="Any special instructions..." value={form.driver_notes} onChange={(e) => setForm({ ...form, driver_notes: e.target.value })} />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                    <Button className="bg-cyan-600 hover:bg-cyan-700" onClick={handleSave} disabled={saving || !form.customer_id}>
                      {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                      Create Delivery
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Summary stats */}
        {!loading && filtered.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="bg-white border rounded-xl px-4 py-3">
              <p className="text-xs text-slate-400">Deliveries</p>
              <p className="text-xl font-bold text-slate-700">{filtered.length}</p>
            </div>
            <div className="bg-white border rounded-xl px-4 py-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Package className="w-3.5 h-3.5 text-cyan-500" />
                <p className="text-xs text-slate-400">Delivered</p>
              </div>
              <p className="text-base font-bold text-cyan-700">{totalDelivered350.toLocaleString()}×350ml &nbsp; {totalDelivered750.toLocaleString()}×750ml</p>
            </div>
            <div className="bg-white border rounded-xl px-4 py-3">
              <div className="flex items-center gap-1.5 mb-1">
                <RotateCcw className="w-3.5 h-3.5 text-emerald-500" />
                <p className="text-xs text-slate-400">Collected so far</p>
              </div>
              <p className="text-xl font-bold text-emerald-700">{totalCollected.toLocaleString()}</p>
            </div>
            <div className="bg-white border rounded-xl px-4 py-3">
              <div className="flex items-center gap-1.5 mb-1">
                <RotateCcw className="w-3.5 h-3.5 text-amber-500" />
                <p className="text-xs text-slate-400">Still to collect</p>
              </div>
              <p className={`text-xl font-bold ${remainingToCollect > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {remainingToCollect.toLocaleString()}
              </p>
            </div>
            <div className={`border rounded-xl px-4 py-3 ${totalDamaged > 0 ? 'bg-red-50 border-red-200' : 'bg-white'}`}>
              <div className="flex items-center gap-1.5 mb-1">
                <AlertTriangle className={`w-3.5 h-3.5 ${totalDamaged > 0 ? 'text-red-500' : 'text-slate-300'}`} />
                <p className="text-xs text-slate-400">Damaged / Lost</p>
              </div>
              <p className={`text-xl font-bold ${totalDamaged > 0 ? 'text-red-600' : 'text-slate-400'}`}>{totalDamaged.toLocaleString()}</p>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-xl border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead>Delivered</TableHead>
                <TableHead>
                  <div className="flex items-center gap-1">
                    <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                    Collected / Expected
                  </div>
                </TableHead>
                <TableHead>
                  <div className="flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-slate-400" />
                    Damage + Loss
                  </div>
                </TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-300 mx-auto" /></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                      <MapPin className="w-8 h-8 text-slate-200" />
                      <p className="font-medium">No deliveries found</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((d) => {
                  const cid = d.customer_id
                  const damageTotal = damageTotals[cid] ?? 0
                  const limit = discrepancyLimits[cid] ?? 5
                  const overLimit = damageTotal > limit
                  const thisDamage = (d.damaged_350ml ?? 0) + (d.damaged_750ml ?? 0)
                  // expected to collect = what was delivered
                  const expected = (d.delivered_350ml ?? 0) + (d.delivered_750ml ?? 0)
                  const collected = (d.collected_350ml ?? 0) + (d.collected_750ml ?? 0)
                  const remaining = Math.max(0, expected - collected)

                  return (
                    <TableRow key={d.id} className="hover:bg-slate-50">
                      <TableCell className="text-sm text-slate-600 whitespace-nowrap">{d.delivery_date}</TableCell>
                      <TableCell className="font-medium whitespace-nowrap">
                        <div>{(d.customer as any)?.name}</div>
                        <div className="text-xs text-slate-400">{(d.customer as any)?.city}</div>
                      </TableCell>
                      <TableCell className="text-sm text-slate-500 whitespace-nowrap">{(d.driver as any)?.name ?? '—'}</TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {d.delivered_350ml > 0 && <span className="mr-2">{d.delivered_350ml}×350ml</span>}
                        {d.delivered_750ml > 0 && <span>{d.delivered_750ml}×750ml</span>}
                        {!d.delivered_350ml && !d.delivered_750ml && <span className="text-slate-300">—</span>}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className={collected >= expected && expected > 0 ? 'text-emerald-600 font-medium' : 'text-slate-700'}>
                            {collected} / {expected}
                          </span>
                          {remaining > 0 && (
                            <span className="text-xs text-amber-600 bg-amber-50 rounded px-1.5 py-0.5">
                              {remaining} remaining
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {thisDamage > 0 ? (
                          <div className="space-y-0.5">
                            <span className={`font-medium ${overLimit ? 'text-red-600' : 'text-amber-600'}`}>
                              {thisDamage} bottle{thisDamage !== 1 ? 's' : ''}
                            </span>
                            <div className={`text-xs ${overLimit ? 'text-red-500' : 'text-slate-400'}`}>
                              {overLimit ? `⚠ All-time: ${damageTotal} (limit: ${limit})` : `All-time: ${damageTotal}/${limit}`}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-xs ${statusColors[d.status]}`}>
                          {d.status.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {(d.status === 'pending' || d.status === 'in_transit') ? (
                          <div className="flex gap-1">
                            <button onClick={() => markComplete(d.id)} title="Mark complete" className="text-emerald-500 hover:text-emerald-700">
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                            <button onClick={() => markFailed(d.id)} title="Mark failed" className="text-red-400 hover:text-red-600">
                              <XCircle className="w-4 h-4" />
                            </button>
                          </div>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </>
  )
}
