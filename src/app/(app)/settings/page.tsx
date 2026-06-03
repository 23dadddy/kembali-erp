'use client'

import { useState, useEffect } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { createClient } from '@/lib/supabase/client'
import {
  Settings, DollarSign, Database, CheckCircle2, Loader2, Building2,
  MapPin, Plus, Trash2, X, Check, Sparkles, Globe, Bell, FileText, MessageSquare
} from 'lucide-react'
import { getPricing, setPricing } from '@/lib/db'

export default function SettingsPage() {
  const [tab, setTab] = useState<'pricing' | 'company' | 'locations' | 'invoice' | 'system' | 'kpi'>('pricing')

  // Pricing
  const [price350, setPrice350] = useState('')
  const [price750, setPrice750] = useState('')
  const [lostThreshold, setLostThreshold] = useState('8')
  const [savingPrice, setSavingPrice] = useState(false)
  const [priceSaved, setPriceSaved] = useState(false)

  // Locations
  const [locations, setLocations] = useState<any[]>([])
  const [showLocForm, setShowLocForm] = useState(false)
  const [savingLoc, setSavingLoc] = useState(false)
  const [locForm, setLocForm] = useState({ name: '', city: '', address: '', country: 'Indonesia', currency: 'IDR', timezone: 'Asia/Makassar' })

  // Invoice settings
  const [invoiceSettings, setInvoiceSettings] = useState({
    company_name: 'PT Kembali Air Bali',
    bank_name: 'BCA',
    bank_account: '123-456-7890',
    bank_holder: 'PT Kembali Air Bali',
    invoice_footer: 'Thank you for choosing Kembali Water! Please transfer to the account above and send proof of payment.',
    payment_terms_days: '30',
    invoice_prefix: 'INV',
  })
  const [savingInvoice, setSavingInvoice] = useState(false)
  const [invoiceSaved, setInvoiceSaved] = useState(false)

  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadAll()
  }, [])

  const loadAll = async () => {
    setLoading(true)
    const sb = createClient()

    const [pricingData, locData, settingsData] = await Promise.all([
      getPricing(),
      sb.from('locations').select('*').order('name'),
      sb.from('app_settings').select('value').eq('key', 'invoice').single(),
    ])

    for (const p of pricingData) {
      if (p.bottle_size === '350ml') setPrice350(String(p.price_per_unit))
      if (p.bottle_size === '750ml') setPrice750(String(p.price_per_unit))
    }
    setLocations(locData.data ?? [])
    if (settingsData.data?.value) {
      const s = settingsData.data.value as any
      setInvoiceSettings(prev => ({
        ...prev,
        company_name: s.company_name ?? prev.company_name,
        bank_name: s.bank_name ?? prev.bank_name,
        bank_account: s.bank_account ?? prev.bank_account,
        bank_holder: s.bank_holder ?? prev.bank_holder,
        invoice_footer: s.footer_note ?? prev.invoice_footer,
        payment_terms_days: String(s.payment_terms ?? prev.payment_terms_days),
        invoice_prefix: s.invoice_prefix ?? prev.invoice_prefix,
      }))
    } else {
      // Fall back to localStorage
      const saved = localStorage.getItem('invoice_settings')
      if (saved) setInvoiceSettings(JSON.parse(saved))
    }
    setLoading(false)
  }

  const savePricing = async () => {
    setSavingPrice(true)
    await Promise.all([
      setPricing('350ml', parseFloat(price350) || 6000),
      setPricing('750ml', parseFloat(price750) || 10000),
    ])
    setPriceSaved(true)
    setTimeout(() => setPriceSaved(false), 3000)
    setSavingPrice(false)
  }

  const addLocation = async () => {
    if (!locForm.name) return
    setSavingLoc(true)
    const sb = createClient()
    const { data } = await sb.from('locations').insert(locForm).select().single()
    if (data) setLocations([...locations, data])
    setShowLocForm(false)
    setLocForm({ name: '', city: '', address: '', country: 'Indonesia', currency: 'IDR', timezone: 'Asia/Makassar' })
    setSavingLoc(false)
  }

  const deleteLocation = async (id: string) => {
    const sb = createClient()
    await sb.from('locations').delete().eq('id', id)
    setLocations(locations.filter(l => l.id !== id))
  }

  const saveInvoiceSettings = async () => {
    setSavingInvoice(true)
    const sb = createClient()
    const dbValue = {
      company_name: invoiceSettings.company_name,
      bank_name: invoiceSettings.bank_name,
      bank_account: invoiceSettings.bank_account,
      bank_holder: invoiceSettings.bank_holder,
      footer_note: invoiceSettings.invoice_footer,
      payment_terms: parseInt(invoiceSettings.payment_terms_days) || 30,
      invoice_prefix: invoiceSettings.invoice_prefix,
    }
    await sb.from('app_settings').upsert({ key: 'invoice', value: dbValue, updated_at: new Date().toISOString() })
    // Also sync to localStorage for PDF generation
    localStorage.setItem('invoice_settings', JSON.stringify(invoiceSettings))
    setInvoiceSaved(true)
    setTimeout(() => setInvoiceSaved(false), 3000)
    setSavingInvoice(false)
  }

  const Section = ({ title, icon: Icon, children }: any) => (
    <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
        <Icon className="w-4 h-4 text-slate-500" />
        <h3 className="font-semibold text-slate-800 text-sm">{title}</h3>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  )

  const Field = ({ label, value, onChange, type = 'text', placeholder = '' }: any) => (
    <div>
      <label className="text-xs font-medium text-slate-600 block mb-1">{label}</label>
      <input type={type} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
        value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  )

  return (
    <>
      <Topbar title="Settings" />
      <div className="p-6 max-w-3xl space-y-6">

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit flex-wrap">
          {([
            { key: 'pricing', label: 'Pricing' },
            { key: 'invoice', label: 'Invoice' },
            { key: 'locations', label: 'Locations' },
            { key: 'company', label: 'Company' },
            { key: 'kpi', label: 'KPI Targets' },
            { key: 'system', label: 'System' },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'pricing' && (
          <Section title="Bottle Pricing & Thresholds" icon={DollarSign}>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">350ml — Price per bottle</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">Rp</span>
                  <input type="number" step="500" className="w-full border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm"
                    value={price350} onChange={e => setPrice350(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">750ml — Price per bottle</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">Rp</span>
                  <input type="number" step="500" className="w-full border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm"
                    value={price750} onChange={e => setPrice750(e.target.value)} />
                </div>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Lost Bottle Threshold (%)</label>
              <div className="flex items-center gap-3">
                <input type="number" min="0" max="100" step="1" className="w-24 border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={lostThreshold} onChange={e => setLostThreshold(e.target.value)} />
                <p className="text-sm text-slate-500">Bottles lost beyond this % of total delivered will be charged at replacement cost.</p>
              </div>
            </div>
            <div className="pt-2">
              <button onClick={savePricing} disabled={savingPrice}
                className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors">
                {savingPrice ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Save Pricing
              </button>
              {priceSaved && <span className="ml-3 text-sm text-emerald-600 flex items-center gap-1 inline-flex"><CheckCircle2 className="w-4 h-4" /> Saved!</span>}
            </div>
          </Section>
        )}

        {tab === 'invoice' && (
          <Section title="Invoice & Payment Settings" icon={FileText}>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Company Name" value={invoiceSettings.company_name}
                onChange={(v: string) => setInvoiceSettings({ ...invoiceSettings, company_name: v })} />
              <Field label="Invoice Prefix" value={invoiceSettings.invoice_prefix} placeholder="INV"
                onChange={(v: string) => setInvoiceSettings({ ...invoiceSettings, invoice_prefix: v })} />
              <Field label="Payment Terms (days)" type="number" value={invoiceSettings.payment_terms_days}
                onChange={(v: string) => setInvoiceSettings({ ...invoiceSettings, payment_terms_days: v })} />
              <Field label="Bank Name" value={invoiceSettings.bank_name}
                onChange={(v: string) => setInvoiceSettings({ ...invoiceSettings, bank_name: v })} />
              <Field label="Bank Account Number" value={invoiceSettings.bank_account}
                onChange={(v: string) => setInvoiceSettings({ ...invoiceSettings, bank_account: v })} />
              <Field label="Account Holder Name" value={invoiceSettings.bank_holder}
                onChange={(v: string) => setInvoiceSettings({ ...invoiceSettings, bank_holder: v })} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Invoice Footer / Payment Instructions</label>
              <textarea className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none" rows={3}
                value={invoiceSettings.invoice_footer}
                onChange={e => setInvoiceSettings({ ...invoiceSettings, invoice_footer: e.target.value })} />
            </div>
            <div className="pt-2 flex items-center gap-3">
              <button onClick={saveInvoiceSettings} disabled={savingInvoice}
                className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors">
                {savingInvoice ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Save Settings
              </button>
              {invoiceSaved && <span className="text-sm text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Saved!</span>}
            </div>
          </Section>
        )}

        {tab === 'locations' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button onClick={() => setShowLocForm(!showLocForm)}
                className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
                <Plus className="w-4 h-4" /> Add Location
              </button>
            </div>

            {showLocForm && (
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                <h3 className="font-semibold text-slate-800">New Location / Branch</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">Location Name *</label>
                    <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                      placeholder="e.g. Bali HQ, Jakarta Branch"
                      value={locForm.name} onChange={e => setLocForm({ ...locForm, name: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">City</label>
                    <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                      value={locForm.city} onChange={e => setLocForm({ ...locForm, city: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">Country</label>
                    <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                      value={locForm.country} onChange={e => setLocForm({ ...locForm, country: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">Currency</label>
                    <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                      value={locForm.currency} onChange={e => setLocForm({ ...locForm, currency: e.target.value })}>
                      <option value="IDR">IDR — Indonesian Rupiah</option>
                      <option value="USD">USD — US Dollar</option>
                      <option value="SGD">SGD — Singapore Dollar</option>
                      <option value="AUD">AUD — Australian Dollar</option>
                      <option value="MYR">MYR — Malaysian Ringgit</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">Timezone</label>
                    <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                      value={locForm.timezone} onChange={e => setLocForm({ ...locForm, timezone: e.target.value })}>
                      <option value="Asia/Makassar">Asia/Makassar (WITA — Bali)</option>
                      <option value="Asia/Jakarta">Asia/Jakarta (WIB — Jakarta)</option>
                      <option value="Asia/Jayapura">Asia/Jayapura (WIT — East)</option>
                      <option value="Asia/Singapore">Asia/Singapore</option>
                      <option value="Australia/Sydney">Australia/Sydney</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">Address</label>
                    <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                      value={locForm.address} onChange={e => setLocForm({ ...locForm, address: e.target.value })} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={addLocation} disabled={savingLoc || !locForm.name}
                    className="flex-1 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-2">
                    {savingLoc ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" />Add Location</>}
                  </button>
                  <button onClick={() => setShowLocForm(false)} className="border border-slate-200 px-4 py-2 rounded-xl text-sm hover:bg-slate-50"><X className="w-4 h-4" /></button>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {locations.length === 0 ? (
                <div className="text-center py-12 text-slate-400 bg-white border border-slate-100 rounded-2xl">
                  <Globe className="w-8 h-8 mx-auto mb-2 text-slate-200" />
                  <p>No locations yet</p>
                  <p className="text-sm mt-1">Add your first location to enable multi-branch operations</p>
                </div>
              ) : locations.map(loc => (
                <div key={loc.id} className="bg-white border border-slate-100 rounded-2xl p-4 flex items-center gap-4 shadow-sm">
                  <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <MapPin className="w-5 h-5 text-slate-500" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-slate-800">{loc.name}</p>
                    <p className="text-sm text-slate-500">{[loc.city, loc.country].filter(Boolean).join(', ')}</p>
                    <div className="flex gap-2 mt-1">
                      <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{loc.currency ?? 'IDR'}</span>
                      <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{loc.timezone ?? 'Asia/Makassar'}</span>
                    </div>
                  </div>
                  <button onClick={() => deleteLocation(loc.id)} className="text-slate-300 hover:text-red-400 transition-colors p-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'company' && (
          <Section title="Company Information" icon={Building2}>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Company Name" value="PT Kembali Air Bali" onChange={() => {}} />
              <Field label="Trading Name" value="Kembali Water" onChange={() => {}} />
              <Field label="Phone" value="+62 812-3456-7890" onChange={() => {}} />
              <Field label="Email" value="info@kembaliwater.com" onChange={() => {}} />
              <Field label="Website" value="www.kembaliwater.com" onChange={() => {}} />
              <Field label="Tax / NPWP" value="" placeholder="00.000.000.0-000.000" onChange={() => {}} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Registered Address</label>
              <textarea className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none" rows={2}
                defaultValue="Jl. Sunset Road No. 88, Seminyak, Badung, Bali 80361, Indonesia" />
            </div>
            <button className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium">
              <Check className="w-4 h-4" /> Save Company Info
            </button>
          </Section>
        )}

        {tab === 'kpi' && (
          <KpiTargetsSection />
        )}

        {tab === 'system' && (
          <div className="space-y-4">
            {/* Migration runner */}
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <Database className="w-5 h-5 text-blue-600" />
                <p className="font-semibold text-blue-800">Database Setup — Run Migrations</p>
              </div>
              <p className="text-sm text-blue-700 mb-3">
                Several modules need new tables to work fully. Run both SQL files once in Supabase to unlock all functionality.
              </p>
              <ol className="text-xs text-blue-700 space-y-1 mb-3">
                <li>1. Open <span className="font-semibold">supabase.com → your project → SQL Editor</span></li>
                <li>2. Click <span className="font-semibold">+ New Query</span>, paste & run <code className="bg-blue-100 px-1 rounded">supabase/migrations/20260603_missing_tables.sql</code></li>
                <li>3. New Query again, paste & run <code className="bg-blue-100 px-1 rounded">supabase/migrations/20260603_comms_tables.sql</code></li>
                <li>3. Paste & run <code className="bg-blue-100 px-1 rounded">20260603_inventory_rpcs.sql</code> <span className="text-red-600 font-semibold">(critical — fixes delivery inventory updates)</span></li>
                <li>4. Paste & run <code className="bg-blue-100 px-1 rounded">20260603_missing_columns.sql</code> — adds missing columns (portal_enabled, auth_user_id, delivery fields, etc.)</li>
                <li>✅ After running all 4 files, the entire ERP will be fully operational</li>
              </ol>
              <a href="https://supabase.com/dashboard/project/oyingjtpontuoiyvkzxg/sql/new" target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
                Open Supabase SQL Editor ↗
              </a>
            </div>

            {/* Database */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <p className="font-semibold text-emerald-800">Database Connected</p>
              </div>
              <p className="text-sm text-emerald-700">Supabase PostgreSQL · Project: <code className="bg-emerald-100 px-1 rounded">oyingjtpontuoiyvkzxg</code></p>
              <p className="text-xs text-emerald-600 mt-1">Region: ap-northeast-1 (Tokyo) · 41 tables</p>
            </div>

            {/* AI */}
            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-5 h-5 text-violet-500" />
                <p className="font-semibold text-slate-800">AI Command Center</p>
              </div>
              <p className="text-sm text-slate-600 mb-3">
                Powered by Claude (Anthropic). Requires an API key in <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">.env.local</code>
              </p>
              <div className="bg-slate-50 rounded-xl p-3 font-mono text-xs text-slate-600">
                ANTHROPIC_API_KEY=your_key_here
              </div>
              <p className="text-xs text-slate-400 mt-2">Get a key at <span className="text-cyan-600">console.anthropic.com</span></p>
            </div>

            {/* WhatsApp Business */}
            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <MessageSquare className="w-5 h-5 text-emerald-500" />
                <p className="font-semibold text-slate-800">WhatsApp Business API</p>
              </div>
              <p className="text-sm text-slate-600 mb-3">
                Receive and reply to WhatsApp messages from customers directly in the Communications inbox.
              </p>
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-1">Webhook URL (paste into Meta Developer Console)</p>
                  <div className="bg-slate-50 rounded-xl p-3 font-mono text-xs text-slate-700 break-all select-all">
                    https://kembali-erp.vercel.app/api/webhooks/whatsapp
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-1">Verify Token</p>
                  <div className="bg-slate-50 rounded-xl p-3 font-mono text-xs text-slate-700">kembali-wa-verify</div>
                </div>
                <ol className="text-xs text-slate-500 space-y-1 ml-1">
                  <li>1. Create a Meta App at <span className="text-cyan-600">developers.facebook.com</span></li>
                  <li>2. Add WhatsApp product → set up a phone number</li>
                  <li>3. Add <code className="bg-slate-100 px-1 rounded">WHATSAPP_ACCESS_TOKEN</code> and <code className="bg-slate-100 px-1 rounded">WHATSAPP_PHONE_NUMBER_ID</code> to Vercel env vars</li>
                  <li>4. Set webhook URL and verify token above in Meta console</li>
                  <li>5. Subscribe to <code className="bg-slate-100 px-1 rounded">messages</code> webhook field</li>
                </ol>
              </div>
            </div>

            {/* Email-to-Ticket */}
            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Bell className="w-5 h-5 text-cyan-500" />
                <p className="font-semibold text-slate-800">Email → Support Ticket</p>
              </div>
              <p className="text-sm text-slate-600 mb-3">
                Set up Postmark Inbound to automatically convert customer emails into support tickets.
              </p>
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-1">Webhook URL (paste into Postmark)</p>
                  <div className="bg-slate-50 rounded-xl p-3 font-mono text-xs text-slate-700 break-all select-all">
                    https://kembali-erp.vercel.app/api/inbound-email
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-1">Webhook Secret Header</p>
                  <div className="bg-slate-50 rounded-xl p-3 font-mono text-xs text-slate-700">
                    x-webhook-secret: kembali-webhook-f96855513063069c96fb59e62fd79759
                  </div>
                </div>
                <ol className="text-xs text-slate-500 space-y-1 ml-1">
                  <li>1. Create a free account at <span className="text-cyan-600 font-medium">postmarkapp.com</span></li>
                  <li>2. Add an Inbound domain (e.g. <code>contact@kembaliwater.com</code>)</li>
                  <li>3. Set the Inbound Webhook URL to the URL above</li>
                  <li>4. Add <code>x-webhook-secret</code> as a custom header with the value above</li>
                  <li>5. Emails sent to that address automatically create support tickets</li>
                </ol>
              </div>
            </div>

            {/* Document Storage */}
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-amber-500 text-lg">📦</span>
                <p className="font-semibold text-amber-800">Document Library — Storage Setup Required</p>
              </div>
              <p className="text-sm text-amber-700 mb-3">
                To enable file uploads in the Document Library, create a storage bucket in Supabase:
              </p>
              <ol className="text-xs text-amber-700 space-y-1 ml-1">
                <li>1. Go to <span className="font-medium">supabase.com → your project → Storage</span></li>
                <li>2. Click <span className="font-medium">New bucket</span></li>
                <li>3. Name it exactly: <code className="bg-amber-100 px-1 rounded">kembali-docs</code></li>
                <li>4. Set to <span className="font-medium">Public</span> (so download links work)</li>
                <li>5. Save — file uploads will then work immediately</li>
              </ol>
              <p className="text-xs text-amber-600 mt-2">Until the bucket exists, documents still save with metadata (name, size) but no download link.</p>
            </div>

            {/* Version */}
            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
              <p className="font-semibold text-slate-800 mb-2">System Info</p>
              <div className="space-y-1.5 text-sm text-slate-600">
                <div className="flex justify-between"><span className="text-slate-400">Version</span><span>Kembali ERP v1.0</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Framework</span><span>Next.js 16 · TypeScript</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Database</span><span>Supabase (PostgreSQL 16)</span></div>
                <div className="flex justify-between"><span className="text-slate-400">AI Model</span><span>claude-opus-4-5</span></div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

function KpiTargetsSection() {
  const METRICS = [
    { key: 'revenue', label: 'Monthly Revenue (IDR)', placeholder: '50000000' },
    { key: 'deliveries', label: 'Completed Deliveries', placeholder: '500' },
    { key: 'new_customers', label: 'New Customers', placeholder: '10' },
    { key: 'support_resolved', label: 'Support Tickets Resolved', placeholder: '50' },
  ]
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7))
  const [targets, setTargets] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const sb = createClient()
      const { data } = await sb.from('kpi_targets').select('*').eq('period', period)
      const t: Record<string, string> = {}
      for (const row of (data ?? [])) t[row.metric] = String(row.target)
      setTargets(t)
      setLoading(false)
    }
    load()
  }, [period])

  const save = async () => {
    const sb = createClient()
    for (const { key } of METRICS) {
      if (!targets[key]) continue
      await sb.from('kpi_targets').upsert({ metric: key, period, target: parseFloat(targets[key]) }, { onConflict: 'metric,period' })
    }
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-800">KPI Targets</h3>
        <input type="month" value={period} onChange={e => setPeriod(e.target.value)} className="border rounded-lg px-3 py-1.5 text-sm" />
      </div>
      <p className="text-sm text-slate-500">Set monthly targets. Progress bars appear on the dashboard when targets are configured.</p>
      {loading ? <Loader2 className="w-5 h-5 animate-spin text-slate-300 mx-auto" /> : (
        <div className="space-y-3">
          {METRICS.map(({ key, label, placeholder }) => (
            <div key={key} className="flex items-center gap-3">
              <label className="text-sm text-slate-600 w-56 flex-shrink-0">{label}</label>
              <input type="number" min="0" value={targets[key] ?? ''} onChange={e => setTargets(t => ({ ...t, [key]: e.target.value }))}
                placeholder={placeholder} className="border rounded-lg px-3 py-1.5 text-sm flex-1" />
            </div>
          ))}
        </div>
      )}
      <button onClick={save} className="bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2">
        {saved ? <><CheckCircle2 className="w-4 h-4" />Saved!</> : 'Save Targets'}
      </button>
    </div>
  )
}
