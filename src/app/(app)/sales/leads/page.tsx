'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Topbar } from '@/components/layout/topbar'
import { Plus, X, ChevronDown, Phone, Mail, MapPin, DollarSign, Calendar, Search, Filter, Building2, Edit2, Trash2, MoreVertical } from 'lucide-react'
import { cn } from '@/lib/utils'

const STAGES = [
  { key: 'prospect', label: 'Prospect', color: '#94A3B8', bg: '#F1F5F9' },
  { key: 'contacted', label: 'Contacted', color: '#60A5FA', bg: '#EFF6FF' },
  { key: 'meeting', label: 'Meeting Set', color: '#A78BFA', bg: '#F5F3FF' },
  { key: 'proposal', label: 'Proposal Sent', color: '#F59E0B', bg: '#FFFBEB' },
  { key: 'negotiation', label: 'Negotiation', color: '#F97316', bg: '#FFF7ED' },
  { key: 'closed_won', label: 'Closed Won', color: '#10B981', bg: '#ECFDF5' },
  { key: 'closed_lost', label: 'Closed Lost', color: '#EF4444', bg: '#FEF2F2' },
]

const SOURCES = ['Cold Call', 'Walk-in', 'Referral', 'Social Media', 'Website', 'Event', 'Other']
const INDUSTRIES = ['Restaurant', 'Hotel', 'Office', 'Retail', 'Healthcare', 'Education', 'Other']

type Lead = {
  id: string
  company_name: string
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  address: string | null
  stage: string
  source: string | null
  industry: string | null
  estimated_value: number
  notes: string | null
  last_contacted_at: string | null
  next_follow_up: string | null
  created_at: string
}

const EMPTY_LEAD = {
  company_name: '',
  contact_name: '',
  contact_email: '',
  contact_phone: '',
  address: '',
  stage: 'prospect',
  source: '',
  industry: '',
  estimated_value: 0,
  notes: '',
  next_follow_up: '',
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStage, setFilterStage] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editLead, setEditLead] = useState<Lead | null>(null)
  const [form, setForm] = useState({ ...EMPTY_LEAD })
  const [saving, setSaving] = useState(false)
  const [detailLead, setDetailLead] = useState<Lead | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)
  const sb = createClient()

  const load = async () => {
    const { data } = await sb.from('sales_leads').select('*').order('created_at', { ascending: false })
    setLeads(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const openNew = () => { setForm({ ...EMPTY_LEAD }); setEditLead(null); setShowForm(true) }
  const openEdit = (lead: Lead) => {
    setForm({
      company_name: lead.company_name,
      contact_name: lead.contact_name ?? '',
      contact_email: lead.contact_email ?? '',
      contact_phone: lead.contact_phone ?? '',
      address: lead.address ?? '',
      stage: lead.stage,
      source: lead.source ?? '',
      industry: lead.industry ?? '',
      estimated_value: lead.estimated_value ?? 0,
      notes: lead.notes ?? '',
      next_follow_up: lead.next_follow_up ?? '',
    })
    setEditLead(lead)
    setShowForm(true)
  }

  const save = async () => {
    if (!form.company_name.trim()) return
    setSaving(true)
    const payload = {
      company_name: form.company_name.trim(),
      contact_name: form.contact_name || null,
      contact_email: form.contact_email || null,
      contact_phone: form.contact_phone || null,
      address: form.address || null,
      stage: form.stage,
      source: form.source || null,
      industry: form.industry || null,
      estimated_value: Number(form.estimated_value) || 0,
      notes: form.notes || null,
      next_follow_up: form.next_follow_up || null,
      updated_at: new Date().toISOString(),
    }
    if (editLead) {
      await sb.from('sales_leads').update(payload).eq('id', editLead.id)
    } else {
      await sb.from('sales_leads').insert(payload)
    }
    await load()
    setShowForm(false)
    setSaving(false)
  }

  const deleteLead = async (id: string) => {
    if (!confirm('Delete this lead?')) return
    await sb.from('sales_leads').delete().eq('id', id)
    setDetailLead(null)
    await load()
  }

  const moveStage = async (id: string, stage: string) => {
    await sb.from('sales_leads').update({ stage, updated_at: new Date().toISOString() }).eq('id', id)
    setLeads(prev => prev.map(l => l.id === id ? { ...l, stage } : l))
  }

  const handleDrop = async (e: React.DragEvent, stage: string) => {
    e.preventDefault()
    if (dragging && dragging !== stage) {
      const lead = leads.find(l => l.id === dragging.split('::')[0])
      if (lead) await moveStage(lead.id, stage)
    }
    setDragging(null)
    setDragOver(null)
  }

  const filtered = leads.filter(l => {
    const q = search.toLowerCase()
    const matchSearch = !q || l.company_name.toLowerCase().includes(q) || (l.contact_name ?? '').toLowerCase().includes(q)
    const matchStage = !filterStage || l.stage === filterStage
    return matchSearch && matchStage
  })

  const byStage = (stage: string) => filtered.filter(l => l.stage === stage)

  if (loading) return (
    <>
      <Topbar title="Leads Pipeline" />
      <div className="flex-1 flex items-center justify-center"><div className="w-8 h-8 border-2 border-[#5BA3A0] border-t-transparent rounded-full animate-spin" /></div>
    </>
  )

  return (
    <>
      <Topbar title="Leads Pipeline" />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="px-5 py-3 border-b border-gray-100 bg-white flex items-center gap-3 flex-shrink-0">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search leads..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#5BA3A0]" />
          </div>
          <select value={filterStage ?? ''} onChange={e => setFilterStage(e.target.value || null)}
            className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-[#5BA3A0] bg-white text-gray-700">
            <option value="">All Stages</option>
            {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-gray-400">{filtered.length} leads</span>
            <button onClick={openNew}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-sm font-medium"
              style={{ background: '#5BA3A0' }}>
              <Plus className="w-4 h-4" /> Add Lead
            </button>
          </div>
        </div>

        {/* Kanban Board */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden p-5">
          <div className="flex gap-4 h-full min-w-max">
            {STAGES.map(stage => {
              const stagLeads = byStage(stage.key)
              const stageVal = stagLeads.reduce((s, l) => s + Number(l.estimated_value || 0), 0)
              const isOver = dragOver === stage.key
              return (
                <div key={stage.key}
                  className={cn('flex flex-col rounded-2xl w-64 transition-colors', isOver ? 'bg-gray-100' : 'bg-gray-50')}
                  onDragOver={e => { e.preventDefault(); setDragOver(stage.key) }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={e => handleDrop(e, stage.key)}>
                  {/* Column header */}
                  <div className="px-3 pt-3 pb-2 flex-shrink-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: stage.color }} />
                        <span className="text-xs font-semibold text-gray-700">{stage.label}</span>
                        <span className="text-xs bg-white text-gray-500 rounded-full px-1.5 py-0.5 font-medium shadow-sm">{stagLeads.length}</span>
                      </div>
                    </div>
                    {stageVal > 0 && <p className="text-xs text-gray-400 mt-1 pl-4">${stageVal.toLocaleString()}</p>}
                  </div>

                  {/* Cards */}
                  <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
                    {stagLeads.map(lead => (
                      <div key={lead.id}
                        draggable
                        onDragStart={() => setDragging(lead.id + '::' + lead.stage)}
                        onDragEnd={() => { setDragging(null); setDragOver(null) }}
                        onClick={() => setDetailLead(lead)}
                        className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition-all hover:border-[#5BA3A0]/30 group">
                        <div className="flex items-start justify-between gap-1">
                          <p className="font-semibold text-gray-900 text-sm leading-tight">{lead.company_name}</p>
                          <button onClick={e => { e.stopPropagation(); openEdit(lead) }}
                            className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-gray-700 transition-opacity flex-shrink-0">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {lead.contact_name && <p className="text-xs text-gray-500 mt-0.5">{lead.contact_name}</p>}
                        {lead.industry && (
                          <span className="inline-block mt-1.5 text-xs px-1.5 py-0.5 rounded-md font-medium" style={{ background: stage.bg, color: stage.color }}>
                            {lead.industry}
                          </span>
                        )}
                        <div className="flex items-center justify-between mt-2">
                          {lead.estimated_value > 0 && (
                            <span className="text-xs font-semibold text-gray-700">${lead.estimated_value.toLocaleString()}/mo</span>
                          )}
                          {lead.next_follow_up && (
                            <span className="text-xs text-orange-500 ml-auto flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {new Date(lead.next_follow_up).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                    {/* Drop target */}
                    {isOver && (
                      <div className="border-2 border-dashed border-[#5BA3A0] rounded-xl h-16 flex items-center justify-center">
                        <p className="text-xs text-[#5BA3A0] font-medium">Drop here</p>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Add/Edit modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">{editLead ? 'Edit Lead' : 'New Lead'}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Company Name *</label>
                <input value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))}
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#5BA3A0]" placeholder="Acme Restaurant" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Contact Name</label>
                  <input value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))}
                    className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#5BA3A0]" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone</label>
                  <input value={form.contact_phone} onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))}
                    className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#5BA3A0]" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</label>
                <input value={form.contact_email} onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))}
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#5BA3A0]" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Address</label>
                <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#5BA3A0]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Stage</label>
                  <select value={form.stage} onChange={e => setForm(f => ({ ...f, stage: e.target.value }))}
                    className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#5BA3A0] bg-white">
                    {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Est. Value/mo ($)</label>
                  <input type="number" value={form.estimated_value} onChange={e => setForm(f => ({ ...f, estimated_value: Number(e.target.value) }))}
                    className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#5BA3A0]" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Industry</label>
                  <select value={form.industry} onChange={e => setForm(f => ({ ...f, industry: e.target.value }))}
                    className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#5BA3A0] bg-white">
                    <option value="">Select...</option>
                    {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Source</label>
                  <select value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))}
                    className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#5BA3A0] bg-white">
                    <option value="">Select...</option>
                    {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Next Follow-up</label>
                <input type="date" value={form.next_follow_up} onChange={e => setForm(f => ({ ...f, next_follow_up: e.target.value }))}
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#5BA3A0]" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3}
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#5BA3A0] resize-none" />
              </div>
            </div>
            <div className="px-6 pb-6 flex justify-end gap-3">
              {editLead && (
                <button onClick={() => deleteLead(editLead.id)} className="px-4 py-2 rounded-xl text-sm text-red-600 hover:bg-red-50 transition-colors">Delete</button>
              )}
              <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl text-sm text-gray-600 hover:bg-gray-50 border border-gray-200">Cancel</button>
              <button onClick={save} disabled={saving || !form.company_name.trim()}
                className="px-5 py-2 rounded-xl text-sm text-white font-medium disabled:opacity-50"
                style={{ background: '#5BA3A0' }}>
                {saving ? 'Saving...' : editLead ? 'Save Changes' : 'Add Lead'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Drawer */}
      {detailLead && (
        <div className="fixed inset-0 z-40 flex" onClick={() => setDetailLead(null)}>
          <div className="flex-1" />
          <div className="w-96 bg-white shadow-2xl border-l border-gray-100 flex flex-col h-full overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-900 truncate">{detailLead.company_name}</h3>
              <div className="flex items-center gap-2">
                <button onClick={() => { openEdit(detailLead); setDetailLead(null) }} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg"><Edit2 className="w-4 h-4" /></button>
                <button onClick={() => setDetailLead(null)} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="p-5 space-y-4">
              {(() => {
                const stage = STAGES.find(s => s.key === detailLead.stage)!
                return (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: stage?.bg, color: stage?.color }}>
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: stage?.color }} />
                    {stage?.label}
                  </span>
                )
              })()}
              <div className="space-y-2">
                {detailLead.contact_name && (
                  <div className="flex items-center gap-2.5 text-sm text-gray-700">
                    <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-3.5 h-3.5 text-gray-500" />
                    </div>
                    {detailLead.contact_name}
                  </div>
                )}
                {detailLead.contact_phone && (
                  <a href={`tel:${detailLead.contact_phone}`} className="flex items-center gap-2.5 text-sm text-[#5BA3A0] hover:underline">
                    <div className="w-7 h-7 rounded-lg bg-[#EBF7F7] flex items-center justify-center flex-shrink-0">
                      <Phone className="w-3.5 h-3.5 text-[#5BA3A0]" />
                    </div>
                    {detailLead.contact_phone}
                  </a>
                )}
                {detailLead.contact_email && (
                  <a href={`mailto:${detailLead.contact_email}`} className="flex items-center gap-2.5 text-sm text-[#5BA3A0] hover:underline">
                    <div className="w-7 h-7 rounded-lg bg-[#EBF7F7] flex items-center justify-center flex-shrink-0">
                      <Mail className="w-3.5 h-3.5 text-[#5BA3A0]" />
                    </div>
                    {detailLead.contact_email}
                  </a>
                )}
                {detailLead.address && (
                  <div className="flex items-center gap-2.5 text-sm text-gray-700">
                    <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <MapPin className="w-3.5 h-3.5 text-gray-500" />
                    </div>
                    {detailLead.address}
                  </div>
                )}
                {detailLead.estimated_value > 0 && (
                  <div className="flex items-center gap-2.5 text-sm text-gray-700">
                    <div className="w-7 h-7 rounded-lg bg-green-50 flex items-center justify-center flex-shrink-0">
                      <DollarSign className="w-3.5 h-3.5 text-green-600" />
                    </div>
                    ${detailLead.estimated_value.toLocaleString()}/month
                  </div>
                )}
              </div>
              {(detailLead.industry || detailLead.source) && (
                <div className="flex gap-2">
                  {detailLead.industry && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-lg">{detailLead.industry}</span>}
                  {detailLead.source && <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded-lg">{detailLead.source}</span>}
                </div>
              )}
              {detailLead.next_follow_up && (
                <div className="bg-orange-50 border border-orange-100 rounded-xl p-3">
                  <p className="text-xs font-semibold text-orange-700">Next Follow-up</p>
                  <p className="text-sm text-orange-800 mt-0.5">{new Date(detailLead.next_follow_up).toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
                </div>
              )}
              {detailLead.notes && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Notes</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-xl p-3">{detailLead.notes}</p>
                </div>
              )}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Move Stage</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {STAGES.map(s => (
                    <button key={s.key} onClick={() => { moveStage(detailLead.id, s.key); setDetailLead(prev => prev ? { ...prev, stage: s.key } : null) }}
                      className={cn('text-xs px-2 py-1.5 rounded-lg font-medium transition-colors border', detailLead.stage === s.key ? 'border-transparent' : 'border-gray-200 hover:border-transparent')}
                      style={detailLead.stage === s.key ? { background: s.color, color: '#fff' } : { background: s.bg, color: s.color }}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
