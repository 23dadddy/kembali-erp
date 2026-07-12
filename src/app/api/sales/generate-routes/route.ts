import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendPush } from '@/lib/push'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type Rep = { name: string; id?: string; area_cluster?: string; area?: string }

// Haversine distance in km between two lat/lng points
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Nearest-neighbor sort: starting from the first point, always go to the closest unvisited stop
function sortByProximity(leads: any[]): any[] {
  const withCoords = leads.filter(l => l.lat != null && l.lng != null)
  const noCoords = leads.filter(l => l.lat == null || l.lng == null)

  if (withCoords.length <= 1) return [...withCoords, ...noCoords]

  const sorted: any[] = []
  const remaining = [...withCoords]

  // Start from the northernmost point (top of the zone) so reps drive south
  remaining.sort((a, b) => b.lat - a.lat)
  sorted.push(remaining.shift()!)

  while (remaining.length > 0) {
    const last = sorted[sorted.length - 1]
    let closestIdx = 0
    let closestDist = Infinity
    for (let i = 0; i < remaining.length; i++) {
      const d = haversine(last.lat, last.lng, remaining[i].lat, remaining[i].lng)
      if (d < closestDist) { closestDist = d; closestIdx = i }
    }
    sorted.push(remaining.splice(closestIdx, 1)[0])
  }

  // Append leads with no coords at the end
  return [...sorted, ...noCoords]
}

// Area zone centers for clustering
const ZONE_CENTERS: Record<string, { lat: number; lng: number; areas: string[] }> = {
  'North Canggu':   { lat: -8.648, lng: 115.138, areas: ['Canggu', 'Berawa', 'Pererenan', 'Batu Belig'] },
  'South Seminyak': { lat: -8.710, lng: 115.168, areas: ['Seminyak', 'Legian', 'Kuta', 'Petitenget'] },
  'Ubud & Central': { lat: -8.507, lng: 115.262, areas: ['Ubud', 'Tabanan', 'Denpasar', 'Gianyar'] },
  'South Bali':     { lat: -8.800, lng: 115.185, areas: ['Nusa Dua', 'Jimbaran', 'Uluwatu', 'Bukit'] },
  'East Bali':      { lat: -8.701, lng: 115.262, areas: ['Sanur', 'Ketewel', 'Keramas'] },
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const {
    date = new Date().toISOString().split('T')[0],
    reps = [] as Rep[],
    leads_per_rep = 20,
    replace_existing = false,
  } = body

  if (!reps.length) {
    return NextResponse.json({ error: 'No reps provided' }, { status: 400 })
  }

  // Handle existing routes
  if (replace_existing) {
    await sb.from('sales_routes').delete().eq('date', date)
  } else {
    const { data: existing } = await sb.from('sales_routes').select('id').eq('date', date)
    if (existing?.length) {
      return NextResponse.json(
        { error: 'Routes already exist for this date. Use replace_existing=true to regenerate.' },
        { status: 409 }
      )
    }
  }

  // -----------------------------------------------------------------------
  // CADENCE RULES: touch every lead until they are closed_won.
  // - Never contacted → always eligible
  // - Has a next_follow_up date <= today → eligible
  // - Last contacted more than 30 days ago → eligible (persistent monthly touch)
  // - closed_won → never eligible
  // -----------------------------------------------------------------------
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const cutoff30 = thirtyDaysAgo.toISOString()

  const { data: allLeads } = await sb
    .from('sales_leads')
    .select('id, company_name, contact_name, contact_phone, whatsapp_number, address, area, business_type, stage, priority, estimated_value, last_contacted_at, next_follow_up, lat, lng, assigned_rep')
    .not('stage', 'in', '("closed_won")')
    .or(`last_contacted_at.is.null,next_follow_up.lte.${date},last_contacted_at.lt.${cutoff30}`)
    .order('next_follow_up', { ascending: true, nullsFirst: true })

  const eligibleLeads = allLeads ?? []

  // Assign to reps by zone, then sort each zone's stops by proximity
  const usedLeadIds = new Set<string>()
  const createdRoutes: any[] = []

  for (const rep of reps) {
    let repLeads = eligibleLeads.filter(l => !usedLeadIds.has(l.id))

    // Filter to zone if specified
    if (rep.area_cluster && ZONE_CENTERS[rep.area_cluster]) {
      const zoneAreas = ZONE_CENTERS[rep.area_cluster].areas
      const inZone = repLeads.filter(l => l.area && zoneAreas.some(a => l.area.toLowerCase().includes(a.toLowerCase())))
      const outZone = repLeads.filter(l => !l.area || !zoneAreas.some(a => l.area.toLowerCase().includes(a.toLowerCase())))

      // If zone has enough leads, use only zone leads. Otherwise fill from elsewhere.
      repLeads = inZone.length >= leads_per_rep
        ? inZone
        : [...inZone, ...outZone]
    }

    // Nearest-neighbor sort within the assigned pool
    const pool = repLeads.slice(0, leads_per_rep * 3) // take 3x then sort so we have options
    const sortedPool = sortByProximity(pool)
    const stops = sortedPool.slice(0, leads_per_rep)

    stops.forEach(l => usedLeadIds.add(l.id))
    if (!stops.length) continue

    const { data: route } = await sb.from('sales_routes').insert({
      name: `${rep.name} — ${new Date(date + 'T12:00:00').toLocaleDateString('en', { weekday: 'long', month: 'short', day: 'numeric' })}`,
      date,
      status: 'planned',
      notes: rep.area_cluster ?? null,
      salesperson_id: rep.id ?? null,
    }).select().single()

    if (!route) continue

    await sb.from('sales_route_stops').insert(
      stops.map((lead, idx) => ({
        route_id: route.id,
        lead_id: lead.id,
        order_index: idx,
        status: 'pending',
      }))
    )

    createdRoutes.push({
      ...route,
      rep_name: rep.name,
      stop_count: stops.length,
    })

    // Push notification to the rep's phone (sales_reps are copied from staff by name)
    {
      const { data: staffRow } = await sb.from('staff').select('push_token').eq('name', rep.name).maybeSingle()
      if (staffRow?.push_token) {
        sendPush({
          to: staffRow.push_token,
          title: 'Your route is ready 🗺️',
          body: `${stops.length} stops today. Open the app to start.`,
          data: { routeId: route.id },
        }).catch(() => null)
      }
    }
  }

  return NextResponse.json({
    date,
    routes_created: createdRoutes.length,
    routes: createdRoutes,
    total_leads_assigned: usedLeadIds.size,
    total_eligible: eligibleLeads.length,
  })
}

// GET: fetch routes for a date with full stop details
export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date') ?? new Date().toISOString().split('T')[0]

  const { data: routes } = await sb
    .from('sales_routes')
    .select('*')
    .eq('date', date)
    .order('created_at')

  if (!routes?.length) return NextResponse.json({ routes: [], date })

  const routeIds = routes.map(r => r.id)
  const { data: stops } = await sb
    .from('sales_route_stops')
    .select('id, route_id, lead_id, order_index, status, arrived_at, departed_at, notes, lead:sales_leads(id, company_name, contact_name, contact_phone, whatsapp_number, address, area, business_type, stage, priority, last_contacted_at, next_follow_up, estimated_value, lat, lng)')
    .in('route_id', routeIds)
    .order('order_index')

  const enriched = routes.map(r => ({
    ...r,
    stops: (stops ?? []).filter(s => s.route_id === r.id),
  }))

  return NextResponse.json({ routes: enriched, date })
}
