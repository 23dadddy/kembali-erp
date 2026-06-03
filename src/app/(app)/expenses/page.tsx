'use client'

import { useState, useEffect, useCallback } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { createClient } from '@/lib/supabase/client'
import { idr } from '@/lib/format'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Receipt, Check, X, Loader2, Download } from 'lucide-react'
import { SkeletonRows } from '@/components/ui/skeleton-rows'

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-blue-100 text-blue-700',
  rejected: 'bg-red-100 text-red-500',
  paid: 'bg-emerald-100 text-emerald-700',
}

const CATEGORIES = ['fuel','food','supplies','transport','maintenance','accommodation','entertainment','other']

export default function ExpensesPage() {
  const [claims, setClaims] = useState<any[]>([])
  const [staff, setStaff] = useState<any[]>([])
  const [myStaff, setMyStaff] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [filterStatus, setFilterStatus] = useState('all')
  const [form, setForm] = useState({ staff_id: '', category: 'fuel', amount: '', description: '', expense_date: new Date().toISOString().split('T')[0], notes: '' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const sb = createClient()
    const { data: { user } } = await sb.auth.getUser()
    const [claimsRes, staffRes, myRes] = await Promise.all([
      sb.from('expense_claims').select('*, staff:staff!staff_id(name,role), approver:staff!approved_by(name)').order('created_at', { ascending: false }),
      sb.from('staff').select('id, name, role').eq('active', true).order('name'),
      user ? sb.from('staff').select('id, name, role').eq('auth_user_id', user.id).single() : Promise.resolve({ data: null }),
    ])
    setClaims(claimsRes.data ?? [])
    setStaff(staffRes.data ?? [])
    setMyStaff((myRes as any).data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (myStaff && !form.staff_id) setForm(f => ({ ...f, staff_id: myStaff.id }))
  }, [myStaff])

  const handleSave = async () => {
    if (!form.staff_id || !form.amount || !form.description) return
    setSaving(true); setOpen(false)
    const sb = createClient()
    const { data } = await sb.from('expense_claims').insert({
      staff_id: form.staff_id,
      category: form.category,
      amount: parseFloat(form.amount),
      description: form.description,
      expense_date: form.expense_date,
      notes: form.notes || null,
      status: 'pending',
    }).select('*, staff:staff!staff_id(name,role), approver:staff!approved_by(name)').single()
    if (data) setClaims(prev => [data, ...prev])
    setForm({ staff_id: myStaff?.id ?? '', category: 'fuel', amount: '', description: '', expense_date: new Date().toISOString().split('T')[0], notes: '' })
    setSaving(false)
  }

  const updateStatus = (id: string, status: string) => {
    setClaims(prev => prev.map(c => c.id === id ? { ...c, status } : c))
    const sb = createClient()
    const extra: any = {}
    if (status === 'approved') { extra.approved_by = myStaff?.id ?? null; extra.approved_at = new Date().toISOString() }
    if (status === 'paid') extra.paid_at = new Date().toISOString()
    sb.from('expense_claims').update({ status, ...extra }).eq('id', id)
  }

  const filtered = filterStatus === 'all' ? claims : claims.filter(c => c.status === filterStatus)
  const pendingTotal = claims.filter(c => c.status === 'pending').reduce((s, c) => s + Number(c.amount), 0)
  const approvedTotal = claims.filter(c => c.status === 'approved').reduce((s, c) => s + Number(c.amount), 0)
  const isManager = myStaff?.role === 'manager' || myStaff?.role === 'admin'

  return (
    <>
      <Topbar title="Expense Claims" />
      <div className="p-6 space-y-4">
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Pending Review', value: claims.filter(c=>c.status==='pending').length, sub: idr(pendingTotal), color: 'text-amber-600' },
            { label: 'Approved (Unpaid)', value: claims.filter(c=>c.status==='approved').length, sub: idr(approvedTotal), color: 'text-blue-600' },
            { label: 'Paid This Month', value: claims.filter(c=>c.status==='paid' && c.paid_at?.startsWith(new Date().toISOString().slice(0,7))).length, sub: '', color: 'text-emerald-600' },
            { label: 'Total Claims', value: claims.length, sub: '', color: 'text-slate-700' },
          ].map(({ label, value, sub, color }) => (
            <div key={label} className="bg-white rounded-xl border p-4">
              <p className="text-xs text-slate-500">{label}</p>
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
              {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3">
          <Select value={filterStatus} onValueChange={v => setFilterStatus(v ?? 'all')}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => {
              const filtered = filterStatus === 'all' ? claims : claims.filter(c => c.status === filterStatus)
              const rows = filtered.map(c => ({
                Staff: (c.staff as any)?.name ?? '',
                Role: (c.staff as any)?.role ?? '',
                Category: c.category,
                Description: c.description,
                Amount_IDR: c.amount,
                Date: c.expense_date,
                Status: c.status,
                Approved_By: (c.approver as any)?.name ?? '',
              }))
              const headers = Object.keys(rows[0] ?? {})
              const csv = [headers.join(','), ...rows.map(r => headers.map(h => JSON.stringify((r as any)[h] ?? '')).join(','))].join('\n')
              const a = document.createElement('a')
              a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
              a.download = `expenses.csv`; a.click()
            }}>
              <Download className="w-4 h-4 mr-2" /> Export CSV
            </Button>
            <Button className="bg-cyan-600 hover:bg-cyan-700" onClick={() => setOpen(true)}>
              <Plus className="w-4 h-4 mr-2" /> Submit Claim
            </Button>
          </div>
        </div>

        <div className="bg-white rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead>Staff</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                {isManager && <TableHead>Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? <SkeletonRows cols={isManager ? 7 : 6} rows={6} /> : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-10 text-slate-400">
                  <Receipt className="w-8 h-8 mx-auto mb-2 text-slate-200" />
                  No expense claims
                </TableCell></TableRow>
              ) : filtered.map(c => (
                <TableRow key={c.id}>
                  <TableCell>
                    <p className="font-medium text-slate-700">{c.staff?.name}</p>
                    <p className="text-xs text-slate-400 capitalize">{c.staff?.role}</p>
                  </TableCell>
                  <TableCell><span className="capitalize">{c.category}</span></TableCell>
                  <TableCell className="max-w-48 truncate text-slate-600">{c.description}</TableCell>
                  <TableCell className="text-slate-500">{c.expense_date}</TableCell>
                  <TableCell className="font-medium">{idr(Number(c.amount))}</TableCell>
                  <TableCell><Badge className={STATUS_COLORS[c.status]}>{c.status}</Badge></TableCell>
                  {isManager && (
                    <TableCell>
                      <div className="flex gap-1">
                        {c.status === 'pending' && (
                          <>
                            <button onClick={() => updateStatus(c.id, 'approved')} className="text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-medium px-2 py-1 rounded-lg flex items-center gap-1"><Check className="w-3 h-3" />Approve</button>
                            <button onClick={() => updateStatus(c.id, 'rejected')} className="text-xs bg-red-50 hover:bg-red-100 text-red-600 font-medium px-2 py-1 rounded-lg flex items-center gap-1"><X className="w-3 h-3" />Reject</button>
                          </>
                        )}
                        {c.status === 'approved' && (
                          <button onClick={() => updateStatus(c.id, 'paid')} className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium px-2 py-1 rounded-lg">Mark Paid</button>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Submit Expense Claim</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Staff Member *</Label>
              <Select value={form.staff_id} onValueChange={v => setForm({...form, staff_id: v ?? ''})}>
                <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
                <SelectContent>{staff.map(s => <SelectItem key={s.id} value={s.id}>{s.name} — {s.role}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Category *</Label>
                <Select value={form.category} onValueChange={v => setForm({...form, category: v ?? 'other'})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Date *</Label>
                <Input type="date" value={form.expense_date} onChange={e => setForm({...form, expense_date: e.target.value})} />
              </div>
            </div>
            <div><Label>Amount (IDR) *</Label><Input type="number" min="0" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} placeholder="e.g. 150000" /></div>
            <div><Label>Description *</Label><Input value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="What was this expense for?" /></div>
            <div><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={2} /></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button className="bg-cyan-600 hover:bg-cyan-700" onClick={handleSave} disabled={saving || !form.staff_id || !form.amount || !form.description}>
                {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Submit Claim
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
