'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  CheckCircle2, Circle, Truck, User, ClipboardCheck,
  ChevronDown, Loader2, AlertTriangle, CheckCheck, Clock
} from 'lucide-react'

const PRE_TRIP_ITEMS = [
  { key: 'tires', label: 'Tires — pressure & condition', category: 'exterior' },
  { key: 'lights', label: 'Lights — headlights, brake, indicators', category: 'exterior' },
  { key: 'mirrors', label: 'Mirrors — clean & adjusted', category: 'exterior' },
  { key: 'wipers', label: 'Wipers — functional', category: 'exterior' },
  { key: 'engine_oil', label: 'Engine oil level', category: 'under_hood' },
  { key: 'coolant', label: 'Coolant level', category: 'under_hood' },
  { key: 'brake_fluid', label: 'Brake fluid level', category: 'under_hood' },
  { key: 'fuel', label: 'Fuel level — sufficient for route', category: 'under_hood' },
  { key: 'brakes', label: 'Brakes — responsive', category: 'mechanical' },
  { key: 'horn', label: 'Horn — working', category: 'mechanical' },
  { key: 'seatbelt', label: 'Seatbelt — functional', category: 'safety' },
  { key: 'fire_extinguisher', label: 'Fire extinguisher — present', category: 'safety' },
  { key: 'first_aid', label: 'First aid kit — present', category: 'safety' },
  { key: 'load_secure', label: 'Load secured properly', category: 'cargo' },
  { key: 'delivery_docs', label: 'Delivery documents ready', category: 'cargo' },
]

const POST_TRIP_ITEMS = [
  { key: 'damage_check', label: 'Vehicle damage — none observed', category: 'condition' },
  { key: 'tires_post', label: 'Tires — no damage or flat', category: 'condition' },
  { key: 'lights_post', label: 'Lights — all functional', category: 'condition' },
  { key: 'fuel_post', label: 'Fuel level recorded', category: 'condition' },
  { key: 'empties_collected', label: 'Empty bottles collected & loaded', category: 'cargo' },
  { key: 'deliveries_complete', label: 'All deliveries completed / exceptions noted', category: 'cargo' },
  { key: 'cash_collected', label: 'Cash payments collected', category: 'finance' },
  { key: 'receipts_signed', label: 'Delivery receipts signed', category: 'finance' },
  { key: 'vehicle_clean', label: 'Vehicle cleaned & parked', category: 'handover' },
  { key: 'keys_returned', label: 'Keys returned to office', category: 'handover' },
]

const CATEGORIES: Record<string, string> = {
  exterior: 'Exterior',
  under_hood: 'Under Hood',
  mechanical: 'Mechanical',
  safety: 'Safety Equipment',
  cargo: 'Cargo & Documents',
  condition: 'Vehicle Condition',
  finance: 'Finance & Receipts',
  handover: 'End of Day',
}

type ChecklistItem = { checked: boolean; note?: string }
type ItemsMap = Record<string, ChecklistItem>

export default function DriverChecklistPage() {
  const [staff, setStaff] = useState<any[]>([])
  const [vehicles, setVehicles] = useState<any[]>([])
  const [todayChecklists, setTodayChecklists] = useState<any[]>([])
  const [selectedDriver, setSelectedDriver] = useState('')
  const [selectedVehicle, setSelectedVehicle] = useState('')
  const [type, setType] = useState<'pre_trip' | 'post_trip'>('pre_trip')
  const [items, setItems] = useState<ItemsMap>({})
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [existingId, setExistingId] = useState<string | null>(null)

  const templateItems = type === 'pre_trip' ? PRE_TRIP_ITEMS : POST_TRIP_ITEMS

  useEffect(() => { loadData() }, [])

  useEffect(() => {
    // Reset items when type changes
    const initial: ItemsMap = {}
    templateItems.forEach(i => { initial[i.key] = { checked: false } })
    setItems(initial)
    setExistingId(null)
    setSaved(false)
    checkExisting()
  }, [type, selectedDriver])

  const loadData = async () => {
    setLoading(true)
    const sb = createClient()
    const today = new Date().toISOString().split('T')[0]
    const [staffRes, vehRes, clRes] = await Promise.all([
      sb.from('staff').select('id, name, role').eq('active', true).order('name'),
      sb.from('vehicles').select('id, plate_number, make, model').eq('active', true),
      sb.from('driver_checklists').select('*, driver:staff(name), vehicle:vehicles(plate_number)').eq('checklist_date', today).order('created_at', { ascending: false }),
    ])
    setStaff(staffRes.data ?? [])
    setVehicles(vehRes.data ?? [])
    setTodayChecklists(clRes.data ?? [])
    if (staffRes.data?.[0]) setSelectedDriver(staffRes.data[0].id)
    if (vehRes.data?.[0]) setSelectedVehicle(vehRes.data[0].id)

    // Init items
    const initial: ItemsMap = {}
    PRE_TRIP_ITEMS.forEach(i => { initial[i.key] = { checked: false } })
    setItems(initial)
    setLoading(false)
  }

  const checkExisting = async () => {
    if (!selectedDriver) return
    const sb = createClient()
    const today = new Date().toISOString().split('T')[0]
    const { data } = await sb.from('driver_checklists')
      .select('*').eq('driver_id', selectedDriver).eq('type', type).eq('checklist_date', today).single()
    if (data) {
      setExistingId(data.id)
      setItems(data.items as ItemsMap)
      setNotes(data.notes ?? '')
      setSaved(data.completed)
    }
  }

  const toggle = (key: string) => {
    setItems(prev => ({ ...prev, [key]: { ...prev[key], checked: !prev[key]?.checked } }))
  }

  const allChecked = templateItems.every(i => items[i.key]?.checked)
  const checkedCount = templateItems.filter(i => items[i.key]?.checked).length

  const submit = async (complete: boolean) => {
    if (!selectedDriver) return
    setSaving(true)
    const sb = createClient()
    const today = new Date().toISOString().split('T')[0]
    const payload = {
      driver_id: selectedDriver,
      vehicle_id: selectedVehicle || null,
      checklist_date: today,
      type,
      items,
      notes: notes || null,
      completed: complete,
      completed_at: complete ? new Date().toISOString() : null,
    }

    if (existingId) {
      await sb.from('driver_checklists').update(payload).eq('id', existingId)
    } else {
      const { data } = await sb.from('driver_checklists').insert(payload).select().single()
      if (data) setExistingId(data.id)
    }

    if (complete) setSaved(true)
    // Refresh today's list
    const clRes = await sb.from('driver_checklists').select('*, driver:staff(name), vehicle:vehicles(plate_number)').eq('checklist_date', today).order('created_at', { ascending: false })
    setTodayChecklists(clRes.data ?? [])
    setSaving(false)
  }

  // Group template items by category
  const grouped: Record<string, typeof PRE_TRIP_ITEMS> = {}
  templateItems.forEach(item => {
    if (!grouped[item.category]) grouped[item.category] = []
    grouped[item.category].push(item)
  })

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700 px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-cyan-600 rounded-xl flex items-center justify-center">
            <ClipboardCheck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-base">Vehicle Checklist</h1>
            <p className="text-xs text-slate-400">{today}</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
      ) : (
        <div className="p-4 space-y-4 pb-24">

          {/* Today's Completed */}
          {todayChecklists.filter(c => c.completed).length > 0 && (
            <div className="bg-emerald-900/30 border border-emerald-700/50 rounded-2xl p-4">
              <p className="text-xs font-semibold text-emerald-400 mb-2 flex items-center gap-1">
                <CheckCheck className="w-3.5 h-3.5" /> Completed today
              </p>
              <div className="space-y-1">
                {todayChecklists.filter(c => c.completed).map(c => (
                  <div key={c.id} className="flex items-center gap-2 text-sm text-slate-300">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <span>{c.driver?.name}</span>
                    <span className="text-slate-500">·</span>
                    <span className="text-xs text-slate-400 capitalize">{c.type.replace('_', ' ')}</span>
                    {c.vehicle?.plate_number && <span className="text-xs text-slate-500">{c.vehicle.plate_number}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Driver & Vehicle */}
          <div className="bg-slate-800 rounded-2xl p-4 space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1.5">Driver</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <select className="w-full bg-slate-700 border border-slate-600 rounded-xl pl-9 pr-4 py-2.5 text-sm appearance-none"
                  value={selectedDriver} onChange={e => setSelectedDriver(e.target.value)}>
                  {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1.5">Vehicle</label>
              <div className="relative">
                <Truck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <select className="w-full bg-slate-700 border border-slate-600 rounded-xl pl-9 pr-4 py-2.5 text-sm appearance-none"
                  value={selectedVehicle} onChange={e => setSelectedVehicle(e.target.value)}>
                  <option value="">No vehicle selected</option>
                  {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate_number} — {v.make} {v.model}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Type Toggle */}
          <div className="flex gap-2 bg-slate-800 p-1 rounded-2xl">
            <button onClick={() => setType('pre_trip')}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${type === 'pre_trip' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'}`}>
              Pre-Trip
            </button>
            <button onClick={() => setType('post_trip')}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${type === 'post_trip' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'}`}>
              Post-Trip
            </button>
          </div>

          {/* Progress */}
          <div className="bg-slate-800 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">{checkedCount} / {templateItems.length} items checked</span>
              {allChecked && <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />All clear</span>}
            </div>
            <div className="w-full bg-slate-700 rounded-full h-2">
              <div className="bg-cyan-500 h-2 rounded-full transition-all" style={{ width: `${(checkedCount / templateItems.length) * 100}%` }} />
            </div>
          </div>

          {/* Checklist Groups */}
          {Object.entries(grouped).map(([cat, catItems]) => (
            <div key={cat} className="bg-slate-800 rounded-2xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-700">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{CATEGORIES[cat] ?? cat}</p>
              </div>
              <div className="divide-y divide-slate-700/50">
                {catItems.map(item => {
                  const checked = items[item.key]?.checked ?? false
                  return (
                    <button key={item.key} onClick={() => toggle(item.key)}
                      className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors ${checked ? 'bg-emerald-900/20' : 'hover:bg-slate-700/50'}`}>
                      {checked
                        ? <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                        : <Circle className="w-5 h-5 text-slate-500 flex-shrink-0" />}
                      <span className={`text-sm ${checked ? 'text-slate-300 line-through' : 'text-white'}`}>{item.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          {/* Notes */}
          <div className="bg-slate-800 rounded-2xl p-4">
            <label className="text-xs font-medium text-slate-400 block mb-2">Notes / Issues</label>
            <textarea
              className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2.5 text-sm resize-none text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              rows={3} placeholder="Any issues, damage, or notes to report..."
              value={notes} onChange={e => setNotes(e.target.value)} />
          </div>

          {/* Actions */}
          <div className="space-y-2">
            {saved ? (
              <div className="flex items-center justify-center gap-2 bg-emerald-700 rounded-2xl py-4 text-white font-semibold">
                <CheckCircle2 className="w-5 h-5" /> Checklist Completed
              </div>
            ) : (
              <>
                <button onClick={() => submit(true)} disabled={saving || !allChecked}
                  className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white py-4 rounded-2xl font-semibold text-sm transition-colors">
                  {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><CheckCircle2 className="w-5 h-5" />Submit & Complete</>}
                </button>
                {!allChecked && (
                  <button onClick={() => submit(false)} disabled={saving}
                    className="w-full flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 text-slate-300 py-3 rounded-2xl text-sm transition-colors">
                    <Clock className="w-4 h-4" /> Save Progress
                  </button>
                )}
                {!allChecked && (
                  <p className="text-center text-xs text-slate-500 flex items-center justify-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-amber-400" />
                    {templateItems.length - checkedCount} item{templateItems.length - checkedCount !== 1 ? 's' : ''} remaining to complete
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
