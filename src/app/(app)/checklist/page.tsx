'use client'

import { useState, useEffect } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { createClient } from '@/lib/supabase/client'
import { ClipboardCheck, CheckCircle2, Circle, Loader2, Plus, ChevronDown, ChevronUp } from 'lucide-react'

const DEFAULT_ITEMS = {
  pre_trip: [
    'Check tyre pressure and condition',
    'Check engine oil level',
    'Check fuel level',
    'Check brake fluid',
    'Check windscreen / wipers',
    'Check all lights (front, rear, indicators)',
    'Check mirrors are adjusted',
    'Load secured correctly',
    'Vehicle exterior clean and undamaged',
    'Driver has valid license & ID',
  ],
  post_trip: [
    'Vehicle returned to depot',
    'All deliveries completed or noted',
    'Empty bottles collected and counted',
    'Any damage reported',
    'Fuel level recorded',
    'Vehicle locked and secured',
    'Delivery documents submitted',
  ],
}

interface Checklist {
  id: string
  driver_id: string | null
  vehicle_id: string | null
  checklist_date: string
  type: string
  items: Record<string, boolean>
  notes: string | null
  completed: boolean
  driver?: { name: string }
  vehicle?: { name: string; plate_number: string }
}

export default function ChecklistPage() {
  const [checklists, setChecklists] = useState<Checklist[]>([])
  const [staff, setStaff] = useState<any[]>([])
  const [vehicles, setVehicles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [creating, setCreating] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  const [form, setForm] = useState({
    driver_id: '',
    vehicle_id: '',
    type: 'pre_trip',
    notes: '',
  })
  const [checkItems, setCheckItems] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const sb = createClient()
    const type = form.type as 'pre_trip' | 'post_trip'
    const items: Record<string, boolean> = {}
    DEFAULT_ITEMS[type].forEach(i => { items[i] = false })
    setCheckItems(items)
  }, [form.type])

  const load = async () => {
    setLoading(true)
    const sb = createClient()
    const [cl, st, v] = await Promise.all([
      sb.from('driver_checklists')
        .select('*, driver:staff(name), vehicle:vehicles(name, plate_number)')
        .eq('checklist_date', selectedDate)
        .order('created_at', { ascending: false }),
      sb.from('staff').select('id, name').eq('role', 'driver').eq('active', true),
      sb.from('vehicles').select('id, name, plate_number').eq('status', 'active'),
    ])
    setChecklists((cl.data ?? []) as Checklist[])
    setStaff(st.data ?? [])
    setVehicles(v.data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [selectedDate])

  const handleCreate = async () => {
    setCreating(true)
    const sb = createClient()
    await sb.from('driver_checklists').insert({
      driver_id: form.driver_id || null,
      vehicle_id: form.vehicle_id || null,
      checklist_date: selectedDate,
      type: form.type,
      items: checkItems,
      notes: form.notes || null,
      completed: Object.values(checkItems).every(Boolean),
    })
    setCreating(false)
    setForm({ driver_id: '', vehicle_id: '', type: 'pre_trip', notes: '' })
    await load()
  }

  const toggleItem = async (clId: string, item: string, current: Record<string, boolean>) => {
    const sb = createClient()
    const updated = { ...current, [item]: !current[item] }
    await sb.from('driver_checklists').update({
      items: updated,
      completed: Object.values(updated).every(Boolean),
    }).eq('id', clId)
    setChecklists(prev => prev.map(c => c.id === clId
      ? { ...c, items: updated, completed: Object.values(updated).every(Boolean) }
      : c
    ))
  }

  const completionPct = (items: Record<string, boolean>) => {
    const vals = Object.values(items)
    return vals.length ? Math.round((vals.filter(Boolean).length / vals.length) * 100) : 0
  }

  return (
    <>
      <Topbar title="Driver Checklists" />
      <div className="p-6 space-y-6">

        <div className="flex items-center justify-between flex-wrap gap-3">
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm"
          />
          <span className="text-sm text-slate-500">{checklists.length} checklist{checklists.length !== 1 ? 's' : ''} on this date</span>
        </div>

        {/* Create checklist */}
        <div className="bg-white rounded-xl border p-5">
          <h2 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Plus className="w-4 h-4 text-cyan-600" /> New Checklist
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Driver</label>
              <select value={form.driver_id} onChange={e => setForm({ ...form, driver_id: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="">Select driver</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Vehicle</label>
              <select value={form.vehicle_id} onChange={e => setForm({ ...form, vehicle_id: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="">Select vehicle</option>
                {vehicles.map(v => <option key={v.id} value={v.id}>{v.name} — {v.plate_number}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Type</label>
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="pre_trip">Pre-Trip</option>
                <option value="post_trip">Post-Trip</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Notes</label>
              <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="Optional notes…"
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
            {Object.entries(checkItems).map(([item, checked]) => (
              <label key={item} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={checked}
                  onChange={() => setCheckItems({ ...checkItems, [item]: !checked })}
                  className="accent-cyan-600" />
                {item}
              </label>
            ))}
          </div>
          <button
            onClick={handleCreate}
            disabled={creating || !form.driver_id}
            className="inline-flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardCheck className="w-4 h-4" />}
            Save Checklist
          </button>
        </div>

        {/* Checklists list */}
        {loading ? (
          <div className="text-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-300 mx-auto" /></div>
        ) : checklists.length === 0 ? (
          <div className="bg-white rounded-xl border p-10 text-center">
            <ClipboardCheck className="w-8 h-8 text-slate-200 mx-auto mb-2" />
            <p className="text-sm text-slate-400">No checklists for this date</p>
          </div>
        ) : (
          <div className="space-y-3">
            {checklists.map(cl => {
              const pct = completionPct(cl.items ?? {})
              const isOpen = expanded === cl.id
              return (
                <div key={cl.id} className="bg-white rounded-xl border overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
                    onClick={() => setExpanded(isOpen ? null : cl.id)}
                  >
                    <div className="flex items-center gap-3">
                      {cl.completed
                        ? <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                        : <Circle className="w-5 h-5 text-slate-300 flex-shrink-0" />
                      }
                      <div className="text-left">
                        <p className="font-medium text-slate-800 text-sm">
                          {cl.driver?.name ?? 'Unknown driver'} — {cl.vehicle?.name ?? 'No vehicle'} ({cl.vehicle?.plate_number})
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {cl.type === 'pre_trip' ? 'Pre-Trip' : 'Post-Trip'} · {pct}% complete
                          {cl.notes && ` · ${cl.notes}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-20 bg-slate-100 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : 'bg-amber-400'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                    </div>
                  </button>
                  {isOpen && (
                    <div className="border-t px-4 pb-4 pt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {Object.entries(cl.items ?? {}).map(([item, checked]) => (
                        <label key={item} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input type="checkbox" checked={checked as boolean}
                            onChange={() => toggleItem(cl.id, item, cl.items ?? {})}
                            className="accent-cyan-600" />
                          <span className={checked ? 'line-through text-slate-400' : 'text-slate-700'}>{item}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
