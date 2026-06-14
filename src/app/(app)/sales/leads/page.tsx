'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Topbar } from '@/components/layout/topbar'
import {
  Plus, X, Search, Filter, Phone, Mail, MapPin, Globe,
  MessageCircle, ChevronDown, ChevronUp, Edit2, Trash2,
  Clock, CheckCircle2, AlertCircle, Upload, Download, LayoutGrid,
  List, SlidersHorizontal, MoreHorizontal, ArrowUpDown, Calendar,
  Building2, Users, Tag, Zap, Eye, ExternalLink, FileText, RefreshCw
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ProposalModal } from '@/components/sales/ProposalModal'

// ─── Constants ────────────────────────────────────────────────────────────────

const STAGES = [
  { key: 'prospect',     label: 'Prospect',      color: '#94A3B8', bg: '#F1F5F9' },
  { key: 'contacted',   label: 'Contacted',     color: '#60A5FA', bg: '#EFF6FF' },
  { key: 'meeting',     label: 'Meeting Set',   color: '#A78BFA', bg: '#F5F3FF' },
  { key: 'proposal',    label: 'Proposal Sent', color: '#F59E0B', bg: '#FFFBEB' },
  { key: 'negotiation', label: 'Negotiation',   color: '#F97316', bg: '#FFF7ED' },
  { key: 'closed_won',  label: 'Partner ✓',     color: '#10B981', bg: '#ECFDF5' },
  { key: 'closed_lost', label: 'Not Interested',color: '#EF4444', bg: '#FEF2F2' },
]

const BUSINESS_TYPES = ['Hotel', 'Resort', 'Villa', 'Restaurant', 'Café', 'Spa', 'Gym', 'Office', 'Coworking', 'Retail', 'Healthcare', 'School', 'Other']
const AREAS = ['Seminyak', 'Canggu', 'Ubud', 'Kuta', 'Legian', 'Sanur', 'Nusa Dua', 'Jimbaran', 'Uluwatu', 'Denpasar', 'Berawa', 'Pererenan', 'Tabanan', 'Other']
const PRIORITIES = ['high', 'medium', 'low']
const CHANNELS = [
  { key: 'whatsapp',  label: 'WhatsApp',   color: '#25D366', icon: '💬' },
  { key: 'email',     label: 'Email',      color: '#EA4335', icon: '✉️' },
  { key: 'visit',     label: 'In-Person',  color: '#5BA3A0', icon: '🚶' },
  { key: 'call',      label: 'Phone Call', color: '#F59E0B', icon: '📞' },
  { key: 'linkedin',  label: 'LinkedIn',   color: '#0A66C2', icon: '💼' },
  { key: 'instagram', label: 'Instagram',  color: '#E1306C', icon: '📸' },
  { key: 'referral',  label: 'Referral',   color: '#8B5CF6', icon: '🤝' },
  { key: 'other',     label: 'Other',      color: '#94A3B8', icon: '📝' },
]
const OUTCOMES = ['Interested', 'Not Interested', 'Follow-up Needed', 'Proposal Requested', 'Closed Won', 'No Answer', 'Left Message', 'Scheduled Meeting']
const NEXT_ACTIONS = ['Call back', 'Send proposal', 'Schedule visit', 'Follow up by WhatsApp', 'Follow up by email', 'Revisit next week', 'Revisit next month']

const PRIORITY_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  high:   { label: 'High',   color: 'text-red-600',    dot: 'bg-red-500' },
  medium: { label: 'Medium', color: 'text-orange-500', dot: 'bg-orange-400' },
  low:    { label: 'Low',    color: 'text-gray-400',   dot: 'bg-gray-300' },
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Lead = {
  id: string
  company_name: string
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  whatsapp_number: string | null
  address: string | null
  area: string | null
  city: string | null
  business_type: string | null
  stage: string
  source: string | null
  industry: string | null
  priority: string | null
  estimated_value: number
  website: string | null
  instagram: string | null
  linkedin_url: string | null
  notes: string | null
  last_contacted_at: string | null
  next_follow_up: string | null
  assigned_rep: string | null
  tags: string[] | null
  created_at: string
  updated_at: string
}

type Activity = {
  id: string
  lead_id: string
  channel: string
  direction: string
  subject: string | null
  notes: string
  outcome: string | null
  next_action: string | null
  next_action_date: string | null
  staff_name: string | null
  created_at: string
}

const EMPTY_LEAD = {
  company_name: '', contact_name: '', contact_email: '', contact_phone: '',
  whatsapp_number: '', address: '', area: '', city: '', business_type: '',
  stage: 'prospect', source: '', priority: 'medium', estimated_value: 0,
  website: '', instagram: '', linkedin_url: '', notes: '', next_follow_up: '',
  assigned_rep: '', tags: '' as string,
}

const EMPTY_ACTIVITY = {
  channel: 'whatsapp', direction: 'outbound', subject: '', notes: '',
  outcome: '', next_action: '', next_action_date: '', staff_name: '',
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 50

  // filters
  const [search, setSearch] = useState('')
  const [filterStage, setFilterStage] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterArea, setFilterArea] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [sortCol, setSortCol] = useState<string>('created_at')
  const [sortAsc, setSortAsc] = useState(false)
  const [showFilters, setShowFilters] = useState(false)

  // modals / panels
  const [showLeadForm, setShowLeadForm] = useState(false)
  const [editLead, setEditLead] = useState<Lead | null>(null)
  const [leadForm, setLeadForm] = useState({ ...EMPTY_LEAD })
  const [savingLead, setSavingLead] = useState(false)

  const [detailLead, setDetailLead] = useState<Lead | null>(null)
  const [activities, setActivities] = useState<Activity[]>([])
  const [loadingActivities, setLoadingActivities] = useState(false)
  const [showActivityForm, setShowActivityForm] = useState(false)
  const [activityForm, setActivityForm] = useState({ ...EMPTY_ACTIVITY })
  const [savingActivity, setSavingActivity] = useState(false)

  const [showProposalModal, setShowProposalModal] = useState(false)
  const [activatingPartner, setActivatingPartner] = useState(false)

  const [view, setView] = useState<'table' | 'kanban'>('table')

  // CSV import
  const [showImport, setShowImport] = useState(false)
  const [csvRows, setCsvRows] = useState<any[]>([])
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [colMap, setColMap] = useState<Record<string, string>>({})
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ inserted: number; skipped: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Discover via Google Places
  const [showDiscover, setShowDiscover] = useState(false)
  const [discoverAreas, setDiscoverAreas] = useState<string[]>(['Seminyak', 'Canggu', 'Ubud', 'Kuta', 'Sanur'])
  const [discoverTypes, setDiscoverTypes] = useState<string[]>(['lodging', 'restaurant', 'spa'])
  const [discovering, setDiscovering] = useState(false)
  const [discovered, setDiscovered] = useState<any[]>([])
  const [selectedDiscovered, setSelectedDiscovered] = useState<Set<number>>(new Set())
  const [addingDiscovered, setAddingDiscovered] = useState(false)
  const [discoverError, setDiscoverError] = useState<string | null>(null)

  const sb = createClient()

  // ─── Data loading ──────────────────────────────────────────────────────────

  const load = useCallback(async (resetPage = false) => {
    setLoading(true)
    const p = resetPage ? 0 : page
    if (resetPage) setPage(0)

    let q = sb.from('sales_leads').select('*', { count: 'exact' })

    if (search) q = q.or(`company_name.ilike.%${search}%,contact_name.ilike.%${search}%,area.ilike.%${search}%,business_type.ilike.%${search}%`)
    if (filterStage) q = q.eq('stage', filterStage)
    if (filterType) q = q.eq('business_type', filterType)
    if (filterArea) q = q.eq('area', filterArea)
    if (filterPriority) q = q.eq('priority', filterPriority)

    q = q.order(sortCol, { ascending: sortAsc }).range(p * PAGE_SIZE, p * PAGE_SIZE + PAGE_SIZE - 1)

    const { data, count } = await q
    setLeads(data ?? [])
    setTotalCount(count ?? 0)
    setLoading(false)
  }, [search, filterStage, filterType, filterArea, filterPriority, sortCol, sortAsc, page])

  useEffect(() => { load(true) }, [search, filterStage, filterType, filterArea, filterPriority, sortCol, sortAsc])
  useEffect(() => { load() }, [page])

  const loadActivities = async (leadId: string) => {
    setLoadingActivities(true)
    const { data } = await sb.from('sales_activities').select('*').eq('lead_id', leadId).order('created_at', { ascending: false })
    setActivities(data ?? [])
    setLoadingActivities(false)
  }

  // ─── Lead CRUD ─────────────────────────────────────────────────────────────

  const openNew = () => {
    setLeadForm({ ...EMPTY_LEAD })
    setEditLead(null)
    setShowLeadForm(true)
  }

  const openEdit = (lead: Lead, e?: React.MouseEvent) => {
    e?.stopPropagation()
    setLeadForm({
      company_name: lead.company_name,
      contact_name: lead.contact_name ?? '',
      contact_email: lead.contact_email ?? '',
      contact_phone: lead.contact_phone ?? '',
      whatsapp_number: lead.whatsapp_number ?? '',
      address: lead.address ?? '',
      area: lead.area ?? '',
      city: lead.city ?? '',
      business_type: lead.business_type ?? '',
      stage: lead.stage,
      source: lead.source ?? '',
      priority: lead.priority ?? 'medium',
      estimated_value: lead.estimated_value ?? 0,
      website: lead.website ?? '',
      instagram: lead.instagram ?? '',
      linkedin_url: lead.linkedin_url ?? '',
      notes: lead.notes ?? '',
      next_follow_up: lead.next_follow_up ?? '',
      assigned_rep: lead.assigned_rep ?? '',
      tags: (lead.tags ?? []).join(', '),
    })
    setEditLead(lead)
    setShowLeadForm(true)
  }

  const saveLead = async () => {
    if (!leadForm.company_name.trim()) return
    setSavingLead(true)
    const tags = leadForm.tags ? leadForm.tags.split(',').map(t => t.trim()).filter(Boolean) : null
    const payload: any = {
      company_name: leadForm.company_name.trim(),
      contact_name: leadForm.contact_name || null,
      contact_email: leadForm.contact_email || null,
      contact_phone: leadForm.contact_phone || null,
      whatsapp_number: leadForm.whatsapp_number || null,
      address: leadForm.address || null,
      area: leadForm.area || null,
      city: leadForm.city || null,
      business_type: leadForm.business_type || null,
      stage: leadForm.stage,
      source: leadForm.source || null,
      priority: leadForm.priority || 'medium',
      estimated_value: Number(leadForm.estimated_value) || 0,
      website: leadForm.website || null,
      instagram: leadForm.instagram || null,
      linkedin_url: leadForm.linkedin_url || null,
      notes: leadForm.notes || null,
      next_follow_up: leadForm.next_follow_up || null,
      assigned_rep: leadForm.assigned_rep || null,
      tags: tags,
      updated_at: new Date().toISOString(),
    }
    if (editLead) {
      await sb.from('sales_leads').update(payload).eq('id', editLead.id)
      if (detailLead?.id === editLead.id) setDetailLead({ ...detailLead, ...payload })
    } else {
      await sb.from('sales_leads').insert(payload)
    }
    await load()
    setShowLeadForm(false)
    setSavingLead(false)
  }

  const deleteLead = async (id: string) => {
    if (!confirm('Delete this lead and all its activity history?')) return
    await sb.from('sales_leads').delete().eq('id', id)
    if (detailLead?.id === id) setDetailLead(null)
    await load()
  }

  const quickStageChange = async (id: string, stage: string) => {
    await sb.from('sales_leads').update({ stage, updated_at: new Date().toISOString() }).eq('id', id)
    setLeads(prev => prev.map(l => l.id === id ? { ...l, stage } : l))
    if (detailLead?.id === id) setDetailLead(prev => prev ? { ...prev, stage } : null)
  }

  // ─── Activity logging ──────────────────────────────────────────────────────

  const openDetail = (lead: Lead) => {
    setDetailLead(lead)
    loadActivities(lead.id)
    setShowActivityForm(false)
    setActivityForm({ ...EMPTY_ACTIVITY })
  }

  const saveActivity = async () => {
    if (!detailLead || !activityForm.notes.trim()) return
    setSavingActivity(true)
    const payload = {
      lead_id: detailLead.id,
      channel: activityForm.channel,
      direction: activityForm.direction,
      subject: activityForm.subject || null,
      notes: activityForm.notes.trim(),
      outcome: activityForm.outcome || null,
      next_action: activityForm.next_action || null,
      next_action_date: activityForm.next_action_date || null,
      staff_name: activityForm.staff_name || null,
    }
    await sb.from('sales_activities').insert(payload)
    // Update last_contacted_at on the lead
    const updates: any = { last_contacted_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    if (activityForm.next_action_date) updates.next_follow_up = activityForm.next_action_date
    if (activityForm.outcome === 'Closed Won') updates.stage = 'closed_won'
    else if (activityForm.outcome === 'Not Interested') updates.stage = 'closed_lost'
    else if (activityForm.outcome === 'Proposal Requested') updates.stage = 'proposal'
    await sb.from('sales_leads').update(updates).eq('id', detailLead.id)
    await loadActivities(detailLead.id)
    setDetailLead(prev => prev ? { ...prev, ...updates } : null)
    setLeads(prev => prev.map(l => l.id === detailLead.id ? { ...l, ...updates } : l))
    setActivityForm({ ...EMPTY_ACTIVITY })
    setShowActivityForm(false)
    setSavingActivity(false)
  }

  // ─── Sort helper ───────────────────────────────────────────────────────────

  const handleSort = (col: string) => {
    if (sortCol === col) setSortAsc(a => !a)
    else { setSortCol(col); setSortAsc(true) }
  }

  const SortIcon = ({ col }: { col: string }) => (
    <ArrowUpDown className={cn('w-3 h-3 ml-1 flex-shrink-0', sortCol === col ? 'text-[#5BA3A0]' : 'text-gray-300')} />
  )

  // ─── Helpers ───────────────────────────────────────────────────────────────

  const stageConfig = (key: string) => STAGES.find(s => s.key === key) ?? STAGES[0]
  const channelConfig = (key: string) => CHANNELS.find(c => c.key === key) ?? CHANNELS[7]
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  const daysAgo = (iso: string | null) => {
    if (!iso) return null
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
    if (diff === 0) return 'Today'
    if (diff === 1) return 'Yesterday'
    return `${diff}d ago`
  }

  const followUpStatus = (date: string | null) => {
    if (!date) return null
    const days = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000)
    if (days < 0) return { label: `${Math.abs(days)}d overdue`, color: 'text-red-500' }
    if (days === 0) return { label: 'Today', color: 'text-orange-500' }
    if (days <= 3) return { label: `In ${days}d`, color: 'text-orange-400' }
    return { label: new Date(date).toLocaleDateString('en', { month: 'short', day: 'numeric' }), color: 'text-gray-400' }
  }

  // ─── CSV Export ────────────────────────────────────────────────────────────

  const exportCSV = async () => {
    const { data } = await sb.from('sales_leads').select('*').order('company_name')
    if (!data) return
    const cols = ['company_name','business_type','area','contact_name','contact_phone','whatsapp_number','contact_email','stage','priority','estimated_value','last_contacted_at','next_follow_up','assigned_rep','notes']
    const rows = [cols.join(','), ...data.map(r => cols.map(c => JSON.stringify((r as any)[c] ?? '')).join(','))]
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'kembali_leads.csv'; a.click()
  }

  // ─── CSV Import ────────────────────────────────────────────────────────────

  const downloadTemplate = () => {
    const cols = ['company_name*','business_type','area','contact_name','contact_phone','whatsapp_number','contact_email','website','instagram','address','stage','priority','estimated_value','assigned_rep','notes']
    const example = ['Potato Head Beach Club','Restaurant','Seminyak','John Doe','+62 812 0000 0001','+62 812 0000 0001','john@potato.com','potatohead.co','@potatoheadbali','Jl. Petitenget No.51B','prospect','high','500','Kyle','VIP beachclub']
    const csv = [cols.join(','), example.join(',')].join('\n')
    const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv); a.download = 'leads_import_template.csv'; a.click()
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const text = ev.target?.result as string
      const lines = text.split(/\r?\n/).filter(l => l.trim())
      if (lines.length < 2) return
      const headers = lines[0].split(',').map(h => h.replace(/[*"]/g, '').trim())
      setCsvHeaders(headers)
      const rows = lines.slice(1).map(line => {
        const vals = line.match(/("(?:[^"]|"")*"|[^,]*)/g)?.map(v => v.replace(/^"|"$/g, '').replace(/""/g, '"').trim()) ?? []
        return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']))
      })
      setCsvRows(rows.filter(r => r[headers[0]]))
      // auto-map known columns
      const autoMap: Record<string, string> = {}
      const FIELD_ALIASES: Record<string, string[]> = {
        company_name: ['company_name','business name','name','company','business'],
        business_type: ['business_type','type','category'],
        area: ['area','location','district','zone'],
        contact_name: ['contact_name','contact','person','pic','owner'],
        contact_phone: ['contact_phone','phone','telephone','tel'],
        whatsapp_number: ['whatsapp_number','whatsapp','wa'],
        contact_email: ['contact_email','email','e-mail'],
        website: ['website','web','url','website_url'],
        instagram: ['instagram','ig','instagram_handle'],
        address: ['address','street','alamat'],
        stage: ['stage','status','pipeline_stage'],
        priority: ['priority','tier'],
        estimated_value: ['estimated_value','value','monthly_value','est_value'],
        assigned_rep: ['assigned_rep','rep','salesperson','assigned_to'],
        notes: ['notes','note','remarks','comment'],
      }
      headers.forEach(h => {
        const lh = h.toLowerCase().replace(/[^a-z0-9]/g, '_')
        for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
          if (aliases.some(a => lh.includes(a.replace(/[^a-z0-9]/g, '_')))) {
            autoMap[h] = field; break
          }
        }
      })
      setColMap(autoMap)
      setImportResult(null)
    }
    reader.readAsText(file)
  }

  const runImport = async () => {
    if (!csvRows.length) return
    setImporting(true)
    const { data: existing } = await sb.from('sales_leads').select('company_name')
    const existingNames = new Set((existing ?? []).map((l: any) => l.company_name.toLowerCase().trim()))

    const toInsert: any[] = []
    let skipped = 0
    for (const row of csvRows) {
      const name = row[Object.keys(colMap).find(k => colMap[k] === 'company_name') ?? '']?.trim()
      if (!name) { skipped++; continue }
      if (existingNames.has(name.toLowerCase())) { skipped++; continue }
      const record: any = { company_name: name, stage: 'prospect', priority: 'medium' }
      for (const [csvCol, field] of Object.entries(colMap)) {
        if (field === 'company_name') continue
        const val = row[csvCol]?.trim()
        if (!val) continue
        if (field === 'estimated_value') record[field] = Number(val) || 0
        else record[field] = val
      }
      toInsert.push(record)
      existingNames.add(name.toLowerCase())
    }
    if (toInsert.length) {
      // Insert in batches of 100
      for (let i = 0; i < toInsert.length; i += 100) {
        await sb.from('sales_leads').insert(toInsert.slice(i, i + 100))
      }
    }
    setImportResult({ inserted: toInsert.length, skipped })
    setImporting(false)
    if (toInsert.length) await load()
  }

  // ─── Google Places Discovery ───────────────────────────────────────────────

  const runDiscover = async () => {
    setDiscovering(true)
    setDiscovered([])
    setDiscoverError(null)
    setSelectedDiscovered(new Set())
    try {
      const res = await fetch('/api/sales/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ areas: discoverAreas, types: discoverTypes }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.setup_required) setDiscoverError('setup_required')
        else setDiscoverError(data.error ?? 'Failed to discover businesses')
      } else {
        setDiscovered(data.discovered ?? [])
        setSelectedDiscovered(new Set(data.discovered.map((_: any, i: number) => i)))
      }
    } catch (e: any) {
      setDiscoverError(e.message)
    }
    setDiscovering(false)
  }

  const addDiscovered = async () => {
    const toAdd = discovered.filter((_, i) => selectedDiscovered.has(i))
    if (!toAdd.length) return
    setAddingDiscovered(true)
    const res = await fetch('/api/sales/discover', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leads: toAdd }),
    })
    const data = await res.json()
    setAddingDiscovered(false)
    setShowDiscover(false)
    setDiscovered([])
    await load()
    alert(`Added ${data.inserted} new businesses to your pipeline!`)
  }

  // ─── Kanban view ──────────────────────────────────────────────────────────

  const KanbanView = () => {
    const byStage = (key: string) => leads.filter(l => l.stage === key)
    return (
      <div className="flex gap-3 p-5 overflow-x-auto flex-1">
        {STAGES.map(stage => {
          const cards = byStage(stage.key)
          return (
            <div key={stage.key} className="w-56 flex-shrink-0 bg-gray-50 rounded-2xl flex flex-col">
              <div className="px-3 pt-3 pb-2 flex-shrink-0">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ background: stage.color }} />
                  <span className="text-xs font-semibold text-gray-700">{stage.label}</span>
                  <span className="text-xs bg-white text-gray-400 rounded-full px-1.5 font-medium shadow-sm ml-auto">{cards.length}</span>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
                {cards.map(lead => (
                  <div key={lead.id} onClick={() => openDetail(lead)}
                    className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition-all hover:border-[#5BA3A0]/30 group">
                    <div className="flex items-start justify-between gap-1">
                      <p className="font-semibold text-gray-900 text-xs leading-tight">{lead.company_name}</p>
                      <button onClick={e => openEdit(lead, e)} className="opacity-0 group-hover:opacity-100 flex-shrink-0">
                        <Edit2 className="w-3 h-3 text-gray-400" />
                      </button>
                    </div>
                    {lead.business_type && <p className="text-xs text-gray-400 mt-0.5">{lead.business_type}{lead.area ? ` · ${lead.area}` : ''}</p>}
                    {lead.last_contacted_at && <p className="text-xs text-gray-400 mt-1">{daysAgo(lead.last_contacted_at)}</p>}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <Topbar title="Partner Pipeline" />
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Toolbar */}
        <div className="px-5 py-3 border-b border-gray-100 bg-white flex items-center gap-2 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search businesses, contacts, areas..."
              className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#5BA3A0] w-72" />
          </div>

          <button onClick={() => setShowFilters(f => !f)}
            className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm border transition-colors', showFilters ? 'bg-[#5BA3A0] text-white border-[#5BA3A0]' : 'border-gray-200 text-gray-600 hover:bg-gray-50')}>
            <SlidersHorizontal className="w-3.5 h-3.5" /> Filters
            {(filterStage || filterType || filterArea || filterPriority) && (
              <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
            )}
          </button>

          <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
            <button onClick={() => setView('table')} className={cn('p-1.5 rounded-lg transition-colors', view === 'table' ? 'bg-white shadow-sm text-gray-700' : 'text-gray-400')}>
              <List className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setView('kanban')} className={cn('p-1.5 rounded-lg transition-colors', view === 'kanban' ? 'bg-white shadow-sm text-gray-700' : 'text-gray-400')}>
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
          </div>

          <span className="text-sm text-gray-400 ml-1">{totalCount.toLocaleString()} leads</span>

          <div className="ml-auto flex items-center gap-2">
            <button onClick={exportCSV} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm border border-gray-200 text-gray-600 hover:bg-gray-50">
              <Download className="w-3.5 h-3.5" /> Export
            </button>
            <button onClick={() => { setShowImport(true); setImportResult(null); setCsvRows([]); setCsvHeaders([]) }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm border border-gray-200 text-gray-600 hover:bg-gray-50">
              <Upload className="w-3.5 h-3.5" /> Import CSV
            </button>
            <button onClick={() => { setShowDiscover(true); setDiscovered([]); setDiscoverError(null) }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium text-white"
              style={{ background: '#6366F1' }}>
              <Zap className="w-3.5 h-3.5" /> Discover
            </button>
            <button onClick={openNew}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-white text-sm font-medium"
              style={{ background: '#5BA3A0' }}>
              <Plus className="w-3.5 h-3.5" /> Add Lead
            </button>
          </div>
        </div>

        {/* Filter bar */}
        {showFilters && (
          <div className="px-5 py-2.5 border-b border-gray-100 bg-gray-50 flex items-center gap-2 flex-wrap">
            {[
              { label: 'Stage', value: filterStage, set: setFilterStage, options: STAGES.map(s => ({ value: s.key, label: s.label })) },
              { label: 'Type', value: filterType, set: setFilterType, options: BUSINESS_TYPES.map(t => ({ value: t, label: t })) },
              { label: 'Area', value: filterArea, set: setFilterArea, options: AREAS.map(a => ({ value: a, label: a })) },
              { label: 'Priority', value: filterPriority, set: setFilterPriority, options: PRIORITIES.map(p => ({ value: p, label: p.charAt(0).toUpperCase() + p.slice(1) })) },
            ].map(f => (
              <select key={f.label} value={f.value} onChange={e => f.set(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#5BA3A0] bg-white text-gray-700">
                <option value="">All {f.label}s</option>
                {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ))}
            {(filterStage || filterType || filterArea || filterPriority) && (
              <button onClick={() => { setFilterStage(''); setFilterType(''); setFilterArea(''); setFilterPriority('') }}
                className="text-xs text-red-500 hover:text-red-700 font-medium flex items-center gap-1">
                <X className="w-3 h-3" /> Clear
              </button>
            )}
          </div>
        )}

        {/* Main content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Table or Kanban */}
          {view === 'kanban' ? <KanbanView /> : (
            <div className="flex-1 overflow-auto">
              {loading ? (
                <div className="flex items-center justify-center h-48">
                  <div className="w-6 h-6 border-2 border-[#5BA3A0] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : leads.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                  <Building2 className="w-10 h-10 text-gray-200 mb-3" />
                  <p className="text-sm font-medium">No leads found</p>
                  <p className="text-xs mt-1">Try adjusting your filters or add your first lead</p>
                </div>
              ) : (
                <table className="w-full text-sm border-collapse">
                  <thead className="sticky top-0 bg-white z-10 border-b border-gray-100">
                    <tr>
                      {[
                        { col: 'company_name', label: 'Business' },
                        { col: 'business_type', label: 'Type' },
                        { col: 'area', label: 'Area' },
                        { col: 'contact_name', label: 'Contact' },
                        { col: 'stage', label: 'Stage' },
                        { col: 'priority', label: 'Priority' },
                        { col: 'last_contacted_at', label: 'Last Contact' },
                        { col: 'next_follow_up', label: 'Follow-up' },
                        { col: 'assigned_rep', label: 'Rep' },
                      ].map(h => (
                        <th key={h.col} onClick={() => handleSort(h.col)}
                          className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-700 select-none whitespace-nowrap">
                          <div className="flex items-center">
                            {h.label}<SortIcon col={h.col} />
                          </div>
                        </th>
                      ))}
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {leads.map(lead => {
                      const stage = stageConfig(lead.stage)
                      const priority = PRIORITY_CONFIG[lead.priority ?? 'medium']
                      const followUp = followUpStatus(lead.next_follow_up)
                      return (
                        <tr key={lead.id}
                          onClick={() => openDetail(lead)}
                          className="hover:bg-gray-50 cursor-pointer transition-colors group">
                          <td className="px-4 py-2.5">
                            <div>
                              <p className="font-semibold text-gray-900 leading-tight">{lead.company_name}</p>
                              {lead.whatsapp_number && (
                                <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                                  <MessageCircle className="w-3 h-3 text-[#25D366]" />{lead.whatsapp_number}
                                </p>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-gray-600 text-xs whitespace-nowrap">{lead.business_type ?? '—'}</td>
                          <td className="px-4 py-2.5 text-gray-600 text-xs whitespace-nowrap">{lead.area ?? '—'}</td>
                          <td className="px-4 py-2.5">
                            <p className="text-gray-700 text-xs">{lead.contact_name ?? '—'}</p>
                            {lead.contact_phone && <p className="text-gray-400 text-xs">{lead.contact_phone}</p>}
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <span className="text-xs font-medium px-2 py-1 rounded-full" style={{ background: stage.bg, color: stage.color }}>
                              {stage.label}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <div className={cn('w-1.5 h-1.5 rounded-full', priority.dot)} />
                              <span className={cn('text-xs font-medium', priority.color)}>{priority.label}</span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <span className="text-xs text-gray-400">{daysAgo(lead.last_contacted_at) ?? '—'}</span>
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            {followUp ? (
                              <span className={cn('text-xs font-medium', followUp.color)}>{followUp.label}</span>
                            ) : <span className="text-gray-300 text-xs">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{lead.assigned_rep ?? '—'}</td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={e => { e.stopPropagation(); openEdit(lead) }}
                                className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-700">
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={e => { e.stopPropagation(); deleteLead(lead.id) }}
                                className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Detail panel */}
          {detailLead && (
            <div className="w-96 border-l border-gray-100 flex flex-col bg-white flex-shrink-0 overflow-hidden">
              {/* Panel header */}
              <div className="px-4 py-3 border-b border-gray-100 flex items-start gap-2 flex-shrink-0">
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-gray-900 text-sm leading-tight truncate">{detailLead.company_name}</h3>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    {detailLead.business_type && <span className="text-xs text-gray-500">{detailLead.business_type}</span>}
                    {detailLead.area && <span className="text-xs text-gray-400">· {detailLead.area}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => openEdit(detailLead)}
                    className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-700">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => setDetailLead(null)}
                    className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-700">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                {/* Stage selector */}
                <div className="px-4 py-3 border-b border-gray-50">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Stage</p>
                  <div className="flex flex-wrap gap-1">
                    {STAGES.map(s => (
                      <button key={s.key} onClick={() => quickStageChange(detailLead.id, s.key)}
                        className="text-xs px-2 py-1 rounded-lg font-medium transition-all border"
                        style={detailLead.stage === s.key
                          ? { background: s.color, color: '#fff', borderColor: s.color }
                          : { background: s.bg, color: s.color, borderColor: 'transparent' }}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Action buttons — proposal & confirm */}
                {detailLead.stage !== 'closed_won' && detailLead.stage !== 'closed_lost' && (
                  <div className="px-4 py-3 border-b border-gray-50 space-y-2">
                    {detailLead.stage === 'proposal' || detailLead.stage === 'negotiation' ? (
                      <>
                        <button onClick={() => setShowProposalModal(true)}
                          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200">
                          <FileText className="w-4 h-4" /> Resend Proposal
                        </button>
                        <button
                          onClick={async () => {
                            if (!confirm(`Confirm ${detailLead.company_name} as an active partner? This will create their customer account and send a welcome message.`)) return
                            setActivatingPartner(true)
                            const res = await fetch('/api/sales/activate-partner', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ leadId: detailLead.id }),
                            })
                            setActivatingPartner(false)
                            if (res.ok) {
                              await load()
                              setDetailLead(l => l ? { ...l, stage: 'closed_won' } : l)
                            }
                          }}
                          disabled={activatingPartner}
                          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50">
                          {activatingPartner ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                          {activatingPartner ? 'Activating…' : 'Confirm as Partner ✓'}
                        </button>
                      </>
                    ) : (
                      <button onClick={() => setShowProposalModal(true)}
                        className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium text-white"
                        style={{ background: '#F59E0B' }}>
                        <FileText className="w-4 h-4" /> Generate & Send Proposal
                      </button>
                    )}
                  </div>
                )}

                {/* Contact info */}
                <div className="px-4 py-3 border-b border-gray-50 space-y-2">
                  {detailLead.contact_name && (
                    <div className="flex items-center gap-2 text-sm text-gray-700">
                      <Users className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      {detailLead.contact_name}
                    </div>
                  )}
                  {detailLead.whatsapp_number && (
                    <a href={`https://wa.me/${detailLead.whatsapp_number.replace(/\D/g,'')}`} target="_blank"
                      className="flex items-center gap-2 text-sm text-[#25D366] hover:underline"
                      onClick={e => e.stopPropagation()}>
                      <MessageCircle className="w-3.5 h-3.5 flex-shrink-0" />
                      {detailLead.whatsapp_number}
                    </a>
                  )}
                  {detailLead.contact_phone && (
                    <a href={`tel:${detailLead.contact_phone}`}
                      className="flex items-center gap-2 text-sm text-[#5BA3A0] hover:underline"
                      onClick={e => e.stopPropagation()}>
                      <Phone className="w-3.5 h-3.5 flex-shrink-0" />{detailLead.contact_phone}
                    </a>
                  )}
                  {detailLead.contact_email && (
                    <a href={`mailto:${detailLead.contact_email}`}
                      className="flex items-center gap-2 text-sm text-[#5BA3A0] hover:underline"
                      onClick={e => e.stopPropagation()}>
                      <Mail className="w-3.5 h-3.5 flex-shrink-0" />{detailLead.contact_email}
                    </a>
                  )}
                  {detailLead.address && (
                    <div className="flex items-start gap-2 text-sm text-gray-600">
                      <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5" />{detailLead.address}
                    </div>
                  )}
                  <div className="flex gap-2 mt-1">
                    {detailLead.website && (
                      <a href={detailLead.website.startsWith('http') ? detailLead.website : `https://${detailLead.website}`} target="_blank"
                        className="flex items-center gap-1 text-xs text-blue-500 hover:underline" onClick={e => e.stopPropagation()}>
                        <Globe className="w-3 h-3" /> Website
                      </a>
                    )}
                    {detailLead.instagram && (
                      <a href={`https://instagram.com/${detailLead.instagram.replace('@','')}`} target="_blank"
                        className="flex items-center gap-1 text-xs text-pink-500 hover:underline" onClick={e => e.stopPropagation()}>
                        <ExternalLink className="w-3 h-3" /> Instagram
                      </a>
                    )}
                    {detailLead.linkedin_url && (
                      <a href={detailLead.linkedin_url} target="_blank"
                        className="flex items-center gap-1 text-xs text-blue-600 hover:underline" onClick={e => e.stopPropagation()}>
                        <Globe className="w-3 h-3" /> LinkedIn
                      </a>
                    )}
                  </div>
                </div>

                {/* Priority + Follow-up */}
                <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-4">
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Priority</p>
                    <div className={cn('text-xs font-semibold flex items-center gap-1', PRIORITY_CONFIG[detailLead.priority ?? 'medium'].color)}>
                      <div className={cn('w-1.5 h-1.5 rounded-full', PRIORITY_CONFIG[detailLead.priority ?? 'medium'].dot)} />
                      {PRIORITY_CONFIG[detailLead.priority ?? 'medium'].label}
                    </div>
                  </div>
                  {detailLead.next_follow_up && (
                    <div>
                      <p className="text-xs text-gray-400 mb-0.5">Next Follow-up</p>
                      {(() => {
                        const f = followUpStatus(detailLead.next_follow_up)
                        return <p className={cn('text-xs font-semibold', f?.color)}>{f?.label}</p>
                      })()}
                    </div>
                  )}
                  {detailLead.assigned_rep && (
                    <div>
                      <p className="text-xs text-gray-400 mb-0.5">Assigned To</p>
                      <p className="text-xs font-semibold text-gray-700">{detailLead.assigned_rep}</p>
                    </div>
                  )}
                </div>

                {detailLead.notes && (
                  <div className="px-4 py-3 border-b border-gray-50">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Notes</p>
                    <p className="text-xs text-gray-600 whitespace-pre-wrap bg-gray-50 rounded-lg p-2.5">{detailLead.notes}</p>
                  </div>
                )}

                {/* Activity log */}
                <div className="px-4 py-3">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Activity History</p>
                    <button onClick={() => setShowActivityForm(f => !f)}
                      className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg text-white"
                      style={{ background: '#5BA3A0' }}>
                      <Plus className="w-3 h-3" /> Log
                    </button>
                  </div>

                  {/* Log form */}
                  {showActivityForm && (
                    <div className="bg-gray-50 rounded-xl p-3 mb-3 space-y-2.5 border border-gray-200">
                      {/* Channel */}
                      <div className="grid grid-cols-4 gap-1">
                        {CHANNELS.map(ch => (
                          <button key={ch.key} onClick={() => setActivityForm(f => ({ ...f, channel: ch.key }))}
                            className={cn('flex flex-col items-center gap-0.5 py-1.5 rounded-lg text-xs border transition-all', activityForm.channel === ch.key ? 'border-transparent text-white' : 'border-gray-200 text-gray-600 hover:border-gray-300 bg-white')}
                            style={activityForm.channel === ch.key ? { background: ch.color } : {}}>
                            <span className="text-base leading-none">{ch.icon}</span>
                            <span className="leading-none font-medium" style={{ fontSize: '9px' }}>{ch.label}</span>
                          </button>
                        ))}
                      </div>
                      <textarea value={activityForm.notes} onChange={e => setActivityForm(f => ({ ...f, notes: e.target.value }))}
                        placeholder="What happened? Key points, what was said..."
                        rows={3} className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:border-[#5BA3A0] resize-none bg-white" />
                      <select value={activityForm.outcome} onChange={e => setActivityForm(f => ({ ...f, outcome: e.target.value }))}
                        className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#5BA3A0] bg-white">
                        <option value="">Outcome (optional)</option>
                        {OUTCOMES.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                      <div className="grid grid-cols-2 gap-2">
                        <select value={activityForm.next_action} onChange={e => setActivityForm(f => ({ ...f, next_action: e.target.value }))}
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#5BA3A0] bg-white">
                          <option value="">Next action...</option>
                          {NEXT_ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                        <input type="date" value={activityForm.next_action_date} onChange={e => setActivityForm(f => ({ ...f, next_action_date: e.target.value }))}
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#5BA3A0]" />
                      </div>
                      <input value={activityForm.staff_name} onChange={e => setActivityForm(f => ({ ...f, staff_name: e.target.value }))}
                        placeholder="Your name (optional)"
                        className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#5BA3A0]" />
                      <div className="flex gap-2">
                        <button onClick={() => setShowActivityForm(false)} className="flex-1 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-100">Cancel</button>
                        <button onClick={saveActivity} disabled={savingActivity || !activityForm.notes.trim()}
                          className="flex-1 py-1.5 text-xs text-white rounded-lg font-medium disabled:opacity-50"
                          style={{ background: '#5BA3A0' }}>
                          {savingActivity ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Activity feed */}
                  {loadingActivities ? (
                    <div className="flex justify-center py-4"><div className="w-4 h-4 border-2 border-[#5BA3A0] border-t-transparent rounded-full animate-spin" /></div>
                  ) : activities.length === 0 ? (
                    <div className="text-center py-6">
                      <Clock className="w-6 h-6 text-gray-200 mx-auto mb-1.5" />
                      <p className="text-xs text-gray-400">No activity yet. Log your first touchpoint.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {activities.map((act, i) => {
                        const ch = channelConfig(act.channel)
                        return (
                          <div key={act.id} className="flex gap-2.5">
                            <div className="flex flex-col items-center">
                              <div className="w-6 h-6 rounded-full flex items-center justify-center text-sm flex-shrink-0" style={{ background: ch.color + '20' }}>
                                <span style={{ fontSize: '12px' }}>{ch.icon}</span>
                              </div>
                              {i < activities.length - 1 && <div className="w-px flex-1 bg-gray-100 mt-1 min-h-2" />}
                            </div>
                            <div className="flex-1 pb-2 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs font-semibold" style={{ color: ch.color }}>{ch.label}</span>
                                {act.staff_name && <span className="text-xs text-gray-400">by {act.staff_name}</span>}
                                <span className="text-xs text-gray-300 ml-auto flex-shrink-0">{new Date(act.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</span>
                              </div>
                              <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{act.notes}</p>
                              {act.outcome && (
                                <span className="inline-block mt-1 text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded-md">{act.outcome}</span>
                              )}
                              {act.next_action && (
                                <div className="mt-1 flex items-center gap-1 text-xs text-orange-600">
                                  <AlertCircle className="w-3 h-3" />
                                  {act.next_action}
                                  {act.next_action_date && ` · ${new Date(act.next_action_date).toLocaleDateString('en', { month: 'short', day: 'numeric' })}`}
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Pagination */}
        {view === 'table' && totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-white flex-shrink-0">
            <span className="text-xs text-gray-400">
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount.toLocaleString()}
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">
                Previous
              </button>
              <span className="px-3 py-1.5 text-xs text-gray-600">{page + 1} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Lead Add/Edit Modal */}
      {showLeadForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
              <h2 className="font-bold text-gray-900">{editLead ? 'Edit Lead' : 'Add New Lead'}</h2>
              <button onClick={() => setShowLeadForm(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-4">
              {/* Business info */}
              <div className="col-span-2">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Business Name *</label>
                <input value={leadForm.company_name} onChange={e => setLeadForm(f => ({ ...f, company_name: e.target.value }))}
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#5BA3A0]"
                  placeholder="e.g. Potato Head Beach Club" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Business Type</label>
                <select value={leadForm.business_type} onChange={e => setLeadForm(f => ({ ...f, business_type: e.target.value }))}
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#5BA3A0] bg-white">
                  <option value="">Select type...</option>
                  {BUSINESS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Area</label>
                <select value={leadForm.area} onChange={e => setLeadForm(f => ({ ...f, area: e.target.value }))}
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#5BA3A0] bg-white">
                  <option value="">Select area...</option>
                  {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Stage</label>
                <select value={leadForm.stage} onChange={e => setLeadForm(f => ({ ...f, stage: e.target.value }))}
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#5BA3A0] bg-white">
                  {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Priority</label>
                <select value={leadForm.priority} onChange={e => setLeadForm(f => ({ ...f, priority: e.target.value }))}
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#5BA3A0] bg-white">
                  {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                </select>
              </div>
              {/* Contact info */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Contact Name</label>
                <input value={leadForm.contact_name} onChange={e => setLeadForm(f => ({ ...f, contact_name: e.target.value }))}
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#5BA3A0]" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">WhatsApp Number</label>
                <input value={leadForm.whatsapp_number} onChange={e => setLeadForm(f => ({ ...f, whatsapp_number: e.target.value }))}
                  placeholder="+62 812 3456 7890"
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#5BA3A0]" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone</label>
                <input value={leadForm.contact_phone} onChange={e => setLeadForm(f => ({ ...f, contact_phone: e.target.value }))}
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#5BA3A0]" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</label>
                <input value={leadForm.contact_email} onChange={e => setLeadForm(f => ({ ...f, contact_email: e.target.value }))}
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#5BA3A0]" />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Address</label>
                <input value={leadForm.address} onChange={e => setLeadForm(f => ({ ...f, address: e.target.value }))}
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#5BA3A0]" />
              </div>
              {/* Online presence */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Website</label>
                <input value={leadForm.website} onChange={e => setLeadForm(f => ({ ...f, website: e.target.value }))}
                  placeholder="kembaliwater.com"
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#5BA3A0]" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Instagram</label>
                <input value={leadForm.instagram} onChange={e => setLeadForm(f => ({ ...f, instagram: e.target.value }))}
                  placeholder="@username"
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#5BA3A0]" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Est. Value/mo ($)</label>
                <input type="number" value={leadForm.estimated_value} onChange={e => setLeadForm(f => ({ ...f, estimated_value: Number(e.target.value) }))}
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#5BA3A0]" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Assigned Rep</label>
                <input value={leadForm.assigned_rep} onChange={e => setLeadForm(f => ({ ...f, assigned_rep: e.target.value }))}
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#5BA3A0]" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Next Follow-up</label>
                <input type="date" value={leadForm.next_follow_up} onChange={e => setLeadForm(f => ({ ...f, next_follow_up: e.target.value }))}
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#5BA3A0]" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tags (comma separated)</label>
                <input value={leadForm.tags} onChange={e => setLeadForm(f => ({ ...f, tags: e.target.value }))}
                  placeholder="vip, high-volume, referral"
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#5BA3A0]" />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Notes</label>
                <textarea value={leadForm.notes} onChange={e => setLeadForm(f => ({ ...f, notes: e.target.value }))} rows={3}
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#5BA3A0] resize-none" />
              </div>
            </div>
            <div className="px-6 pb-6 flex items-center justify-between">
              {editLead ? (
                <button onClick={() => deleteLead(editLead.id)} className="text-sm text-red-500 hover:text-red-700 font-medium">Delete Lead</button>
              ) : <div />}
              <div className="flex gap-2">
                <button onClick={() => setShowLeadForm(false)} className="px-4 py-2 rounded-xl text-sm text-gray-600 border border-gray-200 hover:bg-gray-50">Cancel</button>
                <button onClick={saveLead} disabled={savingLead || !leadForm.company_name.trim()}
                  className="px-5 py-2 rounded-xl text-sm text-white font-medium disabled:opacity-50"
                  style={{ background: '#5BA3A0' }}>
                  {savingLead ? 'Saving...' : editLead ? 'Save Changes' : 'Add Lead'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── CSV Import Modal ── */}
      {showImport && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
              <div>
                <h2 className="font-bold text-gray-900">Import Leads from CSV</h2>
                <p className="text-xs text-gray-400 mt-0.5">Duplicates (same business name) are automatically skipped</p>
              </div>
              <button onClick={() => setShowImport(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="p-6 space-y-5">
              {/* Step 1: Download template */}
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-blue-800">Step 1 — Download the template</p>
                  <p className="text-xs text-blue-600 mt-0.5">Fill in the CSV with your list of businesses then upload it below</p>
                </div>
                <button onClick={downloadTemplate}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white flex-shrink-0"
                  style={{ background: '#3B82F6' }}>
                  <Download className="w-3.5 h-3.5" /> Template
                </button>
              </div>

              {/* Step 2: Upload file */}
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">Step 2 — Upload your CSV</p>
                <input ref={fileRef} type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
                <button onClick={() => fileRef.current?.click()}
                  className="w-full border-2 border-dashed border-gray-200 rounded-xl py-8 flex flex-col items-center gap-2 hover:border-[#5BA3A0] hover:bg-gray-50 transition-colors">
                  <Upload className="w-8 h-8 text-gray-300" />
                  <p className="text-sm text-gray-500">Click to select CSV file</p>
                  <p className="text-xs text-gray-400">{csvRows.length > 0 ? `${csvRows.length} rows loaded` : 'Supports any CSV with a header row'}</p>
                </button>
              </div>

              {/* Step 3: Map columns */}
              {csvHeaders.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-2">Step 3 — Map columns <span className="text-xs font-normal text-gray-400">(auto-detected where possible)</span></p>
                  <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
                    {csvHeaders.map(h => (
                      <div key={h} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
                        <span className="text-xs text-gray-600 font-mono truncate flex-1 min-w-0" title={h}>{h}</span>
                        <span className="text-gray-300 text-xs">→</span>
                        <select value={colMap[h] ?? ''} onChange={e => setColMap(m => ({ ...m, [h]: e.target.value }))}
                          className="text-xs border border-gray-200 rounded-lg px-1.5 py-1 bg-white focus:outline-none focus:border-[#5BA3A0] flex-shrink-0">
                          <option value="">Skip</option>
                          {['company_name','business_type','area','contact_name','contact_phone','whatsapp_number','contact_email','website','instagram','address','stage','priority','estimated_value','assigned_rep','notes'].map(f => (
                            <option key={f} value={f}>{f}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Result */}
              {importResult && (
                <div className={cn('rounded-xl p-4 flex items-center gap-3', importResult.inserted > 0 ? 'bg-green-50 border border-green-100' : 'bg-gray-50 border border-gray-100')}>
                  <CheckCircle2 className={cn('w-5 h-5 flex-shrink-0', importResult.inserted > 0 ? 'text-green-500' : 'text-gray-400')} />
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{importResult.inserted > 0 ? `Successfully imported ${importResult.inserted} leads!` : 'No new leads to import'}</p>
                    {importResult.skipped > 0 && <p className="text-xs text-gray-500 mt-0.5">{importResult.skipped} rows skipped (duplicates or missing name)</p>}
                  </div>
                </div>
              )}
            </div>
            <div className="px-6 pb-6 flex justify-end gap-2">
              <button onClick={() => setShowImport(false)} className="px-4 py-2 rounded-xl text-sm text-gray-600 border border-gray-200 hover:bg-gray-50">Close</button>
              <button onClick={runImport} disabled={importing || csvRows.length === 0 || !Object.values(colMap).includes('company_name')}
                className="px-5 py-2 rounded-xl text-sm text-white font-medium disabled:opacity-40"
                style={{ background: '#5BA3A0' }}>
                {importing ? 'Importing...' : `Import ${csvRows.length} rows`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Discover Modal ── */}
      {showDiscover && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
              <div>
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: '#6366F1' }}>
                    <Zap className="w-4 h-4 text-white" />
                  </div>
                  <h2 className="font-bold text-gray-900">Discover New Businesses</h2>
                </div>
                <p className="text-xs text-gray-400 mt-1 ml-9">Searches Google Maps for businesses in Bali not yet in your pipeline</p>
              </div>
              <button onClick={() => setShowDiscover(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="p-6 space-y-5">
              {discoverError === 'setup_required' ? (
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-5 text-center">
                  <AlertCircle className="w-8 h-8 text-orange-400 mx-auto mb-2" />
                  <p className="font-semibold text-orange-800 text-sm">Google Maps API Key Required</p>
                  <p className="text-xs text-orange-600 mt-1.5 max-w-sm mx-auto">
                    To auto-discover new businesses, add your Google Maps API key to Vercel environment variables as <code className="bg-orange-100 px-1 rounded">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code>.
                    Enable the <strong>Places API</strong> in Google Cloud Console.
                  </p>
                  <a href="https://console.cloud.google.com/apis/library/places-backend.googleapis.com" target="_blank"
                    className="inline-flex items-center gap-1 mt-3 text-xs font-medium text-orange-700 hover:underline">
                    <ExternalLink className="w-3 h-3" /> Enable Places API
                  </a>
                </div>
              ) : (
                <>
                  {/* Area selection */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Areas to search</p>
                    <div className="flex flex-wrap gap-1.5">
                      {['Seminyak','Canggu','Ubud','Kuta','Sanur','Nusa Dua','Jimbaran','Uluwatu','Berawa','Legian','Denpasar'].map(a => (
                        <button key={a} onClick={() => setDiscoverAreas(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a])}
                          className={cn('px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors', discoverAreas.includes(a) ? 'text-white border-transparent' : 'border-gray-200 text-gray-600 hover:border-gray-300')}
                          style={discoverAreas.includes(a) ? { background: '#6366F1' } : {}}>
                          {a}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Business type selection */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Business types</p>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { key: 'lodging', label: '🏨 Hotels & Villas' },
                        { key: 'restaurant', label: '🍽 Restaurants' },
                        { key: 'spa', label: '💆 Spas' },
                        { key: 'gym', label: '🏋️ Gyms' },
                        { key: 'cafe', label: '☕ Cafés' },
                      ].map(t => (
                        <button key={t.key} onClick={() => setDiscoverTypes(prev => prev.includes(t.key) ? prev.filter(x => x !== t.key) : [...prev, t.key])}
                          className={cn('px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors', discoverTypes.includes(t.key) ? 'text-white border-transparent' : 'border-gray-200 text-gray-600 hover:border-gray-300')}
                          style={discoverTypes.includes(t.key) ? { background: '#6366F1' } : {}}>
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {!discovered.length && !discovering && !discoverError && (
                    <div className="bg-gray-50 rounded-xl p-5 text-center border-2 border-dashed border-gray-200">
                      <MapPin className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                      <p className="text-sm text-gray-500">Select areas and types, then click Discover</p>
                      <p className="text-xs text-gray-400 mt-1">Only businesses not already in your pipeline will appear</p>
                    </div>
                  )}

                  {discovering && (
                    <div className="text-center py-8">
                      <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                      <p className="text-sm text-gray-500">Searching Google Maps across {discoverAreas.length} areas...</p>
                    </div>
                  )}

                  {discoverError && discoverError !== 'setup_required' && (
                    <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-sm text-red-700">{discoverError}</div>
                  )}

                  {discovered.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{discovered.length} new businesses found</p>
                        <div className="flex gap-2">
                          <button onClick={() => setSelectedDiscovered(new Set(discovered.map((_, i) => i)))}
                            className="text-xs text-indigo-600 hover:underline">Select all</button>
                          <span className="text-gray-300">·</span>
                          <button onClick={() => setSelectedDiscovered(new Set())}
                            className="text-xs text-gray-400 hover:underline">None</button>
                        </div>
                      </div>
                      <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                        {discovered.map((biz, i) => (
                          <label key={i} className={cn('flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors', selectedDiscovered.has(i) ? 'border-indigo-200 bg-indigo-50' : 'border-gray-100 hover:border-gray-200')}>
                            <input type="checkbox" checked={selectedDiscovered.has(i)}
                              onChange={() => setSelectedDiscovered(prev => {
                                const next = new Set(prev)
                                next.has(i) ? next.delete(i) : next.add(i)
                                return next
                              })}
                              className="rounded accent-indigo-600 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-gray-900 truncate">{biz.company_name}</p>
                              <p className="text-xs text-gray-400 truncate">{biz.business_type} · {biz.area}{biz.address ? ` · ${biz.address}` : ''}</p>
                            </div>
                            <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded-full flex-shrink-0',
                              biz.priority === 'high' ? 'bg-red-100 text-red-600' : biz.priority === 'medium' ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-500')}>
                              {biz.priority}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="px-6 pb-6 flex justify-between items-center">
              <span className="text-xs text-gray-400">{selectedDiscovered.size} selected to add</span>
              <div className="flex gap-2">
                <button onClick={() => setShowDiscover(false)} className="px-4 py-2 rounded-xl text-sm text-gray-600 border border-gray-200 hover:bg-gray-50">Cancel</button>
                {discovered.length === 0 ? (
                  <button onClick={runDiscover} disabled={discovering || discoverAreas.length === 0 || discoverTypes.length === 0}
                    className="px-5 py-2 rounded-xl text-sm text-white font-medium disabled:opacity-40 flex items-center gap-1.5"
                    style={{ background: '#6366F1' }}>
                    <Zap className="w-3.5 h-3.5" />
                    {discovering ? 'Searching...' : 'Discover'}
                  </button>
                ) : (
                  <button onClick={addDiscovered} disabled={addingDiscovered || selectedDiscovered.size === 0}
                    className="px-5 py-2 rounded-xl text-sm text-white font-medium disabled:opacity-40 flex items-center gap-1.5"
                    style={{ background: '#6366F1' }}>
                    <Plus className="w-3.5 h-3.5" />
                    {addingDiscovered ? 'Adding...' : `Add ${selectedDiscovered.size} to Pipeline`}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Proposal modal */}
      {showProposalModal && detailLead && (
        <ProposalModal
          lead={detailLead}
          onClose={() => setShowProposalModal(false)}
          onSent={async () => {
            setShowProposalModal(false)
            await load()
            setDetailLead(l => l ? { ...l, stage: 'proposal' } : l)
          }}
        />
      )}
    </>
  )
}
