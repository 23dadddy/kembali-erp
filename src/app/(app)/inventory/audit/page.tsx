'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Topbar } from '@/components/layout/topbar'
import {
  ClipboardList, Plus, Loader2, Check, X, AlertTriangle,
  CheckCircle2, ChevronRight, Warehouse, Calendar
} from 'lucide-react'

const BOTTLE_SIZES = ['350ml', '750ml']
const BOTTLE_STATUSES = ['filled', 'clean_empty', 'dirty', 'damaged', 'in_transit']

export default function InventoryAuditPage() {
  const [audits, setAudits] = useState<any[]>([])
  const [warehouses, setWarehouses] = useState<any[]>([])
  const [staff, setStaff] = useState<any[]>([])
  const [inventory, setInventory] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedAudit, setSelectedAudit] = useState<any>(null)
  const [auditItems, setAuditItems] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [showNewAudit, setShowNewAudit] = useState(false)

  const [newAuditForm, setNewAuditForm] = useState({
    warehouse_id: '',
    performed_by: '',
    notes: '',
  })

  useEffect(() => { loadAll() }, [])
  useEffect(() => { if (selectedAudit) loadAuditItems(selectedAudit.id) }, [selectedAudit])

  const loadAll = async () => {
    setLoading(true)
    const sb = createClient()
    const [auditsRes, whRes, staffRes, invRes] = await Promise.all([
      sb.from('inventory_audits').select('*, warehouse:warehouses(name), performer:staff(name)').order('created_at', { ascending: false }),
      sb.from('warehouses').select('*').eq('active', true),
      sb.from('staff').select('id, name').eq('active', true),
      sb.from('bottle_inventory').select('*'),
    ])
    setAudits(auditsRes.data ?? [])
    setWarehouses(whRes.data ?? [])
    setStaff(staffRes.data ?? [])
    setInventory(invRes.data ?? [])
    if (whRes.data?.[0]) setNewAuditForm(f => ({ ...f, warehouse_id: whRes.data![0].id }))
    setLoading(false)
  }

  const loadAuditItems = async (auditId: string) => {
    const sb = createClient()
    const { data } = await sb.from('inventory_audit_items').select('*').eq('audit_id', auditId)
    setAuditItems(data ?? [])
  }

  const createAudit = async () => {
    if (!newAuditForm.warehouse_id) return
    setSaving(true)
    const sb = createClient()

    const { data: audit } = await sb.from('inventory_audits').insert({
      warehouse_id: newAuditForm.warehouse_id,
      performed_by: newAuditForm.performed_by || null,
      notes: newAuditForm.notes || null,
      status: 'in_progress',
      audit_date: new Date().toISOString().split('T')[0],
    }).select('*, warehouse:warehouses(name), performer:staff(name)').single()

    if (!audit) { setSaving(false); return }

    // Pre-populate items from current inventory
    const warehouseInv = inventory.filter(i => i.warehouse_id === newAuditForm.warehouse_id || !i.warehouse_id)
    const items = []
    for (const size of BOTTLE_SIZES) {
      for (const status of BOTTLE_STATUSES) {
        const invItem = warehouseInv.find(i => i.bottle_size === size && i.status === status)
        items.push({
          audit_id: audit.id,
          bottle_size: size,
          bottle_status: status,
          expected_qty: invItem?.quantity ?? 0,
          actual_qty: invItem?.quantity ?? 0, // starts matching, user adjusts
        })
      }
    }

    if (items.length > 0) {
      await sb.from('inventory_audit_items').insert(items)
    }

    setAudits([audit, ...audits])
    setSelectedAudit(audit)
    setShowNewAudit(false)
    setSaving(false)
  }

  const updateActualQty = (itemId: string, qty: number) => {
    setAuditItems(prev => prev.map(i => i.id === itemId ? { ...i, actual_qty: qty } : i))
  }

  const saveAuditItems = async () => {
    if (!selectedAudit) return
    setSaving(true)
    const sb = createClient()

    for (const item of auditItems) {
      await sb.from('inventory_audit_items').update({
        actual_qty: item.actual_qty,
        notes: item.notes,
      }).eq('id', item.id)
    }

    const hasDiscrepancy = auditItems.some(i => i.actual_qty !== i.expected_qty)
    const newStatus = hasDiscrepancy ? 'discrepancy_found' : 'completed'
    await sb.from('inventory_audits').update({
      status: newStatus,
      completed_at: new Date().toISOString(),
    }).eq('id', selectedAudit.id)

    setSelectedAudit((a: any) => ({ ...a, status: newStatus }))
    setAudits(prev => prev.map(a => a.id === selectedAudit.id ? { ...a, status: newStatus } : a))
    setSaving(false)
    alert(hasDiscrepancy
      ? `Audit complete — ${auditItems.filter(i => i.actual_qty !== i.expected_qty).length} discrepancies found.`
      : 'Audit complete — all counts match!')
  }

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  const statusConfig: Record<string, { color: string; label: string }> = {
    in_progress: { color: 'bg-amber-100 text-amber-700', label: 'In Progress' },
    completed: { color: 'bg-emerald-100 text-emerald-700', label: 'Completed' },
    discrepancy_found: { color: 'bg-red-100 text-red-600', label: 'Discrepancies Found' },
  }

  return (
    <>
      <Topbar title="Inventory Audits" />
      <div className="flex h-[calc(100vh-57px)]">
        {/* Audits List */}
        <div className="w-72 border-r border-slate-200 bg-white flex flex-col flex-shrink-0">
          <div className="p-4 border-b border-slate-100">
            <button onClick={() => setShowNewAudit(true)}
              className="w-full flex items-center justify-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white py-2 rounded-xl text-sm font-medium transition-colors">
              <Plus className="w-4 h-4" /> Start New Audit
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>
            ) : audits.length === 0 ? (
              <div className="text-center py-12 text-slate-400 px-4">
                <ClipboardList className="w-8 h-8 mx-auto mb-2 text-slate-200" />
                <p className="text-sm">No audits yet</p>
              </div>
            ) : audits.map(audit => {
              const cfg = statusConfig[audit.status] ?? statusConfig.in_progress
              return (
                <button key={audit.id} onClick={() => setSelectedAudit(audit)}
                  className={`w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors ${selectedAudit?.id === audit.id ? 'bg-cyan-50 border-l-2 border-l-cyan-500' : ''}`}>
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-slate-800 text-sm">{audit.warehouse?.name ?? 'Unknown'}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>
                      {cfg.label.split(' ')[0]}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{fmtDate(audit.audit_date)}</p>
                  {audit.performer?.name && <p className="text-xs text-slate-400">by {audit.performer.name}</p>}
                </button>
              )
            })}
          </div>
        </div>

        {/* Audit Detail */}
        <div className="flex-1 overflow-y-auto bg-slate-50">
          {!selectedAudit ? (
            <div className="flex items-center justify-center h-full text-slate-400">
              <div className="text-center">
                <ClipboardList className="w-12 h-12 mx-auto mb-3 text-slate-200" />
                <p className="font-medium">Select an audit or start a new one</p>
              </div>
            </div>
          ) : (
            <div className="p-6 space-y-5">
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-slate-800">Stock Count Audit</h2>
                    <p className="text-sm text-slate-500">{selectedAudit.warehouse?.name} · {fmtDate(selectedAudit.audit_date)}</p>
                    <span className={`inline-block mt-2 text-xs px-2.5 py-1 rounded-full font-medium ${statusConfig[selectedAudit.status]?.color ?? ''}`}>
                      {statusConfig[selectedAudit.status]?.label}
                    </span>
                  </div>
                  {selectedAudit.status === 'in_progress' && (
                    <button onClick={saveAuditItems} disabled={saving}
                      className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CheckCircle2 className="w-4 h-4" />Complete Audit</>}
                    </button>
                  )}
                </div>
                {selectedAudit.notes && <p className="text-sm text-slate-500 mt-3 bg-slate-50 rounded-xl px-3 py-2">{selectedAudit.notes}</p>}
              </div>

              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h3 className="font-semibold text-slate-800">Count Sheet</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Enter actual physical counts — discrepancies are highlighted</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase">Size</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Status</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">System Qty</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">Actual Count</th>
                        <th className="text-right px-5 py-3 text-xs font-medium text-slate-400 uppercase">Difference</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {auditItems.length === 0 ? (
                        <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-400">Loading audit items...</td></tr>
                      ) : auditItems.map(item => {
                        const diff = item.actual_qty - item.expected_qty
                        const hasDiscrepancy = diff !== 0
                        return (
                          <tr key={item.id} className={hasDiscrepancy ? 'bg-red-50/50' : 'hover:bg-slate-50'}>
                            <td className="px-5 py-3 font-medium text-slate-800">{item.bottle_size}</td>
                            <td className="px-4 py-3 text-slate-600 capitalize">{item.bottle_status?.replace('_', ' ')}</td>
                            <td className="px-4 py-3 text-right text-slate-600">{item.expected_qty}</td>
                            <td className="px-4 py-3 text-right">
                              {selectedAudit.status === 'in_progress' ? (
                                <input type="number" min="0"
                                  className={`w-20 text-right border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-400 ${hasDiscrepancy ? 'border-red-300 bg-red-50' : 'border-slate-200'}`}
                                  value={item.actual_qty}
                                  onChange={e => updateActualQty(item.id, Number(e.target.value))} />
                              ) : (
                                <span className={`font-medium ${hasDiscrepancy ? 'text-red-600' : 'text-slate-700'}`}>{item.actual_qty}</span>
                              )}
                            </td>
                            <td className={`px-5 py-3 text-right font-semibold ${diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-red-600' : 'text-slate-300'}`}>
                              {diff > 0 ? `+${diff}` : diff < 0 ? diff : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* New Audit Modal */}
      {showNewAudit && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="font-bold text-slate-800 text-lg">Start Inventory Audit</h3>
            <p className="text-sm text-slate-500">The audit will be pre-populated with current system quantities. Update the actual counts as you physically count.</p>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Warehouse *</label>
              <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                value={newAuditForm.warehouse_id} onChange={e => setNewAuditForm({ ...newAuditForm, warehouse_id: e.target.value })}>
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Performed By</label>
              <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                value={newAuditForm.performed_by} onChange={e => setNewAuditForm({ ...newAuditForm, performed_by: e.target.value })}>
                <option value="">Select staff...</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Notes</label>
              <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                value={newAuditForm.notes} onChange={e => setNewAuditForm({ ...newAuditForm, notes: e.target.value })} />
            </div>
            <div className="flex gap-2">
              <button onClick={createAudit} disabled={saving || !newAuditForm.warehouse_id}
                className="flex-1 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" />Start Audit</>}
              </button>
              <button onClick={() => setShowNewAudit(false)} className="border border-slate-200 px-4 py-2.5 rounded-xl text-sm hover:bg-slate-50">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
