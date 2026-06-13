'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Topbar } from '@/components/layout/topbar'
import { useLanguage } from '@/components/providers/language-provider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { getStaff, createStaff, updateStaff, getPtoRequests, createPtoRequest, updatePtoRequest } from '@/lib/db'
import { idr } from '@/lib/format'
import type { Staff, PtoRequest } from '@/types'
import { createClient } from '@/lib/supabase/client'
import {
  Users, Plus, Edit2, Check, X, Phone, Mail, Loader2,
  Truck, UserCog, ChevronRight, Calendar, Clock, DollarSign,
  Shield, AlertTriangle, Star, Download, Zap, BarChart3, User,
  UserCheck, UserX, Send, Trash2
} from 'lucide-react'

type MainTab = 'team' | 'attendance' | 'performance'

const ROLE_COLORS: Record<string, string> = {
  driver: 'bg-blue-100 text-blue-700', cleaner: 'bg-teal-100 text-teal-700',
  manager: 'bg-purple-100 text-purple-700', admin: 'bg-slate-100 text-slate-600',
}
const STATUS_COLORS: Record<string, string> = {
  present: 'bg-emerald-100 text-emerald-700', absent: 'bg-red-100 text-red-600',
  late: 'bg-amber-100 text-amber-700', half_day: 'bg-blue-100 text-blue-700', leave: 'bg-purple-100 text-purple-700',
}
const EMPTY_STAFF: Partial<Staff> = { name: '', role: 'driver', phone: '', email: '', active: true, salary_type: 'monthly', salary: undefined }

// ─── TAB: TEAM (HR) ────────────────────────────────────────────────────────────
function TeamTab() {
  const router = useRouter()
  const { t } = useLanguage()
  const [subTab, setSubTab] = useState<'team' | 'pto'>('team')
  const [staff, setStaff] = useState<Staff[]>([])
  const [ptoRequests, setPtoRequests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<Partial<Staff>>(EMPTY_STAFF)
  const [saving, setSaving] = useState(false)
  const [showPtoForm, setShowPtoForm] = useState(false)
  const [ptoForm, setPtoForm] = useState<Partial<PtoRequest>>({ type: 'annual', status: 'pending' })
  const [filterRole, setFilterRole] = useState('all')

  // ── Invite modal ──
  const [showInvite, setShowInvite] = useState(false)
  const [inviteForm, setInviteForm] = useState({ name: '', email: '', role: 'staff', phone: '' })
  const [inviting, setInviting] = useState(false)
  const [inviteResult, setInviteResult] = useState<{ success: boolean; message: string } | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [s, pto] = await Promise.all([getStaff(), getPtoRequests()])
      setStaff(s); setPtoRequests(pto as any[])
      setLoading(false)
    }
    load()
  }, [])

  const handleSave = async () => {
    if (!form.name) return
    setSaving(true)
    try {
      if (editingId) { const u = await updateStaff(editingId, form); setStaff(staff.map(s => s.id === editingId ? u : s)) }
      else { const c = await createStaff(form); setStaff([...staff, c]) }
      setShowForm(false); setEditingId(null); setForm(EMPTY_STAFF)
    } finally { setSaving(false) }
  }

  const handleInvite = async () => {
    if (!inviteForm.name.trim() || !inviteForm.email.trim()) return
    setInviting(true)
    setInviteResult(null)
    try {
      const res = await fetch('/api/invite-staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inviteForm),
      })
      const data = await res.json()
      if (!res.ok) {
        setInviteResult({ success: false, message: data.error ?? 'Something went wrong.' })
      } else {
        setInviteResult({ success: true, message: `Account created! A welcome email with login credentials has been sent to ${inviteForm.email}.` })
        // Add to staff list
        if (data.staff) setStaff(prev => [...prev, data.staff])
        setInviteForm({ name: '', email: '', role: 'staff', phone: '' })
      }
    } catch {
      setInviteResult({ success: false, message: 'Network error. Please try again.' })
    } finally {
      setInviting(false)
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete ${name}? This cannot be undone.`)) return
    const sb = createClient()
    await sb.from('staff').delete().eq('id', id)
    setStaff(prev => prev.filter(s => s.id !== id))
  }

  const handlePtoSubmit = async () => {
    if (!ptoForm.employee_id || !ptoForm.start_date || !ptoForm.end_date) return
    const created = await createPtoRequest(ptoForm)
    setPtoRequests([created as any, ...ptoRequests]); setShowPtoForm(false); setPtoForm({ type: 'annual', status: 'pending' })
  }

  const handlePtoAction = async (id: string, status: 'approved' | 'rejected') => {
    await updatePtoRequest(id, status)
    setPtoRequests(ptoRequests.map(p => p.id === id ? { ...p, status } : p))
  }

  const filtered = filterRole === 'all' ? staff : staff.filter(s => s.role === filterRole)
  const pendingPto = ptoRequests.filter(p => p.status === 'pending')

  return (
    <div className="p-6 max-w-5xl space-y-6">
      <div className="grid grid-cols-4 gap-4">
        {[
          { labelKey: 'people_total_staff' as const, value: staff.filter(s => s.active).length, icon: Users, color: 'text-slate-800' },
          { labelKey: 'people_drivers' as const, value: staff.filter(s => s.role === 'driver' && s.active).length, icon: Truck, color: 'text-blue-600' },
          { labelKey: 'people_pto_pending' as const, value: pendingPto.length, icon: Calendar, color: pendingPto.length > 0 ? 'text-amber-600' : 'text-slate-600' },
          { labelKey: 'people_team_size' as const, value: staff.length, icon: UserCog, color: 'text-slate-600' },
        ].map(({ labelKey, value, icon: Icon, color }) => (
          <Card key={labelKey}><CardContent className="pt-4"><div className="flex items-center justify-between"><div><p className="text-xs text-slate-400">{t(labelKey)}</p><p className={`text-2xl font-bold ${color}`}>{value}</p></div><Icon className="w-6 h-6 text-slate-200" /></div></CardContent></Card>
        ))}
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {[{ id: 'team', label: `${t('people_team_label')} (${staff.length})` }, { id: 'pto', label: `${t('people_leave_requests')} (${ptoRequests.length})` }].map(({ id, label }) => (
          <button key={id} onClick={() => setSubTab(id as any)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${subTab === id ? 'border-cyan-600 text-cyan-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {subTab === 'team' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              {['all', 'driver', 'manager', 'cleaner', 'admin'].map(r => (
                <button key={r} onClick={() => setFilterRole(r)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterRole === r ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                  {r === 'all' ? t('people_all_roles') : r.charAt(0).toUpperCase() + r.slice(1) + 's'}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setShowInvite(true); setInviteResult(null) }}>
                <Send className="w-4 h-4 mr-1.5" /> Invite User
              </Button>
              <Button onClick={() => { setForm(EMPTY_STAFF); setEditingId(null); setShowForm(true) }}>
                <Plus className="w-4 h-4 mr-1.5" /> {t('people_add_staff')}
              </Button>
            </div>
          </div>

          {/* ── Invite Modal ── */}
          {showInvite && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowInvite(false)}>
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="px-6 pt-6 pb-4 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <h2 className="text-[17px] font-bold text-slate-900">Invite New User</h2>
                    <p className="text-[13px] text-slate-500 mt-0.5">They'll receive an email with their login credentials.</p>
                  </div>
                  <button onClick={() => setShowInvite(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="px-6 py-5 space-y-4">
                  <div>
                    <label className="block text-[13px] font-medium text-slate-700 mb-1.5">Full Name *</label>
                    <input
                      autoFocus
                      className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-[14px] outline-none focus:border-slate-400 transition-colors"
                      placeholder="e.g. John Smith"
                      value={inviteForm.name}
                      onChange={e => setInviteForm(f => ({ ...f, name: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-[13px] font-medium text-slate-700 mb-1.5">Email Address *</label>
                    <input
                      type="email"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-[14px] outline-none focus:border-slate-400 transition-colors"
                      placeholder="e.g. john@kembaliwater.com"
                      value={inviteForm.email}
                      onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[13px] font-medium text-slate-700 mb-1.5">Role</label>
                      <select
                        className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-[14px] outline-none focus:border-slate-400 bg-white transition-colors"
                        value={inviteForm.role}
                        onChange={e => setInviteForm(f => ({ ...f, role: e.target.value }))}
                      >
                        {['admin', 'manager', 'driver', 'cleaner', 'sales', 'staff'].map(r => (
                          <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[13px] font-medium text-slate-700 mb-1.5">Phone</label>
                      <input
                        className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-[14px] outline-none focus:border-slate-400 transition-colors"
                        placeholder="Optional"
                        value={inviteForm.phone}
                        onChange={e => setInviteForm(f => ({ ...f, phone: e.target.value }))}
                      />
                    </div>
                  </div>

                  {inviteResult && (
                    <div className={`rounded-lg px-4 py-3 text-[13px] leading-relaxed ${inviteResult.success ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                      {inviteResult.success && <span className="font-semibold">✓ </span>}
                      {inviteResult.message}
                    </div>
                  )}
                </div>
                <div className="px-6 pb-6 flex gap-3">
                  <button onClick={() => setShowInvite(false)}
                    className="flex-1 border border-slate-200 text-slate-700 text-[13px] font-medium rounded-xl py-2.5 hover:bg-slate-50 transition-colors">
                    {inviteResult?.success ? 'Close' : 'Cancel'}
                  </button>
                  {!inviteResult?.success && (
                    <button
                      onClick={handleInvite}
                      disabled={inviting || !inviteForm.name.trim() || !inviteForm.email.trim()}
                      className="flex-1 bg-slate-900 hover:bg-slate-700 text-white text-[13px] font-medium rounded-xl py-2.5 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {inviting ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</> : <><Send className="w-4 h-4" /> Send Invite</>}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {showForm && (
            <Card>
              <CardHeader><CardTitle className="text-sm">{editingId ? t('people_edit_staff') : t('people_add_new_staff')}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>{t('people_full_name')} *</Label><Input value={form.name ?? ''} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
                  <div><Label>{t('people_role')} *</Label><select className="w-full border rounded-md px-3 py-2 text-sm" value={form.role} onChange={e => setForm({ ...form, role: e.target.value as any })}>{['driver','cleaner','manager','admin','sales'].map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}</select></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>{t('people_phone')}</Label><Input value={form.phone ?? ''} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
                  <div><Label>{t('email')}</Label><Input type="email" value={form.email ?? ''} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div><Label>{t('people_employee_no')}</Label><Input value={form.employee_number ?? ''} onChange={e => setForm({ ...form, employee_number: e.target.value })} /></div>
                  <div><Label>{t('people_start_date')}</Label><Input type="date" value={form.start_date ?? ''} onChange={e => setForm({ ...form, start_date: e.target.value })} /></div>
                  <div><Label>{t('people_id_number')}</Label><Input value={form.id_number ?? ''} onChange={e => setForm({ ...form, id_number: e.target.value })} /></div>
                </div>
                {form.role === 'driver' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>{t('people_license')}</Label><Input value={form.license_number ?? ''} onChange={e => setForm({ ...form, license_number: e.target.value })} /></div>
                    <div><Label>{t('people_license_expiry')}</Label><Input type="date" value={form.license_expiry ?? ''} onChange={e => setForm({ ...form, license_expiry: e.target.value })} /></div>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-3">
                  <div><Label>{t('people_salary_type')}</Label><select className="w-full border rounded-md px-3 py-2 text-sm" value={form.salary_type ?? 'monthly'} onChange={e => setForm({ ...form, salary_type: e.target.value as any })}>{['monthly','daily','hourly'].map(st => <option key={st} value={st}>{st}</option>)}</select></div>
                  <div><Label>{t('people_salary_idr')}</Label><Input type="number" value={form.salary ?? ''} onChange={e => setForm({ ...form, salary: e.target.value ? Number(e.target.value) : undefined })} /></div>
                  <div><Label>{t('people_emergency')}</Label><Input value={form.emergency_contact ?? ''} onChange={e => setForm({ ...form, emergency_contact: e.target.value })} /></div>
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={!!form.active} onChange={e => setForm({ ...form, active: e.target.checked })} />{t('people_active_employee')}</label>
                <div className="flex gap-2">
                  <Button className="bg-cyan-600 hover:bg-cyan-700 flex-1" onClick={handleSave} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4 mr-1" />{editingId ? t('people_save_changes') : t('people_add_staff')}</>}</Button>
                  <Button variant="outline" onClick={() => { setShowForm(false); setEditingId(null) }}><X className="w-4 h-4" /></Button>
                </div>
              </CardContent>
            </Card>
          )}

          {loading && <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>}
          <div className="grid grid-cols-1 gap-3">
            {filtered.map(s => (
              <Card key={s.id} className={!s.active ? 'opacity-50' : ''}>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0"><UserCog className="w-5 h-5 text-slate-500" /></div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-800">{s.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[s.role] ?? 'bg-slate-100 text-slate-600'}`}>{s.role}</span>
                        {!s.active && <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{t('people_inactive')}</span>}
                      </div>
                      <div className="flex gap-4 mt-1 text-xs text-slate-400">
                        {s.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{s.phone}</span>}
                        {s.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{s.email}</span>}
                        {s.salary && <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" />{idr(s.salary)}/{s.salary_type}</span>}
                        {s.start_date && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{t('people_since')} {new Date(s.start_date).toLocaleDateString()}</span>}
                      </div>
                      {s.role === 'driver' && s.license_expiry && (
                        <span className={`text-xs ${new Date(s.license_expiry) < new Date() ? 'text-red-500' : 'text-slate-400'}`}>
                          {new Date(s.license_expiry) < new Date() ? t('people_license_expired') : t('people_license_expires')} {new Date(s.license_expiry).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => { setForm(s); setEditingId(s.id); setShowForm(true) }}><Edit2 className="w-3.5 h-3.5" /></Button>
                      <Button variant="outline" size="sm" onClick={() => router.push(`/hr/${s.id}`)}><ChevronRight className="w-3.5 h-3.5" /></Button>
                      <Button variant="outline" size="sm" className="text-red-500 hover:text-red-700 hover:border-red-300" onClick={() => handleDelete(s.id, s.name)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {filtered.length === 0 && !loading && <div className="text-center py-12 text-slate-400 text-sm"><Users className="w-8 h-8 mx-auto mb-2 text-slate-200" />{t('people_no_staff')}</div>}
          </div>
        </div>
      )}

      {subTab === 'pto' && (
        <div className="space-y-4">
          <div className="flex justify-end"><Button variant="outline" onClick={() => setShowPtoForm(true)}><Plus className="w-4 h-4 mr-1" /> {t('people_log_leave')}</Button></div>
          {showPtoForm && (
            <Card>
              <CardHeader><CardTitle className="text-sm">{t('people_new_leave_request')}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>{t('people_employee')} *</Label><select className="w-full border rounded-md px-3 py-2 text-sm" value={ptoForm.employee_id ?? ''} onChange={e => setPtoForm({ ...ptoForm, employee_id: e.target.value })}><option value="">{t('people_select_employee')}</option>{staff.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
                  <div><Label>{t('people_leave_type')} *</Label><select className="w-full border rounded-md px-3 py-2 text-sm" value={ptoForm.type} onChange={e => setPtoForm({ ...ptoForm, type: e.target.value as any })}>{['annual','sick','personal','unpaid','public_holiday'].map(lt => <option key={lt} value={lt}>{lt.replace('_', ' ')}</option>)}</select></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>{t('people_start_date')} *</Label><Input type="date" value={ptoForm.start_date ?? ''} onChange={e => setPtoForm({ ...ptoForm, start_date: e.target.value })} /></div>
                  <div><Label>{t('people_end_date')} *</Label><Input type="date" value={ptoForm.end_date ?? ''} onChange={e => setPtoForm({ ...ptoForm, end_date: e.target.value })} /></div>
                </div>
                <div><Label>{t('notes')}</Label><Input value={ptoForm.reason ?? ''} onChange={e => setPtoForm({ ...ptoForm, reason: e.target.value })} /></div>
                <div className="flex gap-2"><Button className="bg-cyan-600 hover:bg-cyan-700" onClick={handlePtoSubmit}>{t('submit')}</Button><Button variant="outline" onClick={() => setShowPtoForm(false)}>{t('cancel')}</Button></div>
              </CardContent>
            </Card>
          )}
          {ptoRequests.length === 0 ? <div className="text-center py-12 text-slate-400 text-sm"><Calendar className="w-8 h-8 mx-auto mb-2 text-slate-200" />{t('people_no_pto')}</div>
            : ptoRequests.map(p => {
              const employee = staff.find(s => s.id === p.employee_id)
              const days = p.start_date && p.end_date ? Math.ceil((new Date(p.end_date).getTime() - new Date(p.start_date).getTime()) / 86400000) + 1 : 0
              return (
                <Card key={p.id}><CardContent className="pt-3 pb-3">
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-700">{employee?.name ?? 'Unknown'}</span>
                        <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{p.type.replace('_', ' ')}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${p.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : p.status === 'rejected' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'}`}>{p.status}</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{new Date(p.start_date).toLocaleDateString()} – {new Date(p.end_date).toLocaleDateString()} ({days} day{days !== 1 ? 's' : ''}){p.reason && ` · ${p.reason}`}</p>
                    </div>
                    {p.status === 'pending' && (
                      <div className="flex gap-2">
                        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 h-8" onClick={() => handlePtoAction(p.id, 'approved')}><Check className="w-3.5 h-3.5 mr-1" />{t('people_approve')}</Button>
                        <Button size="sm" variant="outline" className="h-8 text-red-500" onClick={() => handlePtoAction(p.id, 'rejected')}><X className="w-3.5 h-3.5 mr-1" />{t('people_reject')}</Button>
                      </div>
                    )}
                  </div>
                </CardContent></Card>
              )
            })}
        </div>
      )}
    </div>
  )
}

// ─── TAB: ATTENDANCE ──────────────────────────────────────────────────────────
function AttendanceTab() {
  const { t } = useLanguage()
  const [staff, setStaff] = useState<any[]>([])
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [saving, setSaving] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'daily' | 'monthly'>('daily')
  const [monthFilter, setMonthFilter] = useState(new Date().toISOString().slice(0, 7))

  const load = useCallback(async () => {
    setLoading(true)
    const sb = createClient()
    const [staffRes, logsRes] = await Promise.all([
      sb.from('staff').select('id, name, role').eq('active', true).order('name'),
      viewMode === 'daily'
        ? sb.from('attendance_logs').select('*').eq('date', selectedDate)
        : sb.from('attendance_logs').select('*, staff:staff(name,role)').gte('date', `${monthFilter}-01`).lte('date', `${monthFilter}-31`).order('date', { ascending: false }),
    ])
    setStaff(staffRes.data ?? []); setLogs(logsRes.data ?? []); setLoading(false)
  }, [selectedDate, viewMode, monthFilter])

  useEffect(() => { load() }, [load])

  const markStatus = async (staffId: string, status: string) => {
    setSaving(staffId)
    const sb = createClient()
    const existing = logs.find(l => l.staff_id === staffId && l.date === selectedDate)
    const now = new Date().toISOString()
    if (existing) {
      const { data } = await sb.from('attendance_logs').update({ status, updated_at: now }).eq('id', existing.id).select().single()
      if (data) setLogs(prev => prev.map(l => l.id === existing.id ? data : l))
    } else {
      const { data } = await sb.from('attendance_logs').insert({ staff_id: staffId, date: selectedDate, status, clock_in: status === 'present' || status === 'late' ? now : null }).select().single()
      if (data) setLogs(prev => [...prev, data])
    }
    setSaving(null)
  }

  const clockOut = async (staffId: string) => {
    const log = logs.find(l => l.staff_id === staffId && l.date === selectedDate)
    if (!log) return
    setSaving(staffId)
    const sb = createClient()
    const now = new Date().toISOString()
    const hoursWorked = log.clock_in ? Math.round((Date.now() - new Date(log.clock_in).getTime()) / 3600000 * 10) / 10 : null
    const { data } = await sb.from('attendance_logs').update({ clock_out: now, hours_worked: hoursWorked }).eq('id', log.id).select().single()
    if (data) setLogs(prev => prev.map(l => l.id === log.id ? data : l))
    setSaving(null)
  }

  const presentCount = logs.filter(l => l.status === 'present').length
  const absentCount = logs.filter(l => l.status === 'absent').length
  const totalHours = logs.reduce((s, l) => s + Number(l.hours_worked ?? 0), 0)

  return (
    <div className="p-6 space-y-4">
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border p-4"><p className="text-xs text-slate-500">{t('people_present_today')}</p><p className="text-2xl font-bold text-emerald-600">{presentCount}</p></div>
        <div className="bg-white rounded-xl border p-4"><p className="text-xs text-slate-500">{t('people_absent')}</p><p className="text-2xl font-bold text-red-500">{absentCount}</p></div>
        <div className="bg-white rounded-xl border p-4"><p className="text-xs text-slate-500">{t('people_total_staff')}</p><p className="text-2xl font-bold text-slate-700">{staff.length}</p></div>
        <div className="bg-white rounded-xl border p-4"><p className="text-xs text-slate-500">{t('people_hours_logged')}</p><p className="text-2xl font-bold text-blue-600">{totalHours.toFixed(1)}h</p></div>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex rounded-lg border overflow-hidden">
          <button onClick={() => setViewMode('daily')} className={`px-3 py-1.5 text-sm font-medium ${viewMode === 'daily' ? 'bg-cyan-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{t('people_attendance_daily')}</button>
          <button onClick={() => setViewMode('monthly')} className={`px-3 py-1.5 text-sm font-medium ${viewMode === 'monthly' ? 'bg-cyan-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{t('people_attendance_monthly')}</button>
        </div>
        {viewMode === 'daily' ? <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="border rounded-lg px-3 py-1.5 text-sm" /> : <input type="month" value={monthFilter} onChange={e => setMonthFilter(e.target.value)} className="border rounded-lg px-3 py-1.5 text-sm" />}
      </div>
      <div className="bg-white rounded-xl border overflow-hidden">
        {loading ? <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div> : viewMode === 'daily' ? (
          <table className="w-full">
            <thead className="bg-slate-50 border-b"><tr><th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">{t('people_staff')}</th><th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">{t('people_role')}</th><th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">{t('status')}</th><th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">{t('people_check_in')}</th><th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">{t('people_check_out')}</th><th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">{t('people_hours')}</th><th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">{t('actions')}</th></tr></thead>
            <tbody className="divide-y divide-slate-50">
              {staff.map(s => {
                const log = logs.find(l => l.staff_id === s.id)
                const isSaving = saving === s.id
                return (
                  <tr key={s.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-medium text-slate-700">{s.name}</td>
                    <td className="px-4 py-3 text-slate-500 capitalize text-sm">{s.role}</td>
                    <td className="px-4 py-3">{log ? <Badge className={STATUS_COLORS[log.status] ?? ''}>{log.status}</Badge> : <span className="text-xs text-slate-300">{t('people_not_marked')}</span>}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">{log?.clock_in ? new Date(log.clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">{log?.clock_out ? new Date(log.clock_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-700">{log?.hours_worked ? `${log.hours_worked}h` : '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin text-slate-300" /> : (
                          <>
                            {(!log || log.status !== 'present') && <button onClick={() => markStatus(s.id, 'present')} className="text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-2 py-1 rounded-lg flex items-center gap-1"><UserCheck className="w-3 h-3" />{t('people_present')}</button>}
                            {(!log || log.status !== 'late') && <button onClick={() => markStatus(s.id, 'late')} className="text-xs bg-amber-50 hover:bg-amber-100 text-amber-700 px-2 py-1 rounded-lg">{t('people_late')}</button>}
                            {(!log || log.status !== 'absent') && <button onClick={() => markStatus(s.id, 'absent')} className="text-xs bg-red-50 hover:bg-red-100 text-red-600 px-2 py-1 rounded-lg flex items-center gap-1"><UserX className="w-3 h-3" />{t('people_absent')}</button>}
                            {(!log || log.status !== 'leave') && <button onClick={() => markStatus(s.id, 'leave')} className="text-xs bg-purple-50 hover:bg-purple-100 text-purple-700 px-2 py-1 rounded-lg">{t('people_on_leave')}</button>}
                            {log?.clock_in && !log?.clock_out && <button onClick={() => clockOut(s.id)} className="text-xs bg-slate-50 hover:bg-slate-100 text-slate-600 px-2 py-1 rounded-lg flex items-center gap-1"><Clock className="w-3 h-3" />{t('people_check_out')}</button>}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50 border-b"><tr><th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">{t('date')}</th><th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">{t('people_staff')}</th><th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">{t('status')}</th><th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">{t('people_check_in')}</th><th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">{t('people_check_out')}</th><th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">{t('people_hours')}</th></tr></thead>
            <tbody className="divide-y divide-slate-50">
              {logs.map(l => (
                <tr key={l.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3 text-sm text-slate-600">{l.date}</td>
                  <td className="px-4 py-3 font-medium text-slate-700">{(l.staff as any)?.name}</td>
                  <td className="px-4 py-3"><Badge className={STATUS_COLORS[l.status] ?? ''}>{l.status}</Badge></td>
                  <td className="px-4 py-3 text-sm text-slate-500">{l.clock_in ? new Date(l.clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">{l.clock_out ? new Date(l.clock_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                  <td className="px-4 py-3 text-sm font-medium">{l.hours_worked ? `${l.hours_worked}h` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ─── TAB: PERFORMANCE ─────────────────────────────────────────────────────────
function PerformanceTab() {
  const { t } = useLanguage()
  const [records, setRecords] = useState<any[]>([])
  const [staff, setStaff] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [autoCalcing, setAutoCalcing] = useState(false)
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7))
  const [form, setForm] = useState({ driver_id: '', period_date: new Date().toISOString().split('T')[0], deliveries_completed: 0, deliveries_failed: 0, on_time_rate: 0, bottles_delivered: 0, bottles_collected: 0, collection_rate: 0, customer_rating: '', incidents: 0, fuel_used: 0, km_driven: 0 })

  useEffect(() => { loadAll() }, [period])

  const loadAll = async () => {
    setLoading(true)
    const sb = createClient()
    const monthStart = `${period}-01`
    const monthEnd = new Date(parseInt(period.split('-')[0]), parseInt(period.split('-')[1]), 0).toISOString().split('T')[0]
    const [perfRes, staffRes] = await Promise.all([
      sb.from('driver_performance').select('*, driver:staff(name, role)').gte('period_date', monthStart).lte('period_date', monthEnd).order('period_date', { ascending: false }),
      sb.from('staff').select('id, name, role').eq('active', true),
    ])
    setRecords(perfRes.data ?? []); setStaff(staffRes.data ?? []); setLoading(false)
  }

  const saveRecord = async () => {
    if (!form.driver_id) return
    setSaving(true)
    const sb = createClient()
    const { data } = await sb.from('driver_performance').upsert({ driver_id: form.driver_id, period_date: form.period_date, deliveries_completed: form.deliveries_completed, deliveries_failed: form.deliveries_failed, on_time_rate: form.on_time_rate, bottles_delivered: form.bottles_delivered, bottles_collected: form.bottles_collected, collection_rate: form.bottles_delivered > 0 ? Math.round((form.bottles_collected / form.bottles_delivered) * 100) : 0, customer_rating: form.customer_rating ? Number(form.customer_rating) : null, incidents: form.incidents, fuel_used: form.fuel_used, km_driven: form.km_driven }, { onConflict: 'driver_id,period_date' }).select('*, driver:staff(name, role)').single()
    if (data) setRecords(prev => { const i = prev.findIndex(r => r.driver_id === data.driver_id && r.period_date === data.period_date); return i >= 0 ? prev.map((r, j) => j === i ? data : r) : [data, ...prev] })
    setShowForm(false); setSaving(false)
  }

  const autoCalculate = async () => {
    setAutoCalcing(true)
    const sb = createClient()
    const monthStart = `${period}-01`
    const monthEnd = new Date(parseInt(period.split('-')[0]), parseInt(period.split('-')[1]), 0).toISOString().split('T')[0]
    const { data: deliveries } = await sb.from('deliveries').select('driver_id, status, delivered_350ml, delivered_750ml, collected_350ml, collected_750ml').gte('delivery_date', monthStart).lte('delivery_date', monthEnd).not('driver_id', 'is', null)
    const byDriver: Record<string, any> = {}
    for (const d of (deliveries ?? [])) {
      if (!byDriver[d.driver_id]) byDriver[d.driver_id] = { completed: 0, failed: 0, del350: 0, del750: 0, col350: 0, col750: 0 }
      if (d.status === 'completed') { byDriver[d.driver_id].completed++; byDriver[d.driver_id].del350 += d.delivered_350ml ?? 0; byDriver[d.driver_id].del750 += d.delivered_750ml ?? 0; byDriver[d.driver_id].col350 += d.collected_350ml ?? 0; byDriver[d.driver_id].col750 += d.collected_750ml ?? 0 }
      else if (d.status === 'failed') byDriver[d.driver_id].failed++
    }
    for (const [driverId, t] of Object.entries(byDriver)) {
      const bd = t.del350 + t.del750; const bc = t.col350 + t.col750
      await sb.from('driver_performance').upsert({ driver_id: driverId, period_date: monthStart, deliveries_completed: t.completed, deliveries_failed: t.failed, bottles_delivered: bd, bottles_collected: bc, collection_rate: bd > 0 ? Math.round((bc / bd) * 100) : 0 }, { onConflict: 'driver_id,period_date' })
    }
    await loadAll(); setAutoCalcing(false)
    alert(`Auto-calculated for ${Object.keys(byDriver).length} drivers.`)
  }

  const driverSummary = staff.map(s => {
    const dr = records.filter(r => r.driver_id === s.id)
    return { ...s, records: dr, total_deliveries: dr.reduce((sum, r) => sum + (r.deliveries_completed ?? 0), 0), total_failed: dr.reduce((sum, r) => sum + (r.deliveries_failed ?? 0), 0), avg_on_time: dr.length > 0 ? Math.round(dr.reduce((sum, r) => sum + (r.on_time_rate ?? 0), 0) / dr.length) : 0, avg_collection: dr.length > 0 ? Math.round(dr.reduce((sum, r) => sum + (r.collection_rate ?? 0), 0) / dr.length) : 0, avg_rating: dr.filter(r => r.customer_rating).length > 0 ? (dr.reduce((sum, r) => sum + (r.customer_rating ?? 0), 0) / dr.filter(r => r.customer_rating).length).toFixed(1) : null, total_incidents: dr.reduce((sum, r) => sum + (r.incidents ?? 0), 0), total_km: dr.reduce((sum, r) => sum + (r.km_driven ?? 0), 0) }
  })

  const ScoreBadge = ({ value, threshold, label }: { value: number; threshold: number; label: string }) => (
    <div className={`text-center p-2 rounded-xl ${value >= threshold ? 'bg-emerald-50' : value >= threshold * 0.7 ? 'bg-amber-50' : 'bg-red-50'}`}>
      <p className={`text-lg font-bold ${value >= threshold ? 'text-emerald-700' : value >= threshold * 0.7 ? 'text-amber-700' : 'text-red-600'}`}>{value}%</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  )

  return (
    <div className="p-6 max-w-6xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2"><label className="text-sm text-slate-600">{t('people_period')}:</label><input type="month" className="border border-slate-200 rounded-lg px-3 py-2 text-sm" value={period} onChange={e => setPeriod(e.target.value)} /></div>
        <div className="flex-1" />
        <button onClick={autoCalculate} disabled={autoCalcing} className="flex items-center gap-2 border border-violet-200 bg-violet-50 hover:bg-violet-100 text-violet-700 px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50">{autoCalcing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}{t('people_calc_performance')}</button>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-xl text-sm font-medium"><Plus className="w-4 h-4" />{t('people_log_performance')}</button>
      </div>

      {showForm && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
          <h3 className="font-semibold text-slate-800">{t('people_log_driver_performance')}</h3>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="text-xs font-medium text-slate-600 block mb-1">{t('dispatch_driver')} *</label><select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={form.driver_id} onChange={e => setForm({ ...form, driver_id: e.target.value })}><option value="">{t('dispatch_select_driver')}</option>{staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            <div><label className="text-xs font-medium text-slate-600 block mb-1">{t('people_period_date')}</label><input type="date" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={form.period_date} onChange={e => setForm({ ...form, period_date: e.target.value })} /></div>
            <div><label className="text-xs font-medium text-slate-600 block mb-1">{t('people_customer_rating')}</label><input type="number" min="1" max="5" step="0.1" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={form.customer_rating} onChange={e => setForm({ ...form, customer_rating: e.target.value })} /></div>
            <div><label className="text-xs font-medium text-slate-600 block mb-1">{t('people_deliveries_completed')}</label><input type="number" min="0" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={form.deliveries_completed} onChange={e => setForm({ ...form, deliveries_completed: Number(e.target.value) })} /></div>
            <div><label className="text-xs font-medium text-slate-600 block mb-1">{t('people_deliveries_failed')}</label><input type="number" min="0" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={form.deliveries_failed} onChange={e => setForm({ ...form, deliveries_failed: Number(e.target.value) })} /></div>
            <div><label className="text-xs font-medium text-slate-600 block mb-1">{t('people_on_time_rate')}</label><input type="number" min="0" max="100" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={form.on_time_rate} onChange={e => setForm({ ...form, on_time_rate: Number(e.target.value) })} /></div>
          </div>
          <div className="flex gap-2">
            <button onClick={saveRecord} disabled={saving || !form.driver_id} className="flex-1 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-2">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" />{t('people_save_record')}</>}</button>
            <button onClick={() => setShowForm(false)} className="border border-slate-200 px-4 py-2 rounded-xl text-sm hover:bg-slate-50"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {loading ? <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div> : (
        <div className="space-y-4">
          {driverSummary.filter(d => d.records.length > 0).length === 0 ? (
            <div className="text-center py-16 text-slate-400 bg-white border border-slate-100 rounded-2xl"><BarChart3 className="w-10 h-10 mx-auto mb-3 text-slate-200" /><p className="font-medium">{t('people_no_performance')}</p><p className="text-sm mt-1">{t('people_no_performance_hint')}</p></div>
          ) : driverSummary.filter(d => d.records.length > 0).map(driver => (
            <div key={driver.id} className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-5 py-4 flex items-center gap-4 border-b border-slate-100">
                <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0"><User className="w-5 h-5 text-slate-500" /></div>
                <div className="flex-1"><p className="font-semibold text-slate-800">{driver.name}</p><p className="text-xs text-slate-400 capitalize">{driver.role}</p></div>
                {driver.avg_rating && <div className="flex items-center gap-1"><Star className="w-4 h-4 text-amber-400 fill-amber-400" /><span className="font-bold text-slate-800">{driver.avg_rating}</span><span className="text-xs text-slate-400">/5</span></div>}
                {driver.total_incidents > 0 && <span className="flex items-center gap-1 text-xs bg-red-100 text-red-600 px-2 py-1 rounded-full"><AlertTriangle className="w-3 h-3" />{driver.total_incidents} incident{driver.total_incidents > 1 ? 's' : ''}</span>}
              </div>
              <div className="p-4 grid grid-cols-5 gap-3">
                <div className="text-center p-2 bg-slate-50 rounded-xl"><p className="text-xl font-bold text-slate-800">{driver.total_deliveries}</p><p className="text-xs text-slate-400">{t('people_deliveries')}</p></div>
                <div className={`text-center p-2 rounded-xl ${driver.total_failed > 0 ? 'bg-red-50' : 'bg-emerald-50'}`}><p className={`text-xl font-bold ${driver.total_failed > 0 ? 'text-red-600' : 'text-emerald-700'}`}>{driver.total_failed}</p><p className="text-xs text-slate-400">{t('failed')}</p></div>
                <ScoreBadge value={driver.avg_on_time} threshold={90} label={t('people_on_time_pct')} />
                <ScoreBadge value={driver.avg_collection} threshold={92} label={t('people_collection_pct')} />
                <div className="text-center p-2 bg-slate-50 rounded-xl"><p className="text-xl font-bold text-slate-800">{driver.total_km.toFixed(0)}</p><p className="text-xs text-slate-400">{t('people_km_driven')}</p></div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── MAIN PAGE ─────────────────────────────────────────────────────────────────
const TAB_KEYS_PEOPLE = [
  { id: 'team' as MainTab, labelKey: 'people_team' as const, icon: Users },
  { id: 'attendance' as MainTab, labelKey: 'people_attendance' as const, icon: Clock },
  { id: 'performance' as MainTab, labelKey: 'people_performance' as const, icon: BarChart3 },
]

export default function PeoplePage() {
  const { t } = useLanguage()
  const [tab, setTab] = useState<MainTab>('team')
  return (
    <>
      <Topbar title="people_title" titleIsKey />
      <div className="bg-white border-b border-slate-200 px-6">
        <div className="flex gap-1">
          {TAB_KEYS_PEOPLE.map(({ id, labelKey, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${tab === id ? 'border-cyan-600 text-cyan-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
              <Icon className="w-4 h-4" />{t(labelKey)}
            </button>
          ))}
        </div>
      </div>
      {tab === 'team' && <TeamTab />}
      {tab === 'attendance' && <AttendanceTab />}
      {tab === 'performance' && <PerformanceTab />}
    </>
  )
}
