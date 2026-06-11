'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Topbar } from '@/components/layout/topbar'
import { useLanguage } from '@/components/providers/language-provider'
import {
  MessageSquare, Plus, Loader2, Check, X, AlertCircle,
  CheckCircle2, Clock, Building2, Search, Send, Lock, Eye, Download,
  ChevronDown, User,
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
  delivery: 'Delivery Issue', billing: 'Billing', quality: 'Quality',
  bottles: 'Bottles', other: 'Other',
}

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const fmtTime = (d: string) => new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
const fmtRelative = (d: string) => {
  const diff = Date.now() - new Date(d).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return fmtDate(d)
}

export default function SupportPage() {
  const { t: tr } = useLanguage()
  const [tickets, setTickets] = useState<any[]>([])
  const [comments, setComments] = useState<any[]>([])
  const [staff, setStaff] = useState<any[]>([])
  const [myStaff, setMyStaff] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [loadingComments, setLoadingComments] = useState(false)
  const [selected, setSelected] = useState<any>(null)
  const [filterStatus, setFilterStatus] = useState('open')
  const [filterPriority, setFilterPriority] = useState('all')
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [isInternal, setIsInternal] = useState(false)
  const [sendingReply, setSendingReply] = useState(false)
  const [showNewForm, setShowNewForm] = useState(false)
  const [newForm, setNewForm] = useState({ customer_id: '', subject: '', description: '', priority: 'medium', category: 'other' })
  const [customers, setCustomers] = useState<any[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const init = async () => {
      const sb = createClient()
      const { data: { user } } = await sb.auth.getUser()
      const [ticketsRes, staffRes, customersRes, myRes] = await Promise.all([
        sb.from('support_tickets').select('*, customer:customers(name, city, contact_phone), assignee:staff!assigned_to(name)').order('created_at', { ascending: false }),
        sb.from('staff').select('id, name').eq('active', true).order('name'),
        sb.from('customers').select('id, name, city').eq('active', true).order('name'),
        user ? sb.from('staff').select('id, name').eq('auth_user_id', user.id).single() : Promise.resolve({ data: null }),
      ])
      setTickets(ticketsRes.data ?? [])
      setStaff(staffRes.data ?? [])
      setCustomers(customersRes.data ?? [])
      setMyStaff((myRes as any).data)
      setLoading(false)
    }
    init()
  }, [])

  // Load comments when ticket selected
  useEffect(() => {
    if (!selected) { setComments([]); return }
    const loadComments = async () => {
      setLoadingComments(true)
      const sb = createClient()
      const { data } = await sb.from('ticket_comments')
        .select('*, author:staff!author_id(name)')
        .eq('ticket_id', selected.id)
        .order('created_at', { ascending: true })
      setComments(data ?? [])
      setLoadingComments(false)
    }
    loadComments()

    // Realtime
    const sb = createClient()
    const sub = sb.channel(`comments-${selected.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ticket_comments', filter: `ticket_id=eq.${selected.id}` },
        (payload) => setComments(prev => [...prev, payload.new as any]))
      .subscribe()
    return () => { sub.unsubscribe() }
  }, [selected?.id])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [comments])

  const updateTicket = (id: string, updates: Record<string, any>) => {
    // Optimistic — update state instantly, sync in background
    setTickets(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t))
    if (selected?.id === id) setSelected((t: any) => ({ ...t, ...updates }))
    const sb = createClient()
    sb.from('support_tickets').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id)
  }

  const sendReply = () => {
    if (!replyText.trim() || !selected) return
    const optimistic = {
      id: `tmp-${Date.now()}`,
      ticket_id: selected.id,
      author_id: myStaff?.id ?? null,
      author: myStaff ? { name: myStaff.name } : null,
      content: replyText.trim(),
      is_internal: isInternal,
      created_at: new Date().toISOString(),
    }
    setComments(prev => [...prev, optimistic as any])
    setReplyText('')
    if (selected.status === 'open') updateTicket(selected.id, { status: 'in_progress' })
    const sb = createClient()
    sb.from('ticket_comments').insert({
      ticket_id: selected.id,
      author_id: myStaff?.id ?? null,
      content: optimistic.content,
      is_internal: isInternal,
    })
  }

  const createTicket = async () => {
    if (!newForm.customer_id || !newForm.subject) return
    setShowNewForm(false)
    const sb = createClient()
    const { data } = await sb.from('support_tickets').insert({ ...newForm, source: 'manual' }).select('*, customer:customers(name, city, contact_phone)').single()
    if (data) { setTickets(prev => [data, ...prev]); setSelected(data) }
    setNewForm({ customer_id: '', subject: '', description: '', priority: 'medium', category: 'other' })
  }

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
    urgent: tickets.filter(t => t.priority === 'urgent' && !['resolved','closed'].includes(t.status)).length,
  }

  return (
    <>
      <Topbar title="support_title" titleIsKey />
      <div className="flex h-[calc(100vh-57px)]">

        {/* ── Left panel ── */}
        <div className="w-80 border-r border-slate-200 bg-white flex flex-col flex-shrink-0">
          <div className="grid grid-cols-3 gap-2 p-3 border-b border-slate-100">
            <div className="bg-red-50 rounded-xl p-2 text-center">
              <p className="text-xl font-bold text-red-600">{counts.open}</p>
              <p className="text-xs text-red-400">{tr('support_open')}</p>
            </div>
            <div className="bg-amber-50 rounded-xl p-2 text-center">
              <p className="text-xl font-bold text-amber-600">{counts.in_progress}</p>
              <p className="text-xs text-amber-400">{tr('support_active')}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-2 text-center">
              <p className="text-xl font-bold text-slate-700">{counts.urgent}</p>
              <p className="text-xs text-slate-400">{tr('support_urgent')}</p>
            </div>
          </div>

          <div className="px-3 py-2 border-b border-slate-100 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-cyan-400"
                placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <button onClick={() => {
              const rows = filtered.map(t => ({ ID: t.id.slice(0, 8), Subject: t.subject, Status: t.status, Priority: t.priority, Category: t.category, Customer: (t.customer as any)?.name ?? '', Created: t.created_at?.split('T')[0] ?? '' }))
              if (!rows.length) return
              const headers = Object.keys(rows[0])
              const csv = [headers.join(','), ...rows.map(r => headers.map(h => JSON.stringify((r as any)[h] ?? '')).join(','))].join('\n')
              const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
              a.download = 'support-tickets.csv'; a.click()
            }} className="flex-shrink-0 border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 rounded-lg px-2 py-1.5 text-sm">
              <Download className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setShowNewForm(true)}
              className="flex-shrink-0 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg px-2.5 py-1.5 text-sm font-medium flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="px-3 py-2 flex gap-1 flex-wrap border-b border-slate-100">
            {['open', 'in_progress', 'resolved', 'all'].map(s => (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={`px-2 py-1 rounded-lg text-xs font-medium capitalize transition-colors ${filterStatus === s ? 'bg-cyan-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                {s === 'in_progress' ? tr('active') : s === 'open' ? tr('support_open') : s === 'resolved' ? tr('support_resolved') : tr('all')}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <MessageSquare className="w-8 h-8 mx-auto mb-2 text-slate-200" />
                <p className="text-sm">{tr('support_no_tickets')}</p>
              </div>
            ) : filtered.map(ticket => {
              const priCfg = PRIORITY_CONFIG[ticket.priority] ?? PRIORITY_CONFIG.medium
              const statusCfg = STATUS_CONFIG[ticket.status] ?? STATUS_CONFIG.open
              return (
                <button key={ticket.id} onClick={() => setSelected(ticket)}
                  className={`w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors ${selected?.id === ticket.id ? 'bg-cyan-50 border-l-2 border-l-cyan-500' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-slate-800 text-sm truncate flex-1">{ticket.subject}</p>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${priCfg.color}`}>{priCfg.label}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">
                    {ticket.customer?.name ?? ticket.from_email ?? 'Unknown'}
                    {ticket.source === 'email' && <span className="ml-1.5 text-cyan-500">✉</span>}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${statusCfg.color}`}>{statusCfg.label}</span>
                    <span className="text-xs text-slate-300 ml-auto">{fmtRelative(ticket.created_at)}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Detail panel ── */}
        <div className="flex-1 flex flex-col bg-slate-50 min-w-0">
          {showNewForm ? (
            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-xl space-y-4">
                <h2 className="text-lg font-bold text-slate-800">New Support Ticket</h2>
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">Customer *</label>
                  <select className="w-full border rounded-lg px-3 py-2 text-sm" value={newForm.customer_id} onChange={e => setNewForm({ ...newForm, customer_id: e.target.value })}>
                    <option value="">— select customer —</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name} · {c.city}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">Subject *</label>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm" value={newForm.subject} onChange={e => setNewForm({ ...newForm, subject: e.target.value })} placeholder="Brief description of the issue" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-500 block mb-1">Priority</label>
                    <select className="w-full border rounded-lg px-3 py-2 text-sm" value={newForm.priority} onChange={e => setNewForm({ ...newForm, priority: e.target.value })}>
                      {Object.entries(PRIORITY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 block mb-1">Category</label>
                    <select className="w-full border rounded-lg px-3 py-2 text-sm" value={newForm.category} onChange={e => setNewForm({ ...newForm, category: e.target.value })}>
                      {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">Description</label>
                  <textarea className="w-full border rounded-lg px-3 py-2 text-sm resize-none" rows={4} value={newForm.description} onChange={e => setNewForm({ ...newForm, description: e.target.value })} placeholder="Detailed description..." />
                </div>
                <div className="flex gap-2">
                  <button onClick={createTicket} disabled={saving || !newForm.customer_id || !newForm.subject}
                    className="flex-1 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" />Create Ticket</>}
                  </button>
                  <button onClick={() => setShowNewForm(false)} className="border px-4 py-2.5 rounded-xl text-sm hover:bg-slate-50"><X className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          ) : !selected ? (
            <div className="flex items-center justify-center flex-1 text-slate-400">
              <div className="text-center">
                <MessageSquare className="w-12 h-12 mx-auto mb-3 text-slate-200" />
                <p className="font-medium">Select a ticket to view details</p>
                <button onClick={() => setShowNewForm(true)} className="mt-3 text-sm text-cyan-600 hover:underline flex items-center gap-1 mx-auto">
                  <Plus className="w-3.5 h-3.5" />New ticket
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Ticket header */}
              <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h2 className="text-base font-bold text-slate-800 truncate">{selected.subject}</h2>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-400 flex-wrap">
                      {selected.customer?.name && (
                        <span className="flex items-center gap-1">
                          <Building2 className="w-3 h-3" />{selected.customer.name}
                          {selected.customer.contact_phone && (
                            <a href={`https://wa.me/${selected.customer.contact_phone.replace(/\D/g,'')}`} target="_blank" rel="noopener noreferrer"
                              className="ml-1 text-emerald-500 hover:text-emerald-700 font-medium">WhatsApp ↗</a>
                          )}
                        </span>
                      )}
                      {selected.from_email && <span className="text-cyan-600">✉ {selected.from_name ? `${selected.from_name} <${selected.from_email}>` : selected.from_email}</span>}
                      <span>{fmtDate(selected.created_at)}</span>
                    </div>
                    <div className="flex gap-2 mt-2 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CONFIG[selected.status]?.color}`}>{STATUS_CONFIG[selected.status]?.label}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_CONFIG[selected.priority]?.color}`}>{PRIORITY_CONFIG[selected.priority]?.label}</span>
                      {selected.category && <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{CATEGORY_LABELS[selected.category] ?? selected.category}</span>}
                      {selected.assignee?.name && <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">→ {selected.assignee.name}</span>}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    {(selected.status === 'open' || selected.status === 'in_progress') && (
                      <button onClick={() => updateTicket(selected.id, { status: 'resolved', resolved_at: new Date().toISOString() })} disabled={saving}
                        className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-xl text-xs font-medium transition-colors">
                        <CheckCircle2 className="w-3.5 h-3.5" />Resolve
                      </button>
                    )}
                    <select className="border border-slate-200 rounded-xl px-2 py-1.5 text-xs text-slate-600"
                      value={selected.assigned_to ?? ''} onChange={e => updateTicket(selected.id, { assigned_to: e.target.value || null })}>
                      <option value="">Unassigned</option>
                      {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <select className="border border-slate-200 rounded-xl px-2 py-1.5 text-xs text-slate-600"
                      value={selected.priority} onChange={e => updateTicket(selected.id, { priority: e.target.value })}>
                      {Object.entries(PRIORITY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                </div>
                {selected.description && (
                  <div className="mt-3 pt-3 border-t border-slate-100 text-sm text-slate-600 bg-slate-50 rounded-xl px-3 py-2 whitespace-pre-wrap">
                    {selected.description}
                  </div>
                )}
              </div>

              {/* Comment thread */}
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
                {loadingComments ? (
                  <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>
                ) : comments.length === 0 ? (
                  <div className="text-center py-8 text-slate-300">
                    <MessageSquare className="w-8 h-8 mx-auto mb-2" />
                    <p className="text-sm">No replies yet — start the conversation below</p>
                  </div>
                ) : comments.map(c => (
                  <div key={c.id} className={`flex gap-3 ${c.is_internal ? 'opacity-80' : ''}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-bold ${c.is_internal ? 'bg-amber-400' : 'bg-cyan-500'}`}>
                      {c.author?.name?.[0] ?? '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-slate-700">{c.author?.name ?? 'Staff'}</span>
                        {c.is_internal && (
                          <span className="flex items-center gap-0.5 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
                            <Lock className="w-2.5 h-2.5" />Internal
                          </span>
                        )}
                        <span className="text-xs text-slate-400">{fmtRelative(c.created_at)}</span>
                      </div>
                      <div className={`rounded-2xl px-4 py-2.5 text-sm text-slate-700 whitespace-pre-wrap ${c.is_internal ? 'bg-amber-50 border border-amber-200' : 'bg-white border border-slate-200'}`}>
                        {c.content}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              {/* Reply box */}
              <div className="bg-white border-t border-slate-200 p-4 flex-shrink-0">
                <div className={`border rounded-2xl overflow-hidden ${isInternal ? 'border-amber-300' : 'border-slate-200'}`}>
                  <textarea
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) sendReply() }}
                    placeholder={isInternal ? 'Internal note (not visible to customer)…' : 'Reply to this ticket… (Cmd+Enter to send)'}
                    rows={3}
                    className={`w-full px-4 py-3 text-sm resize-none focus:outline-none ${isInternal ? 'bg-amber-50' : 'bg-white'}`}
                  />
                  <div className="flex items-center gap-2 px-3 pb-3">
                    <button
                      onClick={() => setIsInternal(!isInternal)}
                      className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors ${isInternal ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                      {isInternal ? <Lock className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      {isInternal ? 'Internal note' : 'Public reply'}
                    </button>
                    <button
                      onClick={sendReply}
                      disabled={sendingReply || !replyText.trim()}
                      className="ml-auto flex items-center gap-1.5 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors">
                      {sendingReply ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                      Send
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
