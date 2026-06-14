'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Topbar } from '@/components/layout/topbar'
import { Plus, X, ClipboardCheck, Building2, Calendar, Clock, TrendingUp, ChevronDown, Filter, CheckCircle2, XCircle, MessageSquare, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

type Lead = { id: string; company_name: string; contact_name: string | null; stage: string }
type Visit = {
  id: string
  lead_id: string
  visited_at: string
  outcome: string | null
  notes: string | null
  next_action: string | null
  next_action_date: string | null
  duration_minutes: number | null
  created_at: string
  lead?: Lead
}

const OUTCOMES = [
  { key: 'interested', label: 'Interested', color: '#10B981', icon: '🟢' },
  { key: 'not_interested', label: 'Not Interested', color: '#EF4444', icon: '🔴' },
  { key: 'follow_up', label: 'Follow-up Needed', color: '#F59E0B', icon: '🟡' },
  { key: 'proposal', label: 'Proposal Requested', color: '#6366F1', icon: '📋' },
  { key: 'closed_won', label: 'Closed Won', color: '#059669', icon: '🎉' },
  { key: 'no_contact', label: 'No Contact Made', color: '#94A3B8', icon: '⚪' },
  { key: 'callback', label: 'Requested Callback', color: '#F97316', icon: '📞' },
]

const NEXT_ACTIONS = ['Call back', 'Send proposal', 'Schedule demo', 'Follow up by email', 'Revisit next week', 'Revisit next month', 'Escalate to manager']

export default function ReportsPage() {
  const [visits, setVisits] = useState<Visit[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [filterOutcome, setFilterOutcome] = useState<string | null>(null)
  const [filterLeadId, setFilterLeadId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [form, setForm] = useState({
    lead_id: '',
    visited_at: new Date().toISOString().slice(0, 16),
    outcome: '',
    notes: '',
    next_action: '',
    next_action_date: '',
    duration_minutes: '',
  })
  const [saving, setSaving] = useState(false)
  const sb = createClient()

  const load = async () => {
    const { data: visitData } = await sb
      .from('sales_visits')
      .select('*, lead:sales_leads(id, company_name, contact_name, stage)')
      .order('visited_at', { ascending: false })
      .limit(200)
    const { data: leadData } = await sb
      .from('sales_leads')
      .select('id, company_name, contact_name, stage')
      .order('company_name')
    setVisits(visitData ?? [])
    setLeads(leadData ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const save = async () => {
    if (!form.lead_id || !form.outcome) return
    setSaving(true)
    const payload = {
      lead_id: form.lead_id,
      visited_at: new Date(form.visited_at).toISOString(),
      outcome: form.outcome,
      notes: form.notes || null,
      next_action: form.next_action || null,
      next_action_date: form.next_action_date || null,
      duration_minutes: form.duration_minutes ? Number(form.duration_minutes) : null,
    }
    await sb.from('sales_visits').insert(payload)

    // Update lead's last_contacted_at and possibly stage
    const updates: any = { last_contacted_at: payload.visited_at }
    if (form.outcome === 'closed_won') updates.stage = 'closed_won'
    else if (form.outcome === 'not_interested') updates.stage = 'closed_lost'
    else if (form.outcome === 'proposal') updates.stage = 'proposal'
    else if (form.outcome === 'interested' || form.outcome === 'follow_up') {
      const lead = leads.find(l => l.id === form.lead_id)
      if (lead?.stage === 'prospect') updates.stage = 'contacted'
    }
    await sb.from('sales_leads').update(updates).eq('id', form.lead_id)

    await load()
    setShowForm(false)
    setSaving(false)
    setForm({ lead_id: '', visited_at: new Date().toISOString().slice(0, 16), outcome: '', notes: '', next_action: '', next_action_date: '', duration_minutes: '' })
  }

  const filtered = visits.filter(v => {
    if (filterOutcome && v.outcome !== filterOutcome) return false
    if (filterLeadId && v.lead_id !== filterLeadId) return false
    return true
  })

  // Stats
  const todayStr = new Date().toISOString().split('T')[0]
  const todayVisits = visits.filter(v => v.visited_at.startsWith(todayStr))
  const wonCount = visits.filter(v => v.outcome === 'closed_won').length
  const interestCount = visits.filter(v => ['interested', 'follow_up', 'proposal'].includes(v.outcome ?? '')).length
  const followUps = visits.filter(v => v.next_action_date && v.next_action_date >= todayStr).sort((a, b) => (a.next_action_date ?? '') < (b.next_action_date ?? '') ? -1 : 1)

  return (
    <>
      <Topbar title="Visit Reports" />
      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Stats row */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Total Visits', value: visits.length, icon: ClipboardCheck, color: '#5BA3A0', bg: '#EBF7F7' },
            { label: 'Today', value: todayVisits.length, icon: Calendar, color: '#6366F1', bg: '#EEF2FF' },
            { label: 'Closed Won', value: wonCount, icon: CheckCircle2, color: '#10B981', bg: '#ECFDF5' },
            { label: 'Positive Outcomes', value: interestCount, icon: TrendingUp, color: '#F59E0B', bg: '#FFFBEB' },
          ].map(c => (
            <div key={c.label} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3" style={{ background: c.bg }}>
                <c.icon className="w-4.5 h-4.5" style={{ color: c.color }} />
              </div>
              <p className="text-2xl font-bold text-gray-900">{c.value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{c.label}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Visit log */}
          <div className="lg:col-span-2 space-y-4">
            {/* Toolbar */}
            <div className="flex items-center gap-3">
              <select value={filterOutcome ?? ''} onChange={e => setFilterOutcome(e.target.value || null)}
                className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-[#5BA3A0] bg-white text-gray-700">
                <option value="">All Outcomes</option>
                {OUTCOMES.map(o => <option key={o.key} value={o.key}>{o.icon} {o.label}</option>)}
              </select>
              <select value={filterLeadId ?? ''} onChange={e => setFilterLeadId(e.target.value || null)}
                className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-[#5BA3A0] bg-white text-gray-700 flex-1 max-w-xs">
                <option value="">All Leads</option>
                {leads.map(l => <option key={l.id} value={l.id}>{l.company_name}</option>)}
              </select>
              <div className="ml-auto">
                <button onClick={() => setShowForm(true)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-sm font-medium"
                  style={{ background: '#5BA3A0' }}>
                  <Plus className="w-4 h-4" /> Log Visit
                </button>
              </div>
            </div>

            {loading ? (
              <div className="flex justify-center py-12"><div className="w-7 h-7 border-2 border-[#5BA3A0] border-t-transparent rounded-full animate-spin" /></div>
            ) : filtered.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
                <ClipboardCheck className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">No visit reports yet. Start logging visits after each sales call.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map(visit => {
                  const outcome = OUTCOMES.find(o => o.key === visit.outcome)
                  const lead = visit.lead as Lead | undefined
                  const isExpanded = expandedId === visit.id
                  return (
                    <div key={visit.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                      <button onClick={() => setExpandedId(isExpanded ? null : visit.id)}
                        className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50 transition-colors">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-lg"
                          style={{ background: (outcome?.color ?? '#94A3B8') + '15' }}>
                          {outcome?.icon ?? '⚪'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-sm text-gray-900 truncate">{lead?.company_name ?? 'Unknown'}</p>
                            {outcome && (
                              <span className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
                                style={{ background: outcome.color + '15', color: outcome.color }}>
                                {outcome.label}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-xs text-gray-400">
                              {new Date(visit.visited_at).toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })}
                              {' · '}
                              {new Date(visit.visited_at).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {visit.duration_minutes && <span className="text-xs text-gray-400">{visit.duration_minutes} min</span>}
                          </div>
                        </div>
                        <ChevronDown className={cn('w-4 h-4 text-gray-400 flex-shrink-0 transition-transform', isExpanded && 'rotate-180')} />
                      </button>
                      {isExpanded && (
                        <div className="px-4 pb-4 border-t border-gray-50 pt-3 space-y-3">
                          {visit.notes && (
                            <div>
                              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Visit Notes</p>
                              <p className="text-sm text-gray-700 bg-gray-50 rounded-xl p-3 whitespace-pre-wrap">{visit.notes}</p>
                            </div>
                          )}
                          {visit.next_action && (
                            <div className="flex items-start gap-2 bg-orange-50 rounded-xl p-3">
                              <AlertCircle className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
                              <div>
                                <p className="text-xs font-semibold text-orange-700">Next Action</p>
                                <p className="text-sm text-orange-800">{visit.next_action}</p>
                                {visit.next_action_date && (
                                  <p className="text-xs text-orange-600 mt-0.5">Due: {new Date(visit.next_action_date).toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Follow-up sidebar */}
          <div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <h3 className="font-semibold text-sm text-gray-900">Upcoming Follow-ups</h3>
              </div>
              <div className="divide-y divide-gray-50">
                {followUps.slice(0, 10).length === 0 ? (
                  <div className="p-6 text-center">
                    <CheckCircle2 className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                    <p className="text-xs text-gray-400">No pending follow-ups</p>
                  </div>
                ) : followUps.slice(0, 10).map(v => {
                  const lead = v.lead as Lead | undefined
                  const daysUntil = Math.ceil((new Date(v.next_action_date!).getTime() - Date.now()) / 86400000)
                  const isToday = daysUntil === 0
                  const isOverdue = daysUntil < 0
                  return (
                    <div key={v.id} className="p-3">
                      <div className="flex items-start gap-2">
                        <div className={cn('w-2 h-2 rounded-full mt-1.5 flex-shrink-0', isOverdue ? 'bg-red-500' : isToday ? 'bg-orange-500' : 'bg-green-500')} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-800 truncate">{lead?.company_name}</p>
                          <p className="text-xs text-gray-500 truncate">{v.next_action}</p>
                          <p className={cn('text-xs mt-0.5 font-medium', isOverdue ? 'text-red-500' : isToday ? 'text-orange-500' : 'text-gray-400')}>
                            {isOverdue ? `${Math.abs(daysUntil)}d overdue` : isToday ? 'Today' : `In ${daysUntil}d`}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Log Visit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">Log Visit Report</h2>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Lead / Partner *</label>
                <select value={form.lead_id} onChange={e => setForm(f => ({ ...f, lead_id: e.target.value }))}
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#5BA3A0] bg-white">
                  <option value="">Select a lead...</option>
                  {leads.map(l => <option key={l.id} value={l.id}>{l.company_name}{l.contact_name ? ` — ${l.contact_name}` : ''}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Visit Date & Time *</label>
                  <input type="datetime-local" value={form.visited_at} onChange={e => setForm(f => ({ ...f, visited_at: e.target.value }))}
                    className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#5BA3A0]" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Duration (min)</label>
                  <input type="number" value={form.duration_minutes} onChange={e => setForm(f => ({ ...f, duration_minutes: e.target.value }))}
                    placeholder="30"
                    className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#5BA3A0]" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Outcome *</label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {OUTCOMES.map(o => (
                    <button key={o.key} onClick={() => setForm(f => ({ ...f, outcome: o.key }))}
                      className={cn('flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium border transition-all text-left', form.outcome === o.key ? 'border-transparent text-white' : 'border-gray-200 text-gray-700 hover:border-gray-300')}
                      style={form.outcome === o.key ? { background: o.color } : {}}>
                      <span>{o.icon}</span> {o.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Visit Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={4}
                  placeholder="What was discussed? Key takeaways, objections, questions asked..."
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#5BA3A0] resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Next Action</label>
                  <select value={form.next_action} onChange={e => setForm(f => ({ ...f, next_action: e.target.value }))}
                    className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#5BA3A0] bg-white">
                    <option value="">None</option>
                    {NEXT_ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Follow-up Date</label>
                  <input type="date" value={form.next_action_date} onChange={e => setForm(f => ({ ...f, next_action_date: e.target.value }))}
                    className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#5BA3A0]" />
                </div>
              </div>
            </div>
            <div className="px-5 pb-5 flex justify-end gap-2">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl text-sm text-gray-600 border border-gray-200 hover:bg-gray-50">Cancel</button>
              <button onClick={save} disabled={saving || !form.lead_id || !form.outcome}
                className="px-5 py-2 rounded-xl text-sm text-white font-medium disabled:opacity-50"
                style={{ background: '#5BA3A0' }}>
                {saving ? 'Saving...' : 'Save Report'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
