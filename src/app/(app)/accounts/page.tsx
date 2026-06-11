'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Topbar } from '@/components/layout/topbar'
import {
  BookOpen, Plus, Loader2, Check, X, ChevronRight, Search,
  TrendingUp, TrendingDown, DollarSign, Shield, PieChart
} from 'lucide-react'
import { useLanguage } from '@/components/providers/language-provider'

const TYPE_CONFIG: Record<string, { color: string; labelKey: string; icon: React.ElementType }> = {
  asset: { color: 'bg-blue-100 text-blue-700', labelKey: 'acc_asset', icon: DollarSign },
  liability: { color: 'bg-red-100 text-red-600', labelKey: 'acc_liability', icon: TrendingDown },
  equity: { color: 'bg-purple-100 text-purple-700', labelKey: 'acc_equity', icon: Shield },
  revenue: { color: 'bg-emerald-100 text-emerald-700', labelKey: 'acc_revenue', icon: TrendingUp },
  expense: { color: 'bg-amber-100 text-amber-700', labelKey: 'acc_expense', icon: TrendingDown },
}

const TYPES = ['asset', 'liability', 'equity', 'revenue', 'expense'] as const

export default function AccountsPage() {
  const { t } = useLanguage()
  const [accounts, setAccounts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    code: '',
    name: '',
    type: 'revenue' as typeof TYPES[number],
    subtype: '',
    parent_id: '',
    active: true,
  })

  useEffect(() => { loadAccounts() }, [])

  const loadAccounts = async () => {
    setLoading(true)
    const sb = createClient()
    const { data } = await sb.from('chart_of_accounts').select('*').order('code')
    setAccounts(data ?? [])
    setLoading(false)
  }

  const saveAccount = async () => {
    if (!form.code || !form.name || !form.type) return
    setSaving(true)
    const sb = createClient()
    const { data } = await sb.from('chart_of_accounts').insert({
      code: form.code,
      name: form.name,
      type: form.type,
      subtype: form.subtype || null,
      parent_id: form.parent_id || null,
      active: form.active,
    }).select().single()
    if (data) setAccounts(prev => [...prev, data].sort((a, b) => a.code.localeCompare(b.code)))
    setShowForm(false)
    setForm({ code: '', name: '', type: 'revenue', subtype: '', parent_id: '', active: true })
    setSaving(false)
  }

  const toggleActive = async (id: string, active: boolean) => {
    const sb = createClient()
    await sb.from('chart_of_accounts').update({ active }).eq('id', id)
    setAccounts(prev => prev.map(a => a.id === id ? { ...a, active } : a))
  }

  const filtered = accounts.filter(a => {
    if (filterType !== 'all' && a.type !== filterType) return false
    if (search && !a.name?.toLowerCase().includes(search.toLowerCase()) && !a.code?.includes(search)) return false
    return true
  })

  // Group by type for display
  const grouped: Record<string, typeof accounts> = {}
  filtered.forEach(a => {
    if (!grouped[a.type]) grouped[a.type] = []
    grouped[a.type].push(a)
  })

  const parentAccounts = accounts.filter(a => !a.parent_id)

  return (
    <>
      <Topbar title={t('acc_title')} />
      <div className="p-6 max-w-4xl space-y-6">

        {/* Type summary */}
        <div className="grid grid-cols-5 gap-3">
          {TYPES.map(type => {
            const cfg = TYPE_CONFIG[type]
            const Icon = cfg.icon
            const count = accounts.filter(a => a.type === type && a.active).length
            return (
              <button key={type} onClick={() => setFilterType(filterType === type ? 'all' : type)}
                className={`rounded-xl p-3 border text-left transition-all ${filterType === type ? 'ring-2 ring-cyan-400' : ''} ${cfg.color.includes('blue') ? 'bg-blue-50 border-blue-100' : cfg.color.includes('red') ? 'bg-red-50 border-red-100' : cfg.color.includes('purple') ? 'bg-purple-50 border-purple-100' : cfg.color.includes('emerald') ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100'}`}>
                <Icon className={`w-4 h-4 mb-1 ${cfg.color.split(' ')[1]}`} />
                <p className={`text-lg font-bold ${cfg.color.split(' ')[1]}`}>{count}</p>
                <p className={`text-xs ${cfg.color.split(' ')[1]} opacity-70`}>{t(cfg.labelKey as any)}</p>
              </button>
            )
          })}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-cyan-400"
              placeholder="Search accounts by code or name..."
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" /> {t('acc_new_account')}
          </button>
        </div>

        {/* Form */}
        {showForm && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
            <h3 className="font-semibold text-slate-800">{t('acc_add_account_title')}</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">{t('acc_code_label')} *</label>
                <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  placeholder="e.g. 4001"
                  value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">{t('acc_name_label')} *</label>
                <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  placeholder="e.g. Sales Revenue — 350ml"
                  value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">{t('acc_type')} *</label>
                <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm capitalize"
                  value={form.type} onChange={e => setForm({ ...form, type: e.target.value as any })}>
                  {TYPES.map(typ => <option key={typ} value={typ} className="capitalize">{typ}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">{t('acc_subtype')}</label>
                <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  placeholder="e.g. current_asset"
                  value={form.subtype} onChange={e => setForm({ ...form, subtype: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">{t('acc_parent')}</label>
                <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={form.parent_id} onChange={e => setForm({ ...form, parent_id: e.target.value })}>
                  <option value="">{t('acc_top_level')}</option>
                  {parentAccounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={saveAccount} disabled={saving || !form.code || !form.name}
                className="flex-1 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" />{t('acc_save')}</>}
              </button>
              <button onClick={() => setShowForm(false)} className="border border-slate-200 px-4 py-2 rounded-xl text-sm hover:bg-slate-50"><X className="w-4 h-4" /></button>
            </div>
          </div>
        )}

        {/* Accounts grouped by type */}
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <BookOpen className="w-10 h-10 mx-auto mb-3 text-slate-200" />
            <p>{t('acc_no_accounts')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {TYPES.filter(t => grouped[t]?.length).map(type => {
              const cfg = TYPE_CONFIG[type]
              return (
                <div key={type} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${cfg.color}`}>{t(cfg.labelKey as any)}</span>
                    <span className="text-xs text-slate-400">{grouped[type].length} {t('acc_account_name').toLowerCase()}s</span>
                  </div>
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-slate-50">
                      {grouped[type].map(account => (
                        <tr key={account.id} className={`hover:bg-slate-50 ${!account.active ? 'opacity-40' : ''}`}>
                          <td className="px-5 py-2.5 w-20">
                            <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded font-mono text-slate-600">{account.code}</code>
                          </td>
                          <td className="px-3 py-2.5 font-medium text-slate-800">
                            {account.parent_id && <span className="text-slate-300 mr-1">└</span>}
                            {account.name}
                          </td>
                          <td className="px-3 py-2.5 text-slate-400 text-xs">{account.subtype}</td>
                          <td className="px-5 py-2.5 text-right">
                            <button onClick={() => toggleActive(account.id, !account.active)}
                              className={`text-xs px-2 py-0.5 rounded-full transition-colors ${account.active ? 'text-emerald-600 hover:bg-red-50 hover:text-red-500' : 'text-slate-400 hover:bg-emerald-50 hover:text-emerald-600'}`}>
                              {account.active ? t('price_active') : t('inactive')}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
