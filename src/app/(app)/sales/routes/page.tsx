'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'
import { MapPin, Play, CheckCircle, Navigation, RefreshCw, Plus, X, ChevronDown, ChevronUp, MessageCircle, Phone, User, Calendar, Zap, Clock, AlertCircle, Star, Building2, Coffee, Dumbbell, Hotel, Utensils } from 'lucide-react'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const AREA_CLUSTERS = [
  { label: 'North Canggu', value: 'North Canggu', areas: 'Canggu, Berawa, Pererenan' },
  { label: 'South Seminyak', value: 'South Seminyak', areas: 'Seminyak, Legian, Kuta' },
  { label: 'Ubud & Central', value: 'Ubud & Central', areas: 'Ubud, Tabanan, Denpasar' },
  { label: 'South Bali', value: 'South Bali', areas: 'Nusa Dua, Jimbaran, Uluwatu' },
  { label: 'East Bali', value: 'East Bali', areas: 'Sanur, Denpasar' },
]

const DEFAULT_REPS = [
  { name: 'Rep 1', area_cluster: 'North Canggu' },
  { name: 'Rep 2', area_cluster: 'South Seminyak' },
  { name: 'Rep 3', area_cluster: 'Ubud & Central' },
  { name: 'Rep 4', area_cluster: 'South Bali' },
  { name: 'Rep 5', area_cluster: 'East Bali' },
]

const STAGE_COLORS: Record<string, string> = {
  prospect: 'bg-gray-100 text-gray-700',
  contacted: 'bg-blue-100 text-blue-700',
  meeting: 'bg-yellow-100 text-yellow-700',
  proposal: 'bg-purple-100 text-purple-700',
  negotiation: 'bg-orange-100 text-orange-700',
  closed_won: 'bg-green-100 text-green-700',
}

const BTYPE_ICONS: Record<string, any> = {
  Hotel: Hotel, Resort: Hotel, Restaurant: Utensils, Café: Coffee, Cafe: Coffee,
  Gym: Dumbbell, Spa: Star,
}

type Rep = { name: string; area_cluster: string }
type Stop = {
  id?: string
  order_index: number
  lead_id: string
  status: string
  arrived_at?: string
  completed_at?: string
  lead: {
    id: string; company_name: string; business_type: string; area: string
    address: string; contact_name: string; contact_phone: string
    whatsapp_number: string; stage: string; priority: string
    last_contacted_at: string; next_follow_up: string; estimated_value: number
  }
}
type Route = {
  id: string; name: string; date: string; status: string; notes: string
  stops: Stop[]
}
type WaLead = {
  id: string; company_name: string; contact_name: string; whatsapp_number: string
  area: string; business_type: string; stage: string; priority: string
  last_contacted_at: string; next_follow_up: string
}

export default function RoutesPage() {
  const today = new Date().toISOString().split('T')[0]
  const [date, setDate] = useState(today)
  const [routes, setRoutes] = useState<Route[]>([])
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [activeRoute, setActiveRoute] = useState<Route | null>(null)
  const [expandedStop, setExpandedStop] = useState<string | null>(null)
  const [tab, setTab] = useState<'routes' | 'whatsapp'>('routes')
  const [waQueue, setWaQueue] = useState<Record<string, WaLead[]>>({})
  const [showGenModal, setShowGenModal] = useState(false)
  const [reps, setReps] = useState<Rep[]>(DEFAULT_REPS)
  const [leadsPerRep, setLeadsPerRep] = useState(20)
  const [cooldown, setCooldown] = useState(7)
  const [genError, setGenError] = useState('')
  const [visitNote, setVisitNote] = useState('')
  const [visitOutcome, setVisitOutcome] = useState('visited')
  const [loggingStop, setLoggingStop] = useState<string | null>(null)

  useEffect(() => { loadRoutes() }, [date])

  async function loadRoutes() {
    setLoading(true)
    const res = await fetch(`/api/sales/generate-routes?date=${date}`)
    const data = await res.json()
    const loaded: Route[] = data.routes ?? []
    setRoutes(loaded)
    if (loaded.length) {
      setActiveRoute(prev => {
        const refreshed = loaded.find(r => r.id === prev?.id)
        return refreshed ?? loaded[0]
      })
    }
    setLoading(false)
  }

  async function generateRoutes(replace = false) {
    setGenerating(true)
    setGenError('')
    try {
      const res = await fetch('/api/sales/generate-routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, reps, leads_per_rep: leadsPerRep, revisit_cooldown_days: cooldown, replace_existing: replace }),
      })
      const data = await res.json()
      if (!res.ok) {
        setGenError(data.error ?? 'Failed to generate')
      } else {
        setWaQueue(data.whatsapp_queue ?? {})
        await loadRoutes()
        setShowGenModal(false)
      }
    } catch (e: any) {
      setGenError(e.message)
    }
    setGenerating(false)
  }

  async function markStop(stop: Stop, status: 'arrived' | 'completed') {
    const updates: any = { status }
    if (status === 'arrived') updates.arrived_at = new Date().toISOString()
    if (status === 'completed') updates.completed_at = new Date().toISOString()
    await sb.from('sales_route_stops').update(updates).eq('id', stop.id)
    if (status === 'completed') {
      await sb.from('sales_leads').update({ last_contacted_at: new Date().toISOString() }).eq('id', stop.lead_id)
    }
    await loadRoutes()
  }

  async function logVisitAndComplete(stop: Stop) {
    if (!visitNote.trim()) return
    setLoggingStop(stop.lead_id)

    await sb.from('sales_activities').insert({
      lead_id: stop.lead_id,
      channel: 'visit',
      outcome: visitOutcome,
      notes: visitNote,
      activity_date: new Date().toISOString(),
    })

    const stageMap: Record<string, string> = {
      interested: 'meeting', not_interested: 'prospect',
      follow_up: 'contacted', proposal: 'proposal',
      closed_won: 'closed_won', no_answer: 'contacted',
    }
    await sb.from('sales_leads').update({
      last_contacted_at: new Date().toISOString(),
      stage: stageMap[visitOutcome] ?? undefined,
    }).eq('id', stop.lead_id)

    await sb.from('sales_route_stops').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    }).eq('id', stop.id)

    setVisitNote('')
    setVisitOutcome('visited')
    setExpandedStop(null)
    setLoggingStop(null)
    await loadRoutes()
  }

  async function startRoute(route: Route) {
    await sb.from('sales_routes').update({ status: 'in_progress' }).eq('id', route.id)
    await loadRoutes()
  }

  function openMaps(stop: Stop) {
    const q = stop.lead?.address || stop.lead?.company_name
    window.open(`https://maps.google.com/?q=${encodeURIComponent(q ?? '')}`, '_blank')
  }

  function openWhatsApp(phone: string, name: string) {
    const msg = encodeURIComponent(`Hi! I'm from Kembali Water. We offer premium eco-friendly water solutions for businesses like ${name} in Bali. Would love to connect!`)
    window.open(`https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${msg}`, '_blank')
  }

  const completedCount = (r: Route) => r.stops.filter(s => s.status === 'completed').length
  const progressPct = (r: Route) => r.stops.length ? Math.round((completedCount(r) / r.stops.length) * 100) : 0

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-white flex-shrink-0">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Sales Routes</h1>
          <p className="text-sm text-gray-500">Auto-assign 20 stops/rep · Smart deduplication · WhatsApp queue</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button onClick={loadRoutes} className="p-2 text-gray-500 hover:text-gray-700 border rounded-lg hover:bg-gray-50">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowGenModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            <Zap className="w-4 h-4" /> Generate Routes
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b bg-white px-6 flex-shrink-0">
        {(['routes', 'whatsapp'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {t === 'routes' ? `Routes (${routes.length})` : `WhatsApp Queue (${Object.values(waQueue).flat().length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading…
        </div>
      ) : tab === 'routes' ? (
        routes.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center">
              <Zap className="w-8 h-8 text-blue-400" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-800 mb-1">
                No routes for {new Date(date + 'T12:00:00').toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' })}
              </h3>
              <p className="text-sm text-gray-500 max-w-md">
                Click "Generate Routes" to auto-assign {leadsPerRep} optimized stops per rep, prioritizing overdue follow-ups and clustering by area.
              </p>
            </div>
            <button
              onClick={() => setShowGenModal(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              <Zap className="w-4 h-4" /> Generate Today's Routes
            </button>
          </div>
        ) : (
          <div className="flex flex-1 min-h-0">
            {/* Left: route list */}
            <div className="w-72 border-r bg-gray-50 overflow-y-auto flex-shrink-0">
              {routes.map(route => (
                <button
                  key={route.id}
                  onClick={() => setActiveRoute(route)}
                  className={`w-full text-left p-4 border-b transition-colors ${activeRoute?.id === route.id ? 'bg-white border-l-2 border-l-blue-600' : 'hover:bg-white'}`}
                >
                  <div className="flex items-start justify-between mb-1">
                    <span className="font-medium text-gray-900 text-sm leading-tight">{route.name}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ml-2 flex-shrink-0 ${route.status === 'completed' ? 'bg-green-100 text-green-700' : route.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                      {route.status.replace('_', ' ')}
                    </span>
                  </div>
                  {route.notes && <div className="text-xs text-gray-500 mb-2">{route.notes}</div>}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                      <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${progressPct(route)}%` }} />
                    </div>
                    <span className="text-xs text-gray-500 flex-shrink-0">{completedCount(route)}/{route.stops.length}</span>
                  </div>
                </button>
              ))}
            </div>

            {/* Right: active route detail */}
            {activeRoute && (
              <div className="flex-1 overflow-y-auto">
                {/* Route header */}
                <div className="sticky top-0 z-10 bg-white border-b px-5 py-3 flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold text-gray-900">{activeRoute.name}</h2>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-sm text-gray-500">{activeRoute.stops.length} stops</span>
                      <span className="text-sm text-gray-500">{completedCount(activeRoute)} done</span>
                      <span className="text-sm font-medium text-blue-600">{progressPct(activeRoute)}%</span>
                    </div>
                  </div>
                  {activeRoute.status === 'planned' && (
                    <button
                      onClick={() => startRoute(activeRoute)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
                    >
                      <Play className="w-3.5 h-3.5" /> Start Route
                    </button>
                  )}
                </div>

                <div className="divide-y">
                  {activeRoute.stops.map((stop, idx) => {
                    const lead = stop.lead
                    if (!lead) return null
                    const isExpanded = expandedStop === stop.lead_id
                    const isDone = stop.status === 'completed'
                    const isActive = stop.status === 'arrived'
                    const BtypeIcon = BTYPE_ICONS[lead.business_type] ?? Building2

                    return (
                      <div key={stop.lead_id} className={`${isDone ? 'bg-gray-50 opacity-70' : isActive ? 'bg-blue-50' : 'bg-white'}`}>
                        <div className="flex items-start gap-3 px-5 py-4">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 ${isDone ? 'bg-green-100 text-green-700' : isActive ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
                            {isDone ? <CheckCircle className="w-4 h-4" /> : idx + 1}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium text-gray-900">{lead.company_name}</span>
                                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${STAGE_COLORS[lead.stage] ?? 'bg-gray-100 text-gray-600'}`}>
                                    {lead.stage}
                                  </span>
                                  {lead.priority === 'high' && (
                                    <span className="text-xs text-red-600 font-medium">⚡ High</span>
                                  )}
                                  {lead.next_follow_up && lead.next_follow_up <= today && (
                                    <span className="text-xs text-orange-600 flex items-center gap-0.5">
                                      <AlertCircle className="w-3 h-3" /> Follow-up due
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                                  <span className="flex items-center gap-1"><BtypeIcon className="w-3 h-3" />{lead.business_type}</span>
                                  {lead.area && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{lead.area}</span>}
                                  {lead.contact_name && <span className="flex items-center gap-1"><User className="w-3 h-3" />{lead.contact_name}</span>}
                                </div>
                                {lead.address && <p className="text-xs text-gray-400 mt-0.5 truncate">{lead.address}</p>}
                              </div>

                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <button onClick={() => openMaps(stop)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="Navigate">
                                  <Navigation className="w-3.5 h-3.5" />
                                </button>
                                {lead.whatsapp_number && (
                                  <button onClick={() => openWhatsApp(lead.whatsapp_number, lead.company_name)} className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded" title="WhatsApp">
                                    <MessageCircle className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                {lead.contact_phone && (
                                  <a href={`tel:${lead.contact_phone}`} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="Call">
                                    <Phone className="w-3.5 h-3.5" />
                                  </a>
                                )}
                                <button onClick={() => setExpandedStop(isExpanded ? null : stop.lead_id)} className="p-1.5 text-gray-400 hover:text-gray-700 rounded">
                                  {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                            </div>

                            {!isDone && !isExpanded && (
                              <div className="flex gap-2 mt-2">
                                {!isActive && (
                                  <button onClick={() => markStop(stop, 'arrived')} className="text-xs px-2.5 py-1 bg-blue-100 text-blue-700 rounded-full hover:bg-blue-200 font-medium">
                                    Arrived
                                  </button>
                                )}
                                <button onClick={() => setExpandedStop(stop.lead_id)} className="text-xs px-2.5 py-1 bg-green-100 text-green-700 rounded-full hover:bg-green-200 font-medium">
                                  Log Visit & Complete
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {isExpanded && !isDone && (
                          <div className="px-5 pb-4 ml-10">
                            <div className="bg-white border rounded-xl p-4 space-y-3">
                              <h4 className="text-sm font-medium text-gray-800">Log Visit Outcome</h4>
                              <select
                                value={visitOutcome}
                                onChange={e => setVisitOutcome(e.target.value)}
                                className="w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              >
                                <option value="interested">Interested — wants to hear more</option>
                                <option value="not_interested">Not Interested</option>
                                <option value="follow_up">Follow-up Needed</option>
                                <option value="proposal">Requested Proposal</option>
                                <option value="closed_won">Closed Won 🎉</option>
                                <option value="no_answer">No Answer / Not Available</option>
                                <option value="visited">Visited (general)</option>
                              </select>
                              <textarea
                                value={visitNote}
                                onChange={e => setVisitNote(e.target.value)}
                                placeholder="Visit notes — what happened, who you spoke with, next steps…"
                                rows={3}
                                className="w-full text-sm border rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={() => logVisitAndComplete(stop)}
                                  disabled={!visitNote.trim() || loggingStop === stop.lead_id}
                                  className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                                >
                                  {loggingStop === stop.lead_id ? 'Saving…' : 'Save & Mark Complete'}
                                </button>
                                <button onClick={() => setExpandedStop(null)} className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                                  Cancel
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )
      ) : (
        /* WhatsApp Queue tab */
        <div className="flex-1 overflow-y-auto p-6">
          {Object.keys(waQueue).length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <MessageCircle className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Generate routes first</p>
              <p className="text-sm mt-1">The WhatsApp queue appears here — leads not on a physical route that should be messaged today.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(waQueue).map(([repName, leads]) => (
                <div key={repName}>
                  <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <MessageCircle className="w-4 h-4 text-green-600" />
                    {repName} — {leads.length} to message
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {(leads as WaLead[]).map(lead => (
                      <div key={lead.id} className="bg-white border rounded-xl p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="font-medium text-gray-900 text-sm">{lead.company_name}</p>
                            <p className="text-xs text-gray-500">{lead.business_type} · {lead.area}</p>
                          </div>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${STAGE_COLORS[lead.stage] ?? 'bg-gray-100 text-gray-600'}`}>
                            {lead.stage}
                          </span>
                        </div>
                        {lead.contact_name && <p className="text-xs text-gray-500 mb-2">Contact: {lead.contact_name}</p>}
                        {lead.next_follow_up && lead.next_follow_up <= today && (
                          <p className="text-xs text-orange-600 flex items-center gap-1 mb-2">
                            <Clock className="w-3 h-3" /> Follow-up overdue
                          </p>
                        )}
                        <button
                          onClick={() => openWhatsApp(lead.whatsapp_number, lead.company_name)}
                          className="w-full flex items-center justify-center gap-2 py-2 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600"
                        >
                          <MessageCircle className="w-3.5 h-3.5" /> Message on WhatsApp
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Generate Routes Modal */}
      {showGenModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Zap className="w-5 h-5 text-blue-600" /> Generate Routes
              </h2>
              <button onClick={() => setShowGenModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Date</label>
                  <input type="date" value={date} onChange={e => setDate(e.target.value)}
                    className="w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Stops per rep</label>
                  <input type="number" value={leadsPerRep} onChange={e => setLeadsPerRep(Number(e.target.value))} min={5} max={50}
                    className="w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Re-visit cooldown (days)</label>
                  <input type="number" value={cooldown} onChange={e => setCooldown(Number(e.target.value))} min={1} max={30}
                    className="w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-gray-700">Sales Reps ({reps.length})</label>
                  <button
                    onClick={() => setReps(r => [...r, { name: `Rep ${r.length + 1}`, area_cluster: AREA_CLUSTERS[0].value }])}
                    className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Add Rep
                  </button>
                </div>
                <div className="space-y-2">
                  {reps.map((rep, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        value={rep.name}
                        onChange={e => setReps(r => r.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                        placeholder="Rep name"
                        className="flex-1 text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <select
                        value={rep.area_cluster}
                        onChange={e => setReps(r => r.map((x, j) => j === i ? { ...x, area_cluster: e.target.value } : x))}
                        className="flex-1 text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {AREA_CLUSTERS.map(c => (
                          <option key={c.value} value={c.value}>{c.label} ({c.areas})</option>
                        ))}
                      </select>
                      {reps.length > 1 && (
                        <button onClick={() => setReps(r => r.filter((_, j) => j !== i))} className="p-2 text-gray-400 hover:text-red-500">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-blue-50 rounded-xl p-4 text-sm text-blue-800">
                <p className="font-medium mb-1">Smart assignment logic:</p>
                <ul className="list-disc list-inside space-y-0.5 text-blue-700 text-xs">
                  <li>Overdue follow-ups get highest priority (+30 pts)</li>
                  <li>Never-contacted leads prioritized (+15 pts)</li>
                  <li>Leads visited in the last {cooldown} days are excluded (unless follow-up is due)</li>
                  <li>Stops clustered by area to minimize driving time</li>
                  <li>WhatsApp queue auto-generated for remaining contacts</li>
                </ul>
              </div>

              {genError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div>
                    <p>{genError}</p>
                    {genError.includes('already exist') && (
                      <button onClick={() => generateRoutes(true)} className="mt-2 text-xs font-medium underline">
                        Regenerate (replaces existing routes for this date)
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t flex justify-end gap-3">
              <button onClick={() => setShowGenModal(false)} className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
              <button
                onClick={() => generateRoutes(false)}
                disabled={generating || !reps.length}
                className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {generating
                  ? <><RefreshCw className="w-4 h-4 animate-spin" /> Generating…</>
                  : <><Zap className="w-4 h-4" /> Generate {reps.length} Routes</>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
