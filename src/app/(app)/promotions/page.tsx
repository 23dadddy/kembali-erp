'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Topbar } from '@/components/layout/topbar'
import {
  Tag, Plus, Loader2, Check, X, Percent, DollarSign,
  Gift, Calendar, CheckCircle2, AlertCircle, Copy
} from 'lucide-react'

const TYPE_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  percent: { label: 'Percentage Off', icon: Percent, color: 'text-cyan-600' },
  fixed: { label: 'Fixed Amount Off', icon: DollarSign, color: 'text-emerald-600' },
  free_bottles: { label: 'Free Bottles', icon: Gift, color: 'text-violet-600' },
  first_order: { label: 'First Order', icon: Gift, color: 'text-amber-600' },
}

const fmt = (n: number) => `Rp ${(n ?? 0).toLocaleString('id-ID')}`

export default function PromotionsPage() {
  const [promotions, setPromotions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState<'active' | 'all' | 'expired'>('active')
  const [copied, setCopied] = useState<string | null>(null)

  const [form, setForm] = useState({
    code: '',
    name: '',
    type: 'percent',
    value: 0,
    min_order_value: 0,
    max_uses: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    active: true,
  })

  useEffect(() => { loadPromos() }, [])

  const loadPromos = async () => {
    setLoading(true)
    const sb = createClient()
    const { data } = await sb.from('promotions').select('*').order('created_at', { ascending: false })
    setPromotions(data ?? [])
    setLoading(false)
  }

  const generateCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  }

  const savePromo = async () => {
    if (!form.code || !form.name) return
    setSaving(true)
    const sb = createClient()
    const { data } = await sb.from('promotions').insert({
      code: form.code.toUpperCase(),
      name: form.name,
      type: form.type,
      value: form.value,
      min_order_value: form.min_order_value || 0,
      max_uses: form.max_uses ? Number(form.max_uses) : null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      active: form.active,
    }).select().single()
    if (data) setPromotions([data, ...promotions])
    setShowForm(false)
    setForm({ code: '', name: '', type: 'percent', value: 0, min_order_value: 0, max_uses: '', start_date: new Date().toISOString().split('T')[0], end_date: '', active: true })
    setSaving(false)
  }

  const toggleActive = async (id: string, active: boolean) => {
    const sb = createClient()
    await sb.from('promotions').update({ active: !active }).eq('id', id)
    setPromotions(promotions.map(p => p.id === id ? { ...p, active: !active } : p))
  }

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code)
    setCopied(code)
    setTimeout(() => setCopied(null), 2000)
  }

  const today = new Date().toISOString().split('T')[0]
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  const isExpired = (p: any) => p.end_date && p.end_date < today
  const isExhausted = (p: any) => p.max_uses && p.uses_count >= p.max_uses

  const filtered = promotions.filter(p => {
    if (filter === 'active') return p.active && !isExpired(p) && !isExhausted(p)
    if (filter === 'expired') return isExpired(p) || isExhausted(p) || !p.active
    return true
  })

  const totalUses = promotions.reduce((s, p) => s + (p.uses_count ?? 0), 0)
  const activeCount = promotions.filter(p => p.active && !isExpired(p) && !isExhausted(p)).length

  return (
    <>
      <Topbar title="Promotions & Discounts" />
      <div className="p-6 max-w-5xl space-y-6">

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-slate-400">Total Promotions</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{promotions.length}</p>
          </div>
          <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-slate-400">Active Now</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">{activeCount}</p>
          </div>
          <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-slate-400">Total Redemptions</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{totalUses}</p>
          </div>
          <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-slate-400">Expired / Disabled</p>
            <p className="text-2xl font-bold text-slate-400 mt-1">{promotions.length - activeCount}</p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3">
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
            {(['active', 'all', 'expired'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${filter === f ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {f}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" /> Create Promotion
          </button>
        </div>

        {/* Form */}
        {showForm && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
            <h3 className="font-semibold text-slate-800">New Promotion</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Promo Code *</label>
                <div className="flex gap-2">
                  <input className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm uppercase"
                    placeholder="SUMMER20"
                    value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} />
                  <button onClick={() => setForm({ ...form, code: generateCode() })}
                    className="border border-slate-200 px-3 py-2 rounded-lg text-xs hover:bg-slate-50 text-slate-500">Auto</button>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Promo Name *</label>
                <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  placeholder="Summer 2025 Discount"
                  value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Type</label>
                <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                  {Object.entries(TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">
                  Value {form.type === 'percent' ? '(%)' : form.type === 'free_bottles' ? '(qty)' : '(Rp)'}
                </label>
                <input type="number" min="0" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={form.value} onChange={e => setForm({ ...form, value: Number(e.target.value) })} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Min. Order Value (Rp)</label>
                <input type="number" min="0" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={form.min_order_value} onChange={e => setForm({ ...form, min_order_value: Number(e.target.value) })} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Max Uses (blank = unlimited)</label>
                <input type="number" min="0" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={form.max_uses} onChange={e => setForm({ ...form, max_uses: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Start Date</label>
                <input type="date" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">End Date (blank = no expiry)</label>
                <input type="date" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={savePromo} disabled={saving || !form.code || !form.name}
                className="flex-1 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" />Create Promotion</>}
              </button>
              <button onClick={() => setShowForm(false)} className="border border-slate-200 px-4 py-2 rounded-xl text-sm hover:bg-slate-50"><X className="w-4 h-4" /></button>
            </div>
          </div>
        )}

        {/* List */}
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <Tag className="w-10 h-10 mx-auto mb-3 text-slate-200" />
            <p>No promotions found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(promo => {
              const cfg = TYPE_CONFIG[promo.type] ?? TYPE_CONFIG.percent
              const Icon = cfg.icon
              const expired = isExpired(promo)
              const exhausted = isExhausted(promo)
              const inactive = !promo.active || expired || exhausted
              return (
                <div key={promo.id} className={`bg-white border rounded-2xl p-4 shadow-sm transition-opacity ${inactive ? 'opacity-60' : ''} ${expired || exhausted ? 'border-red-100' : 'border-slate-100'}`}>
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-slate-100`}>
                      <Icon className={`w-5 h-5 ${cfg.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button onClick={() => copyCode(promo.code)}
                          className="font-bold text-slate-800 font-mono bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded-lg text-sm transition-colors flex items-center gap-1.5">
                          {promo.code}
                          {copied === promo.code ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3 h-3 text-slate-400" />}
                        </button>
                        <span className="text-slate-600 text-sm">{promo.name}</span>
                        {expired && <span className="text-xs bg-red-100 text-red-500 px-2 py-0.5 rounded-full">Expired</span>}
                        {exhausted && <span className="text-xs bg-red-100 text-red-500 px-2 py-0.5 rounded-full">Exhausted</span>}
                        {!inactive && <span className="text-xs bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full">Active</span>}
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-xs text-slate-400">
                        <span className={`font-medium ${cfg.color}`}>
                          {promo.type === 'percent' ? `${promo.value}% off` :
                           promo.type === 'fixed' ? `${fmt(promo.value)} off` :
                           promo.type === 'free_bottles' ? `${promo.value} free bottles` : cfg.label}
                        </span>
                        {promo.min_order_value > 0 && <span>min order {fmt(promo.min_order_value)}</span>}
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />{promo.uses_count ?? 0}{promo.max_uses ? `/${promo.max_uses}` : ''} uses
                        </span>
                        {promo.end_date && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />Expires {fmtDate(promo.end_date)}</span>}
                      </div>
                    </div>
                    <button onClick={() => toggleActive(promo.id, promo.active)}
                      className={`text-xs border px-3 py-1.5 rounded-lg transition-colors ${promo.active ? 'border-red-200 text-red-500 hover:bg-red-50' : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'}`}>
                      {promo.active ? 'Disable' : 'Enable'}
                    </button>
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
