'use client'

import { useState, useEffect } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { useLanguage } from '@/components/providers/language-provider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { getVehicles, createVehicle, updateVehicle, getVehicleMaintenance, createVehicleMaintenance, getFuelLogs, createFuelLog, getStaff } from '@/lib/db'
import { createClient } from '@/lib/supabase/client'
import { idr } from '@/lib/format'
import type { Vehicle, VehicleMaintenance, FuelLog, Staff } from '@/types'
import {
  Truck, Plus, Edit2, Check, X, AlertTriangle, Fuel, Wrench,
  Calendar, Gauge, Loader2, Shield, CheckCircle2, User, DollarSign,
  ClipboardCheck, Circle, ChevronDown, ChevronUp
} from 'lucide-react'

type Tab = 'vehicles' | 'maintenance' | 'fuel' | 'safety' | 'checklists'

const VEHICLE_STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700', maintenance: 'bg-amber-100 text-amber-700',
  retired: 'bg-slate-100 text-slate-500', sold: 'bg-red-100 text-red-600',
}
const SEVERITY_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  minor: { color: 'text-amber-600', bg: 'bg-amber-100', label: 'Minor' },
  moderate: { color: 'text-orange-600', bg: 'bg-orange-100', label: 'Moderate' },
  major: { color: 'text-red-600', bg: 'bg-red-100', label: 'Major' },
  critical: { color: 'text-red-700', bg: 'bg-red-200', label: 'Critical' },
}
const INCIDENT_TYPES = ['accident', 'near_miss', 'traffic_violation', 'injury', 'property_damage', 'other']
const DEFAULT_ITEMS = {
  pre_trip: ['Check tyre pressure and condition', 'Check engine oil level', 'Check fuel level', 'Check brake fluid', 'Check windscreen / wipers', 'Check all lights (front, rear, indicators)', 'Check mirrors are adjusted', 'Load secured correctly', 'Vehicle exterior clean and undamaged', 'Driver has valid license & ID'],
  post_trip: ['Vehicle returned to depot', 'All deliveries completed or noted', 'Empty bottles collected and counted', 'Any damage reported', 'Fuel level recorded', 'Vehicle locked and secured', 'Delivery documents submitted'],
}
const EMPTY_VEHICLE: Partial<Vehicle> = { name: '', plate_number: '', type: 'truck', status: 'active', capacity_350ml: 0, capacity_750ml: 0, current_odometer: 0 }

export default function FleetPage() {
  const { t } = useLanguage()
  const [tab, setTab] = useState<Tab>('vehicles')
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [maintenance, setMaintenance] = useState<VehicleMaintenance[]>([])
  const [fuelLogs, setFuelLogs] = useState<FuelLog[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  // Vehicle form
  const [showVehicleForm, setShowVehicleForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<Partial<Vehicle>>(EMPTY_VEHICLE)
  // Maintenance form
  const [showMaintForm, setShowMaintForm] = useState(false)
  const [maintForm, setMaintForm] = useState<Partial<VehicleMaintenance>>({ service_date: new Date().toISOString().split('T')[0], type: 'service', cost: 0 })
  // Fuel form
  const [showFuelForm, setShowFuelForm] = useState(false)
  const [fuelForm, setFuelForm] = useState<Partial<FuelLog>>({ log_date: new Date().toISOString().split('T')[0], full_tank: true })
  const [saving, setSaving] = useState(false)
  // Safety state
  const [incidents, setIncidents] = useState<any[]>([])
  const [showIncidentForm, setShowIncidentForm] = useState(false)
  const [savingIncident, setSavingIncident] = useState(false)
  const [filterSeverity, setFilterSeverity] = useState('all')
  const [filterResolved, setFilterResolved] = useState('open')
  const [incidentForm, setIncidentForm] = useState({ driver_id: '', vehicle_id: '', incident_date: new Date().toISOString().split('T')[0], type: 'accident', severity: 'minor', description: '', at_fault: false, reported_to_insurance: false, cost: 0 })
  // Checklist state
  const [checklists, setChecklists] = useState<any[]>([])
  const [checklistDate, setChecklistDate] = useState(new Date().toISOString().split('T')[0])
  const [checklistLoading, setChecklistLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [checklistForm, setChecklistForm] = useState({ driver_id: '', vehicle_id: '', type: 'pre_trip', notes: '' })
  const [checkItems, setCheckItems] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [v, m, f, s] = await Promise.all([getVehicles(), getVehicleMaintenance(), getFuelLogs(), getStaff()])
      setVehicles(v); setMaintenance(m); setFuelLogs(f); setStaff(s.filter(x => x.role === 'driver'))
      setLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    if (tab === 'safety') loadIncidents()
    if (tab === 'checklists') loadChecklists()
  }, [tab])

  useEffect(() => { if (tab === 'checklists') loadChecklists() }, [checklistDate])

  useEffect(() => {
    const type = checklistForm.type as 'pre_trip' | 'post_trip'
    const items: Record<string, boolean> = {}
    DEFAULT_ITEMS[type].forEach(i => { items[i] = false })
    setCheckItems(items)
  }, [checklistForm.type])

  const loadIncidents = async () => {
    const sb = createClient()
    const { data } = await sb.from('safety_incidents').select('*, driver:staff(name), vehicle:vehicles(name, plate_number)').order('incident_date', { ascending: false })
    setIncidents(data ?? [])
  }

  const loadChecklists = async () => {
    setChecklistLoading(true)
    const sb = createClient()
    const [cl, v] = await Promise.all([
      sb.from('driver_checklists').select('*, driver:staff(name), vehicle:vehicles(name, plate_number)').eq('checklist_date', checklistDate).order('created_at', { ascending: false }),
      sb.from('vehicles').select('id, name, plate_number').eq('status', 'active'),
    ])
    setChecklists((cl.data ?? []) as any[])
    setChecklistLoading(false)
  }

  const handleSaveVehicle = async () => {
    if (!form.name || !form.plate_number) return
    setSaving(true)
    try {
      if (editingId) { const u = await updateVehicle(editingId, form); setVehicles(vehicles.map(v => v.id === editingId ? u : v)) }
      else { const c = await createVehicle(form); setVehicles([...vehicles, c]) }
      setShowVehicleForm(false); setEditingId(null); setForm(EMPTY_VEHICLE)
    } finally { setSaving(false) }
  }

  const handleSaveMaint = async () => {
    if (!maintForm.vehicle_id || !maintForm.description) return
    setSaving(true)
    try { const c = await createVehicleMaintenance(maintForm); setMaintenance([c, ...maintenance]); setShowMaintForm(false); setMaintForm({ service_date: new Date().toISOString().split('T')[0], type: 'service', cost: 0 }) } finally { setSaving(false) }
  }

  const handleSaveFuel = async () => {
    if (!fuelForm.vehicle_id || !fuelForm.liters) return
    setSaving(true)
    try { const c = await createFuelLog({ ...fuelForm, total_cost: (fuelForm.liters ?? 0) * (fuelForm.price_per_liter ?? 0) }); setFuelLogs([c, ...fuelLogs]); setShowFuelForm(false); setFuelForm({ log_date: new Date().toISOString().split('T')[0], full_tank: true }) } finally { setSaving(false) }
  }

  const saveIncident = async () => {
    if (!incidentForm.description) return
    setSavingIncident(true)
    const sb = createClient()
    const { data } = await sb.from('safety_incidents').insert({ ...incidentForm, driver_id: incidentForm.driver_id || null, vehicle_id: incidentForm.vehicle_id || null, incident_date: new Date(incidentForm.incident_date).toISOString(), cost: incidentForm.cost || 0 }).select('*, driver:staff(name), vehicle:vehicles(name, plate_number)').single()
    if (data) setIncidents([data, ...incidents])
    setShowIncidentForm(false)
    setIncidentForm({ driver_id: '', vehicle_id: '', incident_date: new Date().toISOString().split('T')[0], type: 'accident', severity: 'minor', description: '', at_fault: false, reported_to_insurance: false, cost: 0 })
    setSavingIncident(false)
  }

  const resolveIncident = async (id: string) => {
    const sb = createClient()
    await sb.from('safety_incidents').update({ resolved: true }).eq('id', id)
    setIncidents(incidents.map(i => i.id === id ? { ...i, resolved: true } : i))
  }

  const handleCreateChecklist = async () => {
    setCreating(true)
    const sb = createClient()
    await sb.from('driver_checklists').insert({ driver_id: checklistForm.driver_id || null, vehicle_id: checklistForm.vehicle_id || null, checklist_date: checklistDate, type: checklistForm.type, items: checkItems, notes: checklistForm.notes || null, completed: Object.values(checkItems).every(Boolean) })
    setCreating(false)
    setChecklistForm({ driver_id: '', vehicle_id: '', type: 'pre_trip', notes: '' })
    await loadChecklists()
  }

  const toggleCheckItem = async (clId: string, item: string, current: Record<string, boolean>) => {
    const sb = createClient()
    const updated = { ...current, [item]: !current[item] }
    await sb.from('driver_checklists').update({ items: updated, completed: Object.values(updated).every(Boolean) }).eq('id', clId)
    setChecklists(prev => prev.map(c => c.id === clId ? { ...c, items: updated, completed: Object.values(updated).every(Boolean) } : c))
  }

  const today = new Date(); const thirtyDays = new Date(); thirtyDays.setDate(thirtyDays.getDate() + 30)
  const activeVehicles = vehicles.filter(v => v.status === 'active')
  const totalFuelCost = fuelLogs.reduce((s, f) => s + Number(f.total_cost ?? 0), 0)
  const totalMaintCost = maintenance.reduce((s, m) => s + Number(m.cost ?? 0), 0)
  const expiring = vehicles.filter(v => (v.registration_expiry && new Date(v.registration_expiry) < thirtyDays) || (v.insurance_expiry && new Date(v.insurance_expiry) < thirtyDays))
  const openIncidents = incidents.filter(i => !i.resolved).length
  const criticalIncidents = incidents.filter(i => i.severity === 'critical' || i.severity === 'major').length
  const totalIncidentCost = incidents.reduce((s, i) => s + (i.cost ?? 0), 0)
  const filteredIncidents = incidents.filter(i => {
    if (filterSeverity !== 'all' && i.severity !== filterSeverity) return false
    if (filterResolved === 'open' && i.resolved) return false
    if (filterResolved === 'resolved' && !i.resolved) return false
    return true
  })
  const fmt = (n: number) => `Rp ${(n ?? 0).toLocaleString('id-ID')}`
  const completionPct = (items: Record<string, boolean>) => { const vals = Object.values(items); return vals.length ? Math.round((vals.filter(Boolean).length / vals.length) * 100) : 0 }

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'vehicles', label: `${t('fleet_vehicles')} (${vehicles.length})`, icon: Truck },
    { id: 'maintenance', label: `${t('fleet_maintenance')} (${maintenance.length})`, icon: Wrench },
    { id: 'fuel', label: `${t('fleet_fuel')} (${fuelLogs.length})`, icon: Fuel },
    { id: 'safety', label: t('fleet_safety'), icon: Shield },
    { id: 'checklists', label: t('fleet_checklists'), icon: ClipboardCheck },
  ]

  return (
    <>
      <Topbar title="fleet_title" titleIsKey />

      {/* Stats bar */}
      <div className="bg-white border-b border-slate-100 px-6 py-4">
        <div className="grid grid-cols-4 gap-4 max-w-5xl">
          {[
            { label: t('fleet_operational_count'), value: activeVehicles.length, icon: Truck, color: 'text-slate-800' },
            { label: t('fleet_in_maint_count'), value: vehicles.filter(v => v.status === 'maintenance').length, icon: Wrench, color: vehicles.filter(v => v.status === 'maintenance').length > 0 ? 'text-amber-600' : 'text-slate-600' },
            { label: t('fleet_safety'), value: openIncidents, icon: AlertTriangle, color: openIncidents > 0 ? 'text-red-600' : 'text-slate-600' },
            { label: t('fleet_total_fuel_cost'), value: idr(totalFuelCost), icon: Fuel, color: 'text-slate-800', small: true },
          ].map(({ label, value, icon: Icon, color, small }) => (
            <div key={label} className="flex items-center gap-3">
              <Icon className="w-5 h-5 text-slate-300 flex-shrink-0" />
              <div><p className="text-xs text-slate-400">{label}</p><p className={`font-bold ${small ? 'text-base' : 'text-xl'} ${color}`}>{value}</p></div>
            </div>
          ))}
        </div>
      </div>

      {expiring.length > 0 && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <p className="text-sm text-amber-800 font-medium">Document expiry alerts: {expiring.map(v => `${v.name} (${v.plate_number})`).join(', ')}</p>
        </div>
      )}

      {/* Tab bar */}
      <div className="bg-white border-b border-slate-200 px-6">
        <div className="flex gap-1">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap ${tab === id ? 'border-cyan-600 text-cyan-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
              <Icon className="w-4 h-4" />{label}
            </button>
          ))}
        </div>
      </div>

      {/* VEHICLES TAB */}
      {tab === 'vehicles' && (
        <div className="p-6 max-w-5xl space-y-4">
          <div className="flex justify-end"><Button onClick={() => { setForm(EMPTY_VEHICLE); setEditingId(null); setShowVehicleForm(true) }}><Plus className="w-4 h-4 mr-1.5" /> {t('fleet_add_vehicle')}</Button></div>
          {showVehicleForm && (
            <Card><CardHeader><CardTitle className="text-sm">{editingId ? 'Edit Vehicle' : 'Add Vehicle'}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Vehicle Name *</Label><Input value={form.name ?? ''} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Truck 1, Van Seminyak..." /></div>
                  <div><Label>Plate Number *</Label><Input value={form.plate_number ?? ''} onChange={e => setForm({ ...form, plate_number: e.target.value })} placeholder="DK 1234 AB" /></div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div><Label>Type</Label><select className="w-full border rounded-md px-3 py-2 text-sm" value={form.type} onChange={e => setForm({ ...form, type: e.target.value as any })}>{['truck','van','motorcycle','pickup'].map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                  <div><Label>Make</Label><Input value={form.make ?? ''} onChange={e => setForm({ ...form, make: e.target.value })} /></div>
                  <div><Label>Model</Label><Input value={form.model ?? ''} onChange={e => setForm({ ...form, model: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div><Label>Year</Label><Input type="number" value={form.year ?? ''} onChange={e => setForm({ ...form, year: Number(e.target.value) })} /></div>
                  <div><Label>Capacity 350ml</Label><Input type="number" value={form.capacity_350ml ?? 0} onChange={e => setForm({ ...form, capacity_350ml: Number(e.target.value) })} /></div>
                  <div><Label>Capacity 750ml</Label><Input type="number" value={form.capacity_750ml ?? 0} onChange={e => setForm({ ...form, capacity_750ml: Number(e.target.value) })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Registration Expiry</Label><Input type="date" value={form.registration_expiry ?? ''} onChange={e => setForm({ ...form, registration_expiry: e.target.value })} /></div>
                  <div><Label>Insurance Expiry</Label><Input type="date" value={form.insurance_expiry ?? ''} onChange={e => setForm({ ...form, insurance_expiry: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Status</Label><select className="w-full border rounded-md px-3 py-2 text-sm" value={form.status} onChange={e => setForm({ ...form, status: e.target.value as any })}>{['active','maintenance','retired','sold'].map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                  <div><Label>Current Odometer (km)</Label><Input type="number" value={form.current_odometer ?? 0} onChange={e => setForm({ ...form, current_odometer: Number(e.target.value) })} /></div>
                </div>
                <div className="flex gap-2">
                  <Button className="bg-cyan-600 hover:bg-cyan-700 flex-1" onClick={handleSaveVehicle} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4 mr-1" />{editingId ? 'Save Changes' : 'Add Vehicle'}</>}</Button>
                  <Button variant="outline" onClick={() => setShowVehicleForm(false)}><X className="w-4 h-4" /></Button>
                </div>
              </CardContent>
            </Card>
          )}
          {loading && <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>}
          {vehicles.length === 0 && !loading && <div className="text-center py-12 text-slate-400 text-sm"><Truck className="w-8 h-8 mx-auto mb-2 text-slate-200" />{t('fleet_no_vehicles')}</div>}
          <div className="grid grid-cols-1 gap-3">
            {vehicles.map(v => (
              <Card key={v.id}><CardContent className="pt-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0"><Truck className="w-6 h-6 text-slate-400" /></div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2"><span className="font-semibold text-slate-800">{v.name}</span><span className="text-sm text-slate-400 font-mono">{v.plate_number}</span><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${VEHICLE_STATUS_COLORS[v.status]}`}>{v.status}</span></div>
                    <div className="flex gap-4 mt-1 text-xs text-slate-400">
                      {v.make && <span>{v.make} {v.model} {v.year && `(${v.year})`}</span>}
                      {v.current_odometer > 0 && <span className="flex items-center gap-1"><Gauge className="w-3 h-3" />{v.current_odometer.toLocaleString()} km</span>}
                    </div>
                    <div className="flex gap-3 mt-1 text-xs">
                      {v.registration_expiry && <span className={new Date(v.registration_expiry) < today ? 'text-red-500' : new Date(v.registration_expiry) < thirtyDays ? 'text-amber-500' : 'text-slate-400'}>Reg: {new Date(v.registration_expiry).toLocaleDateString()}</span>}
                      {v.insurance_expiry && <span className={new Date(v.insurance_expiry) < today ? 'text-red-500' : new Date(v.insurance_expiry) < thirtyDays ? 'text-amber-500' : 'text-slate-400'}>Ins: {new Date(v.insurance_expiry).toLocaleDateString()}</span>}
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => { setForm(v); setEditingId(v.id); setShowVehicleForm(true) }}><Edit2 className="w-3.5 h-3.5" /></Button>
                </div>
              </CardContent></Card>
            ))}
          </div>
        </div>
      )}

      {/* MAINTENANCE TAB */}
      {tab === 'maintenance' && (
        <div className="p-6 max-w-5xl space-y-4">
          <div className="flex justify-end"><Button variant="outline" onClick={() => setShowMaintForm(true)}><Plus className="w-4 h-4 mr-1" /> Log Service</Button></div>
          {showMaintForm && (
            <Card><CardHeader><CardTitle className="text-sm">Log Maintenance Record</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Vehicle *</Label><select className="w-full border rounded-md px-3 py-2 text-sm" value={maintForm.vehicle_id ?? ''} onChange={e => setMaintForm({ ...maintForm, vehicle_id: e.target.value })}><option value="">Select vehicle...</option>{vehicles.map(v => <option key={v.id} value={v.id}>{v.name} ({v.plate_number})</option>)}</select></div>
                  <div><Label>Type</Label><select className="w-full border rounded-md px-3 py-2 text-sm" value={maintForm.type} onChange={e => setMaintForm({ ...maintForm, type: e.target.value })}>{['oil_change','tire','brake','engine','body','inspection','service','repair','other'].map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}</select></div>
                </div>
                <div><Label>Description *</Label><Textarea value={maintForm.description ?? ''} onChange={e => setMaintForm({ ...maintForm, description: e.target.value })} rows={2} /></div>
                <div className="grid grid-cols-3 gap-3">
                  <div><Label>Service Date *</Label><Input type="date" value={maintForm.service_date ?? ''} onChange={e => setMaintForm({ ...maintForm, service_date: e.target.value })} /></div>
                  <div><Label>Cost (IDR)</Label><Input type="number" value={maintForm.cost ?? 0} onChange={e => setMaintForm({ ...maintForm, cost: Number(e.target.value) })} /></div>
                  <div><Label>Vendor</Label><Input value={maintForm.vendor ?? ''} onChange={e => setMaintForm({ ...maintForm, vendor: e.target.value })} /></div>
                </div>
                <div className="flex gap-2">
                  <Button className="bg-cyan-600 hover:bg-cyan-700" onClick={handleSaveMaint} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Record'}</Button>
                  <Button variant="outline" onClick={() => setShowMaintForm(false)}>Cancel</Button>
                </div>
              </CardContent>
            </Card>
          )}
          {maintenance.length === 0 ? <div className="text-center py-12 text-slate-400 text-sm"><Wrench className="w-8 h-8 mx-auto mb-2 text-slate-200" />No maintenance records yet</div>
            : maintenance.map(m => { const vehicle = vehicles.find(v => v.id === m.vehicle_id); return (
              <Card key={m.id}><CardContent className="pt-3 pb-3"><div className="flex items-center gap-4"><div className="flex-1"><div className="flex items-center gap-2"><span className="font-medium text-slate-700">{vehicle?.name ?? 'Unknown'}</span><span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{m.type.replace('_', ' ')}</span></div><p className="text-xs text-slate-500 mt-0.5">{m.description}</p><div className="flex gap-3 text-xs text-slate-400 mt-0.5"><span>{new Date(m.service_date).toLocaleDateString()}</span>{m.vendor && <span>{m.vendor}</span>}</div></div><p className="font-bold text-slate-800">{idr(Number(m.cost))}</p></div></CardContent></Card>
            )})}
        </div>
      )}

      {/* FUEL TAB */}
      {tab === 'fuel' && (
        <div className="p-6 max-w-5xl space-y-4">
          <div className="flex justify-end"><Button variant="outline" onClick={() => setShowFuelForm(true)}><Plus className="w-4 h-4 mr-1" /> Log Fuel</Button></div>
          {showFuelForm && (
            <Card><CardHeader><CardTitle className="text-sm">Log Fuel Fill-Up</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Vehicle *</Label><select className="w-full border rounded-md px-3 py-2 text-sm" value={fuelForm.vehicle_id ?? ''} onChange={e => setFuelForm({ ...fuelForm, vehicle_id: e.target.value })}><option value="">Select vehicle...</option>{vehicles.map(v => <option key={v.id} value={v.id}>{v.name} ({v.plate_number})</option>)}</select></div>
                  <div><Label>Driver</Label><select className="w-full border rounded-md px-3 py-2 text-sm" value={fuelForm.driver_id ?? ''} onChange={e => setFuelForm({ ...fuelForm, driver_id: e.target.value || null })}><option value="">Select driver...</option>{staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div><Label>Date *</Label><Input type="date" value={fuelForm.log_date ?? ''} onChange={e => setFuelForm({ ...fuelForm, log_date: e.target.value })} /></div>
                  <div><Label>Liters *</Label><Input type="number" step="0.1" value={fuelForm.liters ?? ''} onChange={e => setFuelForm({ ...fuelForm, liters: Number(e.target.value) })} /></div>
                  <div><Label>Price/Liter (IDR)</Label><Input type="number" value={fuelForm.price_per_liter ?? ''} onChange={e => setFuelForm({ ...fuelForm, price_per_liter: Number(e.target.value) })} /></div>
                </div>
                <div className="flex gap-2">
                  <Button className="bg-cyan-600 hover:bg-cyan-700" onClick={handleSaveFuel} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Log'}</Button>
                  <Button variant="outline" onClick={() => setShowFuelForm(false)}>Cancel</Button>
                </div>
              </CardContent>
            </Card>
          )}
          {fuelLogs.length === 0 ? <div className="text-center py-12 text-slate-400 text-sm"><Fuel className="w-8 h-8 mx-auto mb-2 text-slate-200" />No fuel logs yet</div>
            : fuelLogs.map(f => { const vehicle = vehicles.find(v => v.id === f.vehicle_id); return (
              <Card key={f.id}><CardContent className="pt-3 pb-3"><div className="flex items-center gap-4"><Fuel className="w-4 h-4 text-slate-300 flex-shrink-0" /><div className="flex-1"><div className="flex items-center gap-2"><span className="font-medium text-slate-700">{vehicle?.name ?? 'Unknown'}</span><span className="text-xs text-slate-400">{new Date(f.log_date).toLocaleDateString()}</span>{f.station && <span className="text-xs text-slate-400">{f.station}</span>}</div><p className="text-xs text-slate-400">{f.liters}L @ {idr(f.price_per_liter ?? 0)}/L</p></div><p className="font-bold text-slate-800">{idr(Number(f.total_cost ?? 0))}</p></div></CardContent></Card>
            )})}
        </div>
      )}

      {/* SAFETY TAB */}
      {tab === 'safety' && (
        <div className="p-6 max-w-5xl space-y-6">
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm"><p className="text-xs text-slate-400">Total Incidents</p><p className="text-2xl font-bold text-slate-800 mt-1">{incidents.length}</p></div>
            <div className={`border rounded-xl p-4 shadow-sm ${openIncidents > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-100'}`}><p className={`text-xs ${openIncidents > 0 ? 'text-amber-500' : 'text-slate-400'}`}>Open / Unresolved</p><p className={`text-2xl font-bold mt-1 ${openIncidents > 0 ? 'text-amber-700' : 'text-slate-800'}`}>{openIncidents}</p></div>
            <div className={`border rounded-xl p-4 shadow-sm ${criticalIncidents > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-slate-100'}`}><p className={`text-xs ${criticalIncidents > 0 ? 'text-red-500' : 'text-slate-400'}`}>Major / Critical</p><p className={`text-2xl font-bold mt-1 ${criticalIncidents > 0 ? 'text-red-700' : 'text-slate-800'}`}>{criticalIncidents}</p></div>
            <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm"><p className="text-xs text-slate-400">Total Cost</p><p className="text-xl font-bold text-red-600 mt-1">{fmt(totalIncidentCost)}</p></div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
              {['open', 'resolved', 'all'].map(f => <button key={f} onClick={() => setFilterResolved(f)} className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${filterResolved === f ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{f}</button>)}
            </div>
            <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
              {['all', 'minor', 'moderate', 'major', 'critical'].map(s => <button key={s} onClick={() => setFilterSeverity(s)} className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${filterSeverity === s ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{s}</button>)}
            </div>
            <div className="flex-1" />
            <button onClick={() => setShowIncidentForm(true)} className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-xl text-sm font-medium"><Plus className="w-4 h-4" /> Report Incident</button>
          </div>
          {showIncidentForm && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
              <h3 className="font-semibold text-slate-800">Report Safety Incident</h3>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="text-xs font-medium text-slate-600 block mb-1">Date</label><input type="date" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={incidentForm.incident_date} onChange={e => setIncidentForm({ ...incidentForm, incident_date: e.target.value })} /></div>
                <div><label className="text-xs font-medium text-slate-600 block mb-1">Type</label><select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={incidentForm.type} onChange={e => setIncidentForm({ ...incidentForm, type: e.target.value })}>{INCIDENT_TYPES.map(t => <option key={t} value={t} className="capitalize">{t.replace('_', ' ')}</option>)}</select></div>
                <div><label className="text-xs font-medium text-slate-600 block mb-1">Severity</label><select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={incidentForm.severity} onChange={e => setIncidentForm({ ...incidentForm, severity: e.target.value })}>{['minor','moderate','major','critical'].map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                <div><label className="text-xs font-medium text-slate-600 block mb-1">Driver Involved</label><select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={incidentForm.driver_id} onChange={e => setIncidentForm({ ...incidentForm, driver_id: e.target.value })}><option value="">None / Unknown</option>{staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
                <div><label className="text-xs font-medium text-slate-600 block mb-1">Vehicle Involved</label><select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={incidentForm.vehicle_id} onChange={e => setIncidentForm({ ...incidentForm, vehicle_id: e.target.value })}><option value="">None / Unknown</option>{vehicles.map(v => <option key={v.id} value={v.id}>{v.name} ({v.plate_number})</option>)}</select></div>
                <div><label className="text-xs font-medium text-slate-600 block mb-1">Estimated Cost (Rp)</label><input type="number" min="0" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={incidentForm.cost} onChange={e => setIncidentForm({ ...incidentForm, cost: Number(e.target.value) })} /></div>
              </div>
              <div><label className="text-xs font-medium text-slate-600 block mb-1">Description *</label><textarea className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none" rows={3} value={incidentForm.description} onChange={e => setIncidentForm({ ...incidentForm, description: e.target.value })} /></div>
              <div className="flex gap-5">
                <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={incidentForm.at_fault} onChange={e => setIncidentForm({ ...incidentForm, at_fault: e.target.checked })} />Driver at fault</label>
                <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={incidentForm.reported_to_insurance} onChange={e => setIncidentForm({ ...incidentForm, reported_to_insurance: e.target.checked })} />Reported to insurance</label>
              </div>
              <div className="flex gap-2">
                <button onClick={saveIncident} disabled={savingIncident || !incidentForm.description} className="flex-1 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-2">{savingIncident ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" />Submit Report</>}</button>
                <button onClick={() => setShowIncidentForm(false)} className="border border-slate-200 px-4 py-2 rounded-xl text-sm hover:bg-slate-50"><X className="w-4 h-4" /></button>
              </div>
            </div>
          )}
          {filteredIncidents.length === 0 ? (
            <div className="text-center py-16 text-slate-400"><Shield className="w-10 h-10 mx-auto mb-3 text-slate-200" /><p className="font-medium">No incidents found</p><p className="text-sm mt-1">Keep it that way — drive safely!</p></div>
          ) : filteredIncidents.map(inc => {
            const sev = SEVERITY_CONFIG[inc.severity] ?? SEVERITY_CONFIG.minor
            return (
              <div key={inc.id} className={`bg-white border rounded-2xl p-4 shadow-sm ${inc.severity === 'critical' ? 'border-red-200' : inc.severity === 'major' ? 'border-orange-200' : 'border-slate-100'}`}>
                <div className="flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${sev.bg}`}><AlertTriangle className={`w-5 h-5 ${sev.color}`} /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${sev.bg} ${sev.color}`}>{sev.label}</span>
                      <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full capitalize">{inc.type?.replace('_', ' ')}</span>
                      {inc.resolved && <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Resolved</span>}
                    </div>
                    <p className="text-sm text-slate-700 mt-1.5">{inc.description}</p>
                    <div className="flex items-center gap-4 mt-1.5 text-xs text-slate-400">
                      <span>{new Date(inc.incident_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      {inc.driver?.name && <span className="flex items-center gap-1"><User className="w-3 h-3" />{inc.driver.name}{inc.at_fault ? ' (at fault)' : ''}</span>}
                      {inc.vehicle?.name && <span className="flex items-center gap-1"><Truck className="w-3 h-3" />{inc.vehicle.name}</span>}
                      {inc.cost > 0 && <span className="flex items-center gap-1 text-red-500"><DollarSign className="w-3 h-3" />{fmt(inc.cost)}</span>}
                    </div>
                  </div>
                  {!inc.resolved && <button onClick={() => resolveIncident(inc.id)} className="flex items-center gap-1.5 text-xs border border-emerald-200 text-emerald-600 hover:bg-emerald-50 px-3 py-1.5 rounded-lg flex-shrink-0"><CheckCircle2 className="w-3.5 h-3.5" /> Resolve</button>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* CHECKLISTS TAB */}
      {tab === 'checklists' && (
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <input type="date" value={checklistDate} onChange={e => setChecklistDate(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" />
            <span className="text-sm text-slate-500">{checklists.length} checklist{checklists.length !== 1 ? 's' : ''} on this date</span>
          </div>
          <div className="bg-white rounded-xl border p-5">
            <h2 className="font-semibold text-slate-800 mb-4 flex items-center gap-2"><Plus className="w-4 h-4 text-cyan-600" /> New Checklist</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              <div><label className="block text-xs font-medium text-slate-500 mb-1">Driver</label><select value={checklistForm.driver_id} onChange={e => setChecklistForm({ ...checklistForm, driver_id: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm"><option value="">Select driver</option>{staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
              <div><label className="block text-xs font-medium text-slate-500 mb-1">Vehicle</label><select value={checklistForm.vehicle_id} onChange={e => setChecklistForm({ ...checklistForm, vehicle_id: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm"><option value="">Select vehicle</option>{vehicles.map(v => <option key={v.id} value={v.id}>{v.name} — {v.plate_number}</option>)}</select></div>
              <div><label className="block text-xs font-medium text-slate-500 mb-1">Type</label><select value={checklistForm.type} onChange={e => setChecklistForm({ ...checklistForm, type: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm"><option value="pre_trip">Pre-Trip</option><option value="post_trip">Post-Trip</option></select></div>
              <div><label className="block text-xs font-medium text-slate-500 mb-1">Notes</label><input value={checklistForm.notes} onChange={e => setChecklistForm({ ...checklistForm, notes: e.target.value })} placeholder="Optional notes…" className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
              {Object.entries(checkItems).map(([item, checked]) => (
                <label key={item} className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={checked} onChange={() => setCheckItems({ ...checkItems, [item]: !checked })} className="accent-cyan-600" />{item}</label>
              ))}
            </div>
            <button onClick={handleCreateChecklist} disabled={creating || !checklistForm.driver_id} className="inline-flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardCheck className="w-4 h-4" />} Save Checklist
            </button>
          </div>
          {checklistLoading ? <div className="text-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-300 mx-auto" /></div>
            : checklists.length === 0 ? <div className="bg-white rounded-xl border p-10 text-center"><ClipboardCheck className="w-8 h-8 text-slate-200 mx-auto mb-2" /><p className="text-sm text-slate-400">No checklists for this date</p></div>
            : (
              <div className="space-y-3">
                {checklists.map(cl => {
                  const pct = completionPct(cl.items ?? {})
                  const isOpen = expanded === cl.id
                  return (
                    <div key={cl.id} className="bg-white rounded-xl border overflow-hidden">
                      <button className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors" onClick={() => setExpanded(isOpen ? null : cl.id)}>
                        <div className="flex items-center gap-3">
                          {cl.completed ? <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" /> : <Circle className="w-5 h-5 text-slate-300 flex-shrink-0" />}
                          <div className="text-left">
                            <p className="font-medium text-slate-800 text-sm">{cl.driver?.name ?? 'Unknown driver'} — {cl.vehicle?.name ?? 'No vehicle'}</p>
                            <p className="text-xs text-slate-400 mt-0.5">{cl.type === 'pre_trip' ? 'Pre-Trip' : 'Post-Trip'} · {pct}% complete{cl.notes && ` · ${cl.notes}`}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="w-20 bg-slate-100 rounded-full h-1.5"><div className={`h-1.5 rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : 'bg-amber-400'}`} style={{ width: `${pct}%` }} /></div>
                          {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                        </div>
                      </button>
                      {isOpen && (
                        <div className="border-t px-4 pb-4 pt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {Object.entries(cl.items ?? {}).map(([item, checked]) => (
                            <label key={item} className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={checked as boolean} onChange={() => toggleCheckItem(cl.id, item, cl.items ?? {})} className="accent-cyan-600" /><span className={checked ? 'line-through text-slate-400' : 'text-slate-700'}>{item}</span></label>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
        </div>
      )}
    </>
  )
}
