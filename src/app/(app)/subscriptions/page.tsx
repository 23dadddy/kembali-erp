'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import { getCustomers, getStaff } from '@/lib/db'
import type { Customer, Staff } from '@/types'
import {
  RefreshCw, Plus, Check, X, Loader2, Calendar, Package,
  Play, Pause, ChevronRight, Users, Clock
} from 'lucide-react'

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const FREQ_LABELS: Record<string, string> = {
  daily: 'Every day', weekly: 'Weekly', biweekly: 'Every 2 weeks', monthly: 'Monthly', custom: 'Custom days'
}
const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  paused: 'bg-amber-100 text-amber-700',
  cancelled: 'bg-red-100 text-red-600',
  expired: 'bg-slate-100 text-slate-400',
}

export default function SubscriptionsPage() {
  const router = useRouter()
  const [subscriptions, setSubscriptions] = useState<any[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [filterStatus, setFilterStatus] = useState('active')
  const [plans, setPlans] = useState<any[]>([])
  const [form, setForm] = useState({
    customer_id: '',
    plan_id: '',
    qty_350ml: 0,
    qty_750ml: 0,
    delivery_days: [] as string[],
    start_date: new Date().toISOString().split('T')[0],
    special_instructions: '',
    status: 'active',
  })

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const sb = createClient()
      const [{ data: subs }, custs, { data: plansData }] = await Promise.all([
        sb.from('customer_subscriptions')
          .select('*, customer:customers(name, city, type), plan:subscription_plans(name, frequency, price_350ml, price_750ml)')
          .order('created_at', { ascending: false }),
        getCustomers(),
        sb.from('subscription_plans').select('*').eq('active', true),
      ])
      setSubscriptions(subs ?? [])
      setCustomers(custs)
      setPlans(plansData ?? [])
      if (plansData?.[0]) setForm(f => ({ ...f, plan_id: plansData[0].id }))
      setLoading(false)
    }
    load()
  }, [])

  const handleSave = async () => {
    if (!form.customer_id || (form.qty_350ml === 0 && form.qty_750ml === 0)) return
    setSaving(true)
    try {
      const sb = createClient()
      const { data, error } = await sb.from('customer_subscriptions').insert({
        customer_id: form.customer_id,
        plan_id: form.plan_id || null,
        qty_350ml: form.qty_350ml,
        qty_750ml: form.qty_750ml,
        delivery_days: form.delivery_days.length > 0 ? form.delivery_days : null,
        start_date: form.start_date,
        special_instructions: form.special_instructions || null,
        status: form.status,
      }).select('*, customer:customers(name, city, type), plan:subscription_plans(name, frequency, price_350ml, price_750ml)').single()
      if (error) throw error
      setSubscriptions([data, ...subscriptions])
      setShowForm(false)
      setForm({ customer_id: '', plan_id: plans[0]?.id ?? '', qty_350ml: 0, qty_750ml: 0, delivery_days: [], start_date: new Date().toISOString().split('T')[0], special_instructions: '', status: 'active' })
    } finally {
      setSaving(false)
    }
  }

  const handleToggleStatus = async (sub: any) => {
    const newStatus = sub.status === 'active' ? 'paused' : 'active'
    const sb = createClient()
    await sb.from('customer_subscriptions').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', sub.id)
    setSubscriptions(subscriptions.map(s => s.id === sub.id ? { ...s, status: newStatus } : s))
  }

  const handleGenerateDeliveries = async () => {
    setGenerating(true)
    const sb = createClient()
    const today = new Date()
    const dayName = DAYS[today.getDay() === 0 ? 6 : today.getDay() - 1]
    const todayStr = today.toISOString().split('T')[0]

    const activeSubs = subscriptions.filter(s => s.status === 'active')
    let created = 0

    for (const sub of activeSubs) {
      // Check if this subscription delivers today
      const planFreq = sub.plan?.frequency
      const shouldDeliver =
        planFreq === 'daily' ||
        (sub.delivery_days?.includes(dayName)) ||
        (planFreq === 'weekly' && !sub.delivery_days)

      if (!shouldDeliver) continue

      // Check if delivery already exists today
      const { data: existing } = await sb.from('deliveries')
        .select('id').eq('customer_id', sub.customer_id).eq('delivery_date', todayStr).limit(1)
      if (existing && existing.length > 0) continue

      await sb.from('deliveries').insert({
        customer_id: sub.customer_id,
        delivery_date: todayStr,
        status: 'pending',
        delivered_350ml: sub.qty_350ml,
        delivered_750ml: sub.qty_750ml,
        collected_350ml: 0,
        collected_750ml: 0,
        damaged_350ml: 0,
        damaged_750ml: 0,
      })
      created++
    }

    setGenerating(false)
    alert(`Generated ${created} deliveries for today (${dayName}). ${activeSubs.length - created} subscriptions already had deliveries or don't deliver on ${dayName}.`)
  }

  const filtered = subscriptions.filter(s => filterStatus === 'all' || s.status === filterStatus)
  const activeCount = subscriptions.filter(s => s.status === 'active').length
  const dailyVolume350 = subscriptions.filter(s => s.status === 'active').reduce((sum, s) => sum + (s.qty_350ml || 0), 0)
  const dailyVolume750 = subscriptions.filter(s => s.status === 'active').reduce((sum, s) => sum + (s.qty_750ml || 0), 0)

  return (
    <>
      <Topbar title="Subscriptions & Standing Orders" />
      <div className="p-6 max-w-5xl space-y-6">

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          <Card><CardContent className="pt-4">
            <p className="text-xs text-slate-400">Active Subscriptions</p>
            <p className="text-2xl font-bold text-slate-800">{activeCount}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4">
            <p className="text-xs text-slate-400">Total Subscriptions</p>
            <p className="text-2xl font-bold text-slate-800">{subscriptions.length}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4">
            <p className="text-xs text-slate-400">Daily Volume (350ml)</p>
            <p className="text-2xl font-bold text-cyan-600">{dailyVolume350}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4">
            <p className="text-xs text-slate-400">Daily Volume (750ml)</p>
            <p className="text-2xl font-bold text-cyan-600">{dailyVolume750}</p>
          </CardContent></Card>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            {['active', 'paused', 'all'].map(s => (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${filterStatus === s ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                {s}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <Button variant="outline" onClick={handleGenerateDeliveries} disabled={generating}>
            {generating ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Play className="w-4 h-4 mr-1.5" />}
            Generate Today's Deliveries
          </Button>
          <Button onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4 mr-1.5" /> Add Subscription
          </Button>
        </div>

        {showForm && (
          <Card>
            <CardHeader><CardTitle className="text-sm">New Standing Order / Subscription</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Customer *</Label>
                  <select className="w-full border rounded-md px-3 py-2 text-sm" value={form.customer_id} onChange={e => setForm({ ...form, customer_id: e.target.value })}>
                    <option value="">Select customer...</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name} — {c.city}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Plan</Label>
                  <select className="w-full border rounded-md px-3 py-2 text-sm" value={form.plan_id} onChange={e => setForm({ ...form, plan_id: e.target.value })}>
                    <option value="">No plan (custom)</option>
                    {plans.map(p => <option key={p.id} value={p.id}>{p.name} — {FREQ_LABELS[p.frequency] ?? p.frequency}</option>)}
                  </select>
                </div>
              </div>

              <div>
                  <Label>Delivery Days (override plan)</Label>
                  <div className="flex gap-2 mt-1 flex-wrap">
                    {DAYS.map(day => (
                      <button key={day} type="button"
                        onClick={() => setForm({ ...form, delivery_days: form.delivery_days.includes(day) ? form.delivery_days.filter(d => d !== day) : [...form.delivery_days, day] })}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${form.delivery_days.includes(day) ? 'bg-cyan-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                        {day.slice(0, 3)}
                      </button>
                    ))}
                  </div>
                </div>

              <div className="grid grid-cols-3 gap-3">
                <div><Label>350ml Qty *</Label><Input type="number" min="0" value={form.qty_350ml} onChange={e => setForm({ ...form, qty_350ml: Number(e.target.value) })} /></div>
                <div><Label>750ml Qty *</Label><Input type="number" min="0" value={form.qty_750ml} onChange={e => setForm({ ...form, qty_750ml: Number(e.target.value) })} /></div>
                <div><Label>Start Date</Label><Input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} /></div>
              </div>
              <div><Label>Special Instructions</Label><Input value={form.special_instructions} onChange={e => setForm({ ...form, special_instructions: e.target.value })} placeholder="e.g. Call before arrival, use loading dock..." /></div>
              <div className="flex gap-2">
                <Button className="bg-cyan-600 hover:bg-cyan-700 flex-1" onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4 mr-1" />Save Subscription</>}
                </Button>
                <Button variant="outline" onClick={() => setShowForm(false)}><X className="w-4 h-4" /></Button>
              </div>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <RefreshCw className="w-8 h-8 mx-auto mb-2 text-slate-200" />
            <p className="font-medium">No subscriptions yet</p>
            <p className="text-sm mt-1">Add standing orders for customers who receive regular deliveries</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(sub => (
              <Card key={sub.id}>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-cyan-50 flex items-center justify-center flex-shrink-0">
                      <RefreshCw className="w-5 h-5 text-cyan-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-800">{sub.customer?.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[sub.status]}`}>{sub.status}</span>
                        <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{sub.plan?.name ?? FREQ_LABELS[sub.plan?.frequency] ?? 'Custom'}</span>
                      </div>
                      <div className="flex gap-4 text-xs text-slate-400 mt-0.5">
                        <span>{sub.customer?.city}</span>
                        <span className="flex items-center gap-1">
                          <Package className="w-3 h-3" />
                          {sub.qty_350ml > 0 && `${sub.qty_350ml}×350ml`}
                          {sub.qty_350ml > 0 && sub.qty_750ml > 0 && ' + '}
                          {sub.qty_750ml > 0 && `${sub.qty_750ml}×750ml`}
                        </span>
                        {sub.delivery_days?.length > 0 && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {sub.delivery_days.map((d: string) => d.slice(0, 3)).join(', ')}
                          </span>
                        )}
                        {sub.special_instructions && <span>📋 {sub.special_instructions.slice(0, 40)}{sub.special_instructions.length > 40 ? '...' : ''}</span>}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleToggleStatus(sub)}>
                        {sub.status === 'active' ? <><Pause className="w-3.5 h-3.5 mr-1" />Pause</> : <><Play className="w-3.5 h-3.5 mr-1" />Resume</>}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => router.push(`/customers/${sub.customer_id}`)}>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
