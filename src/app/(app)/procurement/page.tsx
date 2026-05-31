'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Topbar } from '@/components/layout/topbar'
import {
  Package, Plus, Loader2, Check, X, Warehouse, AlertTriangle,
  TrendingDown, Edit2, ArrowUp, ArrowDown, BarChart3, ShoppingCart
} from 'lucide-react'

const CATEGORIES = ['bottle', 'cap', 'label', 'water', 'packaging', 'cleaning', 'other']
const CATEGORY_COLORS: Record<string, string> = {
  bottle: 'bg-cyan-100 text-cyan-700',
  cap: 'bg-violet-100 text-violet-700',
  label: 'bg-amber-100 text-amber-700',
  water: 'bg-blue-100 text-blue-700',
  packaging: 'bg-emerald-100 text-emerald-700',
  cleaning: 'bg-orange-100 text-orange-700',
  other: 'bg-slate-100 text-slate-500',
}

export default function ProcurementPage() {
  const [warehouses, setWarehouses] = useState<any[]>([])
  const [items, setItems] = useState<any[]>([])
  const [movements, setMovements] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'inventory' | 'movements' | 'warehouses'>('inventory')
  const [showItemForm, setShowItemForm] = useState(false)
  const [showWarehouseForm, setShowWarehouseForm] = useState(false)
  const [showMovementForm, setShowMovementForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [selectedItem, setSelectedItem] = useState<any>(null)

  const [itemForm, setItemForm] = useState({
    warehouse_id: '',
    category: 'bottle',
    name: '',
    sku: '',
    unit: 'pcs',
    quantity: 0,
    reorder_point: 0,
    reorder_quantity: 0,
    unit_cost: 0,
    notes: '',
  })

  const [warehouseForm, setWarehouseForm] = useState({
    name: '',
    address: '',
    is_primary: false,
  })

  const [movementForm, setMovementForm] = useState({
    item_id: '',
    direction: 'in' as 'in' | 'out' | 'adjustment',
    quantity: 0,
    reason: '',
    reference: '',
  })

  useEffect(() => { loadAll() }, [])

  const loadAll = async () => {
    setLoading(true)
    const sb = createClient()
    const [whRes, itemsRes, movRes] = await Promise.all([
      sb.from('warehouses').select('*').eq('active', true),
      sb.from('inventory_items').select('*, warehouse:warehouses(name)').order('category').order('name'),
      sb.from('inventory_movements').select('*, item:inventory_items(name, unit), warehouse:warehouses(name)').order('created_at', { ascending: false }).limit(50),
    ])
    setWarehouses(whRes.data ?? [])
    setItems(itemsRes.data ?? [])
    setMovements(movRes.data ?? [])
    if (whRes.data?.[0] && !itemForm.warehouse_id) setItemForm(f => ({ ...f, warehouse_id: whRes.data![0].id }))
    setLoading(false)
  }

  const saveWarehouse = async () => {
    if (!warehouseForm.name) return
    setSaving(true)
    const sb = createClient()
    const { data } = await sb.from('warehouses').insert(warehouseForm).select().single()
    if (data) setWarehouses([...warehouses, data])
    setShowWarehouseForm(false)
    setWarehouseForm({ name: '', address: '', is_primary: false })
    setSaving(false)
  }

  const saveItem = async () => {
    if (!itemForm.name || !itemForm.warehouse_id) return
    setSaving(true)
    const sb = createClient()
    const { data } = await sb.from('inventory_items').insert(itemForm).select('*, warehouse:warehouses(name)').single()
    if (data) setItems([...items, data])
    setShowItemForm(false)
    setItemForm({ warehouse_id: warehouses[0]?.id ?? '', category: 'bottle', name: '', sku: '', unit: 'pcs', quantity: 0, reorder_point: 0, reorder_quantity: 0, unit_cost: 0, notes: '' })
    setSaving(false)
  }

  const saveMovement = async () => {
    if (!movementForm.item_id || !movementForm.quantity) return
    setSaving(true)
    const sb = createClient()
    const item = items.find(i => i.id === movementForm.item_id)
    const qtyChange = movementForm.direction === 'out' ? -movementForm.quantity : movementForm.quantity
    const newQty = (item?.quantity ?? 0) + qtyChange

    await Promise.all([
      sb.from('inventory_movements').insert({
        item_id: movementForm.item_id,
        warehouse_id: item?.warehouse_id,
        direction: movementForm.direction,
        quantity: movementForm.quantity,
        reason: movementForm.reason || null,
        reference_type: movementForm.reference || null,
      }),
      sb.from('inventory_items').update({ quantity: Math.max(0, newQty), updated_at: new Date().toISOString() }).eq('id', movementForm.item_id),
    ])

    setItems(items.map(i => i.id === movementForm.item_id ? { ...i, quantity: Math.max(0, newQty) } : i))
    setShowMovementForm(false)
    setMovementForm({ item_id: '', direction: 'in', quantity: 0, reason: '', reference: '' })
    await loadAll()
    setSaving(false)
  }

  const lowStockItems = items.filter(i => i.reorder_point > 0 && i.quantity <= i.reorder_point)
  const filteredItems = items.filter(i => categoryFilter === 'all' || i.category === categoryFilter)
  const totalValue = items.reduce((s, i) => s + (i.quantity * i.unit_cost), 0)
  const fmt = (n: number) => `Rp ${n.toLocaleString('id-ID')}`
  const fmtDate = (d: string) => new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <>
      <Topbar title="Procurement & Supplies" />
      <div className="p-6 max-w-6xl space-y-6">

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-slate-400">Total Items</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{items.length}</p>
          </div>
          <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-slate-400">Warehouses</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{warehouses.length}</p>
          </div>
          <div className={`border rounded-xl p-4 shadow-sm ${lowStockItems.length > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-slate-100'}`}>
            <p className={`text-xs ${lowStockItems.length > 0 ? 'text-red-400' : 'text-slate-400'}`}>Low Stock Alerts</p>
            <p className={`text-2xl font-bold mt-1 ${lowStockItems.length > 0 ? 'text-red-700' : 'text-slate-800'}`}>{lowStockItems.length}</p>
          </div>
          <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-slate-400">Total Inventory Value</p>
            <p className="text-xl font-bold text-cyan-600 mt-1">{fmt(totalValue)}</p>
          </div>
        </div>

        {/* Low Stock Banner */}
        {lowStockItems.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <p className="text-sm font-semibold text-red-700">Low Stock — {lowStockItems.length} item{lowStockItems.length > 1 ? 's' : ''} need reordering</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {lowStockItems.map(item => (
                <span key={item.id} className="text-xs bg-red-100 text-red-600 px-2.5 py-1 rounded-full">
                  {item.name}: {item.quantity} {item.unit} (reorder at {item.reorder_point})
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-3">
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
            {(['inventory', 'movements', 'warehouses'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${tab === t ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {t}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          {tab === 'inventory' && (
            <>
              <select className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
                value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
                <option value="all">All Categories</option>
                {CATEGORIES.map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
              </select>
              <button onClick={() => setShowMovementForm(true)}
                className="flex items-center gap-2 border border-slate-200 bg-white hover:bg-slate-50 px-4 py-2 rounded-xl text-sm font-medium text-slate-700 transition-colors">
                <ShoppingCart className="w-4 h-4" /> Log Movement
              </button>
              <button onClick={() => setShowItemForm(true)}
                className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
                <Plus className="w-4 h-4" /> Add Item
              </button>
            </>
          )}
          {tab === 'warehouses' && (
            <button onClick={() => setShowWarehouseForm(true)}
              className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
              <Plus className="w-4 h-4" /> Add Warehouse
            </button>
          )}
        </div>

        {/* Item Form */}
        {showItemForm && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
            <h3 className="font-semibold text-slate-800">Add Inventory Item</h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="text-xs font-medium text-slate-600 block mb-1">Item Name *</label>
                <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  placeholder="e.g. 350ml Glass Bottle, Metal Cap"
                  value={itemForm.name} onChange={e => setItemForm({ ...itemForm, name: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">SKU</label>
                <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={itemForm.sku} onChange={e => setItemForm({ ...itemForm, sku: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Category</label>
                <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={itemForm.category} onChange={e => setItemForm({ ...itemForm, category: e.target.value })}>
                  {CATEGORIES.map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Warehouse</label>
                <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={itemForm.warehouse_id} onChange={e => setItemForm({ ...itemForm, warehouse_id: e.target.value })}>
                  {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Unit</label>
                <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={itemForm.unit} onChange={e => setItemForm({ ...itemForm, unit: e.target.value })}>
                  {['pcs', 'kg', 'liter', 'box', 'roll', 'bag'].map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Current Qty</label>
                <input type="number" min="0" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={itemForm.quantity} onChange={e => setItemForm({ ...itemForm, quantity: Number(e.target.value) })} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Reorder Point</label>
                <input type="number" min="0" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={itemForm.reorder_point} onChange={e => setItemForm({ ...itemForm, reorder_point: Number(e.target.value) })} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Unit Cost (Rp)</label>
                <input type="number" min="0" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={itemForm.unit_cost} onChange={e => setItemForm({ ...itemForm, unit_cost: Number(e.target.value) })} />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={saveItem} disabled={saving || !itemForm.name}
                className="flex-1 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" />Save Item</>}
              </button>
              <button onClick={() => setShowItemForm(false)} className="border border-slate-200 px-4 py-2 rounded-xl text-sm hover:bg-slate-50">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Movement Form */}
        {showMovementForm && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
            <h3 className="font-semibold text-slate-800">Log Stock Movement</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs font-medium text-slate-600 block mb-1">Item *</label>
                <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={movementForm.item_id} onChange={e => setMovementForm({ ...movementForm, item_id: e.target.value })}>
                  <option value="">Select item...</option>
                  {items.map(i => <option key={i.id} value={i.id}>{i.name} — {i.quantity} {i.unit} in stock</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Type</label>
                <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={movementForm.direction} onChange={e => setMovementForm({ ...movementForm, direction: e.target.value as any })}>
                  <option value="in">Stock In (received)</option>
                  <option value="out">Stock Out (used/sold)</option>
                  <option value="adjustment">Adjustment</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Quantity *</label>
                <input type="number" min="0" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={movementForm.quantity} onChange={e => setMovementForm({ ...movementForm, quantity: Number(e.target.value) })} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Reason</label>
                <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  placeholder="e.g. Purchase order, damaged, used in production"
                  value={movementForm.reason} onChange={e => setMovementForm({ ...movementForm, reason: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Reference / PO Number</label>
                <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={movementForm.reference} onChange={e => setMovementForm({ ...movementForm, reference: e.target.value })} />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={saveMovement} disabled={saving || !movementForm.item_id || !movementForm.quantity}
                className="flex-1 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" />Log Movement</>}
              </button>
              <button onClick={() => setShowMovementForm(false)} className="border border-slate-200 px-4 py-2 rounded-xl text-sm hover:bg-slate-50">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
        ) : (
          <>
            {tab === 'inventory' && (
              <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Item</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Warehouse</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">In Stock</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Reorder At</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Unit Cost</th>
                      <th className="text-right px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredItems.length === 0 ? (
                      <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-400">No items found</td></tr>
                    ) : filteredItems.map(item => {
                      const isLow = item.reorder_point > 0 && item.quantity <= item.reorder_point
                      return (
                        <tr key={item.id} className={`hover:bg-slate-50 ${isLow ? 'bg-red-50/50' : ''}`}>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              {isLow && <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
                              <div>
                                <p className="font-medium text-slate-800">{item.name}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${CATEGORY_COLORS[item.category] ?? CATEGORY_COLORS.other}`}>{item.category}</span>
                                  {item.sku && <span className="text-xs text-slate-400">{item.sku}</span>}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-600">{item.warehouse?.name ?? '—'}</td>
                          <td className={`px-4 py-3 text-right font-semibold ${isLow ? 'text-red-600' : 'text-slate-800'}`}>
                            {item.quantity} <span className="text-xs font-normal text-slate-400">{item.unit}</span>
                          </td>
                          <td className="px-4 py-3 text-right text-slate-500">{item.reorder_point > 0 ? item.reorder_point : '—'}</td>
                          <td className="px-4 py-3 text-right text-slate-500">{item.unit_cost > 0 ? fmt(item.unit_cost) : '—'}</td>
                          <td className="px-5 py-3 text-right font-medium text-slate-700">
                            {item.unit_cost > 0 ? fmt(item.quantity * item.unit_cost) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {tab === 'movements' && (
              <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase">Date</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Item</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Type</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">Qty</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {movements.length === 0 ? (
                      <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-400">No movements yet</td></tr>
                    ) : movements.map(m => (
                      <tr key={m.id} className="hover:bg-slate-50">
                        <td className="px-5 py-3 text-slate-500 text-xs">{fmtDate(m.created_at)}</td>
                        <td className="px-4 py-3 font-medium text-slate-800">{m.item?.name}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                            m.direction === 'in' ? 'bg-emerald-100 text-emerald-700' :
                            m.direction === 'out' ? 'bg-red-100 text-red-600' :
                            'bg-amber-100 text-amber-700'
                          }`}>
                            {m.direction === 'in' ? <ArrowDown className="w-3 h-3" /> : m.direction === 'out' ? <ArrowUp className="w-3 h-3" /> : null}
                            {m.direction}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-slate-700">{m.quantity} {m.item?.unit}</td>
                        <td className="px-5 py-3 text-slate-500">{m.reason ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {tab === 'warehouses' && (
              <>
                {showWarehouseForm && (
                  <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
                    <h3 className="font-semibold text-slate-800">New Warehouse / Storage Location</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-slate-600 block mb-1">Name *</label>
                        <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                          placeholder="e.g. Main Warehouse, Production Facility"
                          value={warehouseForm.name} onChange={e => setWarehouseForm({ ...warehouseForm, name: e.target.value })} />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-600 block mb-1">Address</label>
                        <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                          value={warehouseForm.address} onChange={e => setWarehouseForm({ ...warehouseForm, address: e.target.value })} />
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                      <input type="checkbox" checked={warehouseForm.is_primary} onChange={e => setWarehouseForm({ ...warehouseForm, is_primary: e.target.checked })} />
                      Set as primary warehouse
                    </label>
                    <div className="flex gap-2">
                      <button onClick={saveWarehouse} disabled={saving || !warehouseForm.name}
                        className="flex-1 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-2">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" />Save</>}
                      </button>
                      <button onClick={() => setShowWarehouseForm(false)} className="border border-slate-200 px-4 py-2 rounded-xl text-sm hover:bg-slate-50"><X className="w-4 h-4" /></button>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-4">
                  {warehouses.map(wh => (
                    <div key={wh.id} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center">
                          <Warehouse className="w-5 h-5 text-slate-500" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800">{wh.name}</p>
                          {wh.is_primary && <span className="text-xs text-cyan-600 bg-cyan-50 px-2 py-0.5 rounded-full">Primary</span>}
                        </div>
                      </div>
                      {wh.address && <p className="text-sm text-slate-500">{wh.address}</p>}
                      <p className="text-xs text-slate-400 mt-2">
                        {items.filter(i => i.warehouse_id === wh.id).length} items · {fmt(items.filter(i => i.warehouse_id === wh.id).reduce((s, i) => s + i.quantity * i.unit_cost, 0))} value
                      </p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </>
  )
}
