'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Topbar } from '@/components/layout/topbar'
import {
  MessageSquare, Plus, Loader2, Check, X, AlertCircle,
  CheckCircle2, Clock, User, Building2, ChevronRight,
  Filter, Search, MessageCircle
} from 'lucide-react'

const STATUS_CONFIG: Record<string, { color: string; label: string; icon: React.ElementType }> = {
  open: { color: 'bg-red-100 text-red-600', label: 'Open', icon: AlertCircle },
  in_progress: { color: 'bg-amber-100 text-amber-700', label: 'In Progress', icon: Clock },
  resolved: { color: 'bg-emerald-100 text-emerald-700', label: 'Resolved', icon: CheckCircle2 },
  closed: { color: 'bg-slate-100 text-slate-500', label: 'Closed', icon: X },
}

const PRIORITY_CONFIG: Record<string, { color: string; label: string }> = {
  low: { color: 'bg-slate-100 text-slate-500', label: 'Low' },
  medium: { color: 'bg-blue-100 text-blue-600', label: 'Medium' },
  high: { color: 'bg-amber-100 text-amber-700', label: 'High' },
  urgent: { color: 'bg-red-100 text-red-600', label: 'Urgent' },
}

const CATEGORY_LABELS: Record<string, string> = {
  delivery: 'Delivery Issue',
  billing: 'Billing',
  quality: 'Quality',
  bottles: 'Bottles',
  other: 'Other',
}

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const fmtTime = (d: string) => new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })

export default function SupportPage() {
  const [tickets, setTickets] = useState<any[]>([])
  const [staff, setStaff] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<any>(null)
  const [filterStatus, setFilterStatus] = useState('open')
  const [filterPriority, setFilterPriority] = useState('all')
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [reply, setReply] = useState('')

  useEffect(() => { loadAll() }, [])

  const loadAll = async () => {
    setLoading(true)
    const sb = createClient()
    const [ticketsRes, staffRes] = await Promise.all([
      sb.from('support_tickets')
        .select('*, customer:customers(name, city), assignee:staff!assigned_to(name)')
        .order('created_at', { ascending: false }),
      sb.from('staff').select('id, name').eq('active', true).order('name'),
    ])
    setTickets(ticketsRes.data ?? [])
    setStaff(staffRes.data ?? [])
    setLoading(false)
  }

  const updateTicket = async (id: string, updates: Record<string, any>) => {
    setSaving(true)
    const sb = createClient()
    await sb.from('support_tickets').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id)
    setTickets(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t))
    if (selected?.id === id) setSelected((t: any) => ({ ...t, ...updates }))
    setSaving(false)
  }

  const resolve = (id: string) => updateTicket(id, {
    status: 'resolved',
    resolved_at: new Date().toISOString(),
  })

  const filtered = tickets.filter(t => {
    if (filterStatus !== 'all' && t.status !== filterStatus) return false
    if (filterPriority !== 'all' && t.priority !== filterPriority) return false
    if (search && !t.subject?.toLowerCase().includes(search.toLowerCase()) &&
        !t.customer?.name?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const counts = {
    open: tickets.filter(t => t.status === 'open').length,
    in_progress: tickets.filter(t => t.status === 'in_progress').length,
    urgent: tickets.filter(t => t.priority === 'urgent' && t.status !== 'resolved' && t.status !== 'closed').length,
  }

  return (
    <>
      <Topbar title="Support Tickets" />
      <div className="flex h-[calc(100vh-57px)]">
        {/* Left panel */}
        <div className="w-80 border-r border-slate-200 bg-white flex flex-col flex-shrink-0">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-2 p-3 border-b border-slate-100">
            <div className="bg-red-50 rounded-xl p-2 text-center">
              <p className="text-xl font-bold text-red-600">{counts.open}</p>
              <p className="text-xs text-red-400">Open</p>
            </div>
            <div className="bg-amber-50 rounded-xl p-2 text-center">
              <p className="text-xl font-bold text-amber-600">{counts.in_progress}</p>
              <p className="text-xs text-amber-400">Active</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-2 text-center">
              <p className="text-xl font-bold text-slate-700">{counts.urgent}</p>
              <p className="text-xs text-slate-400">Urgent</p>
            </div>
          </div>

          {/* Search */}
          <div className="px-3 py-2 border-b border-slate-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-cyan-400"
                placeholder="Search tickets..."
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>

          {/* Filters */}
          <div className="px-3 py-2 flex gap-1 flex-wrap border-b border-slate-100">
            {['all', 'open', 'in_progress', 'resolved'].map(s => (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={`px-2 py-1 rounded-lg text-xs font-medium capitalize transition-colors ${filterStatus === s ? 'bg-cyan-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                {s === 'in_progress' ? 'Active' : s}
              </button>
            ))}
            <div className="w-px bg-slate-200 mx-1" />
            {['all', 'urgent', 'high'].map(p => (
              <button key={p} onClick={() => setFilterPriority(p)}
                className={`px-2 py-1 rounded-lg text-xs font-medium capitalize transition-colors ${filterPriority === p ? 'bg-cyan-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                {p === 'all' ? 'All priority' : p}
              </button>
            ))}
          </div>

          {/* Ticket list */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <MessageSquare className="w-8 h-8 mx-auto mb-2 text-slate-200" />
                <p className="text-sm">No tickets</p>
              </div>
            ) : filtered.map(ticket => {
              const statusCfg = STATUS_CONFIG[ticket.status] ?? STATUS_CONFIG.open
              const priCfg = PRIORITY_CONFIG[ticket.priority] ?? PRIORITY_CONFIG.medium
              return (
                <button key={ticket.id} onClick={() => setSelected(ticket)}
                  className={`w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors ${selected?.id === ticket.id ? 'bg-cyan-50 border-l-2 border-l-cyan-500' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-800 text-sm truncate">{ticket.subject}</p>
                      <p className="text-xs text-slate-400 mt-0.5 truncate">{ticket.customer?.name}</p>
                    </div>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${priCfg.color}`}>{priCfg.label}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${statusCfg.color}`}>{statusCfg.label}</span>
                    <span className="text-xs text-slate-400">{CATEGORY_LABELS[ticket.category] ?? ticket.category}</span>
                    <span className="text-xs text-slate-300 ml-auto">{fmtDate(ticket.created_at)}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Detail panel */}
        <div className="flex-1 overflow-y-auto bg-slate-50">
          {!selected ? (
            <div className="flex items-center justify-center h-full text-slate-400">
              <div className="text-center">
                <MessageSquare className="w-12 h-12 mx-auto mb-3 text-slate-200" />
                <p className="font-medium">Select a ticket to view details</p>
              </div>
            </div>
          ) : (
            <div className="p-6 space-y-4 max-w-2xl">
              {/* Header */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h2 className="text-lg font-bold text-slate-800">{selected.subject}</h2>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-400 flex-wrap">
                      <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{selected.customer?.name}</span>
                      <span>{CATEGORY_LABELS[selected.category] ?? selected.category}</span>
                      <span>{fmtDate(selected.created_at)} at {fmtTime(selected.created_at)}</span>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_CONFIG[selected.status]?.color}`}>
                        {STATUS_CONFIG[selected.status]?.label}
                      </span>
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${PRIORITY_CONFIG[selected.priority]?.color}`}>
                        {PRIORITY_CONFIG[selected.priority]?.label} priority
                      </span>
                    </div>
                  </div>
                  {(selected.status === 'open' || selected.status === 'in_progress') && (
                    <button onClick={() => resolve(selected.id)} disabled={saving}
                      className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-xl text-xs font-medium flex-shrink-0 transition-colors">
                      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><CheckCircle2 className="w-3.5 h-3.5" />Resolve</>}
                    </button>
                  )}
                </div>
              </div>

              {/* Description */}
              {selected.description && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Description</p>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{selected.description}</p>
                </div>
              )}

              {/* Assignment & Actions */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Management</p>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">Assigned To</label>
                    <select className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm"
                      value={selected.assigned_to ?? ''}
                      onChange={e => updateTicket(selected.id, { assigned_to: e.target.value || null })}>
                      <option value="">Unassigned</option>
                      {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">Status</label>
                    <select className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm"
                      value={selected.status}
                      onChange={e => updateTicket(selected.id, { status: e.target.value })}>
                      {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">Priority</label>
                    <select className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm"
                      value={selected.priority}
                      onChange={e => updateTicket(selected.id, { priority: e.target.value })}>
                      {Object.entries(PRIORITY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">Category</label>
                    <select className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm"
                      value={selected.category ?? ''}
                      onChange={e => updateTicket(selected.id, { category: e.target.value || null })}>
                      <option value="">— select —</option>
                      {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Resolution */}
              {selected.status === 'resolved' && selected.resolved_at && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <p className="text-sm font-semibold text-emerald-800">Resolved</p>
                    <span className="text-xs text-emerald-600">{fmtDate(selected.resolved_at)} at {fmtTime(selected.resolved_at)}</span>
                  </div>
                  {selected.assignee?.name && (
                    <p className="text-xs text-emerald-600 mt-1">by {selected.assignee.name}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
