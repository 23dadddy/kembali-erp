'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Topbar } from '@/components/layout/topbar'
import { useLanguage } from '@/components/providers/language-provider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { createClient } from '@/lib/supabase/client'
import { getInventory, setInventoryQty } from '@/lib/db'
import { BottleInventory, BottleSize, BottleStatus } from '@/types'
import {
  Package, ArrowRight, Loader2, Edit2, Search,
  AlertTriangle, CheckCircle2
} from 'lucide-react'

type Tab = 'stock' | 'bottle-tracking' | 'procurement'

const inventoryConfigBase: { status: BottleStatus; labelKey: string; descKey: string; color: string; dot: string }[] = [
  { status: 'filled', labelKey: 'inventory_status_filled', descKey: 'inventory_status_filled_desc', color: 'bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
  { status: 'at_customer', labelKey: 'inventory_status_at_customer', descKey: 'inventory_status_at_customer_desc', color: 'bg-blue-50 border-blue-200', dot: 'bg-blue-500' },
  { status: 'dirty', labelKey: 'inventory_status_dirty', descKey: 'inventory_status_dirty_desc', color: 'bg-amber-50 border-amber-200', dot: 'bg-amber-500' },
  { status: 'cleaning', labelKey: 'inventory_status_cleaning', descKey: 'inventory_status_cleaning_desc', color: 'bg-purple-50 border-purple-200', dot: 'bg-purple-500' },
  { status: 'clean_empty', labelKey: 'inventory_status_clean_empty', descKey: 'inventory_status_clean_empty_desc', color: 'bg-slate-50 border-slate-200', dot: 'bg-slate-400' },
  { status: 'damaged', labelKey: 'inventory_status_damaged', descKey: 'inventory_status_damaged_desc', color: 'bg-red-50 border-red-200', dot: 'bg-red-400' },
]
const REPLACEMENT_COST: Record<string, number> = { '350ml': 15000, '750ml': 25000 }
const fmt = (n: number) => `Rp ${(n ?? 0).toLocaleString('id-ID')}`

// ─── TAB: STOCK ───────────────────────────────────────────────────────────────
function StockTab() {
  const { t } = useLanguage()
  const [inventory, setInventory] = useState<BottleInventory[]>([])
  const [loading, setLoading] = useState(true)
  const [editOpen, setEditOpen] = useState(false)
  const [editRow, setEditRow] = useState<BottleInventory | null>(null)
  const [editQty, setEditQty] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => { setLoading(true); try { setInventory(await getInventory()) } finally { setLoading(false) } }, [])
  useEffect(() => { load() }, [load])

  const getQty = (status: BottleStatus, size: BottleSize) => inventory.find(r => r.status === status && r.bottle_size === size)?.quantity ?? 0
  const getRow = (status: BottleStatus, size: BottleSize) => inventory.find(r => r.status === status && r.bottle_size === size)
  const total350 = inventory.filter(r => r.bottle_size === '350ml').reduce((s, r) => s + r.quantity, 0)
  const total750 = inventory.filter(r => r.bottle_size === '750ml').reduce((s, r) => s + r.quantity, 0)

  const handleSave = async () => {
    if (!editRow) return
    setSaving(true)
    try { await setInventoryQty(editRow.id, parseInt(editQty) || 0); setEditOpen(false); await load() } finally { setSaving(false) }
  }

  return (
    <div className="p-6 space-y-6">
      <Card>
        <CardHeader><CardTitle className="text-sm font-semibold text-slate-500 uppercase tracking-wide">{t('inventory_bottle_flow')}</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-1 flex-wrap">
            {[t('inventory_status_clean_empty'), t('inventory_status_filled'), t('delivered'), t('inventory_status_at_customer'), t('inventory_status_dirty'), t('inventory_status_cleaning')].map((label, i, arr) => (
              <div key={i} className="flex items-center gap-1">
                <span className="px-3 py-1.5 bg-cyan-50 text-cyan-700 text-xs font-medium rounded-full border border-cyan-200">{label}</span>
                {i < arr.length - 1 && <ArrowRight className="w-3 h-3 text-slate-300" />}
              </div>
            ))}
            <ArrowRight className="w-3 h-3 text-slate-300" />
            <span className="px-3 py-1.5 bg-cyan-50 text-cyan-700 text-xs font-medium rounded-full border border-cyan-200 border-dashed">{t('inventory_back_to_start')}</span>
          </div>
        </CardContent>
      </Card>
      <div className="grid grid-cols-2 gap-4">
        <Card><CardContent className="pt-5"><div className="flex items-center justify-between"><div><p className="text-sm text-slate-500">{t('inventory_350ml')}</p><p className="text-3xl font-bold mt-1">{loading ? '—' : total350}</p></div><Package className="w-8 h-8 text-slate-200" /></div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="flex items-center justify-between"><div><p className="text-sm text-slate-500">{t('inventory_750ml')}</p><p className="text-3xl font-bold mt-1">{loading ? '—' : total750}</p></div><Package className="w-8 h-8 text-slate-200" /></div></CardContent></Card>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between"><h2 className="font-semibold text-slate-700">{t('inventory_by_status')}</h2><p className="text-xs text-slate-400">{t('inventory_click_adjust')}</p></div>
        {loading ? <div className="text-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-300 mx-auto" /></div> : (
          <div className="grid gap-3">
            {inventoryConfigBase.map(({ status, labelKey, descKey, color, dot }) => (
              <div key={status} className={`flex items-center gap-4 p-4 rounded-xl border ${color}`}>
                <div className={`w-3 h-3 rounded-full ${dot} flex-shrink-0`} />
                <div className="flex-1"><p className="font-medium text-sm text-slate-800">{t(labelKey as any)}</p><p className="text-xs text-slate-500">{t(descKey as any)}</p></div>
                <div className="flex gap-4 text-sm">
                  {(['350ml', '750ml'] as BottleSize[]).map(size => {
                    const row = getRow(status, size)
                    return (
                      <button key={size} onClick={() => row && (setEditRow(row), setEditQty(String(row.quantity)), setEditOpen(true))} className="text-center group hover:bg-white/60 rounded-lg px-2 py-1 transition-colors">
                        <div className="font-bold text-slate-800 group-hover:text-cyan-600 flex items-center gap-1">{getQty(status, size)}<Edit2 className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity" /></div>
                        <div className="text-xs text-slate-400">{size}</div>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-sm"><DialogHeader><DialogTitle>{t('inventory_adjust_inventory')}</DialogTitle></DialogHeader>
          {editRow && <div className="space-y-4 py-2">
            <p className="text-sm text-slate-500">{t('inventory_setting_label')} <strong>{editRow.bottle_size}</strong> — <strong>{t((inventoryConfigBase.find(c => c.status === editRow.status)?.labelKey ?? 'inventory_status_filled') as any)}</strong></p>
            <div className="space-y-1"><Label>{t('quantity')}</Label><Input type="number" min="0" value={editQty} onChange={e => setEditQty(e.target.value)} /></div>
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setEditOpen(false)}>{t('cancel')}</Button><Button className="bg-cyan-600 hover:bg-cyan-700" onClick={handleSave} disabled={saving}>{saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}{t('save')}</Button></div>
          </div>}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── TAB: BOTTLE TRACKING ─────────────────────────────────────────────────────
function BottleTrackingTab() {
  const { t } = useLanguage()
  const router = useRouter()
  const [balances, setBalances] = useState<any[]>([])
  const [inventory, setInventory] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterView, setFilterView] = useState<'all' | 'chargeable' | 'outstanding'>('all')
  const [sortBy, setSortBy] = useState<'name' | 'outstanding' | 'chargeable'>('chargeable')

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const sb = createClient()
      const [balRes, invRes] = await Promise.all([sb.from('customer_bottle_balance').select('*'), sb.from('bottle_inventory').select('*')])
      setBalances(balRes.data ?? []); setInventory(invRes.data ?? []); setLoading(false)
    }
    load()
  }, [])

  const withChargeable = balances.map(b => {
    const c350 = Number(b.chargeable_lost_350ml ?? 0); const c750 = Number(b.chargeable_lost_750ml ?? 0)
    const chargeableAmt = c350 * REPLACEMENT_COST['350ml'] + c750 * REPLACEMENT_COST['750ml']
    const totalOutstanding = Number(b.outstanding_350ml ?? 0) + Number(b.outstanding_750ml ?? 0)
    return { ...b, chargeable350: c350, chargeable750: c750, chargeableAmt, totalOutstanding, isChargeable: chargeableAmt > 0 }
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
  const totalOut350 = withChargeable.reduce((s, b) => s + Number(b.outstanding_350ml ?? 0), 0)
  const totalOut750 = withChargeable.reduce((s, b) => s + Number(b.outstanding_750ml ?? 0), 0)
  const chargeableCount = withChargeable.filter(b => b.isChargeable).length
  const inv350filled = inventory.filter(i => i.bottle_size === '350ml' && i.status === 'filled').reduce((s, i) => s + (i.quantity ?? 0), 0)
  const inv750filled = inventory.filter(i => i.bottle_size === '750ml' && i.status === 'filled').reduce((s, i) => s + (i.quantity ?? 0), 0)

  return (
    <div className="p-6 space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm"><p className="text-xs text-slate-400 mb-1">{t('inventory_350ml_filled')}</p><p className="text-2xl font-bold text-slate-800">{inv350filled.toLocaleString()}</p></div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm"><p className="text-xs text-slate-400 mb-1">{t('inventory_750ml_filled')}</p><p className="text-2xl font-bold text-slate-800">{inv750filled.toLocaleString()}</p></div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm"><p className="text-xs text-slate-400 mb-1">{t('inventory_outstanding_all')}</p><p className="text-2xl font-bold text-slate-800">{(totalOut350 + totalOut750).toLocaleString()}</p><p className="text-xs text-slate-400 mt-1">{totalOut350} × 350ml · {totalOut750} × 750ml</p></div>
        <div className={`border rounded-2xl p-4 shadow-sm ${chargeableCount > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-slate-100'}`}><p className={`text-xs mb-1 ${chargeableCount > 0 ? 'text-red-400' : 'text-slate-400'}`}>{t('inventory_chargeable_lost')}</p><p className={`text-xl font-bold ${chargeableCount > 0 ? 'text-red-700' : 'text-slate-800'}`}>{fmt(totalChargeable)}</p><p className={`text-xs mt-1 ${chargeableCount > 0 ? 'text-red-400' : 'text-slate-400'}`}>{chargeableCount} customer{chargeableCount !== 1 ? 's' : ''} over threshold</p></div>
      </div>
      <div className="bg-cyan-50 border border-cyan-200 rounded-2xl p-4"><p className="text-sm font-semibold text-cyan-800 mb-1">{t('inventory_bottle_loss_policy')}</p><p className="text-xs text-cyan-700">Customers may keep up to <strong>8%</strong> of delivered bottles outstanding without charge. Bottles beyond this threshold are chargeable at replacement cost (350ml: Rp 6,000 · 750ml: Rp 10,000).</p></div>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" /><input className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl" placeholder={t('customers_search')} value={search} onChange={e => setSearch(e.target.value)} /></div>
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1">{(['all', 'chargeable', 'outstanding'] as const).map(f => <button key={f} onClick={() => setFilterView(f)} className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${filterView === f ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{f === 'all' ? t('all') : f === 'chargeable' ? `⚠ ${t('inventory_chargeable')}` : t('inventory_outstanding')}</button>)}</div>
        <select className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white" value={sortBy} onChange={e => setSortBy(e.target.value as any)}><option value="chargeable">{t('inventory_sort_chargeable')}</option><option value="outstanding">{t('inventory_sort_outstanding')}</option><option value="name">{t('inventory_sort_name')}</option></select>
      </div>
      {loading ? <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
        : filtered.length === 0 ? <div className="text-center py-16 text-slate-400"><Package className="w-10 h-10 mx-auto mb-3 text-slate-200" /><p>{search || filterView !== 'all' ? t('inventory_no_matching') : t('inventory_no_tracking')}</p></div>
        : (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-100 bg-slate-50"><th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase">{t('customers_name')}</th><th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">{t('inventory_col_350_out')}</th><th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">{t('inventory_col_750_out')}</th><th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">{t('inventory_col_350_chargeable')}</th><th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">{t('inventory_col_750_chargeable')}</th><th className="text-right px-5 py-3 text-xs font-medium text-slate-400 uppercase">{t('inventory_charge_amount')}</th></tr></thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(b => (
                  <tr key={b.customer_id} className={`hover:bg-slate-50 cursor-pointer transition-colors ${b.isChargeable ? 'bg-red-50/30' : ''}`} onClick={() => router.push(`/customers/${b.customer_id}`)}>
                    <td className="px-5 py-3"><p className="font-medium text-slate-800">{b.customer_name}</p><p className="text-xs text-slate-400">{b.city} · {b.customer_type}</p></td>
                    <td className="px-4 py-3 text-right"><span className={b.outstanding_350ml > 0 ? 'font-medium text-slate-700' : 'text-slate-300'}>{b.outstanding_350ml ?? 0}</span></td>
                    <td className="px-4 py-3 text-right"><span className={b.outstanding_750ml > 0 ? 'font-medium text-slate-700' : 'text-slate-300'}>{b.outstanding_750ml ?? 0}</span></td>
                    <td className="px-4 py-3 text-right">{b.chargeable350 > 0 ? <span className="font-semibold text-red-600">{b.chargeable350}</span> : <span className="text-slate-300">—</span>}</td>
                    <td className="px-4 py-3 text-right">{b.chargeable750 > 0 ? <span className="font-semibold text-red-600">{b.chargeable750}</span> : <span className="text-slate-300">—</span>}</td>
                    <td className="px-5 py-3 text-right">{b.chargeableAmt > 0 ? <span className="font-bold text-red-600">{fmt(b.chargeableAmt)}</span> : <span className="text-emerald-500 text-xs flex items-center justify-end gap-1"><CheckCircle2 className="w-3.5 h-3.5" />OK</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  )
}

// ─── MAIN PAGE ─────────────────────────────────────────────────────────────────
const TAB_KEYS_INV = [
  { id: 'stock' as Tab, labelKey: 'inventory_bottle_stock' as const },
  { id: 'bottle-tracking' as Tab, labelKey: 'inventory_customer_tracking' as const },
  { id: 'procurement' as Tab, labelKey: 'inventory_procurement' as const },
]

export default function InventoryPage() {
  const router = useRouter()
  const { t } = useLanguage()
  const [tab, setTab] = useState<Tab>('stock')

  const handleTabClick = (id: Tab) => {
    if (id === 'procurement') { router.push('/procurement'); return }
    setTab(id)
  }

  return (
    <>
      <Topbar title="inventory_title" titleIsKey />
      <div className="bg-white border-b border-slate-200 px-6">
        <div className="flex gap-1">
          {TAB_KEYS_INV.map(({ id, labelKey }) => (
            <button key={id} onClick={() => handleTabClick(id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${tab === id && id !== 'procurement' ? 'border-cyan-600 text-cyan-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
              {t(labelKey)}
            </button>
          ))}
        </div>
      </div>
      {tab === 'stock' && <StockTab />}
      {tab === 'bottle-tracking' && <BottleTrackingTab />}
    </>
  )
}
