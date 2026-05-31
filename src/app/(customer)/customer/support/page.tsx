'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  MessageSquare, Plus, Loader2, Check, X, AlertCircle,
  Clock, CheckCircle2, ChevronDown, Package, Truck, HelpCircle
} from 'lucide-react'

const TICKET_CATEGORIES = [
  { value: 'delivery_issue', label: 'Delivery Issue', icon: Truck },
  { value: 'missing_bottles', label: 'Missing Bottles', icon: Package },
  { value: 'billing', label: 'Billing Question', icon: AlertCircle },
  { value: 'account', label: 'Account Change', icon: HelpCircle },
  { value: 'other', label: 'Other', icon: MessageSquare },
]

export default function CustomerSupportPage() {
  const [customers, setCustomers] = useState<any[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState('')
  const [tickets, setTickets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    subject: '',
    category: 'delivery_issue',
    description: '',
    priority: 'medium',
  })

  useEffect(() => { loadCustomers() }, [])
  useEffect(() => { if (selectedCustomer) loadTickets() }, [selectedCustomer])

  const loadCustomers = async () => {
    const sb = createClient()
    const { data } = await sb.from('customers').select('id, name, city').eq('active', true).limit(50)
    setCustomers(data ?? [])
    if (data?.[0]) setSelectedCustomer(data[0].id)
  }

  const loadTickets = async () => {
    setLoading(true)
    const sb = createClient()
    const { data } = await sb.from('support_tickets').select('*').eq('customer_id', selectedCustomer).order('created_at', { ascending: false })
    setTickets(data ?? [])
    setLoading(false)
  }

  const submitTicket = async () => {
    if (!form.subject || !form.description) return
    setSaving(true)
    const sb = createClient()
    const { data } = await sb.from('support_tickets').insert({
      customer_id: selectedCustomer,
      subject: form.subject,
      category: form.category,
      description: form.description,
      priority: form.priority,
      status: 'open',
    }).select().single()
    if (data) setTickets([data, ...tickets])
    setForm({ subject: '', category: 'delivery_issue', description: '', priority: 'medium' })
    setShowForm(false)
    setSaving(false)
  }

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
    open: { label: 'Open', color: 'bg-amber-100 text-amber-700', icon: Clock },
    in_progress: { label: 'In Progress', color: 'bg-cyan-100 text-cyan-700', icon: MessageSquare },
    resolved: { label: 'Resolved', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
    closed: { label: 'Closed', color: 'bg-slate-100 text-slate-500', icon: CheckCircle2 },
  }

  const priorityColor: Record<string, string> = {
    low: 'bg-slate-100 text-slate-500',
    medium: 'bg-blue-100 text-blue-600',
    high: 'bg-orange-100 text-orange-600',
    urgent: 'bg-red-100 text-red-600',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Support</h1>
          <p className="text-slate-500 text-sm mt-0.5">Submit and track your service requests</p>
        </div>
        <select className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white" value={selectedCustomer} onChange={e => setSelectedCustomer(e.target.value)}>
          {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* Contact Banner */}
      <div className="bg-cyan-50 border border-cyan-100 rounded-2xl p-4 flex items-center gap-4">
        <div className="w-10 h-10 bg-cyan-100 rounded-xl flex items-center justify-center flex-shrink-0">
          <MessageSquare className="w-5 h-5 text-cyan-600" />
        </div>
        <div className="flex-1">
          <p className="font-medium text-cyan-800 text-sm">Need urgent help?</p>
          <p className="text-xs text-cyan-600 mt-0.5">
            WhatsApp: <strong>+62 812-3456-7890</strong> · Email: <strong>support@kembaliwater.com</strong>
          </p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors flex-shrink-0">
          <Plus className="w-4 h-4" /> New Ticket
        </button>
      </div>

      {showForm && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
          <h3 className="font-semibold text-slate-800">Submit Support Request</h3>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Category</label>
              <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                {TICKET_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Priority</label>
              <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Subject *</label>
            <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              placeholder="Brief summary of your issue"
              value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Description *</label>
            <textarea
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none"
              rows={4}
              placeholder="Please describe your issue in detail — include dates, quantities, and any relevant information..."
              value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
            />
          </div>

          <div className="flex gap-2">
            <button onClick={submitTicket} disabled={saving || !form.subject || !form.description}
              className="flex-1 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-colors">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" />Submit Ticket</>}
            </button>
            <button onClick={() => setShowForm(false)} className="border border-slate-200 px-4 py-2 rounded-xl text-sm hover:bg-slate-50">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
      ) : tickets.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <MessageSquare className="w-8 h-8 mx-auto mb-2 text-slate-200" />
          <p>No support tickets</p>
          <p className="text-sm mt-1">Submit a ticket if you have any issues or questions</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map(ticket => {
            const cfg = statusConfig[ticket.status] ?? statusConfig.open
            const StatusIcon = cfg.icon
            const cat = TICKET_CATEGORIES.find(c => c.value === ticket.category)
            const CatIcon = cat?.icon ?? MessageSquare
            return (
              <div key={ticket.id} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <CatIcon className="w-5 h-5 text-slate-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-slate-800">{ticket.subject}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${cfg.color}`}>
                        <StatusIcon className="w-3 h-3" /> {cfg.label}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${priorityColor[ticket.priority] ?? priorityColor.medium}`}>
                        {ticket.priority}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{cat?.label} · {fmtDate(ticket.created_at)}</p>
                    {ticket.description && (
                      <p className="text-sm text-slate-600 mt-2 line-clamp-2">{ticket.description}</p>
                    )}
                    {ticket.resolution_notes && (
                      <div className="mt-3 bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                        <p className="text-xs font-medium text-emerald-700 mb-1">Resolution</p>
                        <p className="text-sm text-emerald-600">{ticket.resolution_notes}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
