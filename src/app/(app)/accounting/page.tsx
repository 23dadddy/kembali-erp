'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import { getExpenses, createExpense, getPayments, createPayment, getCustomers, getInvoices } from '@/lib/db'
import { idr } from '@/lib/format'
import type { Expense, Payment, Customer, Invoice } from '@/types'
import {
  DollarSign, Plus, Check, X, Loader2, TrendingUp, TrendingDown,
  CreditCard, Receipt, ArrowUpRight, ArrowDownRight, BarChart3, BookOpen,
  ShoppingCart, Banknote
} from 'lucide-react'

type Tab = 'overview' | 'expenses' | 'payments' | 'purchase-orders' | 'accounts' | 'reports' | 'payroll'

const EXPENSE_CATEGORIES = ['fuel', 'maintenance', 'payroll', 'supplies', 'marketing', 'rent', 'utilities', 'other']
const PAYMENT_METHODS = ['bank_transfer', 'cash', 'credit_card', 'qris', 'cheque', 'other']
const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700', approved: 'bg-blue-100 text-blue-700',
  paid: 'bg-emerald-100 text-emerald-700', rejected: 'bg-red-100 text-red-600',
}

function FinanceContent() {
  const [tab, setTab] = useState<'overview' | 'expenses' | 'payments'>('overview')
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [showExpenseForm, setShowExpenseForm] = useState(false)
  const [showPaymentForm, setShowPaymentForm] = useState(false)
  const [expenseForm, setExpenseForm] = useState<Partial<Expense>>({ category: 'other', expense_date: new Date().toISOString().split('T')[0], status: 'pending', amount: 0, currency: 'IDR' })
  const [paymentForm, setPaymentForm] = useState<Partial<Payment>>({ method: 'bank_transfer', payment_date: new Date().toISOString().split('T')[0], amount: 0, currency: 'IDR' })
  const [saving, setSaving] = useState(false)
  const [filterMonth, setFilterMonth] = useState(new Date().toISOString().slice(0, 7))

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [e, p, c, inv] = await Promise.all([getExpenses(), getPayments(), getCustomers(), getInvoices()])
      setExpenses(e); setPayments(p); setCustomers(c); setInvoices(inv); setLoading(false)
    }
    load()
  }, [])

  const handleSaveExpense = async () => {
    if (!expenseForm.description || !expenseForm.amount) return
    setSaving(true)
    try { const created = await createExpense(expenseForm); setExpenses([created, ...expenses]); setShowExpenseForm(false); setExpenseForm({ category: 'other', expense_date: new Date().toISOString().split('T')[0], status: 'pending', amount: 0, currency: 'IDR' }) } finally { setSaving(false) }
  }

  const handleSavePayment = async () => {
    if (!paymentForm.customer_id || !paymentForm.amount) return
    setSaving(true)
    try { const created = await createPayment(paymentForm); setPayments([created as any, ...payments]); setShowPaymentForm(false); setPaymentForm({ method: 'bank_transfer', payment_date: new Date().toISOString().split('T')[0], amount: 0, currency: 'IDR' }) } finally { setSaving(false) }
  }

  const monthStart = `${filterMonth}-01`
  const monthEnd = new Date(parseInt(filterMonth.split('-')[0]), parseInt(filterMonth.split('-')[1]), 0).toISOString().split('T')[0]
  const monthExpenses = expenses.filter(e => e.expense_date >= monthStart && e.expense_date <= monthEnd)
  const monthPayments = payments.filter(p => p.payment_date >= monthStart && p.payment_date <= monthEnd)
  const totalExpenses = monthExpenses.reduce((s, e) => s + Number(e.amount), 0)
  const totalIncoming = monthPayments.reduce((s, p) => s + Number(p.amount), 0)
  const netCashflow = totalIncoming - totalExpenses
  const unpaidInvoices = invoices.filter(i => ['sent', 'overdue'].includes(i.status))
  const totalAR = unpaidInvoices.reduce((s, i) => s + Number(i.total), 0)
  const byCategory = EXPENSE_CATEGORIES.reduce((acc, cat) => { acc[cat] = monthExpenses.filter(e => e.category === cat).reduce((s, e) => s + Number(e.amount), 0); return acc }, {} as Record<string, number>)

  return (
    <div className="p-6 max-w-5xl space-y-6">
      <div className="flex items-center gap-3"><Label className="text-slate-500 text-sm">Viewing:</Label><Input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)} className="w-40" /></div>

      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Revenue Collected', value: idr(totalIncoming), icon: TrendingUp, color: 'text-emerald-700', bg: 'bg-emerald-50' },
          { label: 'Total Expenses', value: idr(totalExpenses), icon: TrendingDown, color: 'text-red-600', bg: 'bg-red-50' },
          { label: 'Net Cashflow', value: idr(netCashflow), icon: DollarSign, color: netCashflow >= 0 ? 'text-emerald-700' : 'text-red-600', bg: netCashflow >= 0 ? 'bg-emerald-50' : 'bg-red-50' },
          { label: 'Accounts Receivable', value: idr(totalAR), icon: CreditCard, color: 'text-amber-700', bg: 'bg-amber-50' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label} className={bg}><CardContent className="pt-4"><div className="flex items-center justify-between"><div><p className="text-xs text-slate-500">{label}</p><p className={`text-base font-bold ${color}`}>{value}</p></div><Icon className={`w-5 h-5 ${color} opacity-50`} /></div></CardContent></Card>
        ))}
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {[{ id: 'overview', label: 'Overview' }, { id: 'expenses', label: `Expenses (${monthExpenses.length})` }, { id: 'payments', label: `Payments (${monthPayments.length})` }].map(({ id, label }) => (
          <button key={id} onClick={() => setTab(id as any)} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === id ? 'border-cyan-600 text-cyan-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>{label}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid grid-cols-2 gap-6">
          <Card><CardHeader><CardTitle className="text-sm flex items-center gap-2"><TrendingDown className="w-4 h-4" />Expense Breakdown</CardTitle></CardHeader>
            <CardContent>
              {totalExpenses === 0 ? <p className="text-sm text-slate-400 text-center py-4">No expenses this month</p> : (
                <div className="space-y-2">
                  {EXPENSE_CATEGORIES.filter(c => byCategory[c] > 0).sort((a, b) => byCategory[b] - byCategory[a]).map(cat => (
                    <div key={cat}>
                      <div className="flex justify-between text-sm mb-1"><span className="text-slate-600 capitalize">{cat}</span><span className="font-medium text-slate-800">{idr(byCategory[cat])}</span></div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-cyan-500 rounded-full" style={{ width: `${(byCategory[cat] / totalExpenses) * 100}%` }} /></div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          <Card><CardHeader><CardTitle className="text-sm flex items-center gap-2"><CreditCard className="w-4 h-4" />Outstanding Invoices</CardTitle></CardHeader>
            <CardContent>
              {unpaidInvoices.length === 0 ? <p className="text-sm text-emerald-600 text-center py-4">✓ All invoices paid</p> : (
                <div className="space-y-2">
                  {unpaidInvoices.slice(0, 8).map(inv => {
                    const customer = customers.find(c => c.id === inv.customer_id)
                    const isOverdue = inv.status === 'overdue' || new Date(inv.due_date) < new Date()
                    return (
                      <div key={inv.id} className="flex items-center gap-3 text-sm">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isOverdue ? 'bg-red-500' : 'bg-amber-400'}`} />
                        <div className="flex-1 min-w-0"><p className="font-medium text-slate-700 truncate">{customer?.name}</p><p className="text-xs text-slate-400">{inv.invoice_number} · Due {new Date(inv.due_date).toLocaleDateString()}</p></div>
                        <p className="font-bold text-slate-800 flex-shrink-0">{idr(Number(inv.total))}</p>
                      </div>
                    )
                  })}
                  {unpaidInvoices.length > 8 && <p className="text-xs text-slate-400 text-center pt-1">+{unpaidInvoices.length - 8} more invoices</p>}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'expenses' && (
        <div className="space-y-4">
          <div className="flex justify-end"><Button onClick={() => setShowExpenseForm(true)}><Plus className="w-4 h-4 mr-1.5" /> Log Expense</Button></div>
          {showExpenseForm && (
            <Card><CardHeader><CardTitle className="text-sm">Log New Expense</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Category *</Label><select className="w-full border rounded-md px-3 py-2 text-sm" value={expenseForm.category} onChange={e => setExpenseForm({ ...expenseForm, category: e.target.value as any })}>{EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                  <div><Label>Date *</Label><Input type="date" value={expenseForm.expense_date ?? ''} onChange={e => setExpenseForm({ ...expenseForm, expense_date: e.target.value })} /></div>
                </div>
                <div><Label>Description *</Label><Input value={expenseForm.description ?? ''} onChange={e => setExpenseForm({ ...expenseForm, description: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Amount (IDR) *</Label><Input type="number" value={expenseForm.amount ?? 0} onChange={e => setExpenseForm({ ...expenseForm, amount: Number(e.target.value) })} /></div>
                  <div><Label>Vendor</Label><Input value={expenseForm.vendor ?? ''} onChange={e => setExpenseForm({ ...expenseForm, vendor: e.target.value })} /></div>
                </div>
                <div className="flex gap-2">
                  <Button className="bg-cyan-600 hover:bg-cyan-700 flex-1" onClick={handleSaveExpense} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4 mr-1" />Save Expense</>}</Button>
                  <Button variant="outline" onClick={() => setShowExpenseForm(false)}><X className="w-4 h-4" /></Button>
                </div>
              </CardContent>
            </Card>
          )}
          {monthExpenses.length === 0 ? <div className="text-center py-12 text-slate-400 text-sm"><Receipt className="w-8 h-8 mx-auto mb-2 text-slate-200" />No expenses this month</div>
            : <div className="space-y-2">
              {monthExpenses.map(e => (
                <Card key={e.id}><CardContent className="pt-3 pb-3">
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2"><span className="font-medium text-slate-700">{e.description}</span><span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full capitalize">{e.category}</span></div>
                      <div className="flex gap-3 text-xs text-slate-400 mt-0.5"><span>{new Date(e.expense_date).toLocaleDateString()}</span>{e.vendor && <span>{e.vendor}</span>}</div>
                    </div>
                    <p className="font-bold text-red-600">{idr(Number(e.amount))}</p>
                  </div>
                </CardContent></Card>
              ))}
              <div className="flex justify-between pt-2 px-2 text-sm font-bold text-slate-700 border-t border-slate-200"><span>Total</span><span className="text-red-600">{idr(totalExpenses)}</span></div>
            </div>}
        </div>
      )}

      {tab === 'payments' && (
        <div className="space-y-4">
          <div className="flex justify-end"><Button onClick={() => setShowPaymentForm(true)}><Plus className="w-4 h-4 mr-1.5" /> Record Payment</Button></div>
          {showPaymentForm && (
            <Card><CardHeader><CardTitle className="text-sm">Record Payment Received</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Customer *</Label><select className="w-full border rounded-md px-3 py-2 text-sm" value={paymentForm.customer_id ?? ''} onChange={e => setPaymentForm({ ...paymentForm, customer_id: e.target.value })}><option value="">Select customer...</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                  <div><Label>Invoice (optional)</Label><select className="w-full border rounded-md px-3 py-2 text-sm" value={paymentForm.invoice_id ?? ''} onChange={e => setPaymentForm({ ...paymentForm, invoice_id: e.target.value || undefined })}><option value="">Unlinked payment</option>{invoices.filter(i => i.customer_id === paymentForm.customer_id && ['draft','sent','overdue'].includes(i.status)).map(i => <option key={i.id} value={i.id}>{i.invoice_number} — {idr(Number(i.total))}</option>)}</select></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Amount (IDR) *</Label><Input type="number" value={paymentForm.amount ?? 0} onChange={e => setPaymentForm({ ...paymentForm, amount: Number(e.target.value) })} /></div>
                  <div><Label>Date *</Label><Input type="date" value={paymentForm.payment_date ?? ''} onChange={e => setPaymentForm({ ...paymentForm, payment_date: e.target.value })} /></div>
                </div>
                <div><Label>Payment Method *</Label><select className="w-full border rounded-md px-3 py-2 text-sm" value={paymentForm.method} onChange={e => setPaymentForm({ ...paymentForm, method: e.target.value as any })}>{PAYMENT_METHODS.map(m => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}</select></div>
                <div className="flex gap-2">
                  <Button className="bg-emerald-600 hover:bg-emerald-700 flex-1" onClick={handleSavePayment} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4 mr-1" />Record Payment</>}</Button>
                  <Button variant="outline" onClick={() => setShowPaymentForm(false)}><X className="w-4 h-4" /></Button>
                </div>
              </CardContent>
            </Card>
          )}
          {monthPayments.length === 0 ? <div className="text-center py-12 text-slate-400 text-sm"><DollarSign className="w-8 h-8 mx-auto mb-2 text-slate-200" />No payments recorded this month</div>
            : <div className="space-y-2">
              {monthPayments.map(p => {
                const customer = customers.find(c => c.id === p.customer_id)
                return <Card key={p.id}><CardContent className="pt-3 pb-3"><div className="flex items-center gap-4"><ArrowDownRight className="w-4 h-4 text-emerald-500 flex-shrink-0" /><div className="flex-1"><span className="font-medium text-slate-700">{customer?.name ?? 'Unknown'}</span><div className="flex gap-3 text-xs text-slate-400 mt-0.5"><span>{new Date(p.payment_date).toLocaleDateString()}</span>{p.reference && <span>Ref: {p.reference}</span>}</div></div><p className="font-bold text-emerald-600">{idr(Number(p.amount))}</p></div></CardContent></Card>
              })}
              <div className="flex justify-between pt-2 px-2 text-sm font-bold text-slate-700 border-t border-slate-200"><span>Total Collected</span><span className="text-emerald-600">{idr(totalIncoming)}</span></div>
            </div>}
        </div>
      )}
    </div>
  )
}

function LinkedPage({ route, icon: Icon, label, description }: { route: string; icon: React.ElementType; label: string; description: string }) {
  const router = useRouter()
  return (
    <div className="p-6 flex items-center justify-center">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Icon className="w-8 h-8 text-slate-400" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">{label}</h2>
        <p className="text-slate-500 text-sm mb-6">{description}</p>
        <button onClick={() => router.push(route)}
          className="inline-flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-colors">
          Open {label} <ArrowUpRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

const TABS = [
  { id: 'overview' as Tab, label: 'Overview', icon: BarChart3 },
  { id: 'expenses' as Tab, label: 'Expenses & Payments', icon: Receipt },
  { id: 'purchase-orders' as Tab, label: 'Purchase Orders', icon: ShoppingCart },
  { id: 'accounts' as Tab, label: 'Accounts', icon: BookOpen },
  { id: 'reports' as Tab, label: 'Reports', icon: TrendingUp },
  { id: 'payroll' as Tab, label: 'Payroll', icon: Banknote },
]

export default function AccountingPage() {
  const [tab, setTab] = useState<Tab>('overview')
  return (
    <>
      <Topbar title="Accounting" />
      <div className="bg-white border-b border-slate-200 px-6 overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap ${tab === id ? 'border-cyan-600 text-cyan-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
              <Icon className="w-4 h-4" />{label}
            </button>
          ))}
        </div>
      </div>
      {(tab === 'overview' || tab === 'expenses') && <FinanceContent />}
      {tab === 'purchase-orders' && <LinkedPage route="/purchase-orders" icon={ShoppingCart} label="Purchase Orders" description="Manage supplier purchase orders, track approvals and deliveries." />}
      {tab === 'accounts' && <LinkedPage route="/accounts" icon={BookOpen} label="Accounts" description="Chart of accounts, general ledger, and account management." />}
      {tab === 'reports' && <LinkedPage route="/reports" icon={TrendingUp} label="Financial Reports" description="P&L statements, balance sheets, and custom reports." />}
      {tab === 'payroll' && <LinkedPage route="/payroll" icon={Banknote} label="Payroll" description="Process payroll, manage salaries, and payroll records." />}
    </>
  )
}
