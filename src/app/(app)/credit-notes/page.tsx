'use client'

import { useState, useEffect, useCallback } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { createClient } from '@/lib/supabase/client'
import { idr } from '@/lib/format'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Plus, FileText, Loader2 } from 'lucide-react'
import { SkeletonRows } from '@/components/ui/skeleton-rows'

const statusColors: Record<string, string> = {
  issued: 'bg-blue-100 text-blue-700',
  applied: 'bg-emerald-100 text-emerald-700',
  voided: 'bg-slate-100 text-slate-400',
}

export default function CreditNotesPage() {
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
    setNotes(notesRes.data ?? [])
    setCustomers(custsRes.data ?? [])
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
    setSaving(true)
    setOpen(false)
    const sb = createClient()
    const { data: lastCN } = await sb.from('credit_notes').select('credit_note_number').order('credit_note_number', { ascending: false }).limit(1).single()
    const lastNum = lastCN?.credit_note_number ? parseInt(lastCN.credit_note_number.replace('CN-', ''), 10) : 0
    const credit_note_number = `CN-${String(lastNum + 1).padStart(5, '0')}`
    const { data } = await sb.from('credit_notes').insert({
      credit_note_number,
      customer_id: form.customer_id,
      invoice_id: form.invoice_id || null,
      amount: parseFloat(form.amount),
      reason: form.reason,
      notes: form.notes,
      status: 'issued',
    }).select('*, customer:customers(name), invoice:invoices(invoice_number)').single()
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
    <>
      <Topbar title="Credit Notes" />
      <div className="p-6 space-y-4">
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Outstanding', value: idr(totalIssued), color: 'text-blue-600' },
            { label: 'Applied', value: notes.filter(n => n.status === 'applied').length, color: 'text-emerald-600' },
            { label: 'Total Issued', value: notes.filter(n => n.status !== 'voided').length, color: 'text-slate-700' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white rounded-xl border p-4">
              <p className="text-xs text-slate-500">{label}</p>
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        <div className="flex justify-end">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger className="inline-flex items-center gap-2 rounded-md bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium px-4 py-2 transition-colors">
              <Plus className="w-4 h-4" /> Issue Credit Note
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Issue Credit Note</DialogTitle></DialogHeader>
              <div className="space-y-4 py-2">
                <div>
                  <Label>Customer *</Label>
                  <Select value={form.customer_id} onValueChange={v => setForm({ ...form, customer_id: v ?? '', invoice_id: '' })}>
                    <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                    <SelectContent>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                {invoices.length > 0 && (
                  <div>
                    <Label>Related Invoice (optional)</Label>
                    <Select value={form.invoice_id} onValueChange={v => setForm({ ...form, invoice_id: v ?? '' })}>
                      <SelectTrigger><SelectValue placeholder="Select invoice" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">— No specific invoice —</SelectItem>
                        {invoices.map(i => <SelectItem key={i.id} value={i.id}>{i.invoice_number} · {idr(Number(i.total))}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div>
                  <Label>Credit Amount (IDR) *</Label>
                  <Input type="number" min="0" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="e.g. 150000" />
                </div>
                <div>
                  <Label>Reason *</Label>
                  <Input value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="Short delivery, damaged bottles, billing error..." />
                </div>
                <div>
                  <Label>Internal Notes</Label>
                  <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button className="bg-cyan-600 hover:bg-cyan-700" onClick={handleSave} disabled={saving || !form.customer_id || !form.amount}>
                    {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Issue Credit Note
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="bg-white rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead>Credit Note #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Related Invoice</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? <SkeletonRows cols={8} rows={5} /> : notes.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-10 text-slate-400">
                  <FileText className="w-8 h-8 mx-auto mb-2 text-slate-200" />
                  <p>No credit notes yet</p>
                </TableCell></TableRow>
              ) : notes.map(n => (
                <TableRow key={n.id}>
                  <TableCell className="font-mono font-medium">{n.credit_note_number}</TableCell>
                  <TableCell>{n.customer?.name}</TableCell>
                  <TableCell className="text-slate-500">{n.invoice?.invoice_number ?? '—'}</TableCell>
                  <TableCell className="font-medium text-blue-700">{idr(Number(n.amount))}</TableCell>
                  <TableCell className="text-slate-600 max-w-48 truncate">{n.reason}</TableCell>
                  <TableCell className="text-slate-500">{new Date(n.issued_at).toLocaleDateString('en-GB')}</TableCell>
                  <TableCell><Badge className={statusColors[n.status] ?? ''}>{n.status}</Badge></TableCell>
                  <TableCell>
                    {n.status === 'issued' && (
                      <div className="flex gap-1">
                        <button onClick={() => updateStatus(n.id, 'applied')} className="text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-medium px-2 py-1 rounded-lg">Apply</button>
                        <button onClick={() => updateStatus(n.id, 'voided')} className="text-xs bg-slate-50 hover:bg-slate-100 text-slate-500 font-medium px-2 py-1 rounded-lg">Void</button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </>
  )
}
