'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getPortalCustomer } from '@/lib/customer-auth'
import {
  User, MapPin, Phone, Mail, Building2, Plus, Check, X, Loader2,
  Edit2, Trash2, Star, Bell, BellOff
} from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function CustomerAccountPage() {
  const router = useRouter()
  const [customerId, setCustomerId] = useState('')
  const [customer, setCustomer] = useState<any>(null)
  const [addresses, setAddresses] = useState<any[]>([])
  const [contacts, setContacts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'profile' | 'addresses' | 'contacts'>('profile')
  const [editProfile, setEditProfile] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showAddressForm, setShowAddressForm] = useState(false)
  const [showContactForm, setShowContactForm] = useState(false)

  const [profileForm, setProfileForm] = useState<any>({})
  const [addressForm, setAddressForm] = useState({ label: '', address: '', city: '', delivery_instructions: '', is_primary: false })
  const [contactForm, setContactForm] = useState({ name: '', role: '', phone: '', email: '', whatsapp: '', receives_invoices: false, receives_delivery_notices: false })

  useEffect(() => {
    const init = async () => {
      const portalCustomer = await getPortalCustomer()
      if (!portalCustomer) { router.push('/customer/login'); return }
      setCustomerId(portalCustomer.id)
    }
    init()
  }, [router])

  useEffect(() => { if (customerId) loadData() }, [customerId])

  const loadData = async () => {
    setLoading(true)
    const sb = createClient()
    const [custRes, addrRes, contactRes] = await Promise.all([
      sb.from('customers').select('*').eq('id', customerId).single(),
      sb.from('customer_addresses').select('*').eq('customer_id', customerId).order('is_primary', { ascending: false }),
      sb.from('customer_contacts').select('*').eq('customer_id', customerId),
    ])
    const c = custRes.data
    setCustomer(c)
    setProfileForm({ name: c?.name, email: c?.contact_email, phone: c?.contact_phone, city: c?.city, address: c?.address, website: c?.website, notes: c?.notes })
    setAddresses(addrRes.data ?? [])
    setContacts(contactRes.data ?? [])
    setLoading(false)
  }

  const saveProfile = async () => {
    setSaving(true)
    const sb = createClient()
    const { phone, email, ...rest } = profileForm
    await sb.from('customers').update({ ...rest, contact_phone: phone, contact_email: email }).eq('id', customerId)
    setCustomer({ ...customer, ...profileForm })
    setEditProfile(false)
    setSaving(false)
  }

  const addAddress = async () => {
    if (!addressForm.address) return
    setSaving(true)
    const sb = createClient()
    const { data } = await sb.from('customer_addresses').insert({ ...addressForm, customer_id: customerId }).select().single()
    if (data) setAddresses([...addresses, data])
    setAddressForm({ label: '', address: '', city: '', delivery_instructions: '', is_primary: false })
    setShowAddressForm(false)
    setSaving(false)
  }

  const addContact = async () => {
    if (!contactForm.name) return
    setSaving(true)
    const sb = createClient()
    const { data } = await sb.from('customer_contacts').insert({ ...contactForm, customer_id: customerId }).select().single()
    if (data) setContacts([...contacts, data])
    setContactForm({ name: '', role: '', phone: '', email: '', whatsapp: '', receives_invoices: false, receives_delivery_notices: false })
    setShowContactForm(false)
    setSaving(false)
  }

  const deleteAddress = async (id: string) => {
    const sb = createClient()
    await sb.from('customer_addresses').delete().eq('id', id)
    setAddresses(addresses.filter(a => a.id !== id))
  }

  const deleteContact = async (id: string) => {
    const sb = createClient()
    await sb.from('customer_contacts').delete().eq('id', id)
    setContacts(contacts.filter(c => c.id !== id))
  }

  if (loading) return (
    <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Account</h1>
        <p className="text-slate-500 text-sm mt-0.5">Manage your profile, addresses, and contacts</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {(['profile', 'addresses', 'contacts'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${tab === t ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'profile' && customer && (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">Business Profile</h2>
            {!editProfile ? (
              <button onClick={() => setEditProfile(true)} className="flex items-center gap-1.5 text-sm text-cyan-600 hover:text-cyan-700">
                <Edit2 className="w-4 h-4" /> Edit
              </button>
            ) : (
              <div className="flex gap-2">
                <button onClick={saveProfile} disabled={saving} className="flex items-center gap-1.5 text-sm bg-cyan-600 text-white px-3 py-1.5 rounded-lg hover:bg-cyan-700 disabled:opacity-50">
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Check className="w-3.5 h-3.5" />Save</>}
                </button>
                <button onClick={() => { setEditProfile(false); setProfileForm({ name: customer.name, email: customer.contact_email, phone: customer.contact_phone, city: customer.city, address: customer.address }) }}
                  className="text-sm border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50">
                  Cancel
                </button>
              </div>
            )}
          </div>
          <div className="p-6 grid grid-cols-2 gap-5">
            {[
              { label: 'Business Name', key: 'name', icon: Building2 },
              { label: 'City', key: 'city', icon: MapPin },
              { label: 'Phone', key: 'phone', icon: Phone },
              { label: 'Email', key: 'email', icon: Mail },
              { label: 'Address', key: 'address', icon: MapPin },
              { label: 'Website', key: 'website', icon: Building2 },
            ].map(({ label, key, icon: Icon }) => (
              <div key={key}>
                <label className="text-xs font-medium text-slate-400 flex items-center gap-1.5 mb-1">
                  <Icon className="w-3.5 h-3.5" /> {label}
                </label>
                {editProfile ? (
                  <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                    value={profileForm[key] ?? ''} onChange={e => setProfileForm({ ...profileForm, [key]: e.target.value })} />
                ) : (
                  <p className="text-sm text-slate-700">{(key === 'phone' ? customer.contact_phone : key === 'email' ? customer.contact_email : customer[key]) || <span className="text-slate-400">—</span>}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'addresses' && (
        <>
          <div className="flex justify-end">
            <button onClick={() => setShowAddressForm(!showAddressForm)}
              className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
              <Plus className="w-4 h-4" /> Add Address
            </button>
          </div>

          {showAddressForm && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
              <h3 className="font-semibold text-slate-800">New Delivery Address</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Label (e.g. Main Office, Rooftop Bar)</label>
                  <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                    value={addressForm.label} onChange={e => setAddressForm({ ...addressForm, label: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">City</label>
                  <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                    value={addressForm.city} onChange={e => setAddressForm({ ...addressForm, city: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Address *</label>
                <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={addressForm.address} onChange={e => setAddressForm({ ...addressForm, address: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Delivery Instructions</label>
                <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  placeholder="e.g. Use loading dock, call security, leave at reception"
                  value={addressForm.delivery_instructions} onChange={e => setAddressForm({ ...addressForm, delivery_instructions: e.target.value })} />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input type="checkbox" checked={addressForm.is_primary} onChange={e => setAddressForm({ ...addressForm, is_primary: e.target.checked })} className="rounded" />
                Set as primary address
              </label>
              <div className="flex gap-2">
                <button onClick={addAddress} disabled={saving || !addressForm.address}
                  className="flex-1 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" />Add Address</>}
                </button>
                <button onClick={() => setShowAddressForm(false)} className="border border-slate-200 px-4 py-2 rounded-xl text-sm hover:bg-slate-50">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {addresses.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <MapPin className="w-8 h-8 mx-auto mb-2 text-slate-200" />
                <p>No addresses saved</p>
              </div>
            ) : addresses.map(addr => (
              <div key={addr.id} className="bg-white border border-slate-100 rounded-2xl p-4 flex items-start gap-4 shadow-sm">
                <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-5 h-5 text-slate-500" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-slate-800">{addr.label || 'Address'}</p>
                    {addr.is_primary && (
                      <span className="text-xs bg-cyan-100 text-cyan-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Star className="w-3 h-3" /> Primary
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-600 mt-0.5">{addr.address}</p>
                  {addr.city && <p className="text-sm text-slate-500">{addr.city}</p>}
                  {addr.delivery_instructions && (
                    <p className="text-xs text-slate-400 mt-1 italic">📋 {addr.delivery_instructions}</p>
                  )}
                </div>
                <button onClick={() => deleteAddress(addr.id)} className="text-slate-300 hover:text-red-400 transition-colors p-1">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'contacts' && (
        <>
          <div className="flex justify-end">
            <button onClick={() => setShowContactForm(!showContactForm)}
              className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
              <Plus className="w-4 h-4" /> Add Contact
            </button>
          </div>

          {showContactForm && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
              <h3 className="font-semibold text-slate-800">New Contact</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Name *</label>
                  <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                    value={contactForm.name} onChange={e => setContactForm({ ...contactForm, name: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Role / Title</label>
                  <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                    placeholder="e.g. Manager, Owner, Chef"
                    value={contactForm.role} onChange={e => setContactForm({ ...contactForm, role: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Phone</label>
                  <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                    value={contactForm.phone} onChange={e => setContactForm({ ...contactForm, phone: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">WhatsApp</label>
                  <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                    value={contactForm.whatsapp} onChange={e => setContactForm({ ...contactForm, whatsapp: e.target.value })} />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-slate-600 block mb-1">Email</label>
                  <input type="email" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                    value={contactForm.email} onChange={e => setContactForm({ ...contactForm, email: e.target.value })} />
                </div>
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={contactForm.receives_invoices} onChange={e => setContactForm({ ...contactForm, receives_invoices: e.target.checked })} />
                  Receives invoices
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={contactForm.receives_delivery_notices} onChange={e => setContactForm({ ...contactForm, receives_delivery_notices: e.target.checked })} />
                  Delivery notifications
                </label>
              </div>
              <div className="flex gap-2">
                <button onClick={addContact} disabled={saving || !contactForm.name}
                  className="flex-1 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" />Add Contact</>}
                </button>
                <button onClick={() => setShowContactForm(false)} className="border border-slate-200 px-4 py-2 rounded-xl text-sm hover:bg-slate-50">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {contacts.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <User className="w-8 h-8 mx-auto mb-2 text-slate-200" />
                <p>No contacts saved</p>
              </div>
            ) : contacts.map(contact => (
              <div key={contact.id} className="bg-white border border-slate-100 rounded-2xl p-4 flex items-start gap-4 shadow-sm">
                <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <User className="w-5 h-5 text-slate-500" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-slate-800">{contact.name}</p>
                    {contact.role && <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{contact.role}</span>}
                  </div>
                  <div className="flex gap-4 mt-1 flex-wrap">
                    {contact.phone && <span className="text-xs text-slate-500 flex items-center gap-1"><Phone className="w-3 h-3" />{contact.phone}</span>}
                    {contact.email && <span className="text-xs text-slate-500 flex items-center gap-1"><Mail className="w-3 h-3" />{contact.email}</span>}
                  </div>
                  <div className="flex gap-3 mt-2">
                    {contact.receives_invoices && (
                      <span className="text-xs bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Bell className="w-3 h-3" /> Invoices
                      </span>
                    )}
                    {contact.receives_delivery_notices && (
                      <span className="text-xs bg-cyan-50 text-cyan-600 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Bell className="w-3 h-3" /> Deliveries
                      </span>
                    )}
                  </div>
                </div>
                <button onClick={() => deleteContact(contact.id)} className="text-slate-300 hover:text-red-400 transition-colors p-1">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
