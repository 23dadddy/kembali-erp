'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Topbar } from '@/components/layout/topbar'
import {
  FileText, Plus, Loader2, Check, X, Calendar, DollarSign,
  AlertCircle, CheckCircle2, RefreshCw, Building2, ChevronRight, Mail, Download
} from 'lucide-react'
import { useRouter } from 'next/navigation'

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  draft: { color: 'bg-slate-100 text-slate-500', label: 'Draft' },
  active: { color: 'bg-emerald-100 text-emerald-700', label: 'Active' },
  expired: { color: 'bg-red-100 text-red-500', label: 'Expired' },
  terminated: { color: 'bg-slate-100 text-slate-400', label: 'Terminated' },
}

const fmt = (n: number) => `Rp ${(n ?? 0).toLocaleString('id-ID')}`
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

export default function ContractsPage() {
  const router = useRouter()
  const [contracts, setContracts] = useState<any[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [filterStatus, setFilterStatus] = useState('active')

  const [form, setForm] = useState({
    customer_id: '',
    title: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    value: '',
    terms: '',
    auto_renew: false,
    status: 'active',
  })

  useEffect(() => { loadAll() }, [])

  const loadAll = async () => {
    setLoading(true)
    const sb = createClient()
    const [contractsRes, customersRes] = await Promise.all([
      sb.from('contracts').select('*, customer:customers(name, city, type)').order('created_at', { ascending: false }),
      sb.from('customers').select('id, name, city').eq('active', true).order('name'),
    ])
    setContracts(contractsRes.data ?? [])
    setCustomers(customersRes.data ?? [])
    setLoading(false)
  }

  const saveContract = async () => {
    if (!form.customer_id || !form.title || !form.start_date) return
    setSaving(true)
    const sb = createClient()
    const { data } = await sb.from('contracts').insert({
      customer_id: form.customer_id,
      title: form.title,
      start_date: form.start_date,
      end_date: form.end_date || null,
      value: form.value ? Number(form.value) : null,
      terms: form.terms || null,
      auto_renew: form.auto_renew,
      status: form.status,
    }).select('*, customer:customers(name, city, type)').single()
    if (data) setContracts([data, ...contracts])
    setShowForm(false)
    setForm({ customer_id: '', title: '', start_date: new Date().toISOString().split('T')[0], end_date: '', value: '', terms: '', auto_renew: false, status: 'active' })
    setSaving(false)
  }

  const updateStatus = async (id: string, status: string) => {
    const sb = createClient()
    await sb.from('contracts').update({ status }).eq('id', id)
    setContracts(contracts.map(c => c.id === id ? { ...c, status } : c))
  }

  const sendRenewalReminder = async (contract: any) => {
    const customer = contract.customer as any
    if (!customer?.name) return
    // Fetch customer email
    const sb = createClient()
    const { data: cust } = await sb.from('customers').select('contact_email, contact_name').eq('id', contract.customer_id).single()
    if (!cust?.contact_email) { alert('No contact email on file for this customer'); return }
    const daysLeft = Math.ceil((new Date(contract.end_date).getTime() - Date.now()) / 86400000)
    await fetch('/api/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'contract_renewal', payload: {
        customer: { name: customer.name, contact_email: cust.contact_email, contact_name: cust.contact_name },
        contract: { title: contract.title, end_date: contract.end_date, daysLeft, value: contract.value },
      } }),
    })
    alert(`Renewal reminder sent to ${cust.contact_email}`)
  }

  const exportCSV = () => {
    const rows = filtered.map(c => ({
      Customer: (c.customer as any)?.name ?? '',
      Title: c.title,
      Status: c.status,
      Start: c.start_date,
      End: c.end_date ?? '',
      Value_IDR: c.value ?? 0,
      Auto_Renew: c.auto_renew ? 'Yes' : 'No',
    }))
    const headers = Object.keys(rows[0] ?? {})
    const csv = [headers.join(','), ...rows.map(r => headers.map(h => JSON.stringify((r as any)[h] ?? '')).join(','))].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = 'contracts.csv'; a.click()
  }

  const filtered = contracts.filter(c => filterStatus === 'all' || c.status === filterStatus)

  const today = new Date().toISOString().split('T')[0]
  const expiringIn30 = contracts.filter(c =>
    c.status === 'active' && c.end_date &&
    c.end_date >= today &&
    c.end_date <= new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]
  )

  const totalValue = contracts.filter(c => c.status === 'active').reduce((s, c) => s + (c.value ?? 0), 0)

  return (
    <>
      <Topbar title="Contracts" />
      <div className="p-6 max-w-5xl space-y-6">

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-slate-400">Active Contracts</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{contracts.filter(c => c.status === 'active').length}</p>
          </div>
          <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-slate-400">Total Contracts</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{contracts.length}</p>
          </div>
          <div className={`border rounded-xl p-4 shadow-sm ${expiringIn30.length > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-100'}`}>
            <p className={`text-xs ${expiringIn30.length > 0 ? 'text-amber-500' : 'text-slate-400'}`}>Expiring in 30 days</p>
            <p className={`text-2xl font-bold mt-1 ${expiringIn30.length > 0 ? 'text-amber-700' : 'text-slate-800'}`}>{expiringIn30.length}</p>
          </div>
          <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-slate-400">Active Contract Value</p>
            <p className="text-xl font-bold text-cyan-600 mt-1">{fmt(totalValue)}</p>
          </div>
        </div>

        {/* Expiry Alert */}
        {expiringIn30.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              <p className="text-sm font-semibold text-amber-800">Contracts expiring soon</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {expiringIn30.map(c => (
                <div key={c.id} className="flex items-center gap-1.5">
                  <button onClick={() => router.push(`/customers/${c.customer_id}`)}
                    className="text-xs bg-amber-100 hover:bg-amber-200 text-amber-700 px-2.5 py-1 rounded-full transition-colors">
                    {(c.customer as any)?.name} · {fmtDate(c.end_date)}
                  </button>
                  {c.end_date && (
                    <button onClick={() => sendRenewalReminder(c)}
                      className="text-xs bg-white hover:bg-amber-50 text-amber-600 px-2 py-1 rounded-full border border-amber-200 flex items-center gap-1 transition-colors">
                      <Mail className="w-3 h-3" /> Remind
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center gap-3">
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
            {['active', 'draft', 'expired', 'all'].map(s => (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${filterStatus === s ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {s}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <button onClick={exportCSV} disabled={filtered.length === 0}
            className="flex items-center gap-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 px-3 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-40">
            <Download className="w-4 h-4" /> Export
          </button>
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" /> New Contract
          </button>
        </div>

        {/* Form */}
        {showForm && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
            <h3 className="font-semibold text-slate-800">New Contract</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs font-medium text-slate-600 block mb-1">Customer *</label>
                <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={form.customer_id} onChange={e => setForm({ ...form, customer_id: e.target.value })}>
                  <option value="">Select customer...</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name} — {c.city}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-slate-600 block mb-1">Contract Title *</label>
                <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  placeholder="e.g. Annual Water Supply Agreement — The Legian Hotel"
                  value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Start Date *</label>
                <input type="date" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">End Date (blank = open-ended)</label>
                <input type="date" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Contract Value (Rp)</label>
                <input type="number" min="0" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Status</label>
                <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-slate-600 block mb-1">Terms & Notes</label>
                <textarea className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none" rows={3}
                  placeholder="Key contract terms, pricing arrangements, special conditions..."
                  value={form.terms} onChange={e => setForm({ ...form, terms: e.target.value })} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input type="checkbox" checked={form.auto_renew} onChange={e => setForm({ ...form, auto_renew: e.target.checked })} />
              Auto-renew when contract expires
            </label>
            <div className="flex gap-2">
              <button onClick={saveContract} disabled={saving || !form.customer_id || !form.title}
                className="flex-1 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" />Save Contract</>}
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
            <FileText className="w-10 h-10 mx-auto mb-3 text-slate-200" />
            <p>No contracts found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(contract => {
              const cfg = STATUS_CONFIG[contract.status] ?? STATUS_CONFIG.draft
              const daysLeft = contract.end_date
                ? Math.ceil((new Date(contract.end_date).getTime() - Date.now()) / 86400000)
                : null
              return (
                <div key={contract.id} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5 text-slate-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-slate-800">{contract.title}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>{cfg.label}</span>
                        {contract.auto_renew && <span className="text-xs bg-cyan-100 text-cyan-600 px-2 py-0.5 rounded-full flex items-center gap-1"><RefreshCw className="w-3 h-3" />Auto-renew</span>}
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-xs text-slate-400">
                        <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{contract.customer?.name}</span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {fmtDate(contract.start_date)}
                          {contract.end_date && ` → ${fmtDate(contract.end_date)}`}
                          {daysLeft !== null && daysLeft <= 30 && daysLeft >= 0 && (
                            <span className="text-amber-500 font-medium ml-1">{daysLeft}d left</span>
                          )}
                          {daysLeft !== null && daysLeft < 0 && (
                            <span className="text-red-500 font-medium ml-1">Expired</span>
                          )}
                        </span>
                        {contract.value && <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" />{fmt(contract.value)}</span>}
                      </div>
                      {contract.terms && <p className="text-xs text-slate-400 mt-1 line-clamp-1">{contract.terms}</p>}
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      {contract.status === 'active' && (
                        <button onClick={() => updateStatus(contract.id, 'terminated')}
                          className="text-xs border border-red-200 text-red-500 hover:bg-red-50 px-2.5 py-1.5 rounded-lg transition-colors">
                          Terminate
                        </button>
                      )}
                      {contract.status === 'draft' && (
                        <button onClick={() => updateStatus(contract.id, 'active')}
                          className="text-xs border border-emerald-200 text-emerald-600 hover:bg-emerald-50 px-2.5 py-1.5 rounded-lg transition-colors">
                          Activate
                        </button>
                      )}
                      <button onClick={() => router.push(`/customers/${contract.customer_id}`)}
                        className="text-xs border border-slate-200 hover:bg-slate-50 p-1.5 rounded-lg transition-colors">
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                      </button>
                    </div>
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
