'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import {
  MapPin, Play, CheckCircle, Navigation, RefreshCw, Plus, X,
  ChevronDown, ChevronUp, MessageCircle, Phone, User, Zap,
  AlertCircle, Building2, Coffee, Dumbbell, Hotel, Utensils, Star,
} from 'lucide-react'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const ZONES = [
  { label: 'North Canggu',   value: 'North Canggu',   sub: 'Canggu · Berawa · Pererenan' },
  { label: 'South Seminyak', value: 'South Seminyak', sub: 'Seminyak · Legian · Kuta' },
  { label: 'Ubud & Central', value: 'Ubud & Central', sub: 'Ubud · Tabanan · Denpasar' },
  { label: 'South Bali',     value: 'South Bali',     sub: 'Nusa Dua · Jimbaran · Uluwatu' },
  { label: 'East Bali',      value: 'East Bali',      sub: 'Sanur · Ketewel · Keramas' },
]

const DEFAULT_REPS = [
  { name: 'Rep 1', area_cluster: 'North Canggu' },
  { name: 'Rep 2', area_cluster: 'South Seminyak' },
  { name: 'Rep 3', area_cluster: 'Ubud & Central' },
  { name: 'Rep 4', area_cluster: 'South Bali' },
  { name: 'Rep 5', area_cluster: 'East Bali' },
]

const STAGE_COLORS: Record<string, string> = {
  prospect:    'bg-gray-100 text-gray-700',
  contacted:   'bg-blue-100 text-blue-700',
  meeting:     'bg-yellow-100 text-yellow-700',
  proposal:    'bg-purple-100 text-purple-700',
  negotiation: 'bg-orange-100 text-orange-700',
  closed_won:  'bg-green-100 text-green-700',
}

const BTYPE_ICONS: Record<string, any> = {
  Hotel: Hotel, Resort: Hotel, Restaurant: Utensils,
  Café: Coffee, Cafe: Coffee, Gym: Dumbbell, Spa: Star,
}

// ─── Smart note parsing ────────────────────────────────────────────────────
function detectFollowUpDate(text: string): string | null {
  const lower = text.toLowerCase()
  const today = new Date()

  const addDays = (n: number) => {
    const d = new Date(today)
    d.setDate(d.getDate() + n)
    return d.toISOString().split('T')[0]
  }

  if (/come back tomorrow|call tomorrow|follow.?up tomorrow|tomorrow/i.test(lower)) return addDays(1)
  if (/in (\d+) days?/i.test(lower)) {
    const m = lower.match(/in (\d+) days?/i)
    if (m) return addDays(parseInt(m[1]))
  }
  if (/next week|in a week/i.test(lower)) return addDays(7)
  if (/in two weeks|in 2 weeks/i.test(lower)) return addDays(14)
  if (/next month|in a month/i.test(lower)) return addDays(30)
  if (/monday/i.test(lower)) { const d = new Date(today); d.setDate(d.getDate() + ((1 + 7 - d.getDay()) % 7 || 7)); return d.toISOString().split('T')[0] }
  if (/tuesday/i.test(lower)) { const d = new Date(today); d.setDate(d.getDate() + ((2 + 7 - d.getDay()) % 7 || 7)); return d.toISOString().split('T')[0] }
  if (/wednesday/i.test(lower)) { const d = new Date(today); d.setDate(d.getDate() + ((3 + 7 - d.getDay()) % 7 || 7)); return d.toISOString().split('T')[0] }
  if (/thursday/i.test(lower)) { const d = new Date(today); d.setDate(d.getDate() + ((4 + 7 - d.getDay()) % 7 || 7)); return d.toISOString().split('T')[0] }
  if (/friday/i.test(lower)) { const d = new Date(today); d.setDate(d.getDate() + ((5 + 7 - d.getDay()) % 7 || 7)); return d.toISOString().split('T')[0] }
  if (/saturday/i.test(lower)) { const d = new Date(today); d.setDate(d.getDate() + ((6 + 7 - d.getDay()) % 7 || 7)); return d.toISOString().split('T')[0] }
  if (/sunday/i.test(lower)) { const d = new Date(today); d.setDate(d.getDate() + ((0 + 7 - d.getDay()) % 7 || 7)); return d.toISOString().split('T')[0] }

  return null
}

function detectPhone(text: string): string | null {
  const m = text.match(/(\+?[\d\s\-().]{9,16})/)
  if (!m) return null
  const digits = m[1].replace(/\D/g, '')
  return digits.length >= 8 ? digits : null
}

// Auto cadence when no follow-up detected in notes
const OUTCOME_CADENCE: Record<string, number> = {
  interested:     3,   // come back in 3 days
  not_interested: 30,  // monthly check-in regardless
  follow_up:      3,
  proposal:       2,
  no_answer:      1,   // try again tomorrow
  visited:        7,
  closed_won:     0,
}

type Rep = { name: string; area_cluster: string }
type Stop = {
  id: string
  order_index: number
  lead_id: string
  status: string
  arrived_at?: string
  departed_at?: string
  lead: {
    id: string; company_name: string; business_type: string; area: string
    address: string; contact_name: string; contact_phone: string
    whatsapp_number: string; stage: string; priority: string
    last_contacted_at: string; next_follow_up: string; estimated_value: number
    lat?: number; lng?: number
  }
}
type Route = {
  id: string; name: string; date: string; status: string; notes: string
  stops: Stop[]
}

export default function RoutesPage() {
  const today = new Date().toISOString().split('T')[0]
  const [date, setDate] = useState(today)
  const [routes, setRoutes] = useState<Route[]>([])
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [activeRoute, setActiveRoute] = useState<Route | null>(null)
  const [expandedStop, setExpandedStop] = useState<string | null>(null)
  const [showGenModal, setShowGenModal] = useState(false)
  const [reps, setReps] = useState<Rep[]>(DEFAULT_REPS)
  const [leadsPerRep, setLeadsPerRep] = useState(20)
  const [genError, setGenError] = useState('')
  const [visitNote, setVisitNote] = useState('')
  const [visitOutcome, setVisitOutcome] = useState('visited')
  const [loggingStop, setLoggingStop] = useState<string | null>(null)
  const [detectedDate, setDetectedDate] = useState<string | null>(null)
  const [detectedPhone, setDetectedPhone] = useState<string | null>(null)
  const [savePhone, setSavePhone] = useState(false)

  useEffect(() => { loadRoutes() }, [date])

  // Parse notes as user types
  useEffect(() => {
    setDetectedDate(detectFollowUpDate(visitNote))
    setDetectedPhone(detectPhone(visitNote))
    setSavePhone(false)
  }, [visitNote])

  async function loadRoutes() {
    setLoading(true)
    const res = await fetch(`/api/sales/generate-routes?date=${date}`)
    const data = await res.json()
    const loaded: Route[] = data.routes ?? []
    setRoutes(loaded)
    setActiveRoute(prev => {
      const refreshed = loaded.find(r => r.id === prev?.id)
      return refreshed ?? (loaded[0] ?? null)
    })
    setLoading(false)
  }

  async function generateRoutes(replace = false) {
    setGenerating(true)
    setGenError('')
    try {
      const res = await fetch('/api/sales/generate-routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, reps, leads_per_rep: leadsPerRep, replace_existing: replace }),
      })
      const data = await res.json()
      if (!res.ok) {
        setGenError(data.error ?? 'Failed to generate')
      } else {
        await loadRoutes()
        setShowGenModal(false)
      }
    } catch (e: any) {
      setGenError(e.message)
    }
    setGenerating(false)
  }

  async function markArrived(stop: Stop) {
    await sb.from('sales_route_stops').update({ status: 'arrived', arrived_at: new Date().toISOString() }).eq('id', stop.id)
    await loadRoutes()
  }

  async function logVisitAndComplete(stop: Stop) {
    if (!visitNote.trim()) return
    setLoggingStop(stop.lead_id)

    // Determine next follow-up date
    const followUpFromNotes = detectedDate
    const cadenceDays = OUTCOME_CADENCE[visitOutcome] ?? 7
    const autoFollowUp = cadenceDays > 0
      ? new Date(Date.now() + cadenceDays * 86400000).toISOString().split('T')[0]
      : null
    const nextFollowUp = followUpFromNotes ?? autoFollowUp

    // Stage transitions
    const stageMap: Record<string, string> = {
      interested:     'meeting',
      not_interested: 'contacted',
      follow_up:      'contacted',
      proposal:       'proposal',
      closed_won:     'closed_won',
      no_answer:      'contacted',
      visited:        'contacted',
    }

    // Build lead update
    const leadUpdate: any = {
      last_contacted_at: new Date().toISOString(),
      stage: stageMap[visitOutcome] ?? 'contacted',
    }
    if (nextFollowUp) leadUpdate.next_follow_up = nextFollowUp
    if (savePhone && detectedPhone) leadUpdate.contact_phone = detectedPhone

    await Promise.all([
      sb.from('sales_activities').insert({
        lead_id: stop.lead_id,
        channel: 'visit',
        outcome: visitOutcome,
        notes: visitNote,
      }),
      sb.from('sales_leads').update(leadUpdate).eq('id', stop.lead_id),
      sb.from('sales_route_stops').update({
        status: 'completed',
        departed_at: new Date().toISOString(),
        notes: visitNote,
      }).eq('id', stop.id),
    ])

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
    const lead = stop.lead
    const q = (lead.lat && lead.lng)
      ? `${lead.lat},${lead.lng}`
      : encodeURIComponent(lead.address || lead.company_name)
    window.open(`https://maps.google.com/?q=${q}`, '_blank')
  }

  function openWhatsApp(phone: string, name: string) {
    const msg = encodeURIComponent(`Hi! I'm from Kembali Water. We offer premium eco-friendly water for businesses like ${name} in Bali. Would love to connect!`)
    window.open(`https://wa.me/${phone.replace(/\D/g, '')}?text=${msg}`, '_blank')
  }

  const completedCount = (r: Route) => r.stops.filter(s => s.status === 'completed').length
  const pct = (r: Route) => r.stops.length ? Math.round((completedCount(r) / r.stops.length) * 100) : 0

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-white flex-shrink-0">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Sales Routes</h1>
          <p className="text-sm text-gray-500">Geo-optimized · Every lead touched · Smart follow-up detection</p>
        </div>
        <div className="flex items-center gap-3">
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <button onClick={loadRoutes} className="p-2 text-gray-500 border rounded-lg hover:bg-gray-50">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={() => setShowGenModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
            <Zap className="w-4 h-4" /> Generate Routes
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading…
        </div>
      ) : routes.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center">
            <Zap className="w-8 h-8 text-blue-400" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-800 mb-1">
              No routes for {new Date(date + 'T12:00:00').toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' })}
            </h3>
            <p className="text-sm text-gray-500 max-w-sm">
              Generate routes to auto-assign {leadsPerRep} geo-optimized stops per rep. Every eligible lead gets touched.
            </p>
          </div>
          <button onClick={() => setShowGenModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
            <Zap className="w-4 h-4" /> Generate Today's Routes
          </button>
        </div>
      ) : (
        <div className="flex flex-1 min-h-0">

          {/* Left: route list */}
          <div className="w-64 border-r bg-gray-50 overflow-y-auto flex-shrink-0">
            {routes.map(route => (
              <button key={route.id} onClick={() => setActiveRoute(route)}
                className={`w-full text-left p-4 border-b transition-colors ${activeRoute?.id === route.id ? 'bg-white border-l-2 border-l-blue-600' : 'hover:bg-white'}`}>
                <div className="flex items-start justify-between mb-1">
                  <span className="font-medium text-gray-900 text-sm leading-tight">{route.name}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ml-2 flex-shrink-0 ${route.status === 'completed' ? 'bg-green-100 text-green-700' : route.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                    {route.status.replace('_', ' ')}
                  </span>
                </div>
                {route.notes && <p className="text-xs text-gray-500 mb-2">{route.notes}</p>}
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                    <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${pct(route)}%` }} />
                  </div>
                  <span className="text-xs text-gray-500 flex-shrink-0">{completedCount(route)}/{route.stops.length}</span>
                </div>
              </button>
            ))}
          </div>

          {/* Right: active route stops */}
          {activeRoute && (
            <div className="flex-1 overflow-y-auto">
              <div className="sticky top-0 z-10 bg-white border-b px-5 py-3 flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-gray-900">{activeRoute.name}</h2>
                  <p className="text-sm text-gray-500">{activeRoute.stops.length} stops · {completedCount(activeRoute)} done · {pct(activeRoute)}%</p>
                </div>
                {activeRoute.status === 'planned' && (
                  <button onClick={() => startRoute(activeRoute)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
                    <Play className="w-3.5 h-3.5" /> Start Route
                  </button>
                )}
              </div>

              <div className="divide-y">
                {activeRoute.stops.map((stop, idx) => {
                  const lead = stop.lead
                  if (!lead) return null
                  const isDone = stop.status === 'completed'
                  const isArrived = stop.status === 'arrived'
                  const isExpanded = expandedStop === stop.lead_id
                  const BtypeIcon = BTYPE_ICONS[lead.business_type] ?? Building2
                  const followUpOverdue = lead.next_follow_up && lead.next_follow_up < today
                  const followUpToday = lead.next_follow_up === today
                  const neverContacted = !lead.last_contacted_at

                  return (
                    <div key={stop.lead_id} className={isDone ? 'bg-gray-50 opacity-60' : isArrived ? 'bg-blue-50' : 'bg-white'}>
                      <div className="flex items-start gap-3 px-5 py-4">

                        {/* Stop number */}
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 ${isDone ? 'bg-green-100 text-green-700' : isArrived ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
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
                                {neverContacted && <span className="text-xs text-blue-600 font-medium">First visit</span>}
                                {followUpOverdue && <span className="text-xs text-red-600 font-medium flex items-center gap-0.5"><AlertCircle className="w-3 h-3" /> Overdue</span>}
                                {followUpToday && !followUpOverdue && <span className="text-xs text-orange-600 font-medium">Due today</span>}
                              </div>
                              <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                                <span className="flex items-center gap-1"><BtypeIcon className="w-3 h-3" />{lead.business_type}</span>
                                {lead.area && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{lead.area}</span>}
                                {lead.contact_name && <span className="flex items-center gap-1"><User className="w-3 h-3" />{lead.contact_name}</span>}
                              </div>
                              {lead.address && <p className="text-xs text-gray-400 mt-0.5 truncate">{lead.address}</p>}
                              {lead.next_follow_up && !neverContacted && (
                                <p className="text-xs text-gray-400 mt-0.5">
                                  Follow-up: {new Date(lead.next_follow_up + 'T12:00:00').toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                                  {lead.last_contacted_at && ` · Last: ${new Date(lead.last_contacted_at).toLocaleDateString('en', { month: 'short', day: 'numeric' })}`}
                                </p>
                              )}
                            </div>

                            {/* Action icons */}
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

                          {/* Quick action buttons */}
                          {!isDone && !isExpanded && (
                            <div className="flex gap-2 mt-2">
                              {!isArrived && (
                                <button onClick={() => markArrived(stop)} className="text-xs px-2.5 py-1 bg-blue-100 text-blue-700 rounded-full hover:bg-blue-200 font-medium">
                                  Arrived
                                </button>
                              )}
                              <button onClick={() => setExpandedStop(stop.lead_id)} className="text-xs px-2.5 py-1 bg-green-100 text-green-700 rounded-full hover:bg-green-200 font-medium">
                                Log Visit
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Expanded: visit log */}
                      {isExpanded && !isDone && (
                        <div className="px-5 pb-4 ml-10">
                          <div className="bg-white border rounded-xl p-4 space-y-3">
                            <h4 className="text-sm font-semibold text-gray-800">Log this visit</h4>

                            <select value={visitOutcome} onChange={e => setVisitOutcome(e.target.value)}
                              className="w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                              <option value="visited">Visited (general)</option>
                              <option value="interested">Interested — wants to hear more</option>
                              <option value="follow_up">Follow-up Needed</option>
                              <option value="proposal">Requested Proposal</option>
                              <option value="not_interested">Not Interested (will follow up monthly)</option>
                              <option value="no_answer">No Answer / Not Available</option>
                              <option value="closed_won">Closed Won 🎉</option>
                            </select>

                            <textarea
                              value={visitNote}
                              onChange={e => setVisitNote(e.target.value)}
                              placeholder='Notes — e.g. "Manager said come back Thursday" or "Got number: +62 812 3456" or "Not interested right now"'
                              rows={3}
                              className="w-full text-sm border rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />

                            {/* Smart detection hints */}
                            {detectedDate && (
                              <div className="flex items-center gap-2 text-xs bg-blue-50 text-blue-700 rounded-lg px-3 py-2">
                                <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
                                Follow-up auto-set to <strong>{new Date(detectedDate + 'T12:00:00').toLocaleDateString('en', { weekday: 'long', month: 'short', day: 'numeric' })}</strong>
                              </div>
                            )}
                            {!detectedDate && visitOutcome !== 'closed_won' && (
                              <div className="text-xs text-gray-400">
                                Auto follow-up in <strong>{OUTCOME_CADENCE[visitOutcome] ?? 7} days</strong> based on outcome
                                {visitOutcome === 'not_interested' && ' · Monthly touch regardless'}
                              </div>
                            )}
                            {detectedPhone && (
                              <label className="flex items-center gap-2 text-xs bg-green-50 text-green-700 rounded-lg px-3 py-2 cursor-pointer">
                                <input type="checkbox" checked={savePhone} onChange={e => setSavePhone(e.target.checked)} className="rounded" />
                                Save detected number <strong>{detectedPhone}</strong> as contact phone
                              </label>
                            )}

                            <div className="flex gap-2">
                              <button
                                onClick={() => logVisitAndComplete(stop)}
                                disabled={!visitNote.trim() || loggingStop === stop.lead_id}
                                className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                                {loggingStop === stop.lead_id ? 'Saving…' : 'Save & Complete Stop'}
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
      )}

      {/* Generate Routes Modal */}
      {showGenModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Zap className="w-5 h-5 text-blue-600" /> Generate Routes
              </h2>
              <button onClick={() => setShowGenModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4">
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
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-gray-700">Sales Reps</label>
                  <button onClick={() => setReps(r => [...r, { name: `Rep ${r.length + 1}`, area_cluster: ZONES[0].value }])}
                    className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1">
                    <Plus className="w-3 h-3" /> Add Rep
                  </button>
                </div>
                <div className="space-y-2">
                  {reps.map((rep, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input value={rep.name} onChange={e => setReps(r => r.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                        placeholder="Name" className="w-32 text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      <select value={rep.area_cluster} onChange={e => setReps(r => r.map((x, j) => j === i ? { ...x, area_cluster: e.target.value } : x))}
                        className="flex-1 text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                        {ZONES.map(z => <option key={z.value} value={z.value}>{z.label} — {z.sub}</option>)}
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

              <div className="bg-gray-50 rounded-xl p-4 text-xs text-gray-600 space-y-1.5">
                <p className="font-medium text-gray-800">How routes are built:</p>
                <p>• Every lead is eligible until they become a partner (closed won)</p>
                <p>• Not interested? Still followed up monthly, automatically</p>
                <p>• Stops are ordered geographically — nearest-neighbor, no zigzagging</p>
                <p>• If a rep notes "come back Thursday" → follow-up is auto-set to Thursday</p>
                <p>• If a rep notes a phone number → one click to save it to the lead</p>
              </div>

              {genError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div>
                    <p>{genError}</p>
                    {genError.includes('already exist') && (
                      <button onClick={() => generateRoutes(true)} className="mt-2 text-xs font-medium underline">
                        Regenerate (replaces existing routes)
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
              <button onClick={() => generateRoutes(false)} disabled={generating || !reps.length}
                className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {generating
                  ? <><RefreshCw className="w-4 h-4 animate-spin" /> Generating…</>
                  : <><Zap className="w-4 h-4" /> Generate {reps.length} Routes</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
