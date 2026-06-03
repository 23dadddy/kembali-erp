'use client'

import { useState, useEffect, use, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { createClient } from '@/lib/supabase/client'
import {
  getCustomer, updateCustomer, getCustomerAddresses, createCustomerAddress,
  getCustomerContacts, createCustomerContact, deleteCustomerContact,
  getCustomerNotes, createCustomerNote,
  getCustomerBottleBalance, generateMonthlyInvoice,
} from '@/lib/db'
import { idr } from '@/lib/format'
import type { Customer, CustomerAddress, CustomerContact, CustomerNote, Invoice, Delivery, CustomerBottleBalance } from '@/types'
import {
  ChevronLeft, MapPin, Phone, Mail, User, Plus, Edit2, Check, X,
  Package, FileText, Truck, MessageSquare, Building2, Star,
  AlertTriangle, Loader2, Globe, ExternalLink, Clock, Paperclip, RefreshCw,
  Upload, Trash2, Calendar,
} from 'lucide-react'

interface FieldHistory {
  id: string
  field_name: string
  old_value: string | null
  new_value: string | null
  changed_at: string
  changed_by_name?: string | null
}

type Tab = 'overview' | 'addresses' | 'contacts' | 'deliveries' | 'invoices' | 'notes' | 'history' | 'documents' | 'subscription'

const TIER_COLORS: Record<string, string> = {
  standard: 'bg-slate-100 text-slate-600',
  silver: 'bg-gray-100 text-gray-600',
  gold: 'bg-amber-100 text-amber-700',
  platinum: 'bg-blue-100 text-blue-700',
}
const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  lead: 'bg-purple-100 text-purple-700',
  paused: 'bg-amber-100 text-amber-700',
  churned: 'bg-red-100 text-red-600',
  blacklisted: 'bg-red-200 text-red-800',
}
const TYPE_COLORS: Record<string, string> = {
  hotel: 'bg-blue-100 text-blue-700',
  resort: 'bg-emerald-100 text-emerald-700',
  restaurant: 'bg-orange-100 text-orange-700',
  cafe: 'bg-amber-100 text-amber-700',
  office: 'bg-slate-100 text-slate-600',
  retail: 'bg-purple-100 text-purple-700',
  business: 'bg-slate-100 text-slate-600',
  other: 'bg-slate-100 text-slate-500',
}

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('overview')
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [addresses, setAddresses] = useState<CustomerAddress[]>([])
  const [contacts, setContacts] = useState<CustomerContact[]>([])
  const [notes, setNotes] = useState<CustomerNote[]>([])
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [balance, setBalance] = useState<CustomerBottleBalance | null>(null)
  const [loading, setLoading] = useState(true)
  const [editingCustomer, setEditingCustomer] = useState(false)
  const [editForm, setEditForm] = useState<Partial<Customer>>({})
  const [newNote, setNewNote] = useState('')
  const [addingAddress, setAddingAddress] = useState(false)
  const [addingContact, setAddingContact] = useState(false)
  const [newAddress, setNewAddress] = useState<Partial<CustomerAddress>>({ label: 'Main', city: 'Bali', is_primary: false })
  const [newContact, setNewContact] = useState<Partial<CustomerContact>>({ is_primary: false, receives_invoices: false, receives_delivery_notices: false })
  const [generatingInvoice, setGeneratingInvoice] = useState(false)
  const [invoiceMonth, setInvoiceMonth] = useState(new Date().toISOString().slice(0, 7))
  const [enablingPortal, setEnablingPortal] = useState(false)
  const [portalStatus, setPortalStatus] = useState<string | null>(null)
  const [salesStaff, setSalesStaff] = useState<{ id: string; name: string; crm_role: string | null }[]>([])
  const [fieldHistory, setFieldHistory] = useState<FieldHistory[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [documents, setDocuments] = useState<any[]>([])
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const [subscription, setSubscription] = useState<any | null>(null)
  const [editingSub, setEditingSub] = useState(false)
  const [subForm, setSubForm] = useState<any>({ qty_350ml: 0, qty_750ml: 0, delivery_days: [], special_instructions: '', status: 'active' })
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const sb = createClient()
      const { data: staffData } = await sb.from('staff').select('id, name, crm_role').in('role', ['sales', 'manager']).eq('active', true)
      setSalesStaff(staffData ?? [])
      const [cust, addrs, conts, nts, bal] = await Promise.all([
        getCustomer(id),
        getCustomerAddresses(id),
        getCustomerContacts(id),
        getCustomerNotes(id),
        getCustomerBottleBalance(id),
      ])
      const [{ data: dels }, { data: invs }, { data: docs }, { data: subData }] = await Promise.all([
        sb.from('deliveries').select('*').eq('customer_id', id).order('delivery_date', { ascending: false }).limit(30),
        sb.from('invoices').select('*, items:invoice_items(*)').eq('customer_id', id).order('created_at', { ascending: false }),
        sb.from('customer_documents').select('*').eq('customer_id', id).order('created_at', { ascending: false }),
        sb.from('customer_subscriptions').select('*').eq('customer_id', id).eq('status', 'active').order('created_at', { ascending: false }).limit(1),
      ])
      setCustomer(cust)
      setEditForm(cust)
      setAddresses(addrs)
      setContacts(conts)
      setNotes(nts)
      setBalance(bal)
      setDeliveries(dels ?? [])
      setInvoices(invs ?? [])
      setDocuments(docs ?? [])
      const sub = subData?.[0] ?? null
      setSubscription(sub)
      if (sub) setSubForm({ qty_350ml: sub.qty_350ml ?? 0, qty_750ml: sub.qty_750ml ?? 0, delivery_days: sub.delivery_days ?? [], special_instructions: sub.special_instructions ?? '', status: sub.status })
      setLoading(false)
    }
    load()
  }, [id])

  const handleEnablePortal = async () => {
    if (!customer) return
    const email = customer.contact_email
    if (!email) { setPortalStatus('No contact email — add one first'); return }
    setEnablingPortal(true)
    setPortalStatus(null)
    try {
      const sb = createClient()
      // Mark portal as enabled so login page allows access
      await sb.from('customers').update({ portal_enabled: true }).eq('id', customer.id)
      // Send magic link invitation
      await sb.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/customer/dashboard`, shouldCreateUser: true },
      })
      setPortalStatus(`✓ Invitation sent to ${email}`)
      setCustomer({ ...customer, portal_enabled: true } as any)
    } catch (e: any) {
      setPortalStatus(`Error: ${e.message}`)
    }
    setEnablingPortal(false)
  }

  const loadHistory = async () => {
    setHistoryLoading(true)
    const sb = createClient()
    const { data } = await sb
      .from('customer_field_history')
      .select('id, field_name, old_value, new_value, changed_at, staff:changed_by(name)')
      .eq('customer_id', id)
      .order('changed_at', { ascending: false })
      .limit(100)
    setFieldHistory((data ?? []).map((r: any) => ({
      id: r.id,
      field_name: r.field_name,
      old_value: r.old_value,
      new_value: r.new_value,
      changed_at: r.changed_at,
      changed_by_name: r.staff?.name ?? null,
    })))
    setHistoryLoading(false)
  }

  // Track which fields changed and insert history rows before saving
  const TRACKED_FIELDS: (keyof Customer)[] = [
    'name', 'type', 'status', 'tier', 'city', 'address',
    'contact_name', 'contact_email', 'contact_phone', 'notes',
  ]

  const handleSaveCustomer = async () => {
    if (!customer) return
    const sb = createClient()
    // Build history rows for changed fields
    const historyRows = TRACKED_FIELDS
      .filter(f => {
        const oldVal = String(customer[f] ?? '')
        const newVal = String((editForm as any)[f] ?? '')
        return oldVal !== newVal
      })
      .map(f => ({
        customer_id: customer.id,
        field_name: f,
        old_value: String(customer[f] ?? '') || null,
        new_value: String((editForm as any)[f] ?? '') || null,
      }))
    if (historyRows.length > 0) {
      await sb.from('customer_field_history').insert(historyRows)
    }
    const updated = await updateCustomer(customer.id, editForm)
    setCustomer(updated)
    setEditingCustomer(false)
    if (historyRows.length > 0) loadHistory()
  }

  const handleAddNote = async () => {
    if (!newNote.trim() || !customer) return
    const note = await createCustomerNote({ customer_id: customer.id, content: newNote.trim(), type: 'note' })
    setNotes([note, ...notes])
    setNewNote('')
  }

  const handleAddAddress = async () => {
    if (!customer || !newAddress.address) return
    const addr = await createCustomerAddress({ ...newAddress, customer_id: customer.id })
    setAddresses([...addresses, addr])
    setNewAddress({ label: 'Main', city: 'Bali', is_primary: false })
    setAddingAddress(false)
  }

  const handleAddContact = async () => {
    if (!customer || !newContact.name) return
    const cont = await createCustomerContact({ ...newContact, customer_id: customer.id })
    setContacts([...contacts, cont])
    setNewContact({ is_primary: false, receives_invoices: false, receives_delivery_notices: false })
    setAddingContact(false)
    // Log history
    const sb = createClient()
    await sb.from('customer_field_history').insert({
      customer_id: customer.id,
      field_name: 'contact_added',
      old_value: null,
      new_value: [newContact.name, newContact.role, newContact.phone].filter(Boolean).join(' · '),
    })
    loadHistory()
  }

  const handleUploadDocument = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!customer || !e.target.files?.length) return
    setUploadingDoc(true)
    const sb = createClient()
    for (const file of Array.from(e.target.files)) {
      try {
        const path = `customers/${customer.id}/${Date.now()}-${file.name}`
        let file_url: string | null = null
        const { error: uploadError } = await sb.storage.from('kembali-docs').upload(path, file)
        if (!uploadError) {
          const { data: urlData } = sb.storage.from('kembali-docs').getPublicUrl(path)
          file_url = urlData.publicUrl
        }
        const { data: doc } = await sb.from('customer_documents').insert({
          customer_id: customer.id,
          name: file.name,
          file_url,
          file_size: file.size,
          mime_type: file.type,
        }).select().single()
        if (doc) setDocuments(prev => [doc, ...prev])
      } catch { /* continue */ }
    }
    setUploadingDoc(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDeleteDocument = async (docId: string) => {
    const sb = createClient()
    await sb.from('customer_documents').delete().eq('id', docId)
    setDocuments(prev => prev.filter(d => d.id !== docId))
  }

  const DAYS_OF_WEEK = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

  const handleSaveSubscription = async () => {
    if (!customer) return
    const sb = createClient()
    if (subscription) {
      await sb.from('customer_subscriptions').update({ ...subForm, updated_at: new Date().toISOString() }).eq('id', subscription.id)
      setSubscription({ ...subscription, ...subForm })
    } else {
      const { data } = await sb.from('customer_subscriptions').insert({
        customer_id: customer.id,
        ...subForm,
        start_date: new Date().toISOString().split('T')[0],
        status: 'active',
      }).select().single()
      setSubscription(data)
    }
    setEditingSub(false)
  }

  const handleCreateDelivery = async () => {
    if (!customer) return
    const sb = createClient()
    const today = new Date().toISOString().split('T')[0]
    const { data } = await sb.from('deliveries').insert({
      customer_id: customer.id,
      delivery_date: today,
      status: 'pending',
      delivered_350ml: subscription?.qty_350ml ?? 0,
      delivered_750ml: subscription?.qty_750ml ?? 0,
      collected_350ml: 0, collected_750ml: 0,
      damaged_350ml: 0, damaged_750ml: 0,
    }).select().single()
    if (data) setDeliveries(prev => [data, ...prev])
    setTab('deliveries')
  }

  const handleGenerateInvoice = async () => {
    if (!customer) return
    setGeneratingInvoice(true)
    try {
      const inv = await generateMonthlyInvoice(customer.id, invoiceMonth)
      if (inv) {
        const sb = createClient()
        const { data } = await sb.from('invoices').select('*, items:invoice_items(*)').eq('customer_id', id).order('created_at', { ascending: false })
        setInvoices(data ?? [])
        setTab('invoices')
      } else {
        alert('No completed deliveries found for this month.')
      }
    } finally {
      setGeneratingInvoice(false)
    }
  }

  if (loading || !customer) {
    return (
      <>
        <Topbar title="Customer" />
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
        </div>
      </>
    )
  }

  const totalRevenue = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.total), 0)
  const pendingRevenue = invoices.filter(i => ['draft', 'sent', 'overdue'].includes(i.status)).reduce((s, i) => s + Number(i.total), 0)

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'overview', label: 'Overview', icon: Building2 },
    { id: 'addresses', label: `Addresses (${addresses.length})`, icon: MapPin },
    { id: 'contacts', label: `Contacts (${contacts.length})`, icon: User },
    { id: 'deliveries', label: `Deliveries (${deliveries.length})`, icon: Truck },
    { id: 'invoices', label: `Invoices (${invoices.length})`, icon: FileText },
    { id: 'notes', label: `Notes (${notes.length})`, icon: MessageSquare },
    { id: 'documents', label: `Documents (${documents.length})`, icon: Paperclip },
    { id: 'subscription', label: 'Delivery Schedule', icon: RefreshCw },
    { id: 'history', label: 'Edit History', icon: Clock },
  ]

  return (
    <>
      <Topbar title={customer.name} />
      <div className="p-6 max-w-5xl space-y-6">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-slate-500 hover:text-slate-800 text-sm">
          <ChevronLeft className="w-4 h-4" /> Back to Customers
        </button>

        {/* Header */}
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-cyan-50 flex items-center justify-center text-2xl font-bold text-cyan-600 flex-shrink-0">
                  {customer.name.charAt(0)}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-xl font-bold text-slate-800">{customer.name}</h1>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[customer.type] ?? 'bg-slate-100 text-slate-500'}`}>{customer.type}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[customer.status] ?? 'bg-slate-100 text-slate-500'}`}>{customer.status}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TIER_COLORS[customer.tier] ?? 'bg-slate-100 text-slate-500'}`}>
                      <Star className="w-3 h-3 inline mr-0.5" />{customer.tier}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 mt-1 flex items-center gap-1">
                    <MapPin className="w-3 h-3" />{customer.address}, {customer.city}
                  </p>
                  {customer.contact_phone && (
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-sm text-slate-400 flex items-center gap-1">
                        <Phone className="w-3 h-3" />{customer.contact_phone}
                      </p>
                      <a href={`https://wa.me/${customer.contact_phone.replace(/\D/g,'')}`} target="_blank" rel="noopener noreferrer"
                        className="text-xs bg-emerald-50 text-emerald-600 hover:bg-emerald-100 px-2 py-0.5 rounded-full font-medium transition-colors">
                        WhatsApp ↗
                      </a>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                {(customer as any).portal_enabled ? (
                  <a href="/customer/dashboard" target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg hover:bg-emerald-100 transition-colors">
                    <Globe className="w-3.5 h-3.5" /> Portal Active <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <button onClick={handleEnablePortal} disabled={enablingPortal}
                    className="inline-flex items-center gap-1.5 text-xs text-cyan-700 bg-cyan-50 border border-cyan-200 px-3 py-1.5 rounded-lg hover:bg-cyan-100 disabled:opacity-60 transition-colors">
                    {enablingPortal ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe className="w-3.5 h-3.5" />}
                    Enable Portal
                  </button>
                )}
                {portalStatus && <span className="text-xs text-slate-500">{portalStatus}</span>}
                {customer.contact_email && (
                  <button onClick={async () => {
                    const month = new Date().toISOString().slice(0, 7)
                    const res = await fetch('/api/invoices/statement', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ month, customerId: customer.id }),
                    })
                    const data = await res.json()
                    setPortalStatus(data.sent > 0 ? `✓ Statement sent for ${month}` : `Skipped: ${data.results?.[0]?.reason ?? 'no activity'}`)
                  }}
                    className="inline-flex items-center gap-1.5 text-xs text-violet-700 bg-violet-50 border border-violet-200 px-3 py-1.5 rounded-lg hover:bg-violet-100 transition-colors">
                    <Mail className="w-3.5 h-3.5" /> Send Statement
                  </button>
                )}
                <Button variant="outline" size="sm" onClick={() => { setEditingCustomer(true); setTab('overview') }}>
                  <Edit2 className="w-3 h-3 mr-1.5" /> Edit
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-3 mt-5 pt-5 border-t border-slate-100">
              {[
                { label: 'Paid Revenue', value: idr(totalRevenue), color: 'text-slate-800' },
                { label: 'Pending', value: idr(pendingRevenue), color: 'text-amber-600' },
                { label: 'Total Deliveries', value: String(deliveries.length), color: 'text-slate-800' },
                { label: 'Outstanding Bottles', value: String((balance?.outstanding_350ml ?? 0) + (balance?.outstanding_750ml ?? 0)), color: (balance?.chargeable_lost_350ml ?? 0) + (balance?.chargeable_lost_750ml ?? 0) > 0 ? 'text-red-600' : 'text-slate-800' },
              ].map(({ label, value, color }) => (
                <div key={label}>
                  <p className="text-xs text-slate-400">{label}</p>
                  <p className={`font-bold ${color}`}>{value}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Tab bar */}
        <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
          {TABS.map(({ id: tid, label, icon: Icon }) => (
            <button
              key={tid}
              onClick={() => { setTab(tid); if (tid === 'history') loadHistory() }}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                tab === tid ? 'border-cyan-600 text-cyan-700' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />{label}
            </button>
          ))}
        </div>

        {/* OVERVIEW */}
        {tab === 'overview' && (
          <div className="grid grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="text-sm">Customer Details</CardTitle></CardHeader>
              <CardContent>
                {editingCustomer ? (
                  <div className="space-y-3">
                    <div><Label>Name</Label><Input value={editForm.name ?? ''} onChange={e => setEditForm({ ...editForm, name: e.target.value })} /></div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label>Type</Label>
                        <select className="w-full border rounded-md px-3 py-2 text-sm" value={editForm.type} onChange={e => setEditForm({ ...editForm, type: e.target.value as any })}>
                          {['hotel', 'restaurant', 'resort', 'cafe', 'office', 'retail', 'business', 'other'].map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div>
                        <Label>Status</Label>
                        <select className="w-full border rounded-md px-3 py-2 text-sm" value={editForm.status} onChange={e => setEditForm({ ...editForm, status: e.target.value as any })}>
                          {['active', 'lead', 'paused', 'churned', 'blacklisted'].map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label>Tier</Label>
                        <select className="w-full border rounded-md px-3 py-2 text-sm" value={editForm.tier} onChange={e => setEditForm({ ...editForm, tier: e.target.value as any })}>
                          {['standard', 'silver', 'gold', 'platinum'].map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div>
                        <Label>Payment Terms (days)</Label>
                        <Input type="number" value={editForm.payment_terms_days ?? 30} onChange={e => setEditForm({ ...editForm, payment_terms_days: Number(e.target.value) })} />
                      </div>
                    </div>
                    <div><Label>Address</Label><Input value={editForm.address ?? ''} onChange={e => setEditForm({ ...editForm, address: e.target.value })} /></div>
                    <div><Label>City</Label><Input value={editForm.city ?? 'Bali'} onChange={e => setEditForm({ ...editForm, city: e.target.value })} /></div>
                    <div><Label>Tax ID (NPWP)</Label><Input value={editForm.tax_id ?? ''} onChange={e => setEditForm({ ...editForm, tax_id: e.target.value })} /></div>
                    <div>
                      <Label>Bottle Discrepancy Limit</Label>
                      <Input type="number" min="0" value={(editForm as any).bottle_discrepancy_limit ?? 5} onChange={e => setEditForm({ ...editForm, bottle_discrepancy_limit: Number(e.target.value) } as any)} />
                      <p className="text-xs text-slate-400 mt-0.5">Max bottles lost/damaged before charges apply</p>
                    </div>
                    <div>
                      <Label>Account Executive</Label>
                      <select className="w-full border rounded-md px-3 py-2 text-sm" value={(editForm as any).assigned_to ?? ''} onChange={e => setEditForm({ ...editForm, assigned_to: e.target.value || null } as any)}>
                        <option value="">— Unassigned —</option>
                        {salesStaff.map(s => (
                          <option key={s.id} value={s.id}>{s.name}{s.crm_role === 'manager' ? ' (Manager)' : ''}</option>
                        ))}
                      </select>
                    </div>
                    <div><Label>Notes</Label><Textarea value={editForm.notes ?? ''} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} rows={2} /></div>
                    <div className="flex gap-2">
                      <Button className="bg-cyan-600 hover:bg-cyan-700 flex-1" onClick={handleSaveCustomer}><Check className="w-4 h-4 mr-1" />Save</Button>
                      <Button variant="outline" onClick={() => { setEditingCustomer(false); setEditForm(customer) }}><X className="w-4 h-4" /></Button>
                    </div>
                  </div>
                ) : (
                  <dl className="space-y-2.5 text-sm">
                    {[
                      ['Type', customer.type],
                      ['Status', customer.status],
                      ['Tier', customer.tier],
                      ['City', customer.city],
                      ['Address', customer.address],
                      ['Tax ID', customer.tax_id ?? '—'],
                      ['Payment Terms', `${customer.payment_terms_days ?? 30} days`],
                      ['Credit Limit', customer.credit_limit > 0 ? idr(customer.credit_limit) : '—'],
                      ['Source', customer.source ?? '—'],
                      ['Account Executive', salesStaff.find(s => s.id === (customer as any).assigned_to)?.name ?? '—'],
                      ['Customer Since', new Date(customer.created_at).toLocaleDateString()],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-2">
                        <dt className="text-slate-400 flex-shrink-0">{k}</dt>
                        <dd className="text-slate-700 font-medium text-right capitalize">{v}</dd>
                      </div>
                    ))}
                    {customer.notes && (
                      <div className="pt-2 border-t border-slate-100">
                        <p className="text-slate-400 text-xs mb-1">Notes</p>
                        <p className="text-slate-600">{customer.notes}</p>
                      </div>
                    )}
                  </dl>
                )}
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Package className="w-4 h-4" />Bottle Account</CardTitle></CardHeader>
                <CardContent>
                  {balance ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className={`rounded-lg p-3 ${balance.chargeable_lost_350ml > 0 ? 'bg-red-50' : 'bg-slate-50'}`}>
                          <p className="text-xs text-slate-400">350ml Outstanding</p>
                          <p className={`text-xl font-bold ${balance.chargeable_lost_350ml > 0 ? 'text-red-600' : 'text-slate-700'}`}>{balance.outstanding_350ml}</p>
                          <p className="text-xs text-slate-400">of {balance.total_delivered_350ml} delivered</p>
                        </div>
                        <div className={`rounded-lg p-3 ${balance.chargeable_lost_750ml > 0 ? 'bg-red-50' : 'bg-slate-50'}`}>
                          <p className="text-xs text-slate-400">750ml Outstanding</p>
                          <p className={`text-xl font-bold ${balance.chargeable_lost_750ml > 0 ? 'text-red-600' : 'text-slate-700'}`}>{balance.outstanding_750ml}</p>
                          <p className="text-xs text-slate-400">of {balance.total_delivered_750ml} delivered</p>
                        </div>
                      </div>
                      {(balance.chargeable_lost_350ml > 0 || balance.chargeable_lost_750ml > 0) && (
                        <div className="bg-red-50 rounded-lg p-3 border border-red-100">
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                            <p className="text-xs font-semibold text-red-700">Chargeable Lost Bottles (above 8%)</p>
                          </div>
                          {balance.chargeable_lost_350ml > 0 && (
                            <p className="text-xs text-red-600">{balance.chargeable_lost_350ml} × 350ml = {idr(balance.chargeable_lost_350ml * 6000)}</p>
                          )}
                          {balance.chargeable_lost_750ml > 0 && (
                            <p className="text-xs text-red-600">{balance.chargeable_lost_750ml} × 750ml = {idr(balance.chargeable_lost_750ml * 10000)}</p>
                          )}
                        </div>
                      )}
                      {balance.chargeable_lost_350ml === 0 && balance.chargeable_lost_750ml === 0 && (
                        <p className="text-xs text-emerald-600 bg-emerald-50 rounded-lg p-2">✓ Within 8% threshold — no lost bottle charges</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400">No delivery history yet</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-sm flex items-center gap-2"><FileText className="w-4 h-4" />Generate Invoice</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex gap-2">
                    <Input type="month" value={invoiceMonth} onChange={e => setInvoiceMonth(e.target.value)} className="flex-1" />
                    <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleGenerateInvoice} disabled={generatingInvoice}>
                      {generatingInvoice ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Generate'}
                    </Button>
                  </div>
                  <p className="text-xs text-slate-400">Auto-calculates from completed deliveries + any lost bottle charges above the 8% threshold.</p>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* ADDRESSES */}
        {tab === 'addresses' && (
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={() => setAddingAddress(true)}><Plus className="w-4 h-4 mr-1" />Add Address</Button>
            </div>
            {addingAddress && (
              <Card><CardContent className="pt-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Label</Label><Input value={newAddress.label ?? ''} onChange={e => setNewAddress({ ...newAddress, label: e.target.value })} placeholder="Main, Warehouse, Pool Bar..." /></div>
                  <div><Label>City</Label><Input value={newAddress.city ?? 'Bali'} onChange={e => setNewAddress({ ...newAddress, city: e.target.value })} /></div>
                </div>
                <div><Label>Street Address</Label><Input value={newAddress.address ?? ''} onChange={e => setNewAddress({ ...newAddress, address: e.target.value })} /></div>
                <div><Label>Delivery Instructions</Label><Textarea value={newAddress.delivery_instructions ?? ''} onChange={e => setNewAddress({ ...newAddress, delivery_instructions: e.target.value })} rows={2} placeholder="e.g. Use loading dock entrance, call procurement 10 min before..." /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Latitude (optional)</Label><Input type="number" step="any" value={newAddress.latitude ?? ''} onChange={e => setNewAddress({ ...newAddress, latitude: e.target.value ? Number(e.target.value) : null })} /></div>
                  <div><Label>Longitude (optional)</Label><Input type="number" step="any" value={newAddress.longitude ?? ''} onChange={e => setNewAddress({ ...newAddress, longitude: e.target.value ? Number(e.target.value) : null })} /></div>
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={!!newAddress.is_primary} onChange={e => setNewAddress({ ...newAddress, is_primary: e.target.checked })} />Set as primary delivery address</label>
                <div className="flex gap-2">
                  <Button className="bg-cyan-600 hover:bg-cyan-700" onClick={handleAddAddress}>Save Address</Button>
                  <Button variant="outline" onClick={() => setAddingAddress(false)}>Cancel</Button>
                </div>
              </CardContent></Card>
            )}
            {addresses.length === 0 && !addingAddress && <div className="text-center py-10 text-slate-400 text-sm">No addresses yet</div>}
            {addresses.map(addr => (
              <Card key={addr.id}><CardContent className="pt-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-slate-700">{addr.label}</span>
                      {addr.is_primary && <span className="text-xs bg-cyan-100 text-cyan-700 px-2 py-0.5 rounded-full">Primary</span>}
                    </div>
                    <p className="text-sm text-slate-600 flex items-center gap-1"><MapPin className="w-3 h-3" />{addr.address}, {addr.city}</p>
                    {addr.delivery_instructions && <p className="text-xs text-slate-400 mt-1">📋 {addr.delivery_instructions}</p>}
                    {addr.latitude && <p className="text-xs text-slate-400 mt-0.5">📍 {addr.latitude}, {addr.longitude}</p>}
                  </div>
                </div>
              </CardContent></Card>
            ))}
          </div>
        )}

        {/* CONTACTS */}
        {tab === 'contacts' && (
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={() => setAddingContact(true)}><Plus className="w-4 h-4 mr-1" />Add Contact</Button>
            </div>
            {addingContact && (
              <Card><CardContent className="pt-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Name</Label><Input value={newContact.name ?? ''} onChange={e => setNewContact({ ...newContact, name: e.target.value })} /></div>
                  <div><Label>Role</Label><Input value={newContact.role ?? ''} onChange={e => setNewContact({ ...newContact, role: e.target.value })} placeholder="GM, Procurement, F&B Manager..." /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Phone</Label><Input value={newContact.phone ?? ''} onChange={e => setNewContact({ ...newContact, phone: e.target.value })} /></div>
                  <div><Label>WhatsApp</Label><Input value={newContact.whatsapp ?? ''} onChange={e => setNewContact({ ...newContact, whatsapp: e.target.value })} /></div>
                </div>
                <div><Label>Email</Label><Input type="email" value={newContact.email ?? ''} onChange={e => setNewContact({ ...newContact, email: e.target.value })} /></div>
                <div className="flex gap-4 text-sm">
                  <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={!!newContact.is_primary} onChange={e => setNewContact({ ...newContact, is_primary: e.target.checked })} />Primary contact</label>
                  <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={!!newContact.receives_invoices} onChange={e => setNewContact({ ...newContact, receives_invoices: e.target.checked })} />Receives invoices</label>
                  <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={!!newContact.receives_delivery_notices} onChange={e => setNewContact({ ...newContact, receives_delivery_notices: e.target.checked })} />Delivery notices</label>
                </div>
                <div className="flex gap-2">
                  <Button className="bg-cyan-600 hover:bg-cyan-700" onClick={handleAddContact}>Save Contact</Button>
                  <Button variant="outline" onClick={() => setAddingContact(false)}>Cancel</Button>
                </div>
              </CardContent></Card>
            )}
            {contacts.length === 0 && !addingContact && <div className="text-center py-10 text-slate-400 text-sm">No contacts yet</div>}
            {contacts.map(c => (
              <Card key={c.id}><CardContent className="pt-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-700">{c.name}</span>
                      {c.is_primary && <span className="text-xs bg-cyan-100 text-cyan-700 px-2 py-0.5 rounded-full">Primary</span>}
                      {c.role && <span className="text-xs text-slate-400">{c.role}</span>}
                    </div>
                    {c.phone && <p className="text-sm text-slate-500 flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</p>}
                    {c.whatsapp && c.whatsapp !== c.phone && (
                      <a href={`https://wa.me/${c.whatsapp.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer"
                        className="text-sm text-emerald-600 flex items-center gap-1 hover:text-emerald-700">
                        💬 {c.whatsapp}
                      </a>
                    )}
                    {c.email && <p className="text-sm text-slate-500 flex items-center gap-1"><Mail className="w-3 h-3" />{c.email}</p>}
                    <div className="flex gap-2">
                      {c.receives_invoices && <span className="text-xs bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded">Invoices</span>}
                      {c.receives_delivery_notices && <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded">Deliveries</span>}
                    </div>
                  </div>
                  <button onClick={async () => {
                    await deleteCustomerContact(c.id)
                    setContacts(contacts.filter(x => x.id !== c.id))
                    const sb = createClient()
                    await sb.from('customer_field_history').insert({
                      customer_id: customer.id,
                      field_name: 'contact_removed',
                      old_value: [c.name, c.role, c.phone].filter(Boolean).join(' · '),
                      new_value: null,
                    })
                    loadHistory()
                  }} className="text-slate-300 hover:text-red-400 mt-1">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </CardContent></Card>
            ))}
          </div>
        )}

        {/* DELIVERIES */}
        {tab === 'deliveries' && (
          <Card><CardContent className="pt-4">
            {deliveries.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">No deliveries yet</p>
            ) : (
              <div className="space-y-1">
                {deliveries.map(d => (
                  <div key={d.id} className="flex items-center gap-4 p-3 rounded-lg hover:bg-slate-50 text-sm">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${d.status === 'completed' ? 'bg-emerald-500' : d.status === 'failed' ? 'bg-red-500' : d.status === 'in_transit' ? 'bg-blue-500' : 'bg-amber-400'}`} />
                    <div className="flex-1">
                      <p className="font-medium text-slate-700">{new Date(d.delivery_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</p>
                      <p className="text-xs text-slate-400">
                        Delivered: {d.delivered_350ml}×350ml, {d.delivered_750ml}×750ml
                        {(d.collected_350ml + d.collected_750ml) > 0 && ` · Collected: ${d.collected_350ml}×350ml, ${d.collected_750ml}×750ml`}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${d.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : d.status === 'failed' ? 'bg-red-100 text-red-600' : d.status === 'in_transit' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>{d.status}</span>
                    {d.signature_confirmed_by && <span className="text-xs text-slate-400">✓ {d.signature_confirmed_by}</span>}
                  </div>
                ))}
              </div>
            )}
          </CardContent></Card>
        )}

        {/* INVOICES */}
        {tab === 'invoices' && (
          <Card><CardContent className="pt-4">
            {invoices.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">No invoices yet — generate one from the Overview tab</p>
            ) : (
              <div className="space-y-1">
                {invoices.map(inv => (
                  <div key={inv.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 text-sm">
                    <div className="flex-1 cursor-pointer" onClick={() => router.push(`/invoices/${inv.id}`)}>
                      <p className="font-medium text-slate-700">{inv.invoice_number}</p>
                      <p className="text-xs text-slate-400">Due {new Date(inv.due_date).toLocaleDateString()}</p>
                    </div>
                    <p className="font-bold text-slate-800">{idr(Number(inv.total))}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${inv.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : inv.status === 'overdue' ? 'bg-red-100 text-red-600' : inv.status === 'sent' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>{inv.status}</span>
                    {['draft', 'sent'].includes(inv.status) && customer.contact_email && (
                      <button onClick={async () => {
                        await fetch('/api/email', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ type: 'invoice', payload: { ...inv, customer: { name: customer.name, contact_email: customer.contact_email, contact_name: customer.contact_name } } }) })
                        const sb = createClient()
                        await sb.from('invoices').update({ status: 'sent' }).eq('id', inv.id)
                        setInvoices(prev => prev.map(i => i.id === inv.id ? { ...i, status: 'sent' as any } : i))
                      }} className="text-xs text-blue-600 hover:text-blue-800 border border-blue-200 px-2 py-0.5 rounded-lg bg-blue-50 hover:bg-blue-100">
                        Email
                      </button>
                    )}
                    {['sent', 'overdue'].includes(inv.status) && (
                      <button onClick={async () => {
                        const sb = createClient()
                        await Promise.all([
                          sb.from('invoices').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', inv.id),
                          sb.from('payments').insert({ customer_id: customer.id, invoice_id: inv.id, amount: inv.total, currency: 'IDR', method: 'bank_transfer', payment_date: new Date().toISOString().split('T')[0], status: 'verified' }),
                        ])
                        setInvoices(prev => prev.map(i => i.id === inv.id ? { ...i, status: 'paid' as any } : i))
                      }} className="text-xs text-emerald-600 hover:text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-lg bg-emerald-50 hover:bg-emerald-100">
                        Paid
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent></Card>
        )}

        {/* DOCUMENTS */}
        {tab === 'documents' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">Attach contracts, permits, ID copies, or any files to this customer account.</p>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingDoc}
                className="inline-flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              >
                {uploadingDoc ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                Upload File
              </button>
              <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleUploadDocument} />
            </div>
            {documents.length === 0 ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-200 rounded-xl py-14 text-center cursor-pointer hover:border-cyan-300 hover:bg-cyan-50/50 transition-colors"
              >
                <Paperclip className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-400">Click or drag files here</p>
                <p className="text-xs text-slate-300 mt-1">Contracts, permits, IDs, invoices — any file type</p>
              </div>
            ) : (
              <div className="space-y-2">
                {documents.map(doc => (
                  <div key={doc.id} className="flex items-center gap-3 bg-white border border-slate-100 rounded-xl p-3 shadow-sm">
                    <div className="w-9 h-9 rounded-lg bg-slate-50 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-4 h-4 text-slate-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate">{doc.name}</p>
                      <p className="text-xs text-slate-400">
                        {doc.file_size ? `${(doc.file_size / 1024).toFixed(0)} KB · ` : ''}
                        {new Date(doc.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {doc.file_url && (
                        <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
                          className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors" title="Open file">
                          <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                        </a>
                      )}
                      <button onClick={() => handleDeleteDocument(doc.id)}
                        className="p-1.5 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                        <Trash2 className="w-3.5 h-3.5 text-slate-300 hover:text-red-400" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* DELIVERY SCHEDULE / SUBSCRIPTION */}
        {tab === 'subscription' && (
          <div className="space-y-4">
            {/* Quick-create delivery button */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-800">Delivery Schedule</h3>
                <p className="text-sm text-slate-500 mt-0.5">Set delivery days and quantities. Monthly invoice is auto-generated on the 1st.</p>
              </div>
              <div className="flex gap-2">
                <button onClick={handleCreateDelivery}
                  className="inline-flex items-center gap-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors">
                  <Truck className="w-3.5 h-3.5" /> Schedule Delivery Now
                </button>
                <button onClick={() => setEditingSub(!editingSub)}
                  className="inline-flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors">
                  <Edit2 className="w-3.5 h-3.5" /> {subscription ? 'Edit Schedule' : 'Set Up Schedule'}
                </button>
              </div>
            </div>

            {editingSub ? (
              <Card><CardContent className="pt-5 space-y-5">
                <div>
                  <Label className="mb-2 block font-medium">Delivery Days</Label>
                  <div className="flex flex-wrap gap-2">
                    {['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(day => (
                      <button key={day}
                        onClick={() => setSubForm((f: any) => ({
                          ...f,
                          delivery_days: f.delivery_days.includes(day)
                            ? f.delivery_days.filter((d: string) => d !== day)
                            : [...f.delivery_days, day]
                        }))}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors capitalize ${
                          subForm.delivery_days.includes(day)
                            ? 'bg-cyan-600 text-white border-cyan-600'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-cyan-400'
                        }`}>
                        {day.slice(0,3).charAt(0).toUpperCase() + day.slice(1,3)}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-slate-400 mt-1.5">Select all days this customer receives deliveries</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>350ml bottles per delivery</Label>
                    <Input type="number" min="0" value={subForm.qty_350ml}
                      onChange={e => setSubForm((f: any) => ({ ...f, qty_350ml: parseInt(e.target.value) || 0 }))} />
                  </div>
                  <div>
                    <Label>750ml bottles per delivery</Label>
                    <Input type="number" min="0" value={subForm.qty_750ml}
                      onChange={e => setSubForm((f: any) => ({ ...f, qty_750ml: parseInt(e.target.value) || 0 }))} />
                  </div>
                </div>
                <div>
                  <Label>Special instructions</Label>
                  <Textarea value={subForm.special_instructions}
                    onChange={e => setSubForm((f: any) => ({ ...f, special_instructions: e.target.value }))}
                    placeholder="Access notes, contact on arrival, loading dock info..." rows={2} />
                </div>
                <div className="flex gap-2">
                  <Button className="bg-cyan-600 hover:bg-cyan-700" onClick={handleSaveSubscription}>Save Schedule</Button>
                  <Button variant="outline" onClick={() => setEditingSub(false)}>Cancel</Button>
                </div>
              </CardContent></Card>
            ) : subscription ? (
              <Card><CardContent className="pt-5">
                <div className="space-y-4">
                  <div>
                    <p className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-2">Delivery Days</p>
                    <div className="flex flex-wrap gap-2">
                      {['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(day => (
                        <span key={day} className={`px-3 py-1.5 rounded-lg text-sm font-medium border capitalize ${
                          subscription.delivery_days?.includes(day)
                            ? 'bg-cyan-50 text-cyan-700 border-cyan-200'
                            : 'bg-slate-50 text-slate-300 border-slate-100'
                        }`}>
                          {day.slice(0,3).charAt(0).toUpperCase() + day.slice(1,3)}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-xs text-slate-400">350ml per delivery</p>
                      <p className="text-2xl font-bold text-slate-700">{subscription.qty_350ml ?? 0}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-xs text-slate-400">750ml per delivery</p>
                      <p className="text-2xl font-bold text-slate-700">{subscription.qty_750ml ?? 0}</p>
                    </div>
                  </div>
                  {subscription.special_instructions && (
                    <div className="bg-amber-50 rounded-lg p-3 text-sm text-amber-800">
                      📋 {subscription.special_instructions}
                    </div>
                  )}
                  <div className="border-t border-slate-100 pt-3">
                    <p className="text-xs text-slate-400">
                      <Calendar className="w-3 h-3 inline mr-1" />
                      Monthly invoice auto-generates on the 1st of each month based on completed deliveries.
                    </p>
                  </div>
                </div>
              </CardContent></Card>
            ) : (
              <div className="text-center py-12 text-slate-400">
                <RefreshCw className="w-8 h-8 mx-auto mb-2 text-slate-200" />
                <p className="font-medium">No delivery schedule set</p>
                <p className="text-sm mt-1">Click "Set Up Schedule" to configure recurring deliveries</p>
              </div>
            )}

            {/* Recent deliveries mini-table */}
            {deliveries.length > 0 && (
              <div>
                <p className="text-sm font-medium text-slate-600 mb-2">Recent Deliveries</p>
                <div className="space-y-1">
                  {deliveries.slice(0, 5).map(d => (
                    <div key={d.id} className="flex items-center gap-3 text-sm bg-white border border-slate-100 rounded-lg px-3 py-2">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        d.status === 'completed' ? 'bg-emerald-500' : d.status === 'in_transit' ? 'bg-blue-500' : d.status === 'failed' ? 'bg-red-500' : 'bg-amber-400'
                      }`} />
                      <span className="flex-1 text-slate-600">{new Date(d.delivery_date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                      <span className="text-slate-400">{d.delivered_350ml}×350ml · {d.delivered_750ml}×750ml</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${
                        d.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : d.status === 'failed' ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'
                      }`}>{d.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* HISTORY */}
        {tab === 'history' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">All field changes and contact edits are logged here automatically.</p>
              <button onClick={loadHistory} className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Refresh
              </button>
            </div>
            {historyLoading ? (
              <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>
            ) : fieldHistory.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-sm">No edit history yet — changes made via the Edit button will appear here.</div>
            ) : (
              <div className="space-y-2">
                {fieldHistory.map(entry => {
                  const isContactEvent = entry.field_name === 'contact_added' || entry.field_name === 'contact_removed'
                  const isRemoval = entry.field_name === 'contact_removed' || (!entry.new_value && entry.old_value)
                  const fieldLabel = entry.field_name
                    .replace(/_/g, ' ')
                    .replace(/\b\w/g, l => l.toUpperCase())
                  return (
                    <div key={entry.id} className="flex items-start gap-3 text-sm">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        isRemoval ? 'bg-red-50' : isContactEvent ? 'bg-emerald-50' : 'bg-slate-100'
                      }`}>
                        <Clock className={`w-3.5 h-3.5 ${isRemoval ? 'text-red-400' : isContactEvent ? 'text-emerald-500' : 'text-slate-400'}`} />
                      </div>
                      <div className="flex-1 bg-white border border-slate-100 rounded-xl px-3 py-2.5 shadow-sm">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <span className="font-medium text-slate-700">{fieldLabel}</span>
                            {!isContactEvent && (
                              <span className="text-slate-400"> changed</span>
                            )}
                            {entry.old_value && (
                              <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded line-through">{entry.old_value}</span>
                                {entry.new_value && <span className="text-xs text-slate-400">→</span>}
                              </div>
                            )}
                            {entry.new_value && (
                              <div className="mt-1">
                                <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded">{entry.new_value}</span>
                              </div>
                            )}
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-xs text-slate-400">{new Date(entry.changed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                            <p className="text-xs text-slate-300">{new Date(entry.changed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                            {entry.changed_by_name && <p className="text-xs text-slate-400 font-medium">{entry.changed_by_name}</p>}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* NOTES */}
        {tab === 'notes' && (
          <div className="space-y-4">
            <Card><CardContent className="pt-4">
              <div className="flex gap-3">
                <Textarea value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Add a note, log a call, record a meeting..." rows={3} className="flex-1" />
                <Button className="bg-cyan-600 hover:bg-cyan-700 self-end" onClick={handleAddNote}>Add</Button>
              </div>
            </CardContent></Card>
            {notes.length === 0 && <p className="text-sm text-slate-400 text-center py-4">No notes yet</p>}
            {notes.map(n => (
              <div key={n.id} className="flex gap-3 text-sm">
                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <MessageSquare className="w-4 h-4 text-slate-400" />
                </div>
                <div className="flex-1 bg-white border border-slate-100 rounded-xl p-3 shadow-sm">
                  <p className="text-slate-700">{n.content}</p>
                  <p className="text-xs text-slate-400 mt-1.5">{new Date(n.created_at).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
