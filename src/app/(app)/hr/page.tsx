'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { getStaff, createStaff, updateStaff, getPtoRequests, createPtoRequest, updatePtoRequest } from '@/lib/db'
import { idr } from '@/lib/format'
import type { Staff, PtoRequest } from '@/types'
import {
  Users, Plus, Edit2, Check, X, Phone, Mail, Loader2,
  Truck, UserCog, ChevronRight, Calendar, Clock, DollarSign,
  Shield, AlertTriangle, Star, Download
} from 'lucide-react'

type Tab = 'team' | 'pto'

const ROLE_COLORS: Record<string, string> = {
  driver: 'bg-blue-100 text-blue-700',
  cleaner: 'bg-teal-100 text-teal-700',
  manager: 'bg-purple-100 text-purple-700',
  admin: 'bg-slate-100 text-slate-600',
}
const ROLE_ICONS: Record<string, React.ElementType> = {
  driver: Truck,
  cleaner: UserCog,
  manager: Star,
  admin: Shield,
}

const EMPTY_STAFF: Partial<Staff> = {
  name: '', role: 'driver', phone: '', email: '', active: true,
  salary_type: 'monthly', salary: undefined,
}

export default function HRPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('team')
  const [staff, setStaff] = useState<Staff[]>([])
  const [ptoRequests, setPtoRequests] = useState<(PtoRequest & { employee?: Staff })[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<Partial<Staff>>(EMPTY_STAFF)
  const [saving, setSaving] = useState(false)
  const [showPtoForm, setShowPtoForm] = useState(false)
  const [ptoForm, setPtoForm] = useState<Partial<PtoRequest>>({ type: 'annual', status: 'pending' })
  const [filterRole, setFilterRole] = useState<string>('all')

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const [s, pto] = await Promise.all([getStaff(), getPtoRequests()])
        setStaff(s)
        setPtoRequests(pto as any[])
      } catch (e) {
        console.error('HR load error:', e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const handleSave = async () => {
    if (!form.name) return
    setSaving(true)
    try {
      if (editingId) {
        const updated = await updateStaff(editingId, form)
        setStaff(staff.map(s => s.id === editingId ? updated : s))
      } else {
        const created = await createStaff(form)
        setStaff([...staff, created])
      }
      setShowForm(false)
      setEditingId(null)
      setForm(EMPTY_STAFF)
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (s: Staff) => {
    setForm(s)
    setEditingId(s.id)
    setShowForm(true)
  }

  const handlePtoSubmit = async () => {
    if (!ptoForm.employee_id || !ptoForm.start_date || !ptoForm.end_date) return
    const created = await createPtoRequest(ptoForm)
    setPtoRequests([created as any, ...ptoRequests])
    setShowPtoForm(false)
    setPtoForm({ type: 'annual', status: 'pending' })
  }

  const handlePtoAction = async (id: string, status: 'approved' | 'rejected') => {
    await updatePtoRequest(id, status)
    setPtoRequests(ptoRequests.map(p => p.id === id ? { ...p, status } : p))
  }

  const filtered = filterRole === 'all' ? staff : staff.filter(s => s.role === filterRole)
  const activeDrivers = staff.filter(s => s.role === 'driver' && s.active)
  const pendingPto = ptoRequests.filter(p => p.status === 'pending')

  return (
    <>
      <Topbar title="HR & Drivers" />
      <div className="p-6 max-w-5xl space-y-6">

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Total Staff', value: staff.filter(s => s.active).length, icon: Users, color: 'text-slate-800' },
            { label: 'Drivers', value: activeDrivers.length, icon: Truck, color: 'text-blue-600' },
            { label: 'PTO Pending', value: pendingPto.length, icon: Calendar, color: pendingPto.length > 0 ? 'text-amber-600' : 'text-slate-600' },
            { label: 'Team Size', value: staff.length, icon: UserCog, color: 'text-slate-600' },
          ].map(({ label, value, icon: Icon, color }) => (
            <Card key={label}>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-400">{label}</p>
                    <p className={`text-2xl font-bold ${color}`}>{value}</p>
                  </div>
                  <Icon className="w-6 h-6 text-slate-200" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-slate-200">
          {[
            { id: 'team' as Tab, label: `Team (${staff.length})` },
            { id: 'pto' as Tab, label: `Leave Requests (${ptoRequests.length})` },
          ].map(({ id, label }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === id ? 'border-cyan-600 text-cyan-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* TEAM TAB */}
        {tab === 'team' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                {['all', 'driver', 'manager', 'cleaner', 'admin'].map(r => (
                  <button key={r} onClick={() => setFilterRole(r)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterRole === r ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                    {r === 'all' ? 'All Roles' : r.charAt(0).toUpperCase() + r.slice(1) + 's'}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                {filtered.length > 0 && (
                  <Button variant="outline" onClick={() => {
                    const rows = filtered.map(s => ({ Name: s.name, Role: s.role, Phone: s.phone ?? '', Email: s.email ?? '', Employee_No: s.employee_number ?? '', Start_Date: s.start_date ?? '', Salary_Type: s.salary_type ?? '', Salary_IDR: s.salary ?? '', Active: s.active ? 'Yes' : 'No' }))
                    const headers = Object.keys(rows[0])
                    const csv = [headers.join(','), ...rows.map(r => headers.map(h => JSON.stringify((r as any)[h] ?? '')).join(','))].join('\n')
                    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
                    a.download = 'staff.csv'; a.click()
                  }}>
                    <Download className="w-4 h-4 mr-1.5" />Export
                  </Button>
                )}
                <Button onClick={() => { setForm(EMPTY_STAFF); setEditingId(null); setShowForm(true) }}>
                  <Plus className="w-4 h-4 mr-1.5" /> Add Staff
                </Button>
              </div>
            </div>

            {showForm && (
              <Card>
                <CardHeader><CardTitle className="text-sm">{editingId ? 'Edit Staff Member' : 'Add New Staff Member'}</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Full Name *</Label><Input value={form.name ?? ''} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
                    <div>
                      <Label>Role *</Label>
                      <select className="w-full border rounded-md px-3 py-2 text-sm" value={form.role} onChange={e => setForm({ ...form, role: e.target.value as any })}>
                        {['driver', 'cleaner', 'manager', 'admin', 'sales'].map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Phone</Label><Input value={form.phone ?? ''} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
                    <div><Label>Email</Label><Input type="email" value={form.email ?? ''} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div><Label>Employee Number</Label><Input value={form.employee_number ?? ''} onChange={e => setForm({ ...form, employee_number: e.target.value })} /></div>
                    <div><Label>Start Date</Label><Input type="date" value={form.start_date ?? ''} onChange={e => setForm({ ...form, start_date: e.target.value })} /></div>
                    <div><Label>ID Number (KTP)</Label><Input value={form.id_number ?? ''} onChange={e => setForm({ ...form, id_number: e.target.value })} /></div>
                  </div>
                  {form.role === 'driver' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>License Number (SIM)</Label><Input value={form.license_number ?? ''} onChange={e => setForm({ ...form, license_number: e.target.value })} /></div>
                      <div><Label>License Expiry</Label><Input type="date" value={form.license_expiry ?? ''} onChange={e => setForm({ ...form, license_expiry: e.target.value })} /></div>
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label>Salary Type</Label>
                      <select className="w-full border rounded-md px-3 py-2 text-sm" value={form.salary_type ?? 'monthly'} onChange={e => setForm({ ...form, salary_type: e.target.value as any })}>
                        {['monthly', 'daily', 'hourly'].map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div><Label>Salary (IDR)</Label><Input type="number" value={form.salary ?? ''} onChange={e => setForm({ ...form, salary: e.target.value ? Number(e.target.value) : undefined })} /></div>
                    <div><Label>Emergency Contact</Label><Input value={form.emergency_contact ?? ''} onChange={e => setForm({ ...form, emergency_contact: e.target.value })} /></div>
                  </div>
                  <div><Label>Emergency Phone</Label><Input value={form.emergency_phone ?? ''} onChange={e => setForm({ ...form, emergency_phone: e.target.value })} /></div>
                  {(form.role === 'sales' || form.role === 'manager') && (
                    <div>
                      <Label>CRM Access Level</Label>
                      <select className="w-full border rounded-md px-3 py-2 text-sm" value={(form as any).crm_role ?? 'ae'} onChange={e => setForm({ ...form, crm_role: e.target.value } as any)}>
                        <option value="ae">Account Executive — sees only assigned partners</option>
                        <option value="manager">Sales Manager — sees full CRM</option>
                      </select>
                    </div>
                  )}
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={!!form.active} onChange={e => setForm({ ...form, active: e.target.checked })} />
                    Active employee
                  </label>
                  <div className="flex gap-2">
                    <Button className="bg-cyan-600 hover:bg-cyan-700 flex-1" onClick={handleSave} disabled={saving}>
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4 mr-1" /> {editingId ? 'Save Changes' : 'Add Staff Member'}</>}
                    </Button>
                    <Button variant="outline" onClick={() => { setShowForm(false); setEditingId(null) }}><X className="w-4 h-4" /></Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {loading && <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>}

            <div className="grid grid-cols-1 gap-3">
              {filtered.map(s => {
                const RoleIcon = ROLE_ICONS[s.role] ?? UserCog
                return (
                  <Card key={s.id} className={!s.active ? 'opacity-50' : ''}>
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-4">
                        <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                          <RoleIcon className="w-5 h-5 text-slate-500" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-800">{s.name}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[s.role]}`}>{s.role}</span>
                            {!s.active && <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">Inactive</span>}
                            {s.employee_number && <span className="text-xs text-slate-400">{s.employee_number}</span>}
                          </div>
                          <div className="flex gap-4 mt-1 text-xs text-slate-400">
                            {s.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{s.phone}</span>}
                            {s.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{s.email}</span>}
                            {s.salary && <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" />{idr(s.salary)}/{s.salary_type}</span>}
                            {s.start_date && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />Since {new Date(s.start_date).toLocaleDateString()}</span>}
                          </div>
                          {s.role === 'driver' && s.license_expiry && (
                            <div className="mt-1">
                              <span className={`text-xs ${new Date(s.license_expiry) < new Date() ? 'text-red-500' : 'text-slate-400'}`}>
                                {new Date(s.license_expiry) < new Date() ? '⚠️ License expired: ' : 'License expires: '}
                                {new Date(s.license_expiry).toLocaleDateString()}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => handleEdit(s)}>
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => router.push(`/hr/${s.id}`)}>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
              {filtered.length === 0 && !loading && (
                <div className="text-center py-12 text-slate-400 text-sm">
                  <Users className="w-8 h-8 mx-auto mb-2 text-slate-200" />
                  No team members yet. Add your first staff member.
                </div>
              )}
            </div>
          </div>
        )}

        {/* PTO TAB */}
        {tab === 'pto' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setShowPtoForm(true)}><Plus className="w-4 h-4 mr-1" /> Log Leave Request</Button>
            </div>

            {showPtoForm && (
              <Card>
                <CardHeader><CardTitle className="text-sm">New Leave Request</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Employee *</Label>
                      <select className="w-full border rounded-md px-3 py-2 text-sm" value={ptoForm.employee_id ?? ''} onChange={e => setPtoForm({ ...ptoForm, employee_id: e.target.value })}>
                        <option value="">Select employee...</option>
                        {staff.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label>Leave Type *</Label>
                      <select className="w-full border rounded-md px-3 py-2 text-sm" value={ptoForm.type} onChange={e => setPtoForm({ ...ptoForm, type: e.target.value as any })}>
                        {['annual', 'sick', 'personal', 'unpaid', 'public_holiday'].map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Start Date *</Label><Input type="date" value={ptoForm.start_date ?? ''} onChange={e => setPtoForm({ ...ptoForm, start_date: e.target.value })} /></div>
                    <div><Label>End Date *</Label><Input type="date" value={ptoForm.end_date ?? ''} onChange={e => setPtoForm({ ...ptoForm, end_date: e.target.value })} /></div>
                  </div>
                  <div><Label>Reason</Label><Input value={ptoForm.reason ?? ''} onChange={e => setPtoForm({ ...ptoForm, reason: e.target.value })} /></div>
                  <div className="flex gap-2">
                    <Button className="bg-cyan-600 hover:bg-cyan-700" onClick={handlePtoSubmit}>Submit Request</Button>
                    <Button variant="outline" onClick={() => setShowPtoForm(false)}>Cancel</Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {ptoRequests.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-sm">
                <Calendar className="w-8 h-8 mx-auto mb-2 text-slate-200" />
                No leave requests yet
              </div>
            ) : (
              <div className="space-y-2">
                {ptoRequests.map(p => {
                  const employee = staff.find(s => s.id === p.employee_id)
                  const days = p.start_date && p.end_date
                    ? Math.ceil((new Date(p.end_date).getTime() - new Date(p.start_date).getTime()) / 86400000) + 1
                    : 0
                  return (
                    <Card key={p.id}>
                      <CardContent className="pt-3 pb-3">
                        <div className="flex items-center gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-slate-700">{employee?.name ?? 'Unknown'}</span>
                              <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{p.type.replace('_', ' ')}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${p.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : p.status === 'rejected' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'}`}>{p.status}</span>
                            </div>
                            <p className="text-xs text-slate-400 mt-0.5">
                              {new Date(p.start_date).toLocaleDateString()} – {new Date(p.end_date).toLocaleDateString()} ({days} day{days !== 1 ? 's' : ''})
                              {p.reason && ` · ${p.reason}`}
                            </p>
                          </div>
                          {p.status === 'pending' && (
                            <div className="flex gap-2">
                              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 h-8" onClick={() => handlePtoAction(p.id, 'approved')}>
                                <Check className="w-3.5 h-3.5 mr-1" /> Approve
                              </Button>
                              <Button size="sm" variant="outline" className="h-8 text-red-500 hover:text-red-700" onClick={() => handlePtoAction(p.id, 'rejected')}>
                                <X className="w-3.5 h-3.5 mr-1" /> Reject
                              </Button>
                            </div>
                          )}
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
