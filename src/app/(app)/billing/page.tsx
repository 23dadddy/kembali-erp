'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Topbar } from '@/components/layout/topbar'
import { useLanguage } from '@/components/providers/language-provider'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Plus, Search, FileText, DollarSign, Loader2, ExternalLink, Download, Mail, Send, Zap, CheckCircle2, AlertCircle } from 'lucide-react'
import { SkeletonRows } from '@/components/ui/skeleton-rows'
import { idr } from '@/lib/format'
import { Card, CardContent } from '@/components/ui/card'
import { Invoice, Customer, InvoiceStatus } from '@/types'
import { getInvoices, createInvoice, updateInvoiceStatus, getCustomers, getPricing } from '@/lib/db'
import { createClient } from '@/lib/supabase/client'

type Tab = 'invoices' | 'credit-notes'

const statusColors: Record<InvoiceStatus, string> = {
  draft: 'bg-slate-100 text-slate-600',
  sent: 'bg-blue-100 text-blue-700',
  paid: 'bg-emerald-100 text-emerald-700',
  overdue: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-100 text-slate-400',
}
const cnStatusColors: Record<string, string> = {
  issued: 'bg-blue-100 text-blue-700',
  applied: 'bg-emerald-100 text-emerald-700',
  voided: 'bg-slate-100 text-slate-400',
}

const due = new Date(); due.setDate(due.getDate() + 30)
const emptyForm = { customer_id: '', due_date: due.toISOString().split('T')[0], qty_350ml: 0, qty_750ml: 0, notes: '' }

// ─── INVOICES TAB ─────────────────────────────────────────────────────────────
function InvoicesTab() {
  const router = useRouter()
  const { t } = useLanguage()
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [pricing, setPricing] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
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
  const [pendingPayments, setPendingPayments] = useState<any[]>([])
  const [bulkSending, setBulkSending] = useState(false)

  const loadPendingPayments = useCallback(async () => {
    const sb = createClient()
    const { data } = await sb.from('payments').select('*, invoice:invoices(invoice_number, total), customer:customers(name)').eq('status', 'pending_verification').order('created_at', { ascending: false })
    setPendingPayments(data ?? [])
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [inv, cust, price] = await Promise.all([getInvoices(f => setInvoices(f)), getCustomers(f => setCustomers(f)), getPricing()])
      setInvoices(inv); setCustomers(cust)
      const pm: Record<string, number> = {}
      for (const p of price) pm[p.bottle_size] = p.price_per_unit
      setPricing(pm)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load(); loadPendingPayments() }, [load, loadPendingPayments])

  const verifyPayment = async (paymentId: string, invoiceId: string) => {
    const sb = createClient()
    await Promise.all([sb.from('payments').update({ status: 'verified' }).eq('id', paymentId), sb.from('invoices').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', invoiceId)])
    setPendingPayments(prev => prev.filter(p => p.id !== paymentId))
    setInvoices(prev => prev.map(i => i.id === invoiceId ? { ...i, status: 'paid' as any } : i))
  }

  const generateMonthlyInvoices = async (dryRun = false) => {
    setGenerating(true); setGenResult(null)
    try {
      const res = await fetch('/api/invoices/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month: genMonth, dryRun }) })
      const data = await res.json(); setGenResult(data)
      if (!dryRun && data.created > 0) await load()
    } finally { setGenerating(false) }
  }

  const handleSave = async () => {
    if (!form.customer_id) return
    setSaving(true); setOpen(false)
    try {
      const items = []
      if (form.qty_350ml > 0) items.push({ description: '350ml Glass Bottle', bottle_size: '350ml', quantity: form.qty_350ml, unit_price: pricing['350ml'] ?? 0 })
      if (form.qty_750ml > 0) items.push({ description: '750ml Glass Bottle', bottle_size: '750ml', quantity: form.qty_750ml, unit_price: pricing['750ml'] ?? 0 })
      const newInv = await createInvoice({ customer_id: form.customer_id, due_date: form.due_date, notes: form.notes, items })
      setForm(emptyForm); if (newInv) setInvoices(prev => [newInv, ...prev])
    } finally { setSaving(false) }
  }

  const changeStatus = (id: string, status: string) => {
    setInvoices(prev => prev.map(i => i.id === id ? { ...i, status: status as any } : i))
    updateInvoiceStatus(id, status)
  }

  const markAsPaid = (inv: Invoice) => {
    setInvoices(prev => prev.map(i => i.id === inv.id ? { ...i, status: 'paid' as any } : i))
    const sb = createClient()
    Promise.all([sb.from('invoices').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', inv.id), sb.from('payments').insert({ customer_id: inv.customer_id, invoice_id: inv.id, amount: inv.total, currency: 'IDR', method: 'bank_transfer', payment_date: new Date().toISOString().split('T')[0], notes: `Auto-recorded for ${(inv as any).invoice_number}` })])
  }

  const markOverdue = () => {
    const today = new Date().toISOString().split('T')[0]
    const toMark = invoices.filter(i => i.status === 'sent' && i.due_date < today)
    if (toMark.length === 0) return
    setInvoices(prev => prev.map(i => toMark.find(m => m.id === i.id) ? { ...i, status: 'overdue' as any } : i))
    Promise.all(toMark.map(i => updateInvoiceStatus(i.id, 'overdue')))
  }
  const overdueEligible = invoices.filter(i => i.status === 'sent' && i.due_date < new Date().toISOString().split('T')[0]).length

  const bulkSendDrafts = async () => {
    const drafts = invoices.filter(i => i.status === 'draft').filter(i => (i.customer as any)?.contact_email)
    if (drafts.length === 0) { alert('No draft invoices with customer email addresses'); return }
    if (!confirm(`Send ${drafts.length} invoice emails now?`)) return
    setBulkSending(true)
    for (const inv of drafts) {
      await fetch('/api/email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'invoice', payload: { ...inv, customer: inv.customer } }) })
      changeStatus(inv.id, 'sent')
    }
    setBulkSending(false)
    alert(`Sent ${drafts.length} invoices`)
  }

  const sendOverdueReminders = async () => {
    if (!confirm(`Send overdue payment reminders to ${counts.overdue} customers?`)) return
    setSendingReminders(true)
    try {
      const res = await fetch('/api/invoices/remind', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      const data = await res.json()
      alert(`Reminders: ${data.sent} sent, ${data.skipped} skipped, ${data.errors} errors`)
    } finally { setSendingReminders(false) }
  }

  const sendMonthlyStatements = async () => {
    setSendingStmts(true); setStmtResult(null)
    try {
      const res = await fetch('/api/invoices/statement', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month: stmtMonth }) })
      setStmtResult(await res.json())
    } finally { setSendingStmts(false) }
  }

  const counts = {
    draft: invoices.filter(i => i.status === 'draft').length,
    sent: invoices.filter(i => i.status === 'sent').length,
    overdue: invoices.filter(i => i.status === 'overdue').length,
    paid: invoices.filter(i => i.status === 'paid').length,
  }
  const totalPaid = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.total), 0)
  const filtered = invoices.filter(i => {
    const matchStatus = statusFilter === 'all' || i.status === statusFilter
    const matchSearch = search === '' || (i.customer as any)?.name?.toLowerCase().includes(search.toLowerCase()) || i.invoice_number.includes(search)
    return matchStatus && matchSearch
  })
  const preview = (pricing['350ml'] ?? 0) * form.qty_350ml + (pricing['750ml'] ?? 0) * form.qty_750ml

  return (
    <div className="p-6 space-y-4">
      {pendingPayments.length > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3"><CheckCircle2 className="w-4 h-4 text-emerald-600" /><p className="text-sm font-semibold text-emerald-800">{pendingPayments.length} {t('billing_payment_notifications')}</p></div>
          <div className="space-y-2">
            {pendingPayments.map(p => (
              <div key={p.id} className="flex items-center gap-3 bg-white rounded-lg px-3 py-2 text-sm">
                <div className="flex-1 min-w-0"><span className="font-medium text-slate-800">{(p.customer as any)?.name}</span><span className="text-slate-400 mx-2">·</span><span className="text-slate-600">{(p.invoice as any)?.invoice_number}</span></div>
                <span className="text-emerald-700 font-semibold">{idr(Number(p.amount))}</span>
                <button onClick={() => verifyPayment(p.id, p.invoice_id)} className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded-lg flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />{t('billing_verify_mark_paid')}</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-4 gap-4">
        {[
          { label: t('billing_draft'), value: counts.draft, color: 'text-slate-600' },
          { label: t('billing_sent'), value: counts.sent, color: 'text-blue-600' },
          { label: t('billing_overdue'), value: counts.overdue, color: 'text-red-600' },
          { label: t('billing_paid'), value: idr(totalPaid), color: 'text-emerald-600' },
        ].map(({ label, value, color }) => (
          <Card key={label}><CardContent className="pt-4 pb-4"><div className="flex items-center gap-3"><DollarSign className={`w-5 h-5 ${color}`} /><div><p className="text-xs text-slate-500">{label}</p><p className={`text-xl font-bold ${color}`}>{value}</p></div></div></CardContent></Card>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-3">
          <div className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" /><Input placeholder={t('search')} className="pl-8 w-56" value={search} onChange={e => setSearch(e.target.value)} /></div>
          <Select value={statusFilter} onValueChange={v => setStatusFilter(v ?? 'all')}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t('billing_all_status')}</SelectItem><SelectItem value="draft">{t('billing_draft')}</SelectItem><SelectItem value="sent">{t('billing_sent')}</SelectItem><SelectItem value="paid">{t('billing_paid')}</SelectItem><SelectItem value="overdue">{t('billing_overdue')}</SelectItem></SelectContent></Select>
        </div>
        <div className="flex gap-2 flex-wrap">
          {overdueEligible > 0 && <><button onClick={markOverdue} className="inline-flex items-center gap-2 rounded-md border bg-red-50 border-red-200 text-red-700 hover:bg-red-100 text-sm font-medium px-3 py-2">{t('billing_mark_overdue')} {overdueEligible}</button><button onClick={sendOverdueReminders} disabled={sendingReminders} className="inline-flex items-center gap-2 rounded-md border bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100 text-sm font-medium px-3 py-2 disabled:opacity-50">{sendingReminders ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}{t('billing_reminders')}</button></>}
          {invoices.filter(i => i.status === 'draft').length > 0 && <button onClick={bulkSendDrafts} disabled={bulkSending} className="inline-flex items-center gap-2 rounded-md border bg-blue-50 border-blue-200 text-blue-700 text-sm font-medium px-3 py-2 disabled:opacity-50">{bulkSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}{t('billing_send_all_drafts')} ({invoices.filter(i => i.status === 'draft').length})</button>}
          <button onClick={() => { setStmtOpen(true); setStmtResult(null) }} className="inline-flex items-center gap-2 rounded-md bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-3 py-2"><Mail className="w-4 h-4" />{t('billing_send_statements')}</button>
          <button onClick={() => { setGenOpen(true); setGenResult(null) }} className="inline-flex items-center gap-2 rounded-md bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium px-3 py-2"><Zap className="w-4 h-4" />{t('billing_generate')}</button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger className="inline-flex items-center gap-2 rounded-md bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium px-4 py-2"><Plus className="w-4 h-4" />{t('billing_new_invoice')}</DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>{t('billing_new_invoice')}</DialogTitle></DialogHeader>
              <div className="grid gap-4 py-2">
                <div className="space-y-1"><Label>{t('billing_customer')} *</Label><Select value={form.customer_id} onValueChange={v => setForm({ ...form, customer_id: v ?? '' })}><SelectTrigger><SelectValue placeholder={t('dispatch_select_customer')} /></SelectTrigger><SelectContent>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1"><Label>{t('billing_due_date')}</Label><Input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label>{t('dispatch_qty_350')}</Label><Input type="number" min="0" value={form.qty_350ml} onChange={e => setForm({ ...form, qty_350ml: parseInt(e.target.value) || 0 })} /></div>
                  <div className="space-y-1"><Label>{t('dispatch_qty_750')}</Label><Input type="number" min="0" value={form.qty_750ml} onChange={e => setForm({ ...form, qty_750ml: parseInt(e.target.value) || 0 })} /></div>
                </div>
                {preview > 0 && <div className="bg-slate-50 rounded-lg p-3 text-sm"><span className="text-slate-500">{t('total')}: </span><span className="font-bold text-slate-800">{idr(preview)}</span></div>}
                <div className="space-y-1"><Label>{t('notes')}</Label><Input placeholder="Optional notes..." value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
                <div className="flex justify-end gap-2 pt-2"><Button variant="outline" onClick={() => setOpen(false)}>{t('cancel')}</Button><Button className="bg-cyan-600 hover:bg-cyan-700" onClick={handleSave} disabled={saving || !form.customer_id}>{saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}{t('billing_create_invoice')}</Button></div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="bg-white rounded-xl border">
        <Table>
          <TableHeader><TableRow className="bg-slate-50"><TableHead>{t('billing_invoice_number')}</TableHead><TableHead>{t('billing_customer')}</TableHead><TableHead>{t('billing_issue_date')}</TableHead><TableHead>{t('billing_due_date')}</TableHead><TableHead>{t('total')}</TableHead><TableHead>{t('billing_status')}</TableHead><TableHead></TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {loading ? <SkeletonRows cols={8} rows={8} /> : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-12 text-slate-400"><FileText className="w-8 h-8 text-slate-200 mx-auto mb-2" /><p className="font-medium">{t('billing_no_invoices')}</p></TableCell></TableRow>
            ) : filtered.map(inv => (
              <TableRow key={inv.id} className="hover:bg-slate-50">
                <TableCell className="font-mono text-sm font-medium">{inv.invoice_number}</TableCell>
                <TableCell className="font-medium">{(inv.customer as any)?.name}</TableCell>
                <TableCell className="text-sm text-slate-500">{inv.issue_date}</TableCell>
                <TableCell className="text-sm text-slate-500">{inv.due_date}{['sent','overdue'].includes(inv.status) && inv.due_date < new Date().toISOString().split('T')[0] && <span className="ml-1.5 text-xs text-red-500 font-medium">{Math.floor((Date.now() - new Date(inv.due_date).getTime()) / 86400000)}d overdue</span>}</TableCell>
                <TableCell className="font-medium">{idr(Number(inv.total))}</TableCell>
                <TableCell><Badge className={`text-xs ${statusColors[inv.status]}`}>{inv.status}</Badge></TableCell>
                <TableCell><Select value={inv.status} onValueChange={v => v && changeStatus(inv.id, v)}><SelectTrigger className="h-7 text-xs w-24"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="draft">{t('billing_draft')}</SelectItem><SelectItem value="sent">{t('billing_sent')}</SelectItem><SelectItem value="paid">{t('billing_paid')}</SelectItem><SelectItem value="overdue">{t('billing_overdue')}</SelectItem><SelectItem value="cancelled">{t('cancelled')}</SelectItem></SelectContent></Select></TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    {['sent','overdue'].includes(inv.status) && <button onClick={() => markAsPaid(inv)} className="flex items-center gap-1 text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-medium px-2 py-1 rounded-lg"><DollarSign className="w-3 h-3" />{t('billing_paid')}</button>}
                    <button onClick={() => router.push(`/invoices/${inv.id}`)} className="p-1.5 hover:bg-slate-100 rounded-lg"><ExternalLink className="w-3.5 h-3.5 text-slate-400" /></button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {genOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={e => { if (e.target === e.currentTarget) setGenOpen(false) }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div><h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Zap className="w-5 h-5 text-violet-500" />{t('billing_generate')}</h2><p className="text-sm text-slate-500 mt-1">{t('billing_generate_desc')}</p></div>
              <button onClick={() => setGenOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 text-xl">×</button>
            </div>
            <div className="p-6 space-y-4">
              <div><label className="block text-sm font-medium text-slate-700 mb-1">{t('billing_period')}</label><input type="month" value={genMonth} onChange={e => { setGenMonth(e.target.value); setGenResult(null) }} className="border rounded-lg px-3 py-2 text-sm w-full" /></div>
              {genResult && (
                <div className={`rounded-xl p-4 ${genResult.created > 0 ? 'bg-emerald-50 border border-emerald-200' : 'bg-slate-50 border border-slate-200'}`}>
                  <p className="text-sm font-semibold text-slate-800">{genResult.dryRun ? 'Preview: ' : ''}{genResult.created} invoice{genResult.created !== 1 ? 's' : ''} {genResult.dryRun ? 'would be created' : 'created'}, {genResult.skipped} skipped</p>
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <button onClick={() => generateMonthlyInvoices(true)} disabled={generating} className="flex-1 border border-slate-200 rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 flex items-center justify-center gap-2">{generating && <Loader2 className="w-4 h-4 animate-spin" />}{t('billing_preview')}</button>
                <button onClick={() => generateMonthlyInvoices(false)} disabled={generating} className="flex-1 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-bold flex items-center justify-center gap-2">{generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}{t('generate')}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {stmtOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={e => { if (e.target === e.currentTarget) setStmtOpen(false) }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div><h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Mail className="w-5 h-5 text-teal-500" />{t('billing_send_statements')}</h2><p className="text-sm text-slate-500 mt-1">{t('billing_statements_desc')}</p></div>
              <button onClick={() => setStmtOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 text-xl">×</button>
            </div>
            <div className="p-6 space-y-4">
              <div><label className="block text-sm font-medium text-slate-700 mb-1">{t('billing_statement_period')}</label><input type="month" value={stmtMonth} onChange={e => { setStmtMonth(e.target.value); setStmtResult(null) }} className="border rounded-lg px-3 py-2 text-sm w-full" /></div>
              {stmtResult && <div className={`rounded-xl p-4 ${stmtResult.sent > 0 ? 'bg-teal-50 border border-teal-200' : 'bg-slate-50 border border-slate-200'}`}><p className="text-sm font-semibold text-slate-800">{stmtResult.sent} sent · {stmtResult.skipped} skipped · {stmtResult.errors} errors</p></div>}
              <div className="flex gap-2 pt-2">
                <button onClick={() => setStmtOpen(false)} className="flex-1 border border-slate-200 rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">{t('cancel')}</button>
                <button onClick={sendMonthlyStatements} disabled={sendingStmts} className="flex-1 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-bold flex items-center justify-center gap-2">{sendingStmts ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}{t('billing_send_statements')}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── CREDIT NOTES TAB ─────────────────────────────────────────────────────────
function CreditNotesTab() {
  const { t } = useLanguage()
  const [notes, setNotes] = useState<any[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [invoices, setInvoices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ customer_id: '', invoice_id: '', amount: '', reason: '', notes: '' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const sb = createClient()
    const [notesRes, custsRes] = await Promise.all([
      sb.from('credit_notes').select('*, customer:customers(name), invoice:invoices(invoice_number)').order('issued_at', { ascending: false }),
      sb.from('customers').select('id, name').order('name'),
    ])
    setNotes(notesRes.data ?? []); setCustomers(custsRes.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!form.customer_id) return
    const sb = createClient()
    sb.from('invoices').select('id, invoice_number, total').eq('customer_id', form.customer_id).in('status', ['sent', 'overdue', 'paid']).then(({ data }) => setInvoices(data ?? []))
  }, [form.customer_id])

  const handleSave = async () => {
    if (!form.customer_id || !form.amount) return
    setSaving(true); setOpen(false)
    const sb = createClient()
    const { data: lastCN } = await sb.from('credit_notes').select('credit_note_number').order('credit_note_number', { ascending: false }).limit(1).single()
    const lastNum = lastCN?.credit_note_number ? parseInt(lastCN.credit_note_number.replace('CN-', ''), 10) : 0
    const credit_note_number = `CN-${String(lastNum + 1).padStart(5, '0')}`
    const { data } = await sb.from('credit_notes').insert({ credit_note_number, customer_id: form.customer_id, invoice_id: form.invoice_id || null, amount: parseFloat(form.amount), reason: form.reason, notes: form.notes, status: 'issued' }).select('*, customer:customers(name), invoice:invoices(invoice_number)').single()
    if (data) setNotes(prev => [data, ...prev])
    setForm({ customer_id: '', invoice_id: '', amount: '', reason: '', notes: '' })
    setSaving(false)
  }

  const updateStatus = (id: string, status: string) => {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, status } : n))
    const sb = createClient()
    sb.from('credit_notes').update({ status, applied_at: status === 'applied' ? new Date().toISOString() : null }).eq('id', id)
  }

  const totalIssued = notes.filter(n => n.status === 'issued').reduce((s, n) => s + Number(n.amount), 0)

  return (
    <div className="p-6 space-y-4">
      <div className="grid grid-cols-3 gap-4">
        {[
          { labelKey: 'billing_cn_outstanding' as const, value: idr(totalIssued), color: 'text-blue-600' },
          { labelKey: 'billing_cn_applied' as const, value: notes.filter(n => n.status === 'applied').length, color: 'text-emerald-600' },
          { labelKey: 'billing_cn_total_issued' as const, value: notes.filter(n => n.status !== 'voided').length, color: 'text-slate-700' },
        ].map(({ labelKey, value, color }) => (
          <div key={labelKey} className="bg-white rounded-xl border p-4"><p className="text-xs text-slate-500">{t(labelKey)}</p><p className={`text-2xl font-bold ${color}`}>{value}</p></div>
        ))}
      </div>

      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger className="inline-flex items-center gap-2 rounded-md bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium px-4 py-2"><Plus className="w-4 h-4" />{t('billing_issue_credit_note')}</DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{t('billing_issue_credit_note')}</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div><Label>{t('billing_customer')} *</Label><Select value={form.customer_id} onValueChange={v => setForm({ ...form, customer_id: v ?? '', invoice_id: '' })}><SelectTrigger><SelectValue placeholder={t('dispatch_select_customer')} /></SelectTrigger><SelectContent>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
              {invoices.length > 0 && <div><Label>{t('billing_related_invoice')}</Label><Select value={form.invoice_id} onValueChange={v => setForm({ ...form, invoice_id: v ?? '' })}><SelectTrigger><SelectValue placeholder={t('billing_select_invoice')} /></SelectTrigger><SelectContent><SelectItem value="">— {t('billing_no_invoice')} —</SelectItem>{invoices.map(i => <SelectItem key={i.id} value={i.id}>{i.invoice_number} · {idr(Number(i.total))}</SelectItem>)}</SelectContent></Select></div>}
              <div><Label>{t('billing_credit_amount')} *</Label><Input type="number" min="0" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="e.g. 150000" /></div>
              <div><Label>{t('billing_credit_note_reason')} *</Label><Input value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="Short delivery, damaged bottles..." /></div>
              <div><Label>{t('billing_internal_notes')}</Label><Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
              <div className="flex justify-end gap-2 pt-2"><Button variant="outline" onClick={() => setOpen(false)}>{t('cancel')}</Button><Button className="bg-cyan-600 hover:bg-cyan-700" onClick={handleSave} disabled={saving || !form.customer_id || !form.amount}>{saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}{t('billing_issue_credit_note')}</Button></div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-white rounded-xl border">
        <Table>
          <TableHeader><TableRow className="bg-slate-50"><TableHead>{t('billing_credit_note_number')}</TableHead><TableHead>{t('billing_customer')}</TableHead><TableHead>{t('billing_invoice_number')}</TableHead><TableHead>{t('amount')}</TableHead><TableHead>{t('billing_credit_note_reason')}</TableHead><TableHead>{t('billing_issue_date')}</TableHead><TableHead>{t('status')}</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {loading ? <SkeletonRows cols={8} rows={5} /> : notes.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-10 text-slate-400"><FileText className="w-8 h-8 mx-auto mb-2 text-slate-200" /><p>{t('billing_no_credit_notes')}</p></TableCell></TableRow>
            ) : notes.map(n => (
              <TableRow key={n.id}>
                <TableCell className="font-mono font-medium">{n.credit_note_number}</TableCell>
                <TableCell>{n.customer?.name}</TableCell>
                <TableCell className="text-slate-500">{n.invoice?.invoice_number ?? '—'}</TableCell>
                <TableCell className="font-medium text-blue-700">{idr(Number(n.amount))}</TableCell>
                <TableCell className="text-slate-600 max-w-48 truncate">{n.reason}</TableCell>
                <TableCell className="text-slate-500">{new Date(n.issued_at).toLocaleDateString('en-GB')}</TableCell>
                <TableCell><Badge className={cnStatusColors[n.status] ?? ''}>{n.status}</Badge></TableCell>
                <TableCell>{n.status === 'issued' && <div className="flex gap-1"><button onClick={() => updateStatus(n.id, 'applied')} className="text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-medium px-2 py-1 rounded-lg">{t('billing_apply')}</button><button onClick={() => updateStatus(n.id, 'voided')} className="text-xs bg-slate-50 hover:bg-slate-100 text-slate-500 font-medium px-2 py-1 rounded-lg">{t('billing_void')}</button></div>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

// ─── MAIN PAGE ─────────────────────────────────────────────────────────────────
const TAB_KEYS_BILLING = [
  { id: 'invoices' as Tab, labelKey: 'billing_invoices' as const },
  { id: 'credit-notes' as Tab, labelKey: 'billing_credit_notes' as const },
]

export default function BillingPage() {
  const [tab, setTab] = useState<Tab>('invoices')
  const { t } = useLanguage()
  return (
    <>
      <Topbar title="billing_title" titleIsKey />
      <div className="bg-white border-b border-slate-200 px-6">
        <div className="flex gap-1">
          {TAB_KEYS_BILLING.map(({ id, labelKey }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${tab === id ? 'border-cyan-600 text-cyan-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
              {t(labelKey)}
            </button>
          ))}
        </div>
      </div>
      {tab === 'invoices' && <InvoicesTab />}
      {tab === 'credit-notes' && <CreditNotesTab />}
    </>
  )
}
