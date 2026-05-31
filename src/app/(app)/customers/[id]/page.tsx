'use client'

import { useState, useEffect, use } from 'react'
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
  AlertTriangle, Loader2,
} from 'lucide-react'

type Tab = 'overview' | 'addresses' | 'contacts' | 'deliveries' | 'invoices' | 'notes'

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

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const sb = createClient()
      const [cust, addrs, conts, nts, bal] = await Promise.all([
        getCustomer(id),
        getCustomerAddresses(id),
        getCustomerContacts(id),
        getCustomerNotes(id),
        getCustomerBottleBalance(id),
      ])
      const [{ data: dels }, { data: invs }] = await Promise.all([
        sb.from('deliveries').select('*').eq('customer_id', id).order('delivery_date', { ascending: false }).limit(30),
        sb.from('invoices').select('*, items:invoice_items(*)').eq('customer_id', id).order('created_at', { ascending: false }),
      ])
      setCustomer(cust)
      setEditForm(cust)
      setAddresses(addrs)
      setContacts(conts)
      setNotes(nts)
      setBalance(bal)
      setDeliveries(dels ?? [])
      setInvoices(invs ?? [])
      setLoading(false)
    }
    load()
  }, [id])

  const handleSaveCustomer = async () => {
    if (!customer) return
    const updated = await updateCustomer(customer.id, editForm)
    setCustomer(updated)
    setEditingCustomer(false)
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
                    <p className="text-sm text-slate-400 flex items-center gap-1 mt-0.5">
                      <Phone className="w-3 h-3" />{customer.contact_phone}
                    </p>
                  )}
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => { setEditingCustomer(true); setTab('overview') }}>
                <Edit2 className="w-3 h-3 mr-1.5" /> Edit
              </Button>
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
              onClick={() => setTab(tid)}
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
                  <button onClick={async () => { await deleteCustomerContact(c.id); setContacts(contacts.filter(x => x.id !== c.id)) }} className="text-slate-300 hover:text-red-400 mt-1">
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
                  <div key={inv.id} className="flex items-center gap-4 p-3 rounded-lg hover:bg-slate-50 text-sm cursor-pointer" onClick={() => router.push(`/invoices/${inv.id}`)}>
                    <div className="flex-1">
                      <p className="font-medium text-slate-700">{inv.invoice_number}</p>
                      <p className="text-xs text-slate-400">Due {new Date(inv.due_date).toLocaleDateString()}</p>
                    </div>
                    <p className="font-bold text-slate-800">{idr(Number(inv.total))}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${inv.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : inv.status === 'overdue' ? 'bg-red-100 text-red-600' : inv.status === 'sent' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>{inv.status}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent></Card>
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
