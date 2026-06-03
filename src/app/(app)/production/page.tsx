'use client'

import { useState, useEffect } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { createClient } from '@/lib/supabase/client'
import { getStaff, getInventory, setInventoryQty } from '@/lib/db'
import type { Staff, BottleInventory } from '@/types'
import {
  Droplets, Plus, Check, X, Loader2, Package, Beaker,
  CheckCircle2, Clock, AlertTriangle, TrendingUp, Download
} from 'lucide-react'

type Tab = 'production' | 'cleaning'

export default function ProductionPage() {
  const [tab, setTab] = useState<Tab>('production')
  const [runs, setRuns] = useState<any[]>([])
  const [batches, setBatches] = useState<any[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [inventory, setInventory] = useState<BottleInventory[]>([])
  const [loading, setLoading] = useState(true)
  const [showRunForm, setShowRunForm] = useState(false)
  const [showBatchForm, setShowBatchForm] = useState(false)
  const [saving, setSaving] = useState(false)

  const [runForm, setRunForm] = useState({
    run_date: new Date().toISOString().split('T')[0],
    shift: 'morning',
    filled_350ml: 0,
    filled_750ml: 0,
    rejected_350ml: 0,
    rejected_750ml: 0,
    water_liters: 0,
    operator_id: '',
    quality_check: false,
    quality_notes: '',
    batch_number: '',
    notes: '',
    status: 'completed',
  })

  const [batchForm, setBatchForm] = useState({
    batch_date: new Date().toISOString().split('T')[0],
    cleaned_350ml: 0,
    cleaned_750ml: 0,
    rejected_350ml: 0,
    rejected_750ml: 0,
    cleaning_agent: '',
    operator_id: '',
    notes: '',
    status: 'completed',
  })

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const sb = createClient()
      const [{ data: r }, { data: b }, s, inv] = await Promise.all([
        sb.from('production_runs').select('*, operator:staff(name)').order('run_date', { ascending: false }).limit(30),
        sb.from('cleaning_batches').select('*, operator:staff(name)').order('batch_date', { ascending: false }).limit(30),
        getStaff(),
        getInventory(),
      ])
      setRuns(r ?? [])
      setBatches(b ?? [])
      setStaff(s)
      setInventory(inv)
      setLoading(false)
    }
    load()
  }, [])

  const handleSaveRun = async () => {
    setSaving(true)
    try {
      const sb = createClient()
      const { data, error } = await sb.from('production_runs').insert({
        ...runForm,
        operator_id: runForm.operator_id || null,
        completed_at: runForm.status === 'completed' ? new Date().toISOString() : null,
      }).select('*, operator:staff(name)').single()
      if (error) throw error

      // Auto-update inventory: clean_empty → filled
      if (runForm.filled_350ml > 0) {
        const row350filled = inventory.find(r => r.bottle_size === '350ml' && r.status === 'filled')
        const row350clean = inventory.find(r => r.bottle_size === '350ml' && r.status === 'clean_empty')
        if (row350filled) await setInventoryQty(row350filled.id, row350filled.quantity + runForm.filled_350ml)
        if (row350clean) await setInventoryQty(row350clean.id, Math.max(0, row350clean.quantity - runForm.filled_350ml))
      }
      if (runForm.filled_750ml > 0) {
        const row750filled = inventory.find(r => r.bottle_size === '750ml' && r.status === 'filled')
        const row750clean = inventory.find(r => r.bottle_size === '750ml' && r.status === 'clean_empty')
        if (row750filled) await setInventoryQty(row750filled.id, row750filled.quantity + runForm.filled_750ml)
        if (row750clean) await setInventoryQty(row750clean.id, Math.max(0, row750clean.quantity - runForm.filled_750ml))
      }

      setRuns([data, ...runs])
      setShowRunForm(false)
      setRunForm({ run_date: new Date().toISOString().split('T')[0], shift: 'morning', filled_350ml: 0, filled_750ml: 0, rejected_350ml: 0, rejected_750ml: 0, water_liters: 0, operator_id: '', quality_check: false, quality_notes: '', batch_number: '', notes: '', status: 'completed' })
    } finally {
      setSaving(false)
    }
  }

  const handleSaveBatch = async () => {
    setSaving(true)
    try {
      const sb = createClient()
      const { data, error } = await sb.from('cleaning_batches').insert({
        ...batchForm,
        operator_id: batchForm.operator_id || null,
        completed_at: batchForm.status === 'completed' ? new Date().toISOString() : null,
      }).select('*, operator:staff(name)').single()
      if (error) throw error

      // Auto-update inventory: dirty → clean_empty
      if (batchForm.cleaned_350ml > 0) {
        const dirtyRow = inventory.find(r => r.bottle_size === '350ml' && r.status === 'dirty')
        const cleanRow = inventory.find(r => r.bottle_size === '350ml' && r.status === 'clean_empty')
        if (dirtyRow) await setInventoryQty(dirtyRow.id, Math.max(0, dirtyRow.quantity - batchForm.cleaned_350ml))
        if (cleanRow) await setInventoryQty(cleanRow.id, cleanRow.quantity + batchForm.cleaned_350ml)
      }
      if (batchForm.cleaned_750ml > 0) {
        const dirtyRow = inventory.find(r => r.bottle_size === '750ml' && r.status === 'dirty')
        const cleanRow = inventory.find(r => r.bottle_size === '750ml' && r.status === 'clean_empty')
        if (dirtyRow) await setInventoryQty(dirtyRow.id, Math.max(0, dirtyRow.quantity - batchForm.cleaned_750ml))
        if (cleanRow) await setInventoryQty(cleanRow.id, cleanRow.quantity + batchForm.cleaned_750ml)
      }

      setBatches([data, ...batches])
      setShowBatchForm(false)
      setBatchForm({ batch_date: new Date().toISOString().split('T')[0], cleaned_350ml: 0, cleaned_750ml: 0, rejected_350ml: 0, rejected_750ml: 0, cleaning_agent: '', operator_id: '', notes: '', status: 'completed' })
    } finally {
      setSaving(false)
    }
  }

  // Stats
  const thisWeek = new Date(); thisWeek.setDate(thisWeek.getDate() - 7)
  const weeklyRuns = runs.filter(r => new Date(r.run_date) >= thisWeek)
  const totalFilled350 = weeklyRuns.reduce((s, r) => s + (r.filled_350ml || 0), 0)
  const totalFilled750 = weeklyRuns.reduce((s, r) => s + (r.filled_750ml || 0), 0)
  const weeklyBatches = batches.filter(b => new Date(b.batch_date) >= thisWeek)
  const totalCleaned350 = weeklyBatches.reduce((s, b) => s + (b.cleaned_350ml || 0), 0)
  const totalCleaned750 = weeklyBatches.reduce((s, b) => s + (b.cleaned_750ml || 0), 0)

  const inv350Filled = inventory.find(r => r.bottle_size === '350ml' && r.status === 'filled')?.quantity ?? 0
  const inv750Filled = inventory.find(r => r.bottle_size === '750ml' && r.status === 'filled')?.quantity ?? 0
  const inv350Dirty = inventory.find(r => r.bottle_size === '350ml' && r.status === 'dirty')?.quantity ?? 0
  const inv750Dirty = inventory.find(r => r.bottle_size === '750ml' && r.status === 'dirty')?.quantity ?? 0

  return (
    <>
      <Topbar title="Production & Manufacturing" />
      <div className="p-6 max-w-5xl space-y-6">

        {/* Live inventory snapshot */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Filled 350ml', value: inv350Filled, color: 'text-emerald-700', bg: 'bg-emerald-50', icon: Droplets },
            { label: 'Filled 750ml', value: inv750Filled, color: 'text-emerald-700', bg: 'bg-emerald-50', icon: Droplets },
            { label: 'Dirty 350ml (awaiting clean)', value: inv350Dirty, color: inv350Dirty > 50 ? 'text-amber-700' : 'text-slate-700', bg: inv350Dirty > 50 ? 'bg-amber-50' : 'bg-slate-50', icon: Package },
            { label: 'Dirty 750ml (awaiting clean)', value: inv750Dirty, color: inv750Dirty > 50 ? 'text-amber-700' : 'text-slate-700', bg: inv750Dirty > 50 ? 'bg-amber-50' : 'bg-slate-50', icon: Package },
          ].map(({ label, value, color, bg, icon: Icon }) => (
            <Card key={label} className={bg}>
              <CardContent className="pt-4">
                <p className="text-xs text-slate-500">{label}</p>
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* This week */}
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-slate-400 mb-1">This week — Filled</p>
              <div className="flex gap-4">
                <div><p className="text-xl font-bold text-cyan-700">{totalFilled350}</p><p className="text-xs text-slate-400">350ml</p></div>
                <div><p className="text-xl font-bold text-cyan-700">{totalFilled750}</p><p className="text-xs text-slate-400">750ml</p></div>
                <div><p className="text-xl font-bold text-slate-500">{weeklyRuns.length}</p><p className="text-xs text-slate-400">runs</p></div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-slate-400 mb-1">This week — Cleaned</p>
              <div className="flex gap-4">
                <div><p className="text-xl font-bold text-purple-700">{totalCleaned350}</p><p className="text-xs text-slate-400">350ml</p></div>
                <div><p className="text-xl font-bold text-purple-700">{totalCleaned750}</p><p className="text-xs text-slate-400">750ml</p></div>
                <div><p className="text-xl font-bold text-slate-500">{weeklyBatches.length}</p><p className="text-xs text-slate-400">batches</p></div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-slate-200">
          {[
            { id: 'production' as Tab, label: `Production Runs (${runs.length})` },
            { id: 'cleaning' as Tab, label: `Cleaning Batches (${batches.length})` },
          ].map(({ id, label }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === id ? 'border-cyan-600 text-cyan-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* PRODUCTION */}
        {tab === 'production' && (
          <div className="space-y-4">
            <div className="flex justify-end gap-2">
              {runs.length > 0 && (
                <Button variant="outline" onClick={() => {
                  const rows = runs.map(r => ({ Date: r.run_date, Shift: r.shift, Filled_350ml: r.filled_350ml, Filled_750ml: r.filled_750ml, Rejected_350ml: r.rejected_350ml, Rejected_750ml: r.rejected_750ml, Water_Liters: r.water_liters, Quality_Check: r.quality_check ? 'Yes' : 'No', Batch: r.batch_number ?? '', Operator: r.operator?.name ?? '', Status: r.status }))
                  const headers = Object.keys(rows[0])
                  const csv = [headers.join(','), ...rows.map(r => headers.map(h => JSON.stringify((r as any)[h] ?? '')).join(','))].join('\n')
                  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
                  a.download = 'production-runs.csv'; a.click()
                }}>
                  <Download className="w-4 h-4 mr-1.5" />Export CSV
                </Button>
              )}
              <Button onClick={() => setShowRunForm(true)}><Plus className="w-4 h-4 mr-1.5" />Log Production Run</Button>
            </div>

            {showRunForm && (
              <Card>
                <CardHeader><CardTitle className="text-sm">Log Production Run</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div><Label>Date</Label><Input type="date" value={runForm.run_date} onChange={e => setRunForm({ ...runForm, run_date: e.target.value })} /></div>
                    <div>
                      <Label>Shift</Label>
                      <select className="w-full border rounded-md px-3 py-2 text-sm" value={runForm.shift} onChange={e => setRunForm({ ...runForm, shift: e.target.value })}>
                        <option value="morning">Morning</option>
                        <option value="afternoon">Afternoon</option>
                        <option value="night">Night</option>
                      </select>
                    </div>
                    <div>
                      <Label>Operator</Label>
                      <select className="w-full border rounded-md px-3 py-2 text-sm" value={runForm.operator_id} onChange={e => setRunForm({ ...runForm, operator_id: e.target.value })}>
                        <option value="">Select...</option>
                        {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-3">
                    <div><Label>Filled 350ml</Label><Input type="number" min="0" value={runForm.filled_350ml} onChange={e => setRunForm({ ...runForm, filled_350ml: Number(e.target.value) })} /></div>
                    <div><Label>Filled 750ml</Label><Input type="number" min="0" value={runForm.filled_750ml} onChange={e => setRunForm({ ...runForm, filled_750ml: Number(e.target.value) })} /></div>
                    <div><Label>Rejected 350ml</Label><Input type="number" min="0" value={runForm.rejected_350ml} onChange={e => setRunForm({ ...runForm, rejected_350ml: Number(e.target.value) })} /></div>
                    <div><Label>Rejected 750ml</Label><Input type="number" min="0" value={runForm.rejected_750ml} onChange={e => setRunForm({ ...runForm, rejected_750ml: Number(e.target.value) })} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Water Used (liters)</Label><Input type="number" step="0.1" value={runForm.water_liters} onChange={e => setRunForm({ ...runForm, water_liters: Number(e.target.value) })} /></div>
                    <div><Label>Batch Number</Label><Input value={runForm.batch_number} onChange={e => setRunForm({ ...runForm, batch_number: e.target.value })} placeholder="e.g. B2024-001" /></div>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={runForm.quality_check} onChange={e => setRunForm({ ...runForm, quality_check: e.target.checked })} />
                      Quality check passed
                    </label>
                  </div>
                  <div><Label>Notes</Label><Textarea value={runForm.notes} onChange={e => setRunForm({ ...runForm, notes: e.target.value })} rows={2} /></div>
                  <div className="flex gap-2">
                    <Button className="bg-cyan-600 hover:bg-cyan-700 flex-1" onClick={handleSaveRun} disabled={saving}>
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4 mr-1" />Save & Update Inventory</>}
                    </Button>
                    <Button variant="outline" onClick={() => setShowRunForm(false)}><X className="w-4 h-4" /></Button>
                  </div>
                  <p className="text-xs text-slate-400">Saving will automatically move bottles from Clean & Empty → Filled in inventory.</p>
                </CardContent>
              </Card>
            )}

            {runs.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-sm"><Droplets className="w-8 h-8 mx-auto mb-2 text-slate-200" />No production runs logged yet</div>
            ) : (
              <div className="space-y-2">
                {runs.map(r => (
                  <Card key={r.id}>
                    <CardContent className="pt-3 pb-3">
                      <div className="flex items-center gap-4">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${r.status === 'completed' ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-700">{new Date(r.run_date).toLocaleDateString()}</span>
                            <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full capitalize">{r.shift} shift</span>
                            {r.quality_check && <span className="text-xs text-emerald-600 flex items-center gap-0.5"><CheckCircle2 className="w-3 h-3" />QC passed</span>}
                            {r.batch_number && <span className="text-xs text-slate-400">{r.batch_number}</span>}
                          </div>
                          <div className="flex gap-4 text-xs text-slate-400 mt-0.5">
                            <span>Filled: {r.filled_350ml}×350ml + {r.filled_750ml}×750ml</span>
                            {(r.rejected_350ml + r.rejected_750ml) > 0 && <span className="text-red-400">Rejected: {r.rejected_350ml + r.rejected_750ml}</span>}
                            {r.water_liters > 0 && <span>Water: {r.water_liters}L</span>}
                            {r.operator && <span>By: {r.operator.name}</span>}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-slate-800">{r.filled_350ml + r.filled_750ml}</p>
                          <p className="text-xs text-slate-400">bottles</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* CLEANING */}
        {tab === 'cleaning' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setShowBatchForm(true)}><Plus className="w-4 h-4 mr-1.5" />Log Cleaning Batch</Button>
            </div>

            {showBatchForm && (
              <Card>
                <CardHeader><CardTitle className="text-sm">Log Cleaning Batch</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Date</Label><Input type="date" value={batchForm.batch_date} onChange={e => setBatchForm({ ...batchForm, batch_date: e.target.value })} /></div>
                    <div>
                      <Label>Operator</Label>
                      <select className="w-full border rounded-md px-3 py-2 text-sm" value={batchForm.operator_id} onChange={e => setBatchForm({ ...batchForm, operator_id: e.target.value })}>
                        <option value="">Select...</option>
                        {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-3">
                    <div><Label>Cleaned 350ml</Label><Input type="number" min="0" value={batchForm.cleaned_350ml} onChange={e => setBatchForm({ ...batchForm, cleaned_350ml: Number(e.target.value) })} /></div>
                    <div><Label>Cleaned 750ml</Label><Input type="number" min="0" value={batchForm.cleaned_750ml} onChange={e => setBatchForm({ ...batchForm, cleaned_750ml: Number(e.target.value) })} /></div>
                    <div><Label>Rejected 350ml</Label><Input type="number" min="0" value={batchForm.rejected_350ml} onChange={e => setBatchForm({ ...batchForm, rejected_350ml: Number(e.target.value) })} /></div>
                    <div><Label>Rejected 750ml</Label><Input type="number" min="0" value={batchForm.rejected_750ml} onChange={e => setBatchForm({ ...batchForm, rejected_750ml: Number(e.target.value) })} /></div>
                  </div>
                  <div><Label>Cleaning Agent Used</Label><Input value={batchForm.cleaning_agent} onChange={e => setBatchForm({ ...batchForm, cleaning_agent: e.target.value })} placeholder="e.g. Ozone + hot water rinse" /></div>
                  <div><Label>Notes</Label><Textarea value={batchForm.notes} onChange={e => setBatchForm({ ...batchForm, notes: e.target.value })} rows={2} /></div>
                  <div className="flex gap-2">
                    <Button className="bg-purple-600 hover:bg-purple-700 flex-1" onClick={handleSaveBatch} disabled={saving}>
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4 mr-1" />Save & Update Inventory</>}
                    </Button>
                    <Button variant="outline" onClick={() => setShowBatchForm(false)}><X className="w-4 h-4" /></Button>
                  </div>
                  <p className="text-xs text-slate-400">Saving will automatically move bottles from Dirty → Clean & Empty in inventory.</p>
                </CardContent>
              </Card>
            )}

            {batches.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-sm"><Beaker className="w-8 h-8 mx-auto mb-2 text-slate-200" />No cleaning batches logged yet</div>
            ) : (
              <div className="space-y-2">
                {batches.map(b => (
                  <Card key={b.id}>
                    <CardContent className="pt-3 pb-3">
                      <div className="flex items-center gap-4">
                        <div className="w-2 h-2 rounded-full bg-purple-500 flex-shrink-0" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-700">{new Date(b.batch_date).toLocaleDateString()}</span>
                            {b.cleaning_agent && <span className="text-xs text-slate-400">{b.cleaning_agent}</span>}
                          </div>
                          <div className="flex gap-4 text-xs text-slate-400 mt-0.5">
                            <span>Cleaned: {b.cleaned_350ml}×350ml + {b.cleaned_750ml}×750ml</span>
                            {(b.rejected_350ml + b.rejected_750ml) > 0 && <span className="text-red-400">Rejected: {b.rejected_350ml + b.rejected_750ml}</span>}
                            {b.operator && <span>By: {b.operator.name}</span>}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-slate-800">{b.cleaned_350ml + b.cleaned_750ml}</p>
                          <p className="text-xs text-slate-400">cleaned</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
