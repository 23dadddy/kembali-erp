'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Package, Plus, Loader2, Check, X, Clock, CheckCircle2, Truck,
  RefreshCw, Calendar, ChevronDown, ChevronUp
} from 'lucide-react'

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

export default function CustomerOrdersPage() {
  const [customers, setCustomers] = useState<any[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState('')
  const [deliveries, setDeliveries] = useState<any[]>([])
  const [subscriptions, setSubscriptions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showOrderForm, setShowOrderForm] = useState(false)
  const [showSubForm, setShowSubForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<'orders' | 'subscriptions'>('orders')

  const [orderForm, setOrderForm] = useState({
    delivery_date: new Date().toISOString().split('T')[0],
    qty_350ml: 0,
    qty_750ml: 0,
    notes: '',
  })

  const [subForm, setSubForm] = useState({
    frequency: 'weekly',
    qty_350ml: 0,
    qty_750ml: 0,
    delivery_days: [] as string[],
    start_date: new Date().toISOString().split('T')[0],
    special_instructions: '',
  })

  useEffect(() => { loadCustomers() }, [])
  useEffect(() => { if (selectedCustomer) loadData() }, [selectedCustomer])

  const loadCustomers = async () => {
    const sb = createClient()
    const { data } = await sb.from('customers').select('id, name, city').eq('active', true).limit(50)
    setCustomers(data ?? [])
    if (data?.[0]) setSelectedCustomer(data[0].id)
  }

  const loadData = async () => {
    setLoading(true)
    const sb = createClient()
    const [delivRes, subRes] = await Promise.all([
      sb.from('deliveries').select('*').eq('customer_id', selectedCustomer).order('delivery_date', { ascending: false }).limit(30),
      sb.from('customer_subscriptions').select('*').eq('customer_id', selectedCustomer),
    ])
    setDeliveries(delivRes.data ?? [])
    setSubscriptions(subRes.data ?? [])
    setLoading(false)
  }

  const placeOrder = async () => {
    if (!orderForm.qty_350ml && !orderForm.qty_750ml) return
    setSaving(true)
    const sb = createClient()
    await sb.from('deliveries').insert({
      customer_id: selectedCustomer,
      delivery_date: orderForm.delivery_date,
      status: 'pending',
      delivered_350ml: orderForm.qty_350ml,
      delivered_750ml: orderForm.qty_750ml,
      collected_350ml: 0,
      collected_750ml: 0,
      damaged_350ml: 0,
      damaged_750ml: 0,
    })
    await loadData()
    setShowOrderForm(false)
    setOrderForm({ delivery_date: new Date().toISOString().split('T')[0], qty_350ml: 0, qty_750ml: 0, notes: '' })
    setSaving(false)
  }

  const createSubscription = async () => {
    if (!subForm.qty_350ml && !subForm.qty_750ml) return
    setSaving(true)
    const sb = createClient()
    await sb.from('customer_subscriptions').insert({
      customer_id: selectedCustomer,
      frequency: subForm.frequency,
      qty_350ml: subForm.qty_350ml,
      qty_750ml: subForm.qty_750ml,
      delivery_days: subForm.frequency === 'custom' || subForm.frequency === 'weekly' ? subForm.delivery_days : null,
      start_date: subForm.start_date,
      special_instructions: subForm.special_instructions,
      status: 'active',
    })
    await loadData()
    setShowSubForm(false)
    setSaving(false)
  }

  const toggleSub = async (sub: any) => {
    const sb = createClient()
    const newStatus = sub.status === 'active' ? 'paused' : 'active'
    await sb.from('customer_subscriptions').update({ status: newStatus }).eq('id', sub.id)
    setSubscriptions(subscriptions.map(s => s.id === sub.id ? { ...s, status: newStatus } : s))
  }

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Orders</h1>
          <p className="text-slate-500 text-sm mt-0.5">Place one-time orders or manage standing deliveries</p>
        </div>
        <select className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white" value={selectedCustomer} onChange={e => setSelectedCustomer(e.target.value)}>
          {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {(['orders', 'subscriptions'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${tab === t ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'orders' && (
        <>
          <div className="flex justify-end">
            <button onClick={() => setShowOrderForm(!showOrderForm)}
              className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
              <Plus className="w-4 h-4" /> Place Order
            </button>
          </div>

          {showOrderForm && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
              <h3 className="font-semibold text-slate-800">New One-Time Order</h3>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Delivery Date</label>
                  <input type="date" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                    value={orderForm.delivery_date} onChange={e => setOrderForm({ ...orderForm, delivery_date: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">350ml Qty</label>
                  <input type="number" min="0" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                    value={orderForm.qty_350ml} onChange={e => setOrderForm({ ...orderForm, qty_350ml: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">750ml Qty</label>
                  <input type="number" min="0" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                    value={orderForm.qty_750ml} onChange={e => setOrderForm({ ...orderForm, qty_750ml: Number(e.target.value) })} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Special Instructions (optional)</label>
                <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  placeholder="e.g. Call before arrival"
                  value={orderForm.notes} onChange={e => setOrderForm({ ...orderForm, notes: e.target.value })} />
              </div>
              <div className="flex gap-2">
                <button onClick={placeOrder} disabled={saving || (!orderForm.qty_350ml && !orderForm.qty_750ml)}
                  className="flex-1 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-colors">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" />Confirm Order</>}
                </button>
                <button onClick={() => setShowOrderForm(false)} className="border border-slate-200 px-4 py-2 rounded-xl text-sm hover:bg-slate-50">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
          ) : (
            <div className="space-y-2">
              {deliveries.length === 0 ? (
                <div className="text-center py-16 text-slate-400">
                  <Package className="w-8 h-8 mx-auto mb-2 text-slate-200" />
                  <p>No orders yet</p>
                </div>
              ) : deliveries.map(d => (
                <div key={d.id} className="bg-white border border-slate-100 rounded-2xl p-4 flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    ['delivered','completed'].includes(d.status) ? 'bg-emerald-50' : d.status === 'in_transit' ? 'bg-cyan-50' : 'bg-amber-50'
                  }`}>
                    {['delivered','completed'].includes(d.status) ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> :
                     d.status === 'in_transit' ? <Truck className="w-5 h-5 text-cyan-500" /> :
                     <Clock className="w-5 h-5 text-amber-500" />}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-slate-800">{fmtDate(d.delivery_date)}</p>
                    <p className="text-sm text-slate-400 mt-0.5">
                      {d.delivered_350ml > 0 && `${d.delivered_350ml}×350ml`}
                      {d.delivered_350ml > 0 && d.delivered_750ml > 0 && ' + '}
                      {d.delivered_750ml > 0 && `${d.delivered_750ml}×750ml`}
                      {d.collected_350ml + d.collected_750ml > 0 && ` · ${d.collected_350ml + d.collected_750ml} collected`}
                    </p>
                  </div>
                  <span className={`text-xs px-3 py-1 rounded-full font-medium ${
                    ['delivered','completed'].includes(d.status) ? 'bg-emerald-100 text-emerald-700' :
                    d.status === 'in_transit' ? 'bg-cyan-100 text-cyan-700' :
                    d.status === 'failed' ? 'bg-red-100 text-red-600' :
                    'bg-amber-100 text-amber-700'
                  }`}>{{
                      completed: 'Delivered', delivered: 'Delivered',
                      in_transit: 'On the way', pending: 'Scheduled', failed: 'Failed'
                    }[d.status as string] ?? d.status.replace('_', ' ')}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'subscriptions' && (
        <>
          <div className="flex justify-end">
            <button onClick={() => setShowSubForm(!showSubForm)}
              className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
              <Plus className="w-4 h-4" /> Add Standing Order
            </button>
          </div>

          {showSubForm && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
              <h3 className="font-semibold text-slate-800">New Standing Order</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Frequency</label>
                  <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                    value={subForm.frequency} onChange={e => setSubForm({ ...subForm, frequency: e.target.value })}>
                    <option value="daily">Every day</option>
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Every 2 weeks</option>
                    <option value="monthly">Monthly</option>
                    <option value="custom">Custom days</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Start Date</label>
                  <input type="date" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                    value={subForm.start_date} onChange={e => setSubForm({ ...subForm, start_date: e.target.value })} />
                </div>
              </div>

              {(subForm.frequency === 'weekly' || subForm.frequency === 'custom') && (
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Delivery Days</label>
                  <div className="flex gap-2 flex-wrap">
                    {DAYS.map(day => (
                      <button key={day} type="button"
                        onClick={() => setSubForm({ ...subForm, delivery_days: subForm.delivery_days.includes(day) ? subForm.delivery_days.filter(d => d !== day) : [...subForm.delivery_days, day] })}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${subForm.delivery_days.includes(day) ? 'bg-cyan-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                        {day.slice(0, 3)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">350ml Qty</label>
                  <input type="number" min="0" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                    value={subForm.qty_350ml} onChange={e => setSubForm({ ...subForm, qty_350ml: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">750ml Qty</label>
                  <input type="number" min="0" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                    value={subForm.qty_750ml} onChange={e => setSubForm({ ...subForm, qty_750ml: Number(e.target.value) })} />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Special Instructions</label>
                <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  placeholder="e.g. Use loading dock, call before arrival"
                  value={subForm.special_instructions} onChange={e => setSubForm({ ...subForm, special_instructions: e.target.value })} />
              </div>

              <div className="flex gap-2">
                <button onClick={createSubscription} disabled={saving || (!subForm.qty_350ml && !subForm.qty_750ml)}
                  className="flex-1 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-colors">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" />Save Standing Order</>}
                </button>
                <button onClick={() => setShowSubForm(false)} className="border border-slate-200 px-4 py-2 rounded-xl text-sm hover:bg-slate-50">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {subscriptions.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <RefreshCw className="w-8 h-8 mx-auto mb-2 text-slate-200" />
                <p>No standing orders yet</p>
                <p className="text-sm mt-1">Set up recurring deliveries so you never run out</p>
              </div>
            ) : subscriptions.map(s => (
              <div key={s.id} className="bg-white border border-slate-100 rounded-2xl p-4 flex items-center gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${s.status === 'active' ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                  <RefreshCw className={`w-5 h-5 ${s.status === 'active' ? 'text-emerald-500' : 'text-amber-500'}`} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-800 capitalize">{s.frequency}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${s.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{s.status}</span>
                  </div>
                  <p className="text-sm text-slate-400 mt-0.5">
                    {s.qty_350ml > 0 && `${s.qty_350ml}×350ml`}
                    {s.qty_350ml > 0 && s.qty_750ml > 0 && ' + '}
                    {s.qty_750ml > 0 && `${s.qty_750ml}×750ml`}
                    {s.delivery_days?.length > 0 && ` · ${s.delivery_days.map((d: string) => d.slice(0, 3)).join(', ')}`}
                  </p>
                </div>
                <button onClick={() => toggleSub(s)}
                  className="text-xs border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 text-slate-600 transition-colors">
                  {s.status === 'active' ? 'Pause' : 'Resume'}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
