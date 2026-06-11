'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Topbar } from '@/components/layout/topbar'
import {
  Tag, Plus, Loader2, Check, X, TrendingUp, TrendingDown,
  DollarSign, Calendar, AlertCircle, Edit2
} from 'lucide-react'
import { useLanguage } from '@/components/providers/language-provider'

const fmt = (n: number) => `Rp ${(n ?? 0).toLocaleString('id-ID')}`
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

export default function PricingPage() {
  const { t } = useLanguage()
  const [prices, setPrices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    bottle_size: '350ml',
    price_per_unit: '',
    effective_from: new Date().toISOString().split('T')[0],
  })

  useEffect(() => { loadPrices() }, [])

  const loadPrices = async () => {
    setLoading(true)
    const sb = createClient()
    const { data } = await sb.from('pricing').select('*').order('effective_from', { ascending: false })
    setPrices(data ?? [])
    setLoading(false)
  }

  const savePrice = async () => {
    if (!form.price_per_unit || !form.bottle_size) return
    setSaving(true)
    const sb = createClient()

    // Deactivate existing active price for this size
    await sb.from('pricing').update({ active: false })
      .eq('bottle_size', form.bottle_size).eq('active', true)

    const { data } = await sb.from('pricing').insert({
      bottle_size: form.bottle_size,
      price_per_unit: Number(form.price_per_unit),
      effective_from: form.effective_from,
      active: true,
    }).select().single()

    if (data) setPrices([data, ...prices.map(p =>
      p.bottle_size === form.bottle_size && p.active ? { ...p, active: false } : p
    )])
    setShowForm(false)
    setForm({ bottle_size: '350ml', price_per_unit: '', effective_from: new Date().toISOString().split('T')[0] })
    setSaving(false)
  }

  const active350 = prices.find(p => p.bottle_size === '350ml' && p.active)
  const active750 = prices.find(p => p.bottle_size === '750ml' && p.active)

  // Revenue impact estimate helper
  const revenuePerDelivery = (price350: number, price750: number, qty350 = 50, qty750 = 30) =>
    price350 * qty350 + price750 * qty750

  return (
    <>
      <Topbar title={t('price_title')} />
      <div className="p-6 max-w-4xl space-y-6">

        {/* Current prices */}
        <div className="grid grid-cols-2 gap-4">
          {[
            { size: '350ml', price: active350, color: 'cyan' },
            { size: '750ml', price: active750, color: 'violet' },
          ].map(({ size, price, color }) => (
            <div key={size} className={`bg-white border rounded-2xl p-6 shadow-sm border-slate-100`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-400">{size === '350ml' ? t('price_350ml') : t('price_750ml')}</p>
                  <p className={`text-3xl font-bold mt-1 ${color === 'cyan' ? 'text-cyan-600' : 'text-violet-600'}`}>
                    {price ? fmt(price.price_per_unit) : '—'}
                  </p>
                  {price && (
                    <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Effective {fmtDate(price.effective_from)}
                    </p>
                  )}
                </div>
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color === 'cyan' ? 'bg-cyan-100' : 'bg-violet-100'}`}>
                  <Tag className={`w-5 h-5 ${color === 'cyan' ? 'text-cyan-600' : 'text-violet-600'}`} />
                </div>
              </div>
              <button onClick={() => { setForm(f => ({ ...f, bottle_size: size })); setShowForm(true) }}
                className={`mt-4 w-full py-2 rounded-xl text-sm font-medium border transition-colors ${color === 'cyan' ? 'border-cyan-200 text-cyan-600 hover:bg-cyan-50' : 'border-violet-200 text-violet-600 hover:bg-violet-50'}`}>
                {t('price_new_tier')}
              </button>
            </div>
          ))}
        </div>

        {/* Revenue impact */}
        {active350 && active750 && (
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
            <p className="text-sm font-semibold text-slate-600 mb-3">Revenue Impact Estimate</p>
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Per delivery (avg)', qty350: 30, qty750: 20 },
                { label: 'Per day (10 deliveries)', qty350: 300, qty750: 200 },
                { label: 'Per month (est. 200)', qty350: 6000, qty750: 4000 },
              ].map(({ label, qty350, qty750 }) => (
                <div key={label} className="bg-white rounded-xl p-3 shadow-sm">
                  <p className="text-xs text-slate-400 mb-1">{label}</p>
                  <p className="font-bold text-slate-800">{fmt(revenuePerDelivery(active350.price_per_unit, active750.price_per_unit, qty350, qty750))}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* New price form */}
        {showForm && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
            <h3 className="font-semibold text-slate-800">Update Price</h3>
            <p className="text-xs text-slate-500 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
              This will deactivate the current price for the selected size and create a new active price.
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">{t('price_bottle_size')}</label>
                <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={form.bottle_size} onChange={e => setForm({ ...form, bottle_size: e.target.value })}>
                  <option value="350ml">350ml</option>
                  <option value="750ml">750ml</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">{t('price_per_unit')}</label>
                <input type="number" min="0" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  placeholder="e.g. 6000"
                  value={form.price_per_unit} onChange={e => setForm({ ...form, price_per_unit: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Effective From</label>
                <input type="date" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={form.effective_from} onChange={e => setForm({ ...form, effective_from: e.target.value })} />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={savePrice} disabled={saving || !form.price_per_unit}
                className="flex-1 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" />{t('price_save')}</>}
              </button>
              <button onClick={() => setShowForm(false)} className="border border-slate-200 px-4 py-2 rounded-xl text-sm hover:bg-slate-50"><X className="w-4 h-4" /></button>
            </div>
          </div>
        )}

        {!showForm && (
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" /> Add / Update Price
          </button>
        )}

        {/* Price history */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-800">Price History</h3>
          </div>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>
          ) : prices.length === 0 ? (
            <div className="text-center py-10 text-slate-400">
              <DollarSign className="w-8 h-8 mx-auto mb-2 text-slate-200" />
              <p className="text-sm">{t('price_no_pricing')}</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase">{t('price_bottle_size')}</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">{t('price_per_unit')}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">{t('price_min_qty')}</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase">{t('status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {prices.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-medium text-slate-800">{p.bottle_size}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-800">{fmt(p.price_per_unit)}</td>
                    <td className="px-4 py-3 text-slate-500">{fmtDate(p.effective_from)}</td>
                    <td className="px-5 py-3">
                      {p.active ? (
                        <span className="bg-emerald-100 text-emerald-700 text-xs px-2 py-0.5 rounded-full font-medium">{t('price_active')}</span>
                      ) : (
                        <span className="bg-slate-100 text-slate-400 text-xs px-2 py-0.5 rounded-full">{t('inactive')}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  )
}
