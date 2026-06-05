'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Topbar } from '@/components/layout/topbar'
import {
  ShoppingCart, Plus, Loader2, Check, X, Calendar, Package,
  RefreshCw, Clock, CheckCircle2, XCircle, Truck, Play, Pause, ChevronRight
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { getCustomers } from '@/lib/db'
import type { Customer } from '@/types'

type MainTab = 'orders' | 'subscriptions'

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const STATUS_SUB_COLORS: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700', paused: 'bg-amber-100 text-amber-700',
  cancelled: 'bg-red-100 text-red-600', expired: 'bg-slate-100 text-slate-400',
}

const STATUS_CONFIG: Record<string, { color: string; label: string; icon: React.ElementType }> = {
  pending: { color: 'bg-amber-100 text-amber-700', label: 'Pending', icon: Clock },
  scheduled: { color: 'bg-blue-100 text-blue-700', label: 'Scheduled', icon: Calendar },
  delivered: { color: 'bg-emerald-100 text-emerald-700', label: 'Delivered', icon: CheckCircle2 },
  cancelled: { color: 'bg-slate-100 text-slate-400', label: 'Cancelled', icon: XCircle },
}

const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

// ─── SUBSCRIPTIONS SUB-PAGE ───────────────────────────────────────────────────
function SubscriptionsContent() {
  const router = useRouter()
  const [subscriptions, setSubscriptions] = useState<any[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('active')
  const [plans, setPlans] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ customer_id: '', plan_id: '', qty_350ml: 0, qty_750ml: 0, delivery_days: [] as string[], start_date: new Date().toISOString().split('T')[0], special_instructions: '', status: 'active' })

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const sb = createClient()
      const [{ data: subs }, custs, { data: plansData }] = await Promise.all([
        sb.from('customer_subscriptions').select('*, customer:customers(name, city, type), plan:subscription_plans(name, frequency, price_350ml, price_750ml)').order('created_at', { ascending: false }),
        getCustomers(),
        sb.from('subscription_plans').select('*').eq('active', true),
      ])
      setSubscriptions(subs ?? []); setCustomers(custs); setPlans(plansData ?? [])
      if (plansData?.[0]) setForm(f => ({ ...f, plan_id: plansData![0].id }))
      setLoading(false)
    }
    load()
  }, [])

  const handleSave = async () => {
    if (!form.customer_id || (form.qty_350ml === 0 && form.qty_750ml === 0)) return
    setSaving(true)
    const sb = createClient()
    const { data } = await sb.from('customer_subscriptions').insert({ customer_id: form.customer_id, plan_id: form.plan_id || null, qty_350ml: form.qty_350ml, qty_750ml: form.qty_750ml, delivery_days: form.delivery_days.length > 0 ? form.delivery_days : null, start_date: form.start_date, special_instructions: form.special_instructions || null, status: 'active' }).select('*, customer:customers(name, city, type), plan:subscription_plans(name, frequency)').single()
    if (data) setSubscriptions([data, ...subscriptions])
    setShowForm(false); setSaving(false)
  }

  const toggleDay = (day: string) => setForm(f => ({ ...f, delivery_days: f.delivery_days.includes(day) ? f.delivery_days.filter(d => d !== day) : [...f.delivery_days, day] }))

  const updateSubStatus = async (id: string, status: string) => {
    const sb = createClient()
    await sb.from('customer_subscriptions').update({ status }).eq('id', id)
    setSubscriptions(prev => prev.map(s => s.id === id ? { ...s, status } : s))
  }

  const filteredSubs = subscriptions.filter(s => filterStatus === 'all' || s.status === filterStatus)
  const activeSubs = subscriptions.filter(s => s.status === 'active')

  return (
    <div className="p-6 max-w-5xl space-y-6">
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white border border-slate-100 rounded-xl p-4"><p className="text-xs text-slate-400">Active Subscriptions</p><p className="text-2xl font-bold text-emerald-600 mt-1">{activeSubs.length}</p></div>
        <div className="bg-white border border-slate-100 rounded-xl p-4"><p className="text-xs text-slate-400">Total</p><p className="text-2xl font-bold text-slate-800 mt-1">{subscriptions.length}</p></div>
        <div className="bg-white border border-slate-100 rounded-xl p-4"><p className="text-xs text-slate-400">350ml / week (active)</p><p className="text-2xl font-bold text-slate-800 mt-1">{activeSubs.reduce((s, sub) => s + (sub.qty_350ml ?? 0) * (sub.delivery_days?.length ?? 1), 0)}</p></div>
        <div className="bg-white border border-slate-100 rounded-xl p-4"><p className="text-xs text-slate-400">750ml / week (active)</p><p className="text-2xl font-bold text-slate-800 mt-1">{activeSubs.reduce((s, sub) => s + (sub.qty_750ml ?? 0) * (sub.delivery_days?.length ?? 1), 0)}</p></div>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
          {['active', 'paused', 'cancelled', 'all'].map(s => <button key={s} onClick={() => setFilterStatus(s)} className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${filterStatus === s ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{s}</button>)}
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-xl text-sm font-medium"><Plus className="w-4 h-4" /> New Subscription</button>
      </div>

      {showForm && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
          <h3 className="font-semibold text-slate-800">New Customer Subscription</h3>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-slate-600 block mb-1">Customer *</label><select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={form.customer_id} onChange={e => setForm({ ...form, customer_id: e.target.value })}><option value="">Select customer...</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div><label className="text-xs font-medium text-slate-600 block mb-1">Start Date</label><input type="date" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} /></div>
            <div><label className="text-xs font-medium text-slate-600 block mb-1">350ml Qty</label><input type="number" min="0" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={form.qty_350ml} onChange={e => setForm({ ...form, qty_350ml: Number(e.target.value) })} /></div>
            <div><label className="text-xs font-medium text-slate-600 block mb-1">750ml Qty</label><input type="number" min="0" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={form.qty_750ml} onChange={e => setForm({ ...form, qty_750ml: Number(e.target.value) })} /></div>
          </div>
          <div><label className="text-xs font-medium text-slate-600 block mb-1.5">Delivery Days</label><div className="flex gap-2 flex-wrap">{DAYS.map(d => <button key={d} type="button" onClick={() => toggleDay(d)} className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${form.delivery_days.includes(d) ? 'bg-cyan-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{d.slice(0, 3)}</button>)}</div></div>
          <div><label className="text-xs font-medium text-slate-600 block mb-1">Special Instructions</label><input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={form.special_instructions} onChange={e => setForm({ ...form, special_instructions: e.target.value })} /></div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving || !form.customer_id} className="flex-1 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-2">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" />Create Subscription</>}</button>
            <button onClick={() => setShowForm(false)} className="border border-slate-200 px-4 py-2 rounded-xl text-sm hover:bg-slate-50"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {loading ? <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
        : filteredSubs.length === 0 ? <div className="text-center py-16 text-slate-400"><RefreshCw className="w-10 h-10 mx-auto mb-3 text-slate-200" /><p>No subscriptions found</p></div>
        : (
          <div className="space-y-3">
            {filteredSubs.map(sub => (
              <div key={sub.id} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-cyan-100 flex items-center justify-center flex-shrink-0"><RefreshCw className="w-4 h-4 text-cyan-600" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-slate-800">{sub.customer?.name}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_SUB_COLORS[sub.status] ?? ''}`}>{sub.status}</span>
                      {sub.plan && <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{sub.plan.name}</span>}
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-xs text-slate-400 flex-wrap">
                      <span className="flex items-center gap-1"><Package className="w-3 h-3" />{sub.qty_350ml} × 350ml · {sub.qty_750ml} × 750ml</span>
                      {sub.delivery_days?.length > 0 && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{sub.delivery_days.map((d: string) => d.slice(0, 3)).join(', ')}</span>}
                      <span>Since {new Date(sub.start_date).toLocaleDateString()}</span>
                    </div>
                    {sub.special_instructions && <p className="text-xs text-slate-400 mt-1">{sub.special_instructions}</p>}
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    {sub.status === 'active' && <button onClick={() => updateSubStatus(sub.id, 'paused')} className="text-xs border border-amber-200 text-amber-600 hover:bg-amber-50 px-2 py-1.5 rounded-lg flex items-center gap-1"><Pause className="w-3 h-3" />Pause</button>}
                    {sub.status === 'paused' && <button onClick={() => updateSubStatus(sub.id, 'active')} className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1.5 rounded-lg flex items-center gap-1"><Play className="w-3 h-3" />Resume</button>}
                    <button onClick={() => router.push(`/customers/${sub.customer_id}`)} className="text-xs border border-slate-200 hover:bg-slate-50 px-2 py-1.5 rounded-lg text-slate-500 flex items-center gap-1"><ChevronRight className="w-3 h-3" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  )
}

// ─── ORDERS MAIN COMPONENT ────────────────────────────────────────────────────
export default function OrdersPage() {
  const [mainTab, setMainTab] = useState<MainTab>('orders')
  return (
    <>
      <Topbar title="Orders" />
      <div className="bg-white border-b border-slate-200 px-6">
        <div className="flex gap-1">
          {([{ id: 'orders', label: 'Orders' }, { id: 'subscriptions', label: 'Subscriptions' }] as { id: MainTab; label: string }[]).map(({ id, label }) => (
            <button key={id} onClick={() => setMainTab(id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${mainTab === id ? 'border-cyan-600 text-cyan-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {mainTab === 'subscriptions' ? <SubscriptionsContent /> : <OrdersContent />}
    </>
  )
}

function OrdersContent() {
  const router = useRouter()
  const [orders, setOrders] = useState<any[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [filterStatus, setFilterStatus] = useState('pending')
  const [filterType, setFilterType] = useState('all')

  const [form, setForm] = useState({
    customer_id: '',
    order_type: 'one_off' as 'one_off' | 'standing',
    qty_350ml: 0,
    qty_750ml: 0,
    scheduled_date: new Date().toISOString().split('T')[0],
    par_350ml: 0,
    par_750ml: 0,
    notes: '',
    status: 'pending',
  })

  useEffect(() => { loadAll() }, [])

  const loadAll = async () => {
    setLoading(true)
    const sb = createClient()
    const [ordersRes, custRes] = await Promise.all([
      sb.from('orders').select('*, customer:customers(name, city)').order('created_at', { ascending: false }),
      sb.from('customers').select('id, name, city').eq('active', true).order('name'),
    ])
    setOrders(ordersRes.data ?? [])
    setCustomers(custRes.data ?? [])
    if (custRes.data?.[0]) setForm(f => ({ ...f, customer_id: custRes.data![0].id }))
    setLoading(false)
  }

  const saveOrder = async () => {
    if (!form.customer_id) return
    setSaving(true)
    const sb = createClient()
    const { data } = await sb.from('orders').insert({
      customer_id: form.customer_id,
      order_type: form.order_type,
      qty_350ml: form.qty_350ml,
      qty_750ml: form.qty_750ml,
      scheduled_date: form.scheduled_date || null,
      par_350ml: form.order_type === 'standing' ? form.par_350ml : 0,
      par_750ml: form.order_type === 'standing' ? form.par_750ml : 0,
      notes: form.notes || null,
      status: form.status,
    }).select('*, customer:customers(name, city)').single()
    if (data) setOrders([data, ...orders])
    setShowForm(false)
    setSaving(false)
  }

  const updateStatus = async (id: string, status: string) => {
    const sb = createClient()
    await sb.from('orders').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o))
  }

  const createDelivery = async (order: any) => {
    const sb = createClient()
    const { data } = await sb.from('deliveries').insert({
      customer_id: order.customer_id,
      order_id: order.id,
      delivery_date: order.scheduled_date ?? new Date().toISOString().split('T')[0],
      bottles_350ml: order.qty_350ml,
      bottles_750ml: order.qty_750ml,
      status: 'pending',
      notes: order.notes,
    }).select().single()
    if (data) {
      await updateStatus(order.id, 'scheduled')
      alert('Delivery created — assign a driver in TrakOps.')
    }
  }

  const filtered = orders.filter(o => {
    if (filterStatus !== 'all' && o.status !== filterStatus) return false
    if (filterType !== 'all' && o.order_type !== filterType) return false
    return true
  })

  const counts = {
    pending: orders.filter(o => o.status === 'pending').length,
    scheduled: orders.filter(o => o.status === 'scheduled').length,
    standing: orders.filter(o => o.order_type === 'standing').length,
  }

  return (
    <div className="p-6 max-w-5xl space-y-6">

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-slate-400">Total Orders</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{orders.length}</p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-amber-500">Pending</p>
            <p className="text-2xl font-bold text-amber-700 mt-1">{counts.pending}</p>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-blue-500">Scheduled</p>
            <p className="text-2xl font-bold text-blue-700 mt-1">{counts.scheduled}</p>
          </div>
          <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-slate-400">Standing Orders</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{counts.standing}</p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
            {['pending', 'scheduled', 'delivered', 'all'].map(s => (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${filterStatus === s ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {s}
              </button>
            ))}
          </div>
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
            {[['all', 'All types'], ['one_off', 'One-off'], ['standing', 'Standing']].map(([v, l]) => (
              <button key={v} onClick={() => setFilterType(v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterType === v ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {l}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" /> New Order
          </button>
        </div>

        {/* New order form */}
        {showForm && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
            <h3 className="font-semibold text-slate-800">New Order</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs font-medium text-slate-600 block mb-1">Customer *</label>
                <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={form.customer_id} onChange={e => setForm({ ...form, customer_id: e.target.value })}>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name} — {c.city}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Order Type</label>
                <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={form.order_type} onChange={e => setForm({ ...form, order_type: e.target.value as any })}>
                  <option value="one_off">One-off</option>
                  <option value="standing">Standing (recurring)</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Scheduled Date</label>
                <input type="date" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={form.scheduled_date} onChange={e => setForm({ ...form, scheduled_date: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">350ml Qty</label>
                <input type="number" min="0" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={form.qty_350ml} onChange={e => setForm({ ...form, qty_350ml: Number(e.target.value) })} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">750ml Qty</label>
                <input type="number" min="0" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={form.qty_750ml} onChange={e => setForm({ ...form, qty_750ml: Number(e.target.value) })} />
              </div>
              {form.order_type === 'standing' && (<>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Par 350ml (target stock)</label>
                  <input type="number" min="0" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                    value={form.par_350ml} onChange={e => setForm({ ...form, par_350ml: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Par 750ml (target stock)</label>
                  <input type="number" min="0" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                    value={form.par_750ml} onChange={e => setForm({ ...form, par_750ml: Number(e.target.value) })} />
                </div>
              </>)}
              <div className="col-span-2">
                <label className="text-xs font-medium text-slate-600 block mb-1">Notes</label>
                <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={saveOrder} disabled={saving || !form.customer_id}
                className="flex-1 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" />Create Order</>}
              </button>
              <button onClick={() => setShowForm(false)} className="border border-slate-200 px-4 py-2 rounded-xl text-sm hover:bg-slate-50"><X className="w-4 h-4" /></button>
            </div>
          </div>
        )}

        {/* Orders list */}
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <ShoppingCart className="w-10 h-10 mx-auto mb-3 text-slate-200" />
            <p>No orders found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(order => {
              const cfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.pending
              const Icon = cfg.icon
              const total = (order.qty_350ml ?? 0) + (order.qty_750ml ?? 0)
              return (
                <div key={order.id} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${order.order_type === 'standing' ? 'bg-cyan-100' : 'bg-slate-100'}`}>
                      {order.order_type === 'standing' ? <RefreshCw className="w-4 h-4 text-cyan-600" /> : <ShoppingCart className="w-4 h-4 text-slate-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-slate-800">{order.customer?.name}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>{cfg.label}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${order.order_type === 'standing' ? 'bg-cyan-100 text-cyan-600' : 'bg-slate-100 text-slate-500'}`}>
                          {order.order_type === 'standing' ? 'Standing' : 'One-off'}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-xs text-slate-400 flex-wrap">
                        <span className="flex items-center gap-1"><Package className="w-3 h-3" />{total} bottles ({order.qty_350ml} × 350ml · {order.qty_750ml} × 750ml)</span>
                        {order.scheduled_date && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{fmtDate(order.scheduled_date)}</span>}
                        {order.order_type === 'standing' && <span>Par: {order.par_350ml} / {order.par_750ml}</span>}
                      </div>
                      {order.notes && <p className="text-xs text-slate-400 mt-1">{order.notes}</p>}
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      {order.status === 'pending' && (
                        <button onClick={() => createDelivery(order)}
                          className="text-xs bg-cyan-600 hover:bg-cyan-700 text-white px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors">
                          <Truck className="w-3 h-3" /> Schedule
                        </button>
                      )}
                      {order.status === 'pending' && (
                        <button onClick={() => updateStatus(order.id, 'cancelled')}
                          className="text-xs border border-red-200 text-red-500 hover:bg-red-50 px-2 py-1.5 rounded-lg transition-colors">
                          Cancel
                        </button>
                      )}
                      <button onClick={() => router.push(`/customers/${order.customer_id}`)}
                        className="text-xs border border-slate-200 hover:bg-slate-50 px-2 py-1.5 rounded-lg transition-colors text-slate-500">
                        View
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
    </div>
  )
}
