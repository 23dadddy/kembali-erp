'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Topbar } from '@/components/layout/topbar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Plus, Search, FileText, DollarSign, Loader2, ExternalLink, Download, Mail, Send, Zap, CheckCircle2, AlertCircle } from 'lucide-react'
import { SkeletonRows } from '@/components/ui/skeleton-rows'
import { idr } from '@/lib/format'
import { Card, CardContent } from '@/components/ui/card'
import { Invoice, Customer, InvoiceStatus } from '@/types'
import { getInvoices, createInvoice, updateInvoiceStatus, getCustomers, getPricing } from '@/lib/db'
import { createClient } from '@/lib/supabase/client'

const statusColors: Record<InvoiceStatus, string> = {
  draft: 'bg-slate-100 text-slate-600',
  sent: 'bg-blue-100 text-blue-700',
  paid: 'bg-emerald-100 text-emerald-700',
  overdue: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-100 text-slate-400',
}

interface InvoiceForm {
  customer_id: string
  due_date: string
  qty_350ml: number
  qty_750ml: number
  notes: string
}

const due = new Date(); due.setDate(due.getDate() + 30)
const emptyForm: InvoiceForm = {
  customer_id: '', due_date: due.toISOString().split('T')[0],
  qty_350ml: 0, qty_750ml: 0, notes: '',
}

export default function InvoicesPage() {
  const router = useRouter()
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [pricing, setPricing] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<InvoiceForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [genOpen, setGenOpen] = useState(false)
  const [genMonth, setGenMonth] = useState(new Date().toISOString().slice(0, 7))
  const [generating, setGenerating] = useState(false)
  const [genResult, setGenResult] = useState<any>(null)
  const [stmtOpen, setStmtOpen] = useState(false)
  const [stmtMonth, setStmtMonth] = useState(new Date().toISOString().slice(0, 7))
  const [sendingStmts, setSendingStmts] = useState(false)
  const [stmtResult, setStmtResult] = useState<any>(null)
  const [sendingReminders, setSendingReminders] = useState(false)

  const generateMonthlyInvoices = async (dryRun = false) => {
    setGenerating(true)
    setGenResult(null)
    try {
      const res = await fetch('/api/invoices/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: genMonth, dryRun }),
      })
      const data = await res.json()
      setGenResult(data)
      if (!dryRun && data.created > 0) {
        await load() // refresh invoice list
      }
    } finally {
      setGenerating(false)
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [inv, cust, price] = await Promise.all([
        getInvoices(fresh => setInvoices(fresh)),
        getCustomers(fresh => setCustomers(fresh)),
        getPricing(),
      ])
      setInvoices(inv)
      setCustomers(cust)
      const pm: Record<string, number> = {}
      for (const p of price) pm[p.bottle_size] = p.price_per_unit
      setPricing(pm)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleSave = async () => {
    if (!form.customer_id) return
    setSaving(true)
    setOpen(false)
    try {
      const items = []
      if (form.qty_350ml > 0) items.push({ description: '350ml Glass Bottle', bottle_size: '350ml', quantity: form.qty_350ml, unit_price: pricing['350ml'] ?? 0 })
      if (form.qty_750ml > 0) items.push({ description: '750ml Glass Bottle', bottle_size: '750ml', quantity: form.qty_750ml, unit_price: pricing['750ml'] ?? 0 })
      const newInv = await createInvoice({ customer_id: form.customer_id, due_date: form.due_date, notes: form.notes, items })
      setForm(emptyForm)
      if (newInv) setInvoices(prev => [newInv, ...prev])
    } finally { setSaving(false) }
  }

  // Optimistic: update local state immediately, sync DB in background
  const changeStatus = (id: string, status: string) => {
    setInvoices(prev => prev.map(i => i.id === id ? { ...i, status: status as any } : i))
    updateInvoiceStatus(id, status)
  }

  const markAsPaid = (inv: Invoice) => {
    setInvoices(prev => prev.map(i => i.id === inv.id ? { ...i, status: 'paid' as any } : i))
    const sb = createClient()
    Promise.all([
      sb.from('invoices').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', inv.id),
      sb.from('payments').insert({
        customer_id: inv.customer_id,
        invoice_id: inv.id,
        amount: inv.total,
        currency: 'IDR',
        method: 'bank_transfer',
        payment_date: new Date().toISOString().split('T')[0],
        notes: `Auto-recorded when marked paid for invoice ${(inv as any).invoice_number}`,
      }),
    ])
  }

  const markOverdue = () => {
    const today = new Date().toISOString().split('T')[0]
    const toMark = invoices.filter(i => i.status === 'sent' && i.due_date < today)
    if (toMark.length === 0) return
    setInvoices(prev => prev.map(i => toMark.find(m => m.id === i.id) ? { ...i, status: 'overdue' as any } : i))
    Promise.all(toMark.map(i => updateInvoiceStatus(i.id, 'overdue')))
  }
  const overdueEligible = invoices.filter(i => i.status === 'sent' && i.due_date < new Date().toISOString().split('T')[0]).length

  const [bulkSending, setBulkSending] = useState(false)
  const bulkSendDrafts = async () => {
    const drafts = invoices.filter(i => i.status === 'draft')
    const withEmail = drafts.filter(i => (i.customer as any)?.contact_email)
    if (withEmail.length === 0) { alert('No draft invoices with customer email addresses'); return }
    if (!confirm(`Send ${withEmail.length} invoice email${withEmail.length > 1 ? 's' : ''} now?`)) return
    setBulkSending(true)
    let sent = 0
    for (const inv of withEmail) {
      await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'invoice', payload: { ...inv, customer: inv.customer } }),
      })
      changeStatus(inv.id, 'sent')
      sent++
    }
    setBulkSending(false)
    alert(`Sent ${sent} invoice${sent > 1 ? 's' : ''} successfully`)
  }

  const sendInvoiceEmail = async (inv: Invoice) => {
    const customer = (inv.customer as any)
    if (!customer?.contact_email) { alert('No contact email on file for this customer'); return }
    await fetch('/api/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'invoice', payload: { ...inv, customer } }),
    })
    // Move to sent if still draft
    if (inv.status === 'draft') changeStatus(inv.id, 'sent')
  }

  const sendOverdueReminders = async () => {
    if (!confirm(`Send overdue payment reminders to ${counts.overdue} customers?`)) return
    setSendingReminders(true)
    try {
      const res = await fetch('/api/invoices/remind', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      const data = await res.json()
      alert(`Reminders sent: ${data.sent} sent, ${data.skipped} skipped (no email), ${data.errors} errors`)
    } finally {
      setSendingReminders(false)
    }
  }

  const sendMonthlyStatements = async () => {
    setSendingStmts(true)
    setStmtResult(null)
    try {
      const res = await fetch('/api/invoices/statement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: stmtMonth }),
      })
      const data = await res.json()
      setStmtResult(data)
    } finally {
      setSendingStmts(false)
    }
  }

  const counts = {
    draft: invoices.filter((i) => i.status === 'draft').length,
    sent: invoices.filter((i) => i.status === 'sent').length,
    overdue: invoices.filter((i) => i.status === 'overdue').length,
    paid: invoices.filter((i) => i.status === 'paid').length,
  }

  const totalPaid = invoices
    .filter((i) => i.status === 'paid')
    .reduce((s, i) => s + Number(i.total), 0)

  const filtered = invoices.filter((i) => {
    const matchStatus = statusFilter === 'all' || i.status === statusFilter
    const matchSearch = search === '' || (i.customer as any)?.name?.toLowerCase().includes(search.toLowerCase()) || i.invoice_number.includes(search)
    return matchStatus && matchSearch
  })

  const preview = (pricing['350ml'] ?? 0) * form.qty_350ml + (pricing['750ml'] ?? 0) * form.qty_750ml

  const exportCSV = () => {
    const rows = filtered.map(inv => ({
      Invoice_Number: inv.invoice_number,
      Customer: (inv.customer as any)?.name ?? '',
      Issue_Date: inv.issue_date,
      Due_Date: inv.due_date,
      Total_IDR: Number(inv.total),
      Status: inv.status,
    }))
    const headers = Object.keys(rows[0] ?? {})
    const csv = [headers.join(','), ...rows.map(r => headers.map(h => JSON.stringify((r as any)[h] ?? '')).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'invoices.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <Topbar title="Invoices" />
      <div className="p-6 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Draft', value: counts.draft, color: 'text-slate-600' },
            { label: 'Sent / Unpaid', value: counts.sent, color: 'text-blue-600' },
            { label: 'Overdue', value: counts.overdue, color: 'text-red-600' },
            { label: 'Paid (Total)', value: idr(totalPaid), color: 'text-emerald-600' },
          ].map(({ label, value, color }) => (
            <Card key={label}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <DollarSign className={`w-5 h-5 ${color}`} />
                  <div>
                    <p className="text-xs text-slate-500">{label}</p>
                    <p className={`text-xl font-bold ${color}`}>{value}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex gap-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <Input placeholder="Search invoices..." className="pl-8 w-56" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? 'all')}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            {overdueEligible > 0 && (
              <>
                <button onClick={markOverdue} className="inline-flex items-center gap-2 rounded-md border bg-red-50 border-red-200 text-red-700 hover:bg-red-100 text-sm font-medium px-3 py-2 transition-colors">
                  Mark {overdueEligible} Overdue
                </button>
                <button onClick={sendOverdueReminders} disabled={sendingReminders} className="inline-flex items-center gap-2 rounded-md border bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100 text-sm font-medium px-3 py-2 transition-colors disabled:opacity-50">
                  {sendingReminders ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />} Send Reminders
                </button>
              </>
            )}
            {invoices.filter(i => i.status === 'draft').length > 0 && (
              <button onClick={bulkSendDrafts} disabled={bulkSending} className="inline-flex items-center gap-2 rounded-md border bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100 text-sm font-medium px-3 py-2 transition-colors disabled:opacity-50">
                {bulkSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send All Drafts ({invoices.filter(i => i.status === 'draft').length})
              </button>
            )}
            <button onClick={exportCSV} disabled={filtered.length === 0} className="inline-flex items-center gap-2 rounded-md border bg-white text-slate-600 hover:bg-slate-50 text-sm font-medium px-3 py-2 transition-colors disabled:opacity-40">
              <Download className="w-4 h-4" /> Export CSV
            </button>
            <button onClick={() => { setStmtOpen(true); setStmtResult(null) }} className="inline-flex items-center gap-2 rounded-md bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-3 py-2 transition-colors">
              <Mail className="w-4 h-4" /> Statements
            </button>
            <button onClick={() => { setGenOpen(true); setGenResult(null) }} className="inline-flex items-center gap-2 rounded-md bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium px-3 py-2 transition-colors">
              <Zap className="w-4 h-4" /> Generate Monthly
            </button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger className="inline-flex items-center gap-2 rounded-md bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium px-4 py-2 transition-colors">
              <Plus className="w-4 h-4" />
              New Invoice
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>New Invoice</DialogTitle></DialogHeader>
              <div className="grid gap-4 py-2">
                <div className="space-y-1">
                  <Label>Customer *</Label>
                  <Select value={form.customer_id} onValueChange={(v) => setForm({ ...form, customer_id: v ?? '' })}>
                    <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                    <SelectContent>
                      {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Due Date</Label>
                  <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>350ml qty <span className="text-slate-400">({idr(pricing['350ml'] ?? 0)}/btl)</span></Label>
                    <Input type="number" min="0" value={form.qty_350ml} onChange={(e) => setForm({ ...form, qty_350ml: parseInt(e.target.value) || 0 })} />
                  </div>
                  <div className="space-y-1">
                    <Label>750ml qty <span className="text-slate-400">({idr(pricing['750ml'] ?? 0)}/btl)</span></Label>
                    <Input type="number" min="0" value={form.qty_750ml} onChange={(e) => setForm({ ...form, qty_750ml: parseInt(e.target.value) || 0 })} />
                  </div>
                </div>
                {preview > 0 && (
                  <div className="bg-slate-50 rounded-lg p-3 text-sm">
                    <span className="text-slate-500">Total: </span>
                    <span className="font-bold text-slate-800">{idr(preview)}</span>
                  </div>
                )}
                <div className="space-y-1">
                  <Label>Notes</Label>
                  <Input placeholder="Optional notes..." value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button className="bg-cyan-600 hover:bg-cyan-700" onClick={handleSave} disabled={saving || !form.customer_id}>
                    {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                    Create Invoice
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        <div className="bg-white rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead>Invoice #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Issue Date</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <SkeletonRows cols={7} rows={8} />
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                      <FileText className="w-8 h-8 text-slate-200" />
                      <p className="font-medium">No invoices yet</p>
                      <p className="text-sm">Create your first invoice above</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((inv) => (
                  <TableRow key={inv.id} className="hover:bg-slate-50">
                    <TableCell className="font-mono text-sm font-medium">{inv.invoice_number}</TableCell>
                    <TableCell className="font-medium">{(inv.customer as any)?.name}</TableCell>
                    <TableCell className="text-sm text-slate-500">{inv.issue_date}</TableCell>
                    <TableCell className="text-sm text-slate-500">
                      {inv.due_date}
                      {['sent','overdue'].includes(inv.status) && inv.due_date < new Date().toISOString().split('T')[0] && (
                        <span className="ml-1.5 text-xs text-red-500 font-medium">
                          {Math.floor((Date.now() - new Date(inv.due_date).getTime()) / 86400000)}d overdue
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{idr(Number(inv.total))}</TableCell>
                    <TableCell>
                      <Badge className={`text-xs ${statusColors[inv.status]}`}>{inv.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <Select value={inv.status} onValueChange={(v) => v && changeStatus(inv.id, v)}>
                        <SelectTrigger className="h-7 text-xs w-24"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="draft">Draft</SelectItem>
                          <SelectItem value="sent">Sent</SelectItem>
                          <SelectItem value="paid">Paid</SelectItem>
                          <SelectItem value="overdue">Overdue</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {['sent', 'overdue'].includes(inv.status) && (
                          <button onClick={() => markAsPaid(inv)}
                            className="flex items-center gap-1 text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-medium px-2 py-1 rounded-lg transition-colors"
                            title="Mark as paid — creates payment record">
                            <DollarSign className="w-3 h-3" />Paid
                          </button>
                        )}
                        {['draft', 'sent', 'overdue'].includes(inv.status) && (
                          <button onClick={() => sendInvoiceEmail(inv)}
                            className="flex items-center gap-1 text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium px-2 py-1 rounded-lg transition-colors"
                            title="Send invoice by email">
                            <Send className="w-3 h-3" />Email
                          </button>
                        )}
                        <button onClick={() => router.push(`/invoices/${inv.id}`)} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors" title="View invoice">
                          <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Generate Monthly Invoices Modal */}
      {genOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={e => { if (e.target === e.currentTarget) setGenOpen(false) }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="p-6 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Zap className="w-5 h-5 text-violet-500" />Generate Monthly Invoices</h2>
                  <p className="text-sm text-slate-500 mt-1">Auto-creates invoices from completed deliveries. Skips customers already invoiced for the period.</p>
                </div>
                <button onClick={() => setGenOpen(false)} className="text-slate-400 hover:text-slate-600 p-1"><span className="text-xl">×</span></button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Billing Period</label>
                <input type="month" value={genMonth} onChange={e => { setGenMonth(e.target.value); setGenResult(null) }}
                  className="border rounded-lg px-3 py-2 text-sm w-full" />
                <p className="text-xs text-slate-400 mt-1">Counts all completed deliveries in this month. Includes bottle loss charges where applicable.</p>
              </div>

              {genResult && (
                <div className={`rounded-xl p-4 ${genResult.created > 0 ? 'bg-emerald-50 border border-emerald-200' : 'bg-slate-50 border border-slate-200'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    {genResult.created > 0 ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-slate-400" />}
                    <p className="text-sm font-semibold text-slate-800">
                      {genResult.dryRun ? 'Preview: ' : ''}{genResult.created} invoice{genResult.created !== 1 ? 's' : ''} {genResult.dryRun ? 'would be created' : 'created'}, {genResult.skipped} skipped
                    </p>
                  </div>
                  {genResult.results?.length > 0 && (
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {genResult.results.map((r: any, i: number) => (
                        <div key={i} className={`flex items-center justify-between text-xs px-2 py-1.5 rounded-lg ${r.skipped ? 'text-slate-400' : 'text-slate-700 bg-white'}`}>
                          <span className="font-medium truncate flex-1">{r.customerName}</span>
                          {r.skipped ? (
                            <span className="text-slate-400 text-xs ml-2">{r.reason ?? 'Skipped'}</span>
                          ) : (
                            <span className="font-bold text-emerald-700 ml-2">{idr(r.total)}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {genResult.message && <p className="text-xs text-slate-500 mt-1">{genResult.message}</p>}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button onClick={() => generateMonthlyInvoices(true)} disabled={generating}
                  className="flex-1 border border-slate-200 rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 flex items-center justify-center gap-2">
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Preview
                </button>
                <button onClick={() => generateMonthlyInvoices(false)} disabled={generating}
                  className="flex-1 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-bold flex items-center justify-center gap-2">
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />} Generate Invoices
                </button>
              </div>
              <p className="text-xs text-slate-400 text-center">Invoices are created as <strong>Draft</strong> — review before sending to customers.</p>
            </div>
          </div>
        </div>
      )}

      {/* Send Monthly Statements Modal */}
      {stmtOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={e => { if (e.target === e.currentTarget) setStmtOpen(false) }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="p-6 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Mail className="w-5 h-5 text-teal-500" />Send Monthly Statements</h2>
                  <p className="text-sm text-slate-500 mt-1">Email account statements to all active customers with contact emails. Includes deliveries, invoices, payments, and bottle balance.</p>
                </div>
                <button onClick={() => setStmtOpen(false)} className="text-slate-400 hover:text-slate-600 p-1"><span className="text-xl">×</span></button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Statement Period</label>
                <input type="month" value={stmtMonth} onChange={e => { setStmtMonth(e.target.value); setStmtResult(null) }}
                  className="border rounded-lg px-3 py-2 text-sm w-full" />
                <p className="text-xs text-slate-400 mt-1">Customers with no activity this month will be skipped automatically.</p>
              </div>

              {stmtResult && (
                <div className={`rounded-xl p-4 ${stmtResult.sent > 0 ? 'bg-teal-50 border border-teal-200' : 'bg-slate-50 border border-slate-200'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    {stmtResult.sent > 0 ? <CheckCircle2 className="w-4 h-4 text-teal-600" /> : <AlertCircle className="w-4 h-4 text-slate-400" />}
                    <p className="text-sm font-semibold text-slate-800">
                      {stmtResult.sent} sent · {stmtResult.skipped} skipped · {stmtResult.errors} errors
                    </p>
                  </div>
                  {stmtResult.results?.length > 0 && (
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {stmtResult.results.map((r: any, i: number) => (
                        <div key={i} className={`flex items-center justify-between text-xs px-2 py-1.5 rounded-lg ${r.status === 'sent' ? 'bg-white text-slate-700' : 'text-slate-400'}`}>
                          <span className="font-medium truncate flex-1">{r.name}</span>
                          <span className={`ml-2 ${r.status === 'sent' ? 'text-teal-600 font-semibold' : r.status === 'error' ? 'text-red-500' : 'text-slate-400'}`}>
                            {r.status === 'sent' ? '✓ Sent' : r.status === 'error' ? '✗ Error' : `Skipped: ${r.reason}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button onClick={() => setStmtOpen(false)} className="flex-1 border border-slate-200 rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
                  Cancel
                </button>
                <button onClick={sendMonthlyStatements} disabled={sendingStmts}
                  className="flex-1 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-bold flex items-center justify-center gap-2">
                  {sendingStmts ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />} Send Statements
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
