'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Topbar } from '@/components/layout/topbar'
import { createClient } from '@/lib/supabase/client'
import { idr } from '@/lib/format'
import {
  TrendingUp, Plus, Check, X, Loader2, Phone, Mail, MapPin,
  ArrowRight, Users, DollarSign, Target, Star, MessageSquare,
  Calendar, Video, FileText, Activity, ChevronRight, Edit2, Building2, User
} from 'lucide-react'

const STAGES = ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost'] as const
type Stage = typeof STAGES[number]

const STAGE_CONFIG: Record<string, { color: string; next?: Stage }> = {
  new: { color: 'bg-slate-100 text-slate-600', next: 'contacted' },
  contacted: { color: 'bg-blue-100 text-blue-700', next: 'qualified' },
  qualified: { color: 'bg-purple-100 text-purple-700', next: 'proposal' },
  proposal: { color: 'bg-amber-100 text-amber-700', next: 'negotiation' },
  negotiation: { color: 'bg-orange-100 text-orange-700', next: 'won' },
  won: { color: 'bg-emerald-100 text-emerald-700' },
  lost: { color: 'bg-red-100 text-red-600' },
}

const ACTIVITY_ICONS: Record<string, React.ElementType> = {
  call: Phone,
  email: Mail,
  whatsapp: MessageSquare,
  meeting: Users,
  site_visit: MapPin,
  proposal_sent: FileText,
  follow_up: Activity,
  note: FileText,
}

const ACTIVITY_COLORS: Record<string, string> = {
  call: 'bg-blue-100 text-blue-600',
  email: 'bg-violet-100 text-violet-600',
  whatsapp: 'bg-emerald-100 text-emerald-600',
  meeting: 'bg-cyan-100 text-cyan-600',
  site_visit: 'bg-amber-100 text-amber-600',
  proposal_sent: 'bg-orange-100 text-orange-600',
  follow_up: 'bg-slate-100 text-slate-600',
  note: 'bg-slate-100 text-slate-500',
}

const EMPTY_LEAD = { status: 'new' as Stage, type: 'business', probability: 50 }

export default function CRMPage() {
  const router = useRouter()
  const [leads, setLeads] = useState<any[]>([])
  const [staff, setStaff] = useState<any[]>([])
  const [activities, setActivities] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<any>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<any>(EMPTY_LEAD)
  const [saving, setSaving] = useState(false)
  const [converting, setConverting] = useState(false)
  const [filterStage, setFilterStage] = useState('active')
  const [filterAE, setFilterAE] = useState('all')
  const [search, setSearch] = useState('')
  const [activityForm, setActivityForm] = useState({ type: 'call', summary: '', outcome: '' })
  const [savingActivity, setSavingActivity] = useState(false)
  // Current user's staff record (for AE restriction)
  const [myStaff, setMyStaff] = useState<{ id: string; crm_role: string; name: string } | null>(null)

  useEffect(() => { loadAll() }, [])
  useEffect(() => { if (selected) loadActivities(selected.id) }, [selected])

  const loadAll = async () => {
    setLoading(true)
    const sb = createClient()
    const { data: { user } } = await sb.auth.getUser()

    const [leadsRes, staffRes, myStaffRes] = await Promise.all([
      sb.from('leads').select('*').order('created_at', { ascending: false }),
      sb.from('staff').select('id, name, crm_role').eq('active', true).order('name'),
      user ? sb.from('staff').select('id, name, crm_role').eq('auth_user_id', user.id).single() : Promise.resolve({ data: null }),
    ])

    const me = (myStaffRes as any).data as { id: string; crm_role: string; name: string } | null
    setMyStaff(me)
    setStaff(staffRes.data ?? [])

    // AEs can only see leads assigned to them
    let allLeads = leadsRes.data ?? []
    if (me && me.crm_role === 'ae') {
      allLeads = allLeads.filter((l: any) => l.assigned_to === me.id)
    }
    setLeads(allLeads)
    setLoading(false)
  }

  const loadActivities = async (leadId: string) => {
    const sb = createClient()
    const { data } = await sb.from('lead_activities')
      .select('*, creator:staff!created_by(name)')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
    setActivities(data ?? [])
  }

  const saveLead = async () => {
    if (!form.name) return
    setShowForm(false)
    const sb = createClient()
    if (editingId) {
      setLeads(leads.map(l => l.id === editingId ? { ...l, ...form } : l))
      if (selected?.id === editingId) setSelected((s: any) => ({ ...s, ...form }))
      sb.from('leads').update(form).eq('id', editingId)
    } else {
      const optimistic = { id: `tmp-${Date.now()}`, ...form, created_at: new Date().toISOString() }
      setLeads([optimistic as any, ...leads])
      const { data } = await sb.from('leads').insert(form).select().single()
      if (data) setLeads(prev => prev.map(l => l.id === optimistic.id ? data : l))
    }
    setEditingId(null)
    setForm(EMPTY_LEAD)
  }

  const updateStage = (leadId: string, status: Stage) => {
    setLeads(leads.map(l => l.id === leadId ? { ...l, status } : l))
    if (selected?.id === leadId) setSelected((s: any) => ({ ...s, status }))
    const sb = createClient()
    sb.from('leads').update({ status }).eq('id', leadId)
  }

  const logActivity = async () => {
    if (!selected || !activityForm.summary) return
    const optimistic = {
      id: `tmp-${Date.now()}`,
      lead_id: selected.id,
      type: activityForm.type,
      summary: activityForm.summary,
      outcome: activityForm.outcome || null,
      creator: null,
      created_at: new Date().toISOString(),
    }
    setActivities([optimistic as any, ...activities])
    setActivityForm({ type: 'call', summary: '', outcome: '' })
    const sb = createClient()
    const { data } = await sb.from('lead_activities').insert({
      lead_id: selected.id,
      type: activityForm.type,
      summary: activityForm.summary,
      outcome: activityForm.outcome || null,
    }).select('*, creator:staff!created_by(name)').single()
    if (data) setActivities(prev => prev.map(a => a.id === optimistic.id ? data : a))
  }

  const convertLead = async () => {
    if (!selected) return
    if (!confirm(`Convert "${selected.name}" to a customer? A new customer record will be created.`)) return
    setConverting(true)
    const sb = createClient()
    const { data: customer } = await sb.from('customers').insert({
      name: selected.name,
      type: selected.type === 'hotel' || selected.type === 'resort' || selected.type === 'restaurant' ? selected.type : 'business',
      contact_name: selected.contact_name,
      contact_phone: selected.contact_phone,
      contact_email: selected.contact_email,
      city: selected.city ?? 'Bali',
      address: selected.address ?? selected.city ?? 'Bali',
      status: 'active',
    }).select().single()
    if (customer) {
      await sb.from('leads').update({ status: 'won', converted_customer_id: customer.id }).eq('id', selected.id)
      setLeads(leads.map(l => l.id === selected.id ? { ...l, status: 'won', converted_customer_id: customer.id } : l))
      setSelected((l: any) => ({ ...l, status: 'won', converted_customer_id: customer.id }))
      alert(`✅ Converted to customer! Redirecting to customer record.`)
      router.push(`/customers/${customer.id}`)
    }
    setConverting(false)
  }

  const filtered = leads.filter(l => {
    if (filterStage === 'active') return !['won', 'lost'].includes(l.status)
    if (filterStage !== 'all') return l.status === filterStage
    return true
  }).filter(l => !search || l.name?.toLowerCase().includes(search.toLowerCase()) || l.contact_name?.toLowerCase().includes(search.toLowerCase()))
  .filter(l => {
    // Managers can filter by AE; AEs always see only their own (enforced in loadAll)
    if (filterAE === 'all') return true
    return l.assigned_to === filterAE
  })

  const pipeline = leads.filter(l => !['won', 'lost'].includes(l.status))
  const pipelineValue = pipeline.reduce((s, l) => s + Number(l.estimated_monthly_value ?? 0) * 12 * (l.probability ?? 50) / 100, 0)
  const wonCount = leads.filter(l => l.status === 'won').length

  const fmtTime = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })

  return (
    <>
      <Topbar title="CRM & Sales Pipeline" />
      <div className="flex h-[calc(100vh-57px)]">
        {/* Left panel — leads list */}
        <div className="w-80 border-r border-slate-200 bg-white flex flex-col flex-shrink-0">
          {/* Stats strip */}
          <div className="grid grid-cols-3 gap-2 p-3 border-b border-slate-100">
            <div className="bg-slate-50 rounded-xl p-2 text-center">
              <p className="text-lg font-bold text-slate-700">{pipeline.length}</p>
              <p className="text-xs text-slate-400">Active</p>
            </div>
            <div className="bg-emerald-50 rounded-xl p-2 text-center">
              <p className="text-lg font-bold text-emerald-600">{wonCount}</p>
              <p className="text-xs text-emerald-400">Won</p>
            </div>
            <div className="bg-cyan-50 rounded-xl p-2 text-center">
              <p className="text-xs font-bold text-cyan-600">{idr(pipelineValue)}</p>
              <p className="text-xs text-cyan-400">Pipeline</p>
            </div>
          </div>

          {/* AE role badge */}
          {myStaff?.crm_role === 'ae' && (
            <div className="px-3 py-2 border-b border-slate-100">
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 text-xs text-amber-700 flex items-center gap-2">
                <Users className="w-3.5 h-3.5" />
                Showing your assigned leads only
              </div>
            </div>
          )}

          {/* Search + filter */}
          <div className="px-3 py-2 space-y-2 border-b border-slate-100">
            <input className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-400"
              placeholder="Search leads..." value={search} onChange={e => setSearch(e.target.value)} />
            <div className="flex gap-1 flex-wrap">
              {['active', 'all', ...STAGES].map(s => (
                <button key={s} onClick={() => setFilterStage(s)}
                  className={`px-2 py-0.5 rounded-md text-xs font-medium capitalize transition-colors ${filterStage === s ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                  {s === 'active' ? 'Active' : s === 'all' ? 'All' : s}
                </button>
              ))}
            </div>
            {/* Managers can filter by AE */}
            {(!myStaff || myStaff.crm_role !== 'ae') && (
              <select className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none"
                value={filterAE} onChange={e => setFilterAE(e.target.value)}>
                <option value="all">All Account Executives</option>
                {staff.filter((s: any) => s.crm_role === 'ae' || !s.crm_role).map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Add button */}
          <div className="px-3 py-2 border-b border-slate-100">
            <button onClick={() => { setForm(EMPTY_LEAD); setEditingId(null); setShowForm(true) }}
              className="w-full flex items-center justify-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white py-2 rounded-xl text-sm font-medium transition-colors">
              <Plus className="w-4 h-4" /> Add Lead
            </button>
          </div>

          {/* Lead list */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Target className="w-8 h-8 mx-auto mb-2 text-slate-200" />
                <p className="text-sm">No leads found</p>
              </div>
            ) : filtered.map(lead => {
              const cfg = STAGE_CONFIG[lead.status] ?? STAGE_CONFIG.new
              return (
                <button key={lead.id} onClick={() => setSelected(lead)}
                  className={`w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors ${selected?.id === lead.id ? 'bg-cyan-50 border-l-2 border-l-cyan-500' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-800 text-sm truncate">{lead.name}</p>
                      <p className="text-xs text-slate-400 mt-0.5 truncate">{lead.contact_name} · {lead.city}</p>
                    </div>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${cfg.color}`}>{lead.status}</span>
                  </div>
                  {lead.estimated_monthly_value > 0 && (
                    <p className="text-xs text-cyan-600 mt-1">{idr(lead.estimated_monthly_value)}/mo · {lead.probability}%</p>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Right panel — lead detail */}
        <div className="flex-1 overflow-y-auto bg-slate-50">
          {showForm ? (
            <div className="p-6 max-w-2xl space-y-4">
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
                <h2 className="font-bold text-slate-800">{editingId ? 'Edit Lead' : 'New Lead'}</h2>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="text-xs font-medium text-slate-600 block mb-1">Business Name *</label>
                    <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                      value={form.name ?? ''} onChange={e => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">Type</label>
                    <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                      value={form.type ?? 'business'} onChange={e => setForm({ ...form, type: e.target.value })}>
                      {['hotel', 'restaurant', 'resort', 'cafe', 'office', 'business', 'other'].map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">Stage</label>
                    <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                      value={form.status ?? 'new'} onChange={e => setForm({ ...form, status: e.target.value })}>
                      {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">Contact Name</label>
                    <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                      value={form.contact_name ?? ''} onChange={e => setForm({ ...form, contact_name: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">Phone / WhatsApp</label>
                    <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                      value={form.contact_phone ?? ''} onChange={e => setForm({ ...form, contact_phone: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">Email</label>
                    <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                      value={form.contact_email ?? ''} onChange={e => setForm({ ...form, contact_email: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">City</label>
                    <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                      value={form.city ?? 'Bali'} onChange={e => setForm({ ...form, city: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">Est. Monthly Value (IDR)</label>
                    <input type="number" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                      value={form.estimated_monthly_value ?? ''} onChange={e => setForm({ ...form, estimated_monthly_value: Number(e.target.value) })} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">Probability (%)</label>
                    <input type="number" min="0" max="100" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                      value={form.probability ?? 50} onChange={e => setForm({ ...form, probability: Number(e.target.value) })} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">Source</label>
                    <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                      value={form.source ?? ''} onChange={e => setForm({ ...form, source: e.target.value || null })}>
                      <option value="">Unknown</option>
                      {['referral', 'cold_call', 'walk_in', 'social', 'website', 'partner', 'other'].map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-medium text-slate-600 block mb-1">Assign To (AE)</label>
                    <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                      value={form.assigned_to ?? ''} onChange={e => setForm({ ...form, assigned_to: e.target.value || null })}>
                      <option value="">— Unassigned —</option>
                      {staff.filter((s: any) => s.crm_role === 'ae' || s.crm_role === 'manager').map((s: any) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">Notes</label>
                    <textarea className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none" rows={3}
                      value={form.notes ?? ''} onChange={e => setForm({ ...form, notes: e.target.value })} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={saveLead} disabled={saving || !form.name}
                    className="flex-1 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" />{editingId ? 'Save Changes' : 'Add Lead'}</>}
                  </button>
                  <button onClick={() => { setShowForm(false); setEditingId(null) }} className="border border-slate-200 px-4 py-2.5 rounded-xl text-sm hover:bg-slate-50"><X className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          ) : !selected ? (
            <div className="flex items-center justify-center h-full text-slate-400">
              <div className="text-center">
                <Target className="w-12 h-12 mx-auto mb-3 text-slate-200" />
                <p className="font-medium">Select a lead to view details</p>
              </div>
            </div>
          ) : (
            <div className="p-6 space-y-4 max-w-2xl">
              {/* Lead header */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h2 className="text-xl font-bold text-slate-800">{selected.name}</h2>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-400 flex-wrap">
                      <span className="capitalize">{selected.type}</span>
                      {selected.city && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{selected.city}</span>}
                      {selected.source && <span>via {selected.source.replace('_', ' ')}</span>}
                    </div>
                    <div className="flex gap-2 mt-2 flex-wrap">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium capitalize ${STAGE_CONFIG[selected.status]?.color ?? 'bg-slate-100 text-slate-600'}`}>{selected.status}</span>
                      {selected.estimated_monthly_value > 0 && (
                        <span className="text-xs bg-cyan-50 text-cyan-700 px-2 py-1 rounded-full">
                          {idr(selected.estimated_monthly_value)}/mo · {selected.probability}% likely
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={() => { setForm(selected); setEditingId(selected.id); setShowForm(true) }}
                      className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
                      <Edit2 className="w-4 h-4 text-slate-500" />
                    </button>
                  </div>
                </div>

                {/* Contact info */}
                <div className="flex gap-4 mt-3 pt-3 border-t border-slate-100 text-sm text-slate-600 flex-wrap">
                  {selected.contact_name && <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5 text-slate-400" />{selected.contact_name}</span>}
                  {selected.contact_phone && <a href={`tel:${selected.contact_phone}`} className="flex items-center gap-1 hover:text-cyan-600"><Phone className="w-3.5 h-3.5 text-slate-400" />{selected.contact_phone}</a>}
                  {selected.contact_email && <a href={`mailto:${selected.contact_email}`} className="flex items-center gap-1 hover:text-cyan-600"><Mail className="w-3.5 h-3.5 text-slate-400" />{selected.contact_email}</a>}
                </div>

                {selected.assigned_to && (
                  <p className="text-xs text-slate-400 mt-2 flex items-center gap-1">
                    <User className="w-3 h-3" /> AE: {staff.find((s: any) => s.id === selected.assigned_to)?.name ?? 'Unknown'}
                  </p>
                )}
                {selected.notes && <p className="text-sm text-slate-500 mt-3 bg-slate-50 rounded-xl px-3 py-2">{selected.notes}</p>}

                {/* Stage progression */}
                {!['won', 'lost'].includes(selected.status) && (
                  <div className="mt-4 flex gap-2 flex-wrap">
                    {STAGES.filter(s => !['won', 'lost'].includes(s)).map(s => (
                      <button key={s} onClick={() => updateStage(selected.id, s)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${selected.status === s ? STAGE_CONFIG[s].color + ' ring-2 ring-offset-1 ring-current' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                        {s}
                      </button>
                    ))}
                    <button onClick={() => updateStage(selected.id, 'lost')}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-500 hover:bg-red-100 transition-colors">
                      Mark Lost
                    </button>
                  </div>
                )}

                {/* Convert button */}
                {selected.status !== 'won' && !selected.converted_customer_id && (
                  <button onClick={convertLead} disabled={converting}
                    className="mt-3 w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors">
                    {converting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><ArrowRight className="w-4 h-4" />Convert to Customer</>}
                  </button>
                )}
                {selected.converted_customer_id && (
                  <button onClick={() => router.push(`/customers/${selected.converted_customer_id}`)}
                    className="mt-3 w-full flex items-center justify-center gap-2 bg-cyan-50 hover:bg-cyan-100 text-cyan-700 py-2.5 rounded-xl text-sm font-medium transition-colors">
                    <ChevronRight className="w-4 h-4" />View Customer Record
                  </button>
                )}
              </div>

              {/* Log activity */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <h3 className="font-semibold text-slate-800 mb-3">Log Activity</h3>
                <div className="flex gap-2 flex-wrap mb-3">
                  {Object.keys(ACTIVITY_ICONS).map(t => {
                    const Icon = ACTIVITY_ICONS[t]
                    return (
                      <button key={t} onClick={() => setActivityForm({ ...activityForm, type: t })}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${activityForm.type === t ? ACTIVITY_COLORS[t] + ' ring-1 ring-current' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                        <Icon className="w-3 h-3" />{t.replace('_', ' ')}
                      </button>
                    )
                  })}
                </div>
                <textarea className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-cyan-400" rows={2}
                  placeholder="Summary of interaction..." value={activityForm.summary}
                  onChange={e => setActivityForm({ ...activityForm, summary: e.target.value })} />
                <input className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm mt-2 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                  placeholder="Outcome / next steps..." value={activityForm.outcome}
                  onChange={e => setActivityForm({ ...activityForm, outcome: e.target.value })} />
                <button onClick={logActivity} disabled={savingActivity || !activityForm.summary}
                  className="mt-2 flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white px-4 py-2 rounded-xl text-xs font-medium transition-colors">
                  {savingActivity ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Check className="w-3.5 h-3.5" />Log Activity</>}
                </button>
              </div>

              {/* Activity timeline */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <h3 className="font-semibold text-slate-800 mb-4">Activity Timeline</h3>
                {activities.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-4">No activities yet — log the first interaction above</p>
                ) : (
                  <div className="space-y-3">
                    {activities.map(a => {
                      const Icon = ACTIVITY_ICONS[a.type] ?? Activity
                      return (
                        <div key={a.id} className="flex gap-3">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${ACTIVITY_COLORS[a.type] ?? 'bg-slate-100 text-slate-500'}`}>
                            <Icon className="w-3.5 h-3.5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-medium text-slate-800">{a.summary}</p>
                              <span className="text-xs text-slate-400">{fmtTime(a.created_at)}</span>
                            </div>
                            {a.outcome && <p className="text-xs text-slate-500 mt-0.5 bg-slate-50 rounded-lg px-2 py-1">{a.outcome}</p>}
                            {a.creator?.name && <p className="text-xs text-slate-400 mt-0.5">by {a.creator.name}</p>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
