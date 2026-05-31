'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Topbar } from '@/components/layout/topbar'
import {
  AlertTriangle, Plus, Loader2, Check, X, Shield, TrendingDown,
  Truck, User, DollarSign, CheckCircle2
} from 'lucide-react'

const SEVERITY_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  minor: { color: 'text-amber-600', bg: 'bg-amber-100', label: 'Minor' },
  moderate: { color: 'text-orange-600', bg: 'bg-orange-100', label: 'Moderate' },
  major: { color: 'text-red-600', bg: 'bg-red-100', label: 'Major' },
  critical: { color: 'text-red-700', bg: 'bg-red-200', label: 'Critical' },
}

const INCIDENT_TYPES = ['accident', 'near_miss', 'traffic_violation', 'injury', 'property_damage', 'other']

const fmt = (n: number) => `Rp ${(n ?? 0).toLocaleString('id-ID')}`

export default function SafetyPage() {
  const [incidents, setIncidents] = useState<any[]>([])
  const [staff, setStaff] = useState<any[]>([])
  const [vehicles, setVehicles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [filterSeverity, setFilterSeverity] = useState('all')
  const [filterResolved, setFilterResolved] = useState('open')

  const [form, setForm] = useState({
    driver_id: '',
    vehicle_id: '',
    incident_date: new Date().toISOString().split('T')[0],
    type: 'accident',
    severity: 'minor',
    description: '',
    at_fault: false,
    reported_to_insurance: false,
    cost: 0,
  })

  useEffect(() => { loadAll() }, [])

  const loadAll = async () => {
    setLoading(true)
    const sb = createClient()
    const [incRes, staffRes, vehRes] = await Promise.all([
      sb.from('safety_incidents')
        .select('*, driver:staff(name), vehicle:vehicles(name, plate_number)')
        .order('incident_date', { ascending: false }),
      sb.from('staff').select('id, name, role').eq('active', true),
      sb.from('vehicles').select('id, name, plate_number'),
    ])
    setIncidents(incRes.data ?? [])
    setStaff(staffRes.data ?? [])
    setVehicles(vehRes.data ?? [])
    setLoading(false)
  }

  const saveIncident = async () => {
    if (!form.description) return
    setSaving(true)
    const sb = createClient()
    const { data } = await sb.from('safety_incidents').insert({
      ...form,
      driver_id: form.driver_id || null,
      vehicle_id: form.vehicle_id || null,
      incident_date: new Date(form.incident_date).toISOString(),
      cost: form.cost || 0,
    }).select('*, driver:staff(name), vehicle:vehicles(name, plate_number)').single()
    if (data) setIncidents([data, ...incidents])
    setShowForm(false)
    setForm({ driver_id: '', vehicle_id: '', incident_date: new Date().toISOString().split('T')[0], type: 'accident', severity: 'minor', description: '', at_fault: false, reported_to_insurance: false, cost: 0 })
    setSaving(false)
  }

  const resolveIncident = async (id: string) => {
    const sb = createClient()
    await sb.from('safety_incidents').update({ resolved: true }).eq('id', id)
    setIncidents(incidents.map(i => i.id === id ? { ...i, resolved: true } : i))
  }

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  const filtered = incidents.filter(i => {
    if (filterSeverity !== 'all' && i.severity !== filterSeverity) return false
    if (filterResolved === 'open' && i.resolved) return false
    if (filterResolved === 'resolved' && !i.resolved) return false
    return true
  })

  const totalCost = incidents.reduce((s, i) => s + (i.cost ?? 0), 0)
  const openCount = incidents.filter(i => !i.resolved).length
  const criticalCount = incidents.filter(i => i.severity === 'critical' || i.severity === 'major').length

  return (
    <>
      <Topbar title="Safety & Incidents" />
      <div className="p-6 max-w-5xl space-y-6">

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-slate-400">Total Incidents</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{incidents.length}</p>
          </div>
          <div className={`border rounded-xl p-4 shadow-sm ${openCount > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-100'}`}>
            <p className={`text-xs ${openCount > 0 ? 'text-amber-500' : 'text-slate-400'}`}>Open / Unresolved</p>
            <p className={`text-2xl font-bold mt-1 ${openCount > 0 ? 'text-amber-700' : 'text-slate-800'}`}>{openCount}</p>
          </div>
          <div className={`border rounded-xl p-4 shadow-sm ${criticalCount > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-slate-100'}`}>
            <p className={`text-xs ${criticalCount > 0 ? 'text-red-500' : 'text-slate-400'}`}>Major / Critical</p>
            <p className={`text-2xl font-bold mt-1 ${criticalCount > 0 ? 'text-red-700' : 'text-slate-800'}`}>{criticalCount}</p>
          </div>
          <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-slate-400">Total Cost</p>
            <p className="text-xl font-bold text-red-600 mt-1">{fmt(totalCost)}</p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3">
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
            {['open', 'resolved', 'all'].map(f => (
              <button key={f} onClick={() => setFilterResolved(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${filterResolved === f ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {f}
              </button>
            ))}
          </div>
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
            {['all', 'minor', 'moderate', 'major', 'critical'].map(s => (
              <button key={s} onClick={() => setFilterSeverity(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${filterSeverity === s ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {s}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" /> Report Incident
          </button>
        </div>

        {/* Form */}
        {showForm && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
            <h3 className="font-semibold text-slate-800">Report Safety Incident</h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Date</label>
                <input type="date" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={form.incident_date} onChange={e => setForm({ ...form, incident_date: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Type</label>
                <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                  {INCIDENT_TYPES.map(t => <option key={t} value={t} className="capitalize">{t.replace('_', ' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Severity</label>
                <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={form.severity} onChange={e => setForm({ ...form, severity: e.target.value })}>
                  {['minor', 'moderate', 'major', 'critical'].map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Driver Involved</label>
                <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={form.driver_id} onChange={e => setForm({ ...form, driver_id: e.target.value })}>
                  <option value="">None / Unknown</option>
                  {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Vehicle Involved</label>
                <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={form.vehicle_id} onChange={e => setForm({ ...form, vehicle_id: e.target.value })}>
                  <option value="">None / Unknown</option>
                  {vehicles.map(v => <option key={v.id} value={v.id}>{v.name} ({v.plate_number})</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Estimated Cost (Rp)</label>
                <input type="number" min="0" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={form.cost} onChange={e => setForm({ ...form, cost: Number(e.target.value) })} />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Description *</label>
              <textarea className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none" rows={3}
                placeholder="Describe what happened, where, and any immediate actions taken..."
                value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="flex gap-5">
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input type="checkbox" checked={form.at_fault} onChange={e => setForm({ ...form, at_fault: e.target.checked })} />
                Driver at fault
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input type="checkbox" checked={form.reported_to_insurance} onChange={e => setForm({ ...form, reported_to_insurance: e.target.checked })} />
                Reported to insurance
              </label>
            </div>
            <div className="flex gap-2">
              <button onClick={saveIncident} disabled={saving || !form.description}
                className="flex-1 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" />Submit Report</>}
              </button>
              <button onClick={() => setShowForm(false)} className="border border-slate-200 px-4 py-2 rounded-xl text-sm hover:bg-slate-50"><X className="w-4 h-4" /></button>
            </div>
          </div>
        )}

        {/* List */}
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <Shield className="w-10 h-10 mx-auto mb-3 text-slate-200" />
            <p className="font-medium">No incidents found</p>
            <p className="text-sm mt-1">Keep it that way — drive safely!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(inc => {
              const sev = SEVERITY_CONFIG[inc.severity] ?? SEVERITY_CONFIG.minor
              return (
                <div key={inc.id} className={`bg-white border rounded-2xl p-4 shadow-sm ${inc.severity === 'critical' ? 'border-red-200' : inc.severity === 'major' ? 'border-orange-200' : 'border-slate-100'}`}>
                  <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${sev.bg}`}>
                      <AlertTriangle className={`w-5 h-5 ${sev.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${sev.bg} ${sev.color}`}>{sev.label}</span>
                        <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full capitalize">{inc.type?.replace('_', ' ')}</span>
                        {inc.resolved && <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Resolved</span>}
                        {inc.reported_to_insurance && <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">Insured</span>}
                      </div>
                      <p className="text-sm text-slate-700 mt-1.5">{inc.description}</p>
                      <div className="flex items-center gap-4 mt-1.5 text-xs text-slate-400">
                        <span>{fmtDate(inc.incident_date)}</span>
                        {inc.driver?.name && <span className="flex items-center gap-1"><User className="w-3 h-3" />{inc.driver.name}{inc.at_fault ? ' (at fault)' : ''}</span>}
                        {inc.vehicle?.name && <span className="flex items-center gap-1"><Truck className="w-3 h-3" />{inc.vehicle.name}</span>}
                        {inc.cost > 0 && <span className="flex items-center gap-1 text-red-500"><DollarSign className="w-3 h-3" />{fmt(inc.cost)}</span>}
                      </div>
                    </div>
                    {!inc.resolved && (
                      <button onClick={() => resolveIncident(inc.id)}
                        className="flex items-center gap-1.5 text-xs border border-emerald-200 text-emerald-600 hover:bg-emerald-50 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Resolve
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
