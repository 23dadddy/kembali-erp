'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Topbar } from '@/components/layout/topbar'
import {
  Package, AlertTriangle, CheckCircle2, Loader2, Search,
  TrendingUp, TrendingDown, RotateCcw, DollarSign, Filter
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/components/providers/language-provider'

const fmt = (n: number) => `Rp ${(n ?? 0).toLocaleString('id-ID')}`

const REPLACEMENT_COST: Record<string, number> = {
  '350ml': 15000,
  '750ml': 25000,
}

export default function BottlesPage() {
  const router = useRouter()
  const { t } = useLanguage()
  const [balances, setBalances] = useState<any[]>([])
  const [inventory, setInventory] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterView, setFilterView] = useState<'all' | 'chargeable' | 'outstanding'>('all')
  const [sortBy, setSortBy] = useState<'name' | 'outstanding' | 'chargeable'>('chargeable')

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)
    const sb = createClient()
    const [balRes, invRes] = await Promise.all([
      sb.from('customer_bottle_balance').select('*'),
      sb.from('bottle_inventory').select('*'),
    ])
    setBalances(balRes.data ?? [])
    setInventory(invRes.data ?? [])
    setLoading(false)
  }

  // Compute chargeable amount per customer
  const withChargeable = balances.map(b => {
    const chargeable350 = Number(b.chargeable_lost_350ml ?? 0)
    const chargeable750 = Number(b.chargeable_lost_750ml ?? 0)
    const chargeableAmt = chargeable350 * REPLACEMENT_COST['350ml'] + chargeable750 * REPLACEMENT_COST['750ml']
    const totalOutstanding = Number(b.outstanding_350ml ?? 0) + Number(b.outstanding_750ml ?? 0)
    return { ...b, chargeable350, chargeable750, chargeableAmt, totalOutstanding, isChargeable: chargeableAmt > 0 }
  })

  const filtered = withChargeable.filter(b => {
    if (search && !b.customer_name?.toLowerCase().includes(search.toLowerCase())) return false
    if (filterView === 'chargeable' && !b.isChargeable) return false
    if (filterView === 'outstanding' && b.totalOutstanding === 0) return false
    return true
  }).sort((a, b) => {
    if (sortBy === 'outstanding') return b.totalOutstanding - a.totalOutstanding
    if (sortBy === 'chargeable') return b.chargeableAmt - a.chargeableAmt
    return (a.customer_name ?? '').localeCompare(b.customer_name ?? '')
  })

  const totalChargeable = withChargeable.reduce((s, b) => s + b.chargeableAmt, 0)
  const totalOutstanding350 = withChargeable.reduce((s, b) => s + Number(b.outstanding_350ml ?? 0), 0)
  const totalOutstanding750 = withChargeable.reduce((s, b) => s + Number(b.outstanding_750ml ?? 0), 0)
  const chargeableCount = withChargeable.filter(b => b.isChargeable).length

  // Warehouse inventory totals
  const inv350filled = inventory.filter(i => i.bottle_size === '350ml' && i.status === 'filled').reduce((s, i) => s + (i.quantity ?? 0), 0)
  const inv750filled = inventory.filter(i => i.bottle_size === '750ml' && i.status === 'filled').reduce((s, i) => s + (i.quantity ?? 0), 0)
  const inv350empty = inventory.filter(i => i.bottle_size === '350ml' && i.status === 'clean_empty').reduce((s, i) => s + (i.quantity ?? 0), 0)
  const inv750empty = inventory.filter(i => i.bottle_size === '750ml' && i.status === 'clean_empty').reduce((s, i) => s + (i.quantity ?? 0), 0)

  return (
    <>
      <Topbar title={t('bottles_title')} />
      <div className="p-6 space-y-6">

        {/* Warehouse stock summary */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
            <p className="text-xs text-slate-400 mb-1">350ml {t('bottles_in_facility')}</p>
            <p className="text-2xl font-bold text-slate-800">{inv350filled.toLocaleString()}</p>
            <p className="text-xs text-slate-400 mt-1">{inv350empty} clean empty</p>
          </div>
          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
            <p className="text-xs text-slate-400 mb-1">750ml {t('bottles_in_facility')}</p>
            <p className="text-2xl font-bold text-slate-800">{inv750filled.toLocaleString()}</p>
            <p className="text-xs text-slate-400 mt-1">{inv750empty} clean empty</p>
          </div>
          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
            <p className="text-xs text-slate-400 mb-1">{t('bottles_at_customers')}</p>
            <p className="text-2xl font-bold text-slate-800">{(totalOutstanding350 + totalOutstanding750).toLocaleString()}</p>
            <p className="text-xs text-slate-400 mt-1">{totalOutstanding350} × 350ml · {totalOutstanding750} × 750ml</p>
          </div>
          <div className={`border rounded-2xl p-4 shadow-sm ${chargeableCount > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-slate-100'}`}>
            <p className={`text-xs mb-1 ${chargeableCount > 0 ? 'text-red-400' : 'text-slate-400'}`}>{t('bottles_chargeable')}</p>
            <p className={`text-xl font-bold ${chargeableCount > 0 ? 'text-red-700' : 'text-slate-800'}`}>{fmt(totalChargeable)}</p>
            <p className={`text-xs mt-1 ${chargeableCount > 0 ? 'text-red-400' : 'text-slate-400'}`}>{chargeableCount} customer{chargeableCount !== 1 ? 's' : ''} over threshold</p>
          </div>
        </div>

        {/* Policy reminder */}
        <div className="bg-cyan-50 border border-cyan-200 rounded-2xl p-4">
          <p className="text-sm font-semibold text-cyan-800 mb-1">Bottle Loss Policy</p>
          <p className="text-xs text-cyan-700">Customers may keep up to <strong>8%</strong> of delivered bottles outstanding without charge. Bottles beyond this threshold are chargeable at replacement cost (350ml: Rp 6,000 · 750ml: Rp 10,000). Replacement costs are configurable in Settings.</p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-cyan-400"
              placeholder="Search customers..."
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
            {(['all', 'chargeable', 'outstanding'] as const).map(f => (
              <button key={f} onClick={() => setFilterView(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${filterView === f ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {f === 'all' ? 'All' : f === 'chargeable' ? '⚠ Chargeable' : 'Outstanding'}
              </button>
            ))}
          </div>
          <select className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white"
            value={sortBy} onChange={e => setSortBy(e.target.value as any)}>
            <option value="chargeable">Sort: Chargeable first</option>
            <option value="outstanding">Sort: Most outstanding</option>
            <option value="name">Sort: Name A–Z</option>
          </select>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <Package className="w-10 h-10 mx-auto mb-3 text-slate-200" />
            <p>{search || filterView !== 'all' ? t('no_data') : t('bottles_no_data')}</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase">{t('bottles_customer')}</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">350ml {t('bottles_outstanding')}</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">750ml {t('bottles_outstanding')}</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">350ml {t('bottles_chargeable')}</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">750ml {t('bottles_chargeable')}</th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-slate-400 uppercase">{t('bottles_chargeable')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(b => (
                  <tr key={b.customer_id}
                    className={`hover:bg-slate-50 cursor-pointer transition-colors ${b.isChargeable ? 'bg-red-50/30' : ''}`}
                    onClick={() => router.push(`/customers/${b.customer_id}`)}>
                    <td className="px-5 py-3">
                      <p className="font-medium text-slate-800">{b.customer_name}</p>
                      <p className="text-xs text-slate-400">{b.city} · {b.customer_type}</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={b.outstanding_350ml > 0 ? 'font-medium text-slate-700' : 'text-slate-300'}>
                        {b.outstanding_350ml ?? 0}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={b.outstanding_750ml > 0 ? 'font-medium text-slate-700' : 'text-slate-300'}>
                        {b.outstanding_750ml ?? 0}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {b.chargeable350 > 0 ? (
                        <span className="font-semibold text-red-600">{b.chargeable350}</span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {b.chargeable750 > 0 ? (
                        <span className="font-semibold text-red-600">{b.chargeable750}</span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {b.chargeableAmt > 0 ? (
                        <span className="font-bold text-red-600">{fmt(b.chargeableAmt)}</span>
                      ) : (
                        <span className="text-emerald-500 text-xs flex items-center justify-end gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> OK
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              {filtered.length > 0 && (
                <tfoot>
                  <tr className="border-t border-slate-200 bg-slate-50">
                    <td className="px-5 py-3 text-xs font-semibold text-slate-500">{filtered.length} customers</td>
                    <td className="px-4 py-3 text-right text-xs font-semibold text-slate-600">
                      {filtered.reduce((s, b) => s + Number(b.outstanding_350ml ?? 0), 0)}
                    </td>
                    <td className="px-4 py-3 text-right text-xs font-semibold text-slate-600">
                      {filtered.reduce((s, b) => s + Number(b.outstanding_750ml ?? 0), 0)}
                    </td>
                    <td className="px-4 py-3 text-right text-xs font-semibold text-red-500">
                      {filtered.reduce((s, b) => s + b.chargeable350, 0)}
                    </td>
                    <td className="px-4 py-3 text-right text-xs font-semibold text-red-500">
                      {filtered.reduce((s, b) => s + b.chargeable750, 0)}
                    </td>
                    <td className="px-5 py-3 text-right font-bold text-red-600">
                      {fmt(filtered.reduce((s, b) => s + b.chargeableAmt, 0))}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </>
  )
}
