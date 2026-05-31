'use client'

import { useState, useEffect } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { getVehicles, createVehicle, updateVehicle, getVehicleMaintenance, createVehicleMaintenance, getFuelLogs, createFuelLog, getStaff } from '@/lib/db'
import { idr } from '@/lib/format'
import type { Vehicle, VehicleMaintenance, FuelLog, Staff } from '@/types'
import {
  Truck, Plus, Edit2, Check, X, AlertTriangle, Fuel,
  Wrench, Calendar, Gauge, Loader2, ChevronRight, Shield
} from 'lucide-react'

type Tab = 'fleet' | 'maintenance' | 'fuel'

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  maintenance: 'bg-amber-100 text-amber-700',
  retired: 'bg-slate-100 text-slate-500',
  sold: 'bg-red-100 text-red-600',
}

const EMPTY_VEHICLE: Partial<Vehicle> = {
  name: '', plate_number: '', type: 'truck', status: 'active',
  capacity_350ml: 0, capacity_750ml: 0, current_odometer: 0,
}

export default function FleetPage() {
  const [tab, setTab] = useState<Tab>('fleet')
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [maintenance, setMaintenance] = useState<VehicleMaintenance[]>([])
  const [fuelLogs, setFuelLogs] = useState<FuelLog[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [showVehicleForm, setShowVehicleForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<Partial<Vehicle>>(EMPTY_VEHICLE)
  const [showMaintForm, setShowMaintForm] = useState(false)
  const [maintForm, setMaintForm] = useState<Partial<VehicleMaintenance>>({ service_date: new Date().toISOString().split('T')[0], type: 'service', cost: 0 })
  const [showFuelForm, setShowFuelForm] = useState(false)
  const [fuelForm, setFuelForm] = useState<Partial<FuelLog>>({ log_date: new Date().toISOString().split('T')[0], full_tank: true })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [v, m, f, s] = await Promise.all([getVehicles(), getVehicleMaintenance(), getFuelLogs(), getStaff()])
      setVehicles(v)
      setMaintenance(m)
      setFuelLogs(f)
      setStaff(s.filter(x => x.role === 'driver'))
      setLoading(false)
    }
    load()
  }, [])

  const handleSaveVehicle = async () => {
    if (!form.name || !form.plate_number) return
    setSaving(true)
    try {
      if (editingId) {
        const updated = await updateVehicle(editingId, form)
        setVehicles(vehicles.map(v => v.id === editingId ? updated : v))
      } else {
        const created = await createVehicle(form)
        setVehicles([...vehicles, created])
      }
      setShowVehicleForm(false)
      setEditingId(null)
      setForm(EMPTY_VEHICLE)
    } finally {
      setSaving(false)
    }
  }

  const handleSaveMaint = async () => {
    if (!maintForm.vehicle_id || !maintForm.description) return
    setSaving(true)
    try {
      const created = await createVehicleMaintenance(maintForm)
      setMaintenance([created, ...maintenance])
      setShowMaintForm(false)
      setMaintForm({ service_date: new Date().toISOString().split('T')[0], type: 'service', cost: 0 })
    } finally {
      setSaving(false)
    }
  }

  const handleSaveFuel = async () => {
    if (!fuelForm.vehicle_id || !fuelForm.liters) return
    setSaving(true)
    try {
      const totalCost = (fuelForm.liters ?? 0) * (fuelForm.price_per_liter ?? 0)
      const created = await createFuelLog({ ...fuelForm, total_cost: totalCost })
      setFuelLogs([created, ...fuelLogs])
      setShowFuelForm(false)
      setFuelForm({ log_date: new Date().toISOString().split('T')[0], full_tank: true })
    } finally {
      setSaving(false)
    }
  }

  const activeVehicles = vehicles.filter(v => v.status === 'active')
  const maintenanceDue = vehicles.filter(v => v.status === 'maintenance')
  const totalFuelCost = fuelLogs.reduce((s, f) => s + Number(f.total_cost ?? 0), 0)
  const totalMaintCost = maintenance.reduce((s, m) => s + Number(m.cost ?? 0), 0)

  // Check for expiring docs
  const today = new Date()
  const thirtyDays = new Date(); thirtyDays.setDate(thirtyDays.getDate() + 30)
  const expiring = vehicles.filter(v =>
    (v.registration_expiry && new Date(v.registration_expiry) < thirtyDays) ||
    (v.insurance_expiry && new Date(v.insurance_expiry) < thirtyDays)
  )

  return (
    <>
      <Topbar title="Fleet Management" />
      <div className="p-6 max-w-5xl space-y-6">

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Active Vehicles', value: activeVehicles.length, icon: Truck, color: 'text-slate-800' },
            { label: 'In Maintenance', value: maintenanceDue.length, icon: Wrench, color: maintenanceDue.length > 0 ? 'text-amber-600' : 'text-slate-600' },
            { label: 'Total Fuel Cost', value: idr(totalFuelCost), icon: Fuel, color: 'text-slate-800', small: true },
            { label: 'Total Maint. Cost', value: idr(totalMaintCost), icon: Wrench, color: 'text-slate-800', small: true },
          ].map(({ label, value, icon: Icon, color, small }) => (
            <Card key={label}>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-400">{label}</p>
                    <p className={`font-bold ${small ? 'text-base' : 'text-2xl'} ${color}`}>{value}</p>
                  </div>
                  <Icon className="w-6 h-6 text-slate-200" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Expiry alerts */}
        {expiring.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <p className="text-sm font-semibold text-amber-800">Document Expiry Alerts</p>
            </div>
            {expiring.map(v => (
              <div key={v.id} className="text-xs text-amber-700">
                <span className="font-medium">{v.name} ({v.plate_number})</span>
                {v.registration_expiry && new Date(v.registration_expiry) < thirtyDays && ` · Registration expires ${new Date(v.registration_expiry).toLocaleDateString()}`}
                {v.insurance_expiry && new Date(v.insurance_expiry) < thirtyDays && ` · Insurance expires ${new Date(v.insurance_expiry).toLocaleDateString()}`}
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-slate-200">
          {[
            { id: 'fleet' as Tab, label: `Vehicles (${vehicles.length})` },
            { id: 'maintenance' as Tab, label: `Maintenance (${maintenance.length})` },
            { id: 'fuel' as Tab, label: `Fuel Logs (${fuelLogs.length})` },
          ].map(({ id, label }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === id ? 'border-cyan-600 text-cyan-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* FLEET TAB */}
        {tab === 'fleet' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => { setForm(EMPTY_VEHICLE); setEditingId(null); setShowVehicleForm(true) }}>
                <Plus className="w-4 h-4 mr-1.5" /> Add Vehicle
              </Button>
            </div>

            {showVehicleForm && (
              <Card>
                <CardHeader><CardTitle className="text-sm">{editingId ? 'Edit Vehicle' : 'Add Vehicle'}</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Vehicle Name *</Label><Input value={form.name ?? ''} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Truck 1, Van Seminyak..." /></div>
                    <div><Label>Plate Number *</Label><Input value={form.plate_number ?? ''} onChange={e => setForm({ ...form, plate_number: e.target.value })} placeholder="DK 1234 AB" /></div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label>Type</Label>
                      <select className="w-full border rounded-md px-3 py-2 text-sm" value={form.type} onChange={e => setForm({ ...form, type: e.target.value as any })}>
                        {['truck', 'van', 'motorcycle', 'pickup'].map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div><Label>Make</Label><Input value={form.make ?? ''} onChange={e => setForm({ ...form, make: e.target.value })} placeholder="Toyota, Mitsubishi..." /></div>
                    <div><Label>Model</Label><Input value={form.model ?? ''} onChange={e => setForm({ ...form, model: e.target.value })} placeholder="Hilux, L300..." /></div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div><Label>Year</Label><Input type="number" value={form.year ?? ''} onChange={e => setForm({ ...form, year: Number(e.target.value) })} /></div>
                    <div><Label>Capacity 350ml</Label><Input type="number" value={form.capacity_350ml ?? 0} onChange={e => setForm({ ...form, capacity_350ml: Number(e.target.value) })} /></div>
                    <div><Label>Capacity 750ml</Label><Input type="number" value={form.capacity_750ml ?? 0} onChange={e => setForm({ ...form, capacity_750ml: Number(e.target.value) })} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Assigned Driver</Label>
                      <select className="w-full border rounded-md px-3 py-2 text-sm" value={form.assigned_driver_id ?? ''} onChange={e => setForm({ ...form, assigned_driver_id: e.target.value || null })}>
                        <option value="">Unassigned</option>
                        {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label>Status</Label>
                      <select className="w-full border rounded-md px-3 py-2 text-sm" value={form.status} onChange={e => setForm({ ...form, status: e.target.value as any })}>
                        {['active', 'maintenance', 'retired', 'sold'].map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Registration Expiry</Label><Input type="date" value={form.registration_expiry ?? ''} onChange={e => setForm({ ...form, registration_expiry: e.target.value })} /></div>
                    <div><Label>Insurance Expiry</Label><Input type="date" value={form.insurance_expiry ?? ''} onChange={e => setForm({ ...form, insurance_expiry: e.target.value })} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Insurance Provider</Label><Input value={form.insurance_provider ?? ''} onChange={e => setForm({ ...form, insurance_provider: e.target.value })} /></div>
                    <div><Label>Current Odometer (km)</Label><Input type="number" value={form.current_odometer ?? 0} onChange={e => setForm({ ...form, current_odometer: Number(e.target.value) })} /></div>
                  </div>
                  <div className="flex gap-2">
                    <Button className="bg-cyan-600 hover:bg-cyan-700 flex-1" onClick={handleSaveVehicle} disabled={saving}>
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4 mr-1" />{editingId ? 'Save Changes' : 'Add Vehicle'}</>}
                    </Button>
                    <Button variant="outline" onClick={() => setShowVehicleForm(false)}><X className="w-4 h-4" /></Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {loading && <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>}
            {vehicles.length === 0 && !loading && (
              <div className="text-center py-12 text-slate-400 text-sm">
                <Truck className="w-8 h-8 mx-auto mb-2 text-slate-200" />
                No vehicles yet. Add your first vehicle.
              </div>
            )}

            <div className="grid grid-cols-1 gap-3">
              {vehicles.map(v => (
                <Card key={v.id}>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
                        <Truck className="w-6 h-6 text-slate-400" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-800">{v.name}</span>
                          <span className="text-sm text-slate-400 font-mono">{v.plate_number}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[v.status]}`}>{v.status}</span>
                        </div>
                        <div className="flex gap-4 mt-1 text-xs text-slate-400">
                          {v.make && <span>{v.make} {v.model} {v.year && `(${v.year})`}</span>}
                          {v.current_odometer > 0 && <span className="flex items-center gap-1"><Gauge className="w-3 h-3" />{v.current_odometer.toLocaleString()} km</span>}
                          {(v.capacity_350ml > 0 || v.capacity_750ml > 0) && (
                            <span>Cap: {v.capacity_350ml}×350ml, {v.capacity_750ml}×750ml</span>
                          )}
                          {(v as any).assigned_driver && <span>Driver: {(v as any).assigned_driver.name}</span>}
                        </div>
                        <div className="flex gap-3 mt-1 text-xs">
                          {v.registration_expiry && (
                            <span className={new Date(v.registration_expiry) < today ? 'text-red-500' : new Date(v.registration_expiry) < thirtyDays ? 'text-amber-500' : 'text-slate-400'}>
                              Reg: {new Date(v.registration_expiry).toLocaleDateString()}
                            </span>
                          )}
                          {v.insurance_expiry && (
                            <span className={new Date(v.insurance_expiry) < today ? 'text-red-500' : new Date(v.insurance_expiry) < thirtyDays ? 'text-amber-500' : 'text-slate-400'}>
                              Ins: {new Date(v.insurance_expiry).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => { setForm(v); setEditingId(v.id); setShowVehicleForm(true) }}>
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* MAINTENANCE TAB */}
        {tab === 'maintenance' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setShowMaintForm(true)}><Plus className="w-4 h-4 mr-1" /> Log Service</Button>
            </div>

            {showMaintForm && (
              <Card>
                <CardHeader><CardTitle className="text-sm">Log Maintenance Record</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Vehicle *</Label>
                      <select className="w-full border rounded-md px-3 py-2 text-sm" value={maintForm.vehicle_id ?? ''} onChange={e => setMaintForm({ ...maintForm, vehicle_id: e.target.value })}>
                        <option value="">Select vehicle...</option>
                        {vehicles.map(v => <option key={v.id} value={v.id}>{v.name} ({v.plate_number})</option>)}
                      </select>
                    </div>
                    <div>
                      <Label>Type</Label>
                      <select className="w-full border rounded-md px-3 py-2 text-sm" value={maintForm.type} onChange={e => setMaintForm({ ...maintForm, type: e.target.value })}>
                        {['oil_change', 'tire', 'brake', 'engine', 'body', 'inspection', 'service', 'repair', 'other'].map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                      </select>
                    </div>
                  </div>
                  <div><Label>Description *</Label><Textarea value={maintForm.description ?? ''} onChange={e => setMaintForm({ ...maintForm, description: e.target.value })} rows={2} /></div>
                  <div className="grid grid-cols-3 gap-3">
                    <div><Label>Service Date *</Label><Input type="date" value={maintForm.service_date ?? ''} onChange={e => setMaintForm({ ...maintForm, service_date: e.target.value })} /></div>
                    <div><Label>Cost (IDR)</Label><Input type="number" value={maintForm.cost ?? 0} onChange={e => setMaintForm({ ...maintForm, cost: Number(e.target.value) })} /></div>
                    <div><Label>Vendor</Label><Input value={maintForm.vendor ?? ''} onChange={e => setMaintForm({ ...maintForm, vendor: e.target.value })} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Next Service Date</Label><Input type="date" value={maintForm.next_service_date ?? ''} onChange={e => setMaintForm({ ...maintForm, next_service_date: e.target.value })} /></div>
                    <div><Label>Odometer at Service (km)</Label><Input type="number" value={maintForm.odometer_at_service ?? ''} onChange={e => setMaintForm({ ...maintForm, odometer_at_service: Number(e.target.value) })} /></div>
                  </div>
                  <div className="flex gap-2">
                    <Button className="bg-cyan-600 hover:bg-cyan-700" onClick={handleSaveMaint} disabled={saving}>
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Record'}
                    </Button>
                    <Button variant="outline" onClick={() => setShowMaintForm(false)}>Cancel</Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {maintenance.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-sm"><Wrench className="w-8 h-8 mx-auto mb-2 text-slate-200" />No maintenance records yet</div>
            ) : (
              <div className="space-y-2">
                {maintenance.map(m => {
                  const vehicle = vehicles.find(v => v.id === m.vehicle_id)
                  return (
                    <Card key={m.id}>
                      <CardContent className="pt-3 pb-3">
                        <div className="flex items-center gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-slate-700">{vehicle?.name ?? 'Unknown'}</span>
                              <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{m.type.replace('_', ' ')}</span>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">{m.description}</p>
                            <div className="flex gap-3 text-xs text-slate-400 mt-0.5">
                              <span>{new Date(m.service_date).toLocaleDateString()}</span>
                              {m.vendor && <span>{m.vendor}</span>}
                              {m.next_service_date && <span>Next: {new Date(m.next_service_date).toLocaleDateString()}</span>}
                            </div>
                          </div>
                          <p className="font-bold text-slate-800">{idr(Number(m.cost))}</p>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* FUEL TAB */}
        {tab === 'fuel' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setShowFuelForm(true)}><Plus className="w-4 h-4 mr-1" /> Log Fuel</Button>
            </div>

            {showFuelForm && (
              <Card>
                <CardHeader><CardTitle className="text-sm">Log Fuel Fill-Up</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Vehicle *</Label>
                      <select className="w-full border rounded-md px-3 py-2 text-sm" value={fuelForm.vehicle_id ?? ''} onChange={e => setFuelForm({ ...fuelForm, vehicle_id: e.target.value })}>
                        <option value="">Select vehicle...</option>
                        {vehicles.map(v => <option key={v.id} value={v.id}>{v.name} ({v.plate_number})</option>)}
                      </select>
                    </div>
                    <div>
                      <Label>Driver</Label>
                      <select className="w-full border rounded-md px-3 py-2 text-sm" value={fuelForm.driver_id ?? ''} onChange={e => setFuelForm({ ...fuelForm, driver_id: e.target.value || null })}>
                        <option value="">Select driver...</option>
                        {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div><Label>Date *</Label><Input type="date" value={fuelForm.log_date ?? ''} onChange={e => setFuelForm({ ...fuelForm, log_date: e.target.value })} /></div>
                    <div><Label>Liters *</Label><Input type="number" step="0.1" value={fuelForm.liters ?? ''} onChange={e => setFuelForm({ ...fuelForm, liters: Number(e.target.value) })} /></div>
                    <div><Label>Price/Liter (IDR)</Label><Input type="number" value={fuelForm.price_per_liter ?? ''} onChange={e => setFuelForm({ ...fuelForm, price_per_liter: Number(e.target.value) })} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Odometer (km)</Label><Input type="number" value={fuelForm.odometer ?? ''} onChange={e => setFuelForm({ ...fuelForm, odometer: Number(e.target.value) })} /></div>
                    <div><Label>Station</Label><Input value={fuelForm.station ?? ''} onChange={e => setFuelForm({ ...fuelForm, station: e.target.value })} /></div>
                  </div>
                  {fuelForm.liters && fuelForm.price_per_liter && (
                    <p className="text-sm text-slate-600 bg-slate-50 rounded-lg p-2">
                      Total: <strong>{idr((fuelForm.liters ?? 0) * (fuelForm.price_per_liter ?? 0))}</strong>
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button className="bg-cyan-600 hover:bg-cyan-700" onClick={handleSaveFuel} disabled={saving}>
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Log'}
                    </Button>
                    <Button variant="outline" onClick={() => setShowFuelForm(false)}>Cancel</Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {fuelLogs.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-sm"><Fuel className="w-8 h-8 mx-auto mb-2 text-slate-200" />No fuel logs yet</div>
            ) : (
              <div className="space-y-2">
                {fuelLogs.map(f => {
                  const vehicle = vehicles.find(v => v.id === f.vehicle_id)
                  return (
                    <Card key={f.id}>
                      <CardContent className="pt-3 pb-3">
                        <div className="flex items-center gap-4">
                          <Fuel className="w-4 h-4 text-slate-300 flex-shrink-0" />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-slate-700">{vehicle?.name ?? 'Unknown'}</span>
                              <span className="text-xs text-slate-400">{new Date(f.log_date).toLocaleDateString()}</span>
                              {f.station && <span className="text-xs text-slate-400">{f.station}</span>}
                            </div>
                            <p className="text-xs text-slate-400">{f.liters}L @ {idr(f.price_per_liter ?? 0)}/L{f.odometer ? ` · ${f.odometer.toLocaleString()} km` : ''}</p>
                          </div>
                          <p className="font-bold text-slate-800">{idr(Number(f.total_cost ?? 0))}</p>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
