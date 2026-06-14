'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { GoogleMap, useJsApiLoader, Marker, Polyline, Circle } from '@react-google-maps/api'
import {
  MapPin, Play, CheckCircle, RefreshCw, Plus, X, ChevronDown, ChevronUp,
  MessageCircle, Phone, User, Zap, AlertCircle, Building2, Coffee,
  Dumbbell, Hotel, Utensils, Star, ArrowLeft, Navigation2, List, Settings,
} from 'lucide-react'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const BALI_CENTER = { lat: -8.65, lng: 115.22 }
const ARRIVAL_RADIUS_M = 120 // auto-detect arrival within 120 meters

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
  prospect: 'bg-gray-100 text-gray-700', contacted: 'bg-blue-100 text-blue-700',
  meeting: 'bg-yellow-100 text-yellow-700', proposal: 'bg-purple-100 text-purple-700',
  negotiation: 'bg-orange-100 text-orange-700', closed_won: 'bg-green-100 text-green-700',
}

const BTYPE_ICONS: Record<string, any> = {
  Hotel: Hotel, Resort: Hotel, Restaurant: Utensils, Café: Coffee, Cafe: Coffee, Gym: Dumbbell, Spa: Star,
}

const OUTCOME_CADENCE: Record<string, number> = {
  interested: 3, not_interested: 30, follow_up: 3, proposal: 2, no_answer: 1, visited: 7, closed_won: 0,
}

const OUTCOME_STAGE: Record<string, string> = {
  interested: 'meeting', not_interested: 'contacted', follow_up: 'contacted',
  proposal: 'proposal', closed_won: 'closed_won', no_answer: 'contacted', visited: 'contacted',
}

// Haversine distance in meters
function distanceM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function detectFollowUpDate(text: string): string | null {
  const lower = text.toLowerCase()
  const today = new Date()
  const addDays = (n: number) => { const d = new Date(today); d.setDate(d.getDate() + n); return d.toISOString().split('T')[0] }
  if (/tomorrow/i.test(lower)) return addDays(1)
  const inDays = lower.match(/in (\d+) days?/i)
  if (inDays) return addDays(parseInt(inDays[1]))
  if (/next week|in a week/i.test(lower)) return addDays(7)
  if (/next month|in a month/i.test(lower)) return addDays(30)
  const days = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']
  for (let i = 0; i < days.length; i++) {
    if (new RegExp(days[i], 'i').test(lower)) {
      const d = new Date(today); d.setDate(d.getDate() + ((i + 7 - d.getDay()) % 7 || 7)); return d.toISOString().split('T')[0]
    }
  }
  return null
}

function detectPhone(text: string): string | null {
  const m = text.match(/(\+?[\d\s\-().]{9,16})/)
  if (!m) return null
  const digits = m[1].replace(/\D/g, '')
  return digits.length >= 8 ? digits : null
}

type Rep = { name: string; area_cluster: string }
type Lead = {
  id: string; company_name: string; business_type: string; area: string
  address: string; contact_name: string; contact_phone: string; whatsapp_number: string
  stage: string; priority: string; last_contacted_at: string; next_follow_up: string
  estimated_value: number; lat?: number; lng?: number
}
type Stop = { id: string; order_index: number; lead_id: string; status: string; arrived_at?: string; departed_at?: string; lead: Lead }
type Route = { id: string; name: string; date: string; status: string; notes: string; stops: Stop[] }

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
const MAPS_CONFIGURED = MAPS_KEY && MAPS_KEY !== 'YOUR_GOOGLE_MAPS_API_KEY_HERE'

// ─── ROUTE MAP (DoorDash-style) ───────────────────────────────────────────────
function RouteMap({ route, onBack, onRouteUpdate }: { route: Route; onBack: () => void; onRouteUpdate: () => void }) {
  const { isLoaded } = useJsApiLoader({ googleMapsApiKey: MAPS_KEY ?? '' })
  const [gpsPos, setGpsPos] = useState<{ lat: number; lng: number } | null>(null)
  const [mapView, setMapView] = useState<'map' | 'list'>('map')
  const [activeStopIdx, setActiveStopIdx] = useState<number>(() => {
    const idx = route.stops.findIndex(s => s.status !== 'completed')
    return idx >= 0 ? idx : 0
  })
  const [showLog, setShowLog] = useState(false)
  const [visitNote, setVisitNote] = useState('')
  const [visitOutcome, setVisitOutcome] = useState('visited')
  const [saving, setSaving] = useState(false)
  const [detectedDate, setDetectedDate] = useState<string | null>(null)
  const [detectedPhone, setDetectedPhone] = useState<string | null>(null)
  const [savePhone, setSavePhone] = useState(false)
  const [arrived, setArrived] = useState(false)
  const watchRef = useRef<number | null>(null)
  const mapRef = useRef<google.maps.Map | null>(null)

  const today = new Date().toISOString().split('T')[0]
  const pendingStops = route.stops.filter(s => s.status !== 'completed')
  const currentStop = route.stops[activeStopIdx]
  const completedCount = route.stops.filter(s => s.status === 'completed').length

  // GPS tracking
  useEffect(() => {
    if (!navigator.geolocation) return
    watchRef.current = navigator.geolocation.watchPosition(
      pos => {
        const { latitude: lat, longitude: lng } = pos.coords
        setGpsPos({ lat, lng })
        // Auto-detect arrival at current stop
        if (currentStop?.lead?.lat && currentStop?.lead?.lng) {
          const d = distanceM(lat, lng, currentStop.lead.lat, currentStop.lead.lng)
          if (d < ARRIVAL_RADIUS_M) setArrived(true)
        }
      },
      () => {},
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    )
    return () => { if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current) }
  }, [currentStop])

  useEffect(() => {
    setDetectedDate(detectFollowUpDate(visitNote))
    setDetectedPhone(detectPhone(visitNote))
    setSavePhone(false)
  }, [visitNote])

  const handleMapLoad = useCallback((map: google.maps.Map) => { mapRef.current = map }, [])

  async function saveVisit() {
    if (!visitNote.trim() || !currentStop) return
    setSaving(true)

    const followUp = detectedDate ?? (OUTCOME_CADENCE[visitOutcome] > 0
      ? new Date(Date.now() + OUTCOME_CADENCE[visitOutcome] * 86400000).toISOString().split('T')[0]
      : null)

    const leadUpdate: any = {
      last_contacted_at: new Date().toISOString(),
      stage: OUTCOME_STAGE[visitOutcome] ?? 'contacted',
    }
    if (followUp) leadUpdate.next_follow_up = followUp
    if (savePhone && detectedPhone) leadUpdate.contact_phone = detectedPhone

    await Promise.all([
      sb.from('sales_activities').insert({ lead_id: currentStop.lead_id, channel: 'visit', outcome: visitOutcome, notes: visitNote }),
      sb.from('sales_leads').update(leadUpdate).eq('id', currentStop.lead_id),
      sb.from('sales_route_stops').update({ status: 'completed', departed_at: new Date().toISOString(), notes: visitNote }).eq('id', currentStop.id),
    ])

    // Advance to next pending stop
    const nextIdx = route.stops.findIndex((s, i) => i > activeStopIdx && s.status !== 'completed')
    if (nextIdx >= 0) {
      setActiveStopIdx(nextIdx)
      // Pan map to next stop
      const nextLead = route.stops[nextIdx].lead
      if (mapRef.current && nextLead?.lat && nextLead?.lng) {
        mapRef.current.panTo({ lat: nextLead.lat, lng: nextLead.lng })
      }
    }

    setVisitNote('')
    setVisitOutcome('visited')
    setShowLog(false)
    setArrived(false)
    setSaving(false)
    onRouteUpdate()
  }

  // Map path: all stops with coords
  const mapPath = route.stops
    .filter(s => s.lead?.lat && s.lead?.lng)
    .map(s => ({ lat: s.lead.lat!, lng: s.lead.lng! }))

  const currentLead = currentStop?.lead

  const distToNext = (gpsPos && currentLead?.lat && currentLead?.lng)
    ? Math.round(distanceM(gpsPos.lat, gpsPos.lng, currentLead.lat, currentLead.lng))
    : null

  if (!MAPS_CONFIGURED) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 px-4 py-3 border-b bg-white">
          <button onClick={onBack} className="p-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100"><ArrowLeft className="w-5 h-5" /></button>
          <h2 className="font-semibold text-gray-900 flex-1 truncate">{route.name}</h2>
        </div>
        <div className="flex-1 flex items-center justify-center text-center p-8">
          <div>
            <MapPin className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="font-semibold text-gray-700 mb-1">Google Maps not configured</p>
            <p className="text-sm text-gray-500">Add <code className="bg-gray-100 px-1 rounded">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> to your Vercel environment variables to enable the in-app map.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full relative">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-white z-20 flex-shrink-0">
        <button onClick={onBack} className="p-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100"><ArrowLeft className="w-5 h-5" /></button>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 truncate">{route.name}</p>
          <p className="text-xs text-gray-500">{completedCount}/{route.stops.length} stops done</p>
        </div>
        <button onClick={() => setMapView(v => v === 'map' ? 'list' : 'map')}
          className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">
          {mapView === 'map' ? <><List className="w-4 h-4" /> List</> : <><Navigation2 className="w-4 h-4" /> Map</>}
        </button>
      </div>

      {mapView === 'map' ? (
        <>
          {/* Map */}
          <div className="flex-1 relative">
            {!isLoaded ? (
              <div className="flex items-center justify-center h-full"><RefreshCw className="w-5 h-5 animate-spin text-gray-400" /></div>
            ) : (
              <GoogleMap
                onLoad={handleMapLoad}
                mapContainerStyle={{ width: '100%', height: '100%' }}
                center={gpsPos ?? (currentLead?.lat && currentLead?.lng ? { lat: currentLead.lat, lng: currentLead.lng } : BALI_CENTER)}
                zoom={14}
                options={{ disableDefaultUI: true, zoomControl: true, gestureHandling: 'greedy' }}
              >
                {/* Route polyline */}
                {mapPath.length > 1 && (
                  <Polyline path={mapPath} options={{ strokeColor: '#3B82F6', strokeWeight: 3, strokeOpacity: 0.6 }} />
                )}

                {/* Stop markers */}
                {route.stops.map((stop, idx) => {
                  if (!stop.lead?.lat || !stop.lead?.lng) return null
                  const isDone = stop.status === 'completed'
                  const isCurrent = idx === activeStopIdx
                  return (
                    <Marker
                      key={stop.id}
                      position={{ lat: stop.lead.lat, lng: stop.lead.lng }}
                      onClick={() => { setActiveStopIdx(idx); setShowLog(false) }}
                      label={{ text: isDone ? '✓' : String(idx + 1), color: 'white', fontSize: '12px', fontWeight: 'bold' }}
                      icon={{
                        path: (window as any).google.maps.SymbolPath.CIRCLE,
                        scale: isCurrent ? 18 : 13,
                        fillColor: isDone ? '#22C55E' : isCurrent ? '#2563EB' : '#6B7280',
                        fillOpacity: 1,
                        strokeColor: 'white',
                        strokeWeight: 2,
                      }}
                    />
                  )
                })}

                {/* Live GPS dot */}
                {gpsPos && (
                  <>
                    <Marker
                      position={gpsPos}
                      icon={{
                        path: (window as any).google.maps.SymbolPath.CIRCLE,
                        scale: 10,
                        fillColor: '#60A5FA',
                        fillOpacity: 1,
                        strokeColor: 'white',
                        strokeWeight: 3,
                      }}
                    />
                    <Circle
                      center={gpsPos}
                      radius={60}
                      options={{ strokeColor: '#3B82F6', strokeOpacity: 0.3, fillColor: '#3B82F6', fillOpacity: 0.1 }}
                    />
                  </>
                )}
              </GoogleMap>
            )}
          </div>

          {/* Bottom panel — DoorDash style */}
          {currentStop && !showLog && (
            <div className="flex-shrink-0 bg-white border-t shadow-lg">
              {/* Progress bar */}
              <div className="h-1 bg-gray-100">
                <div className="h-1 bg-blue-500 transition-all" style={{ width: `${Math.round((completedCount / route.stops.length) * 100)}%` }} />
              </div>

              <div className="px-5 py-4">
                {arrived && (
                  <div className="flex items-center gap-2 mb-3 bg-green-50 text-green-700 rounded-xl px-3 py-2 text-sm font-medium">
                    <CheckCircle className="w-4 h-4" /> You've arrived!
                  </div>
                )}

                <div className="flex items-start gap-3 mb-4">
                  <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                    {activeStopIdx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900">{currentLead?.company_name}</p>
                    <p className="text-sm text-gray-500">{currentLead?.business_type} · {currentLead?.area}</p>
                    {currentLead?.address && <p className="text-xs text-gray-400 mt-0.5 truncate">{currentLead.address}</p>}
                    {distToNext !== null && (
                      <p className="text-xs text-blue-600 font-medium mt-1">
                        {distToNext < 1000 ? `${distToNext}m away` : `${(distToNext / 1000).toFixed(1)}km away`}
                      </p>
                    )}
                    {!currentLead?.last_contacted_at && <p className="text-xs text-blue-500 mt-0.5">First visit</p>}
                    {currentLead?.next_follow_up && currentLead.next_follow_up <= today && (
                      <p className="text-xs text-orange-500 mt-0.5 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Follow-up due</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {currentLead?.contact_phone && (
                      <a href={`tel:${currentLead.contact_phone}`} className="p-2 bg-gray-100 text-gray-600 rounded-full hover:bg-gray-200"><Phone className="w-4 h-4" /></a>
                    )}
                    {currentLead?.whatsapp_number && (
                      <button onClick={() => {
                        const msg = encodeURIComponent(`Hi! I'm from Kembali Water. Would love to connect about ${currentLead.company_name}!`)
                        window.open(`https://wa.me/${currentLead.whatsapp_number.replace(/\D/g,'')}?text=${msg}`, '_blank')
                      }} className="p-2 bg-green-50 text-green-600 rounded-full hover:bg-green-100"><MessageCircle className="w-4 h-4" /></button>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => setShowLog(true)}
                  className="w-full py-3.5 bg-blue-600 text-white rounded-2xl font-semibold text-sm hover:bg-blue-700 active:bg-blue-800">
                  {arrived ? 'Log Visit →' : 'Log Visit'}
                </button>

                {/* Next stop preview */}
                {activeStopIdx + 1 < route.stops.length && (() => {
                  const next = route.stops.find((s, i) => i > activeStopIdx && s.status !== 'completed')
                  return next ? (
                    <p className="text-xs text-gray-400 text-center mt-3">
                      Next: <span className="text-gray-600 font-medium">{next.lead?.company_name}</span> · {next.lead?.area}
                    </p>
                  ) : null
                })()}
              </div>
            </div>
          )}

          {/* Log form slides up */}
          {showLog && currentStop && (
            <div className="flex-shrink-0 bg-white border-t shadow-xl">
              <div className="px-5 py-4 space-y-3">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-semibold text-gray-900">How did it go at {currentLead?.company_name}?</h3>
                  <button onClick={() => setShowLog(false)} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                </div>

                {/* Big outcome buttons */}
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'interested',     label: '😊 Interested',      color: 'bg-green-50 border-green-200 text-green-800' },
                    { value: 'follow_up',      label: '📅 Follow Up',       color: 'bg-blue-50 border-blue-200 text-blue-800' },
                    { value: 'not_interested', label: '😐 Not Interested',  color: 'bg-gray-50 border-gray-200 text-gray-700' },
                    { value: 'no_answer',      label: '📵 No Answer',       color: 'bg-yellow-50 border-yellow-200 text-yellow-800' },
                    { value: 'proposal',       label: '📋 Wants Proposal',  color: 'bg-purple-50 border-purple-200 text-purple-800' },
                    { value: 'closed_won',     label: '🎉 Closed Won!',     color: 'bg-emerald-50 border-emerald-200 text-emerald-800' },
                  ].map(o => (
                    <button key={o.value} onClick={() => setVisitOutcome(o.value)}
                      className={`py-2.5 px-3 rounded-xl border text-sm font-medium transition-all ${visitOutcome === o.value ? o.color + ' ring-2 ring-offset-1 ring-blue-400' : 'bg-white border-gray-200 text-gray-600'}`}>
                      {o.label}
                    </button>
                  ))}
                </div>

                <textarea
                  value={visitNote}
                  onChange={e => setVisitNote(e.target.value)}
                  placeholder='Notes — "spoke with manager, come back Thursday" or phone number…'
                  rows={2}
                  className="w-full text-sm border rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                />

                {detectedDate && (
                  <p className="text-xs text-blue-600 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Follow-up auto-set to {new Date(detectedDate + 'T12:00:00').toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </p>
                )}
                {!detectedDate && visitOutcome !== 'closed_won' && (
                  <p className="text-xs text-gray-400">
                    Auto follow-up in {OUTCOME_CADENCE[visitOutcome] ?? 7} days
                    {visitOutcome === 'not_interested' ? ' (monthly check-in)' : ''}
                  </p>
                )}
                {detectedPhone && (
                  <label className="flex items-center gap-2 text-xs text-green-700 bg-green-50 rounded-xl px-3 py-2 cursor-pointer">
                    <input type="checkbox" checked={savePhone} onChange={e => setSavePhone(e.target.checked)} className="rounded" />
                    Save {detectedPhone} as contact number
                  </label>
                )}

                <button onClick={saveVisit} disabled={!visitNote.trim() || saving}
                  className="w-full py-3.5 bg-green-600 text-white rounded-2xl font-semibold text-sm hover:bg-green-700 disabled:opacity-50 active:bg-green-800">
                  {saving ? 'Saving…' : pendingStops.length > 1 ? 'Save & Next Stop →' : 'Save & Finish Route ✓'}
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        /* List view toggle */
        <div className="flex-1 overflow-y-auto">
          {route.stops.map((stop, idx) => {
            const lead = stop.lead
            const isDone = stop.status === 'completed'
            const isCurrent = idx === activeStopIdx
            const BIcon = BTYPE_ICONS[lead?.business_type] ?? Building2
            return (
              <div key={stop.id} onClick={() => { setActiveStopIdx(idx); setMapView('map') }}
                className={`flex items-start gap-3 px-5 py-4 border-b cursor-pointer ${isCurrent ? 'bg-blue-50' : isDone ? 'bg-gray-50 opacity-60' : 'bg-white hover:bg-gray-50'}`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 ${isDone ? 'bg-green-100 text-green-700' : isCurrent ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                  {isDone ? <CheckCircle className="w-4 h-4" /> : idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{lead?.company_name}</p>
                  <p className="text-xs text-gray-500 flex items-center gap-2 mt-0.5">
                    <BIcon className="w-3 h-3" />{lead?.business_type}
                    {lead?.area && <><span>·</span>{lead.area}</>}
                  </p>
                  {!lead?.last_contacted_at && <p className="text-xs text-blue-500 mt-0.5">First visit</p>}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${STAGE_COLORS[lead?.stage] ?? 'bg-gray-100 text-gray-600'}`}>{lead?.stage}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function RoutesPage() {
  const today = new Date().toISOString().split('T')[0]
  const [date, setDate] = useState(today)
  const [routes, setRoutes] = useState<Route[]>([])
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [activeRoute, setActiveRoute] = useState<Route | null>(null)
  const [drivingRoute, setDrivingRoute] = useState<Route | null>(null)
  const [showGenModal, setShowGenModal] = useState(false)
  const [reps, setReps] = useState<Rep[]>(DEFAULT_REPS)
  const [leadsPerRep, setLeadsPerRep] = useState(20)
  const [genError, setGenError] = useState('')

  useEffect(() => { loadRoutes() }, [date])

  async function loadRoutes() {
    setLoading(true)
    const res = await fetch(`/api/sales/generate-routes?date=${date}`)
    const data = await res.json()
    const loaded: Route[] = data.routes ?? []
    setRoutes(loaded)
    setActiveRoute(prev => loaded.find(r => r.id === prev?.id) ?? loaded[0] ?? null)
    if (drivingRoute) {
      const refreshed = loaded.find(r => r.id === drivingRoute.id)
      if (refreshed) setDrivingRoute(refreshed)
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
        body: JSON.stringify({ date, reps, leads_per_rep: leadsPerRep, replace_existing: replace }),
      })
      const data = await res.json()
      if (!res.ok) { setGenError(data.error ?? 'Failed'); return }
      await loadRoutes()
      setShowGenModal(false)
    } catch (e: any) { setGenError(e.message) }
    setGenerating(false)
  }

  async function startRoute(route: Route) {
    await sb.from('sales_routes').update({ status: 'in_progress' }).eq('id', route.id)
    await loadRoutes()
    const fresh = routes.find(r => r.id === route.id) ?? route
    setDrivingRoute(fresh)
  }

  const completedCount = (r: Route) => r.stops.filter(s => s.status === 'completed').length
  const pct = (r: Route) => r.stops.length ? Math.round((completedCount(r) / r.stops.length) * 100) : 0

  // ── Driving mode (full-screen map) ──
  if (drivingRoute) {
    return (
      <RouteMap
        route={drivingRoute}
        onBack={() => setDrivingRoute(null)}
        onRouteUpdate={loadRoutes}
      />
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-white flex-shrink-0">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Sales Routes</h1>
          <p className="text-sm text-gray-500">In-app navigation · Every lead covered · Smart follow-ups</p>
        </div>
        <div className="flex items-center gap-3">
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <button onClick={loadRoutes} className="p-2 text-gray-500 border rounded-lg hover:bg-gray-50"><RefreshCw className="w-4 h-4" /></button>
          <a href="/sales/settings"
            className="p-2 text-gray-500 border rounded-lg hover:bg-gray-50" title="Route Settings">
            <Settings className="w-4 h-4" />
          </a>
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
            <h3 className="font-semibold text-gray-800 mb-1">No routes for {new Date(date + 'T12:00:00').toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' })}</h3>
            <p className="text-sm text-gray-500 max-w-sm">Generate routes to assign geo-optimized stops to each rep. They drive the whole day from the app — no switching to Maps.</p>
          </div>
          <button onClick={() => setShowGenModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
            <Zap className="w-4 h-4" /> Generate Today's Routes
          </button>
        </div>
      ) : (
        <div className="flex flex-1 min-h-0">
          {/* Route list */}
          <div className="w-72 border-r bg-gray-50 overflow-y-auto flex-shrink-0">
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

          {/* Route detail */}
          {activeRoute && (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="px-6 py-4 bg-white border-b flex items-center justify-between flex-shrink-0">
                <div>
                  <h2 className="font-semibold text-gray-900">{activeRoute.name}</h2>
                  <p className="text-sm text-gray-500">{activeRoute.stops.length} stops · {completedCount(activeRoute)} done</p>
                </div>
                <button
                  onClick={() => startRoute(activeRoute)}
                  className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700">
                  {activeRoute.status === 'planned' ? <><Play className="w-4 h-4" /> Start Route</> : <><Navigation2 className="w-4 h-4" /> Resume Route</>}
                </button>
              </div>

              {/* Stop preview list */}
              <div className="flex-1 overflow-y-auto divide-y">
                {activeRoute.stops.map((stop, idx) => {
                  const lead = stop.lead
                  const isDone = stop.status === 'completed'
                  const BIcon = BTYPE_ICONS[lead?.business_type] ?? Building2
                  return (
                    <div key={stop.id} className={`flex items-start gap-3 px-6 py-4 ${isDone ? 'bg-gray-50 opacity-60' : 'bg-white'}`}>
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 ${isDone ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                        {isDone ? <CheckCircle className="w-4 h-4" /> : idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900">{lead?.company_name}</p>
                        <p className="text-xs text-gray-500 flex items-center gap-2 mt-0.5">
                          <BIcon className="w-3 h-3" />{lead?.business_type}
                          {lead?.area && <><span>·</span><MapPin className="w-3 h-3" />{lead.area}</>}
                        </p>
                        {!lead?.last_contacted_at && <p className="text-xs text-blue-500 mt-0.5">First visit</p>}
                        {lead?.next_follow_up && lead.next_follow_up <= today && !isDone && (
                          <p className="text-xs text-orange-500 mt-0.5 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Follow-up due</p>
                        )}
                      </div>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 ${STAGE_COLORS[lead?.stage] ?? 'bg-gray-100 text-gray-600'}`}>{lead?.stage}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Generate modal */}
      {showGenModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold flex items-center gap-2"><Zap className="w-5 h-5 text-blue-600" /> Generate Routes</h2>
              <button onClick={() => setShowGenModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
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
                    className="text-xs text-blue-600 flex items-center gap-1"><Plus className="w-3 h-3" /> Add Rep</button>
                </div>
                <div className="space-y-2">
                  {reps.map((rep, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input value={rep.name} onChange={e => setReps(r => r.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                        className="w-28 text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Name" />
                      <select value={rep.area_cluster} onChange={e => setReps(r => r.map((x, j) => j === i ? { ...x, area_cluster: e.target.value } : x))}
                        className="flex-1 text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                        {ZONES.map(z => <option key={z.value} value={z.value}>{z.label} — {z.sub}</option>)}
                      </select>
                      {reps.length > 1 && <button onClick={() => setReps(r => r.filter((_, j) => j !== i))} className="p-2 text-gray-400 hover:text-red-500"><X className="w-4 h-4" /></button>}
                    </div>
                  ))}
                </div>
              </div>
              {genError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div>
                    <p>{genError}</p>
                    {genError.includes('already exist') && (
                      <button onClick={() => generateRoutes(true)} className="mt-2 text-xs font-medium underline">Regenerate (replace existing)</button>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-3">
              <button onClick={() => setShowGenModal(false)} className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={() => generateRoutes(false)} disabled={generating || !reps.length}
                className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {generating ? <><RefreshCw className="w-4 h-4 animate-spin" /> Generating…</> : <><Zap className="w-4 h-4" /> Generate {reps.length} Routes</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
