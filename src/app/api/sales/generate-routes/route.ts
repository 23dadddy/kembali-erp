import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

type Rep = { name: string; id?: string; area_cluster?: string; area?: string }

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Area clusters — reps should stay within 1-2 areas per day
const AREA_CLUSTERS: Record<string, string[]> = {
  'North Canggu':  ['Canggu', 'Berawa', 'Pererenan'],
  'South Seminyak': ['Seminyak', 'Legian', 'Kuta'],
  'Ubud & Central': ['Ubud', 'Tabanan', 'Denpasar'],
  'South Bali':    ['Nusa Dua', 'Jimbaran', 'Uluwatu'],
  'East Bali':     ['Sanur', 'Denpasar'],
}

function scoreLeadForVisit(lead: any, todayStr: string): number {
  let score = 0

  // Overdue follow-up — highest priority
  if (lead.next_follow_up && lead.next_follow_up < todayStr) score += 30
  else if (lead.next_follow_up === todayStr) score += 20

  // Never contacted at all — fresh prospect
  if (!lead.last_contacted_at) score += 15

  // Priority field
  if (lead.priority === 'high') score += 12
  else if (lead.priority === 'medium') score += 6

  // Stage — further along = more valuable to close
  const stageScores: Record<string, number> = {
    negotiation: 18, proposal: 14, meeting: 10,
    contacted: 6, prospect: 3,
  }
  score += stageScores[lead.stage] ?? 0

  // Estimated value
  const val = Number(lead.estimated_value || 0)
  if (val >= 1000) score += 8
  else if (val >= 500) score += 5
  else if (val >= 200) score += 2

  return score
}

function scoreLeadForWhatsApp(lead: any, todayStr: string): number {
  let score = 0
  if (lead.next_follow_up && lead.next_follow_up <= todayStr) score += 25
  if (!lead.last_contacted_at) score += 10
  if (lead.stage === 'contacted' || lead.stage === 'meeting') score += 12
  if (lead.stage === 'proposal' || lead.stage === 'negotiation') score += 18
  if (lead.priority === 'high') score += 10
  if (lead.whatsapp_number) score += 5
  return score
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const {
    date = new Date().toISOString().split('T')[0],
    reps = [],            // [{ name, area_cluster? }]
    leads_per_rep = 20,
    wa_per_rep = 30,
    revisit_cooldown_days = 7,
    replace_existing = false,
  } = body

  if (!reps.length) {
    return NextResponse.json({ error: 'No reps provided' }, { status: 400 })
  }

  // Delete existing routes for this date if replacing
  if (replace_existing) {
    const { data: old } = await sb.from('sales_routes').select('id').eq('date', date)
    if (old?.length) {
      await sb.from('sales_routes').delete().eq('date', date)
    }
  } else {
    // Check if routes already exist
    const { data: existing } = await sb.from('sales_routes').select('id').eq('date', date)
    if (existing?.length) {
      return NextResponse.json({ error: 'Routes already exist for this date. Use replace_existing=true to regenerate.' }, { status: 409 })
    }
  }

  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - revisit_cooldown_days)
  const cutoffStr = cutoffDate.toISOString()

  // Load all eligible leads for physical visits
  const { data: visitLeads } = await sb
    .from('sales_leads')
    .select('id, company_name, contact_name, contact_phone, whatsapp_number, address, area, business_type, stage, priority, estimated_value, last_contacted_at, next_follow_up, assigned_rep')
    .not('stage', 'in', '("closed_won","closed_lost")')
    .or(`last_contacted_at.is.null,last_contacted_at.lt.${cutoffStr},next_follow_up.lte.${date}`)
    .order('priority', { ascending: false })

  const allVisitLeads = (visitLeads ?? []).map(l => ({
    ...l,
    _score: scoreLeadForVisit(l, date),
  })).sort((a, b) => b._score - a._score)

  // Generate physical routes per rep
  const usedLeadIds = new Set<string>()
  const createdRoutes: any[] = []

  for (const rep of reps) {
    // Filter leads for this rep's cluster if specified
    let repLeads = allVisitLeads.filter(l => !usedLeadIds.has(l.id))

    if (rep.area_cluster && AREA_CLUSTERS[rep.area_cluster]) {
      const clusterAreas = AREA_CLUSTERS[rep.area_cluster]
      // Prefer leads in cluster, but fill remaining from anywhere
      const inCluster = repLeads.filter(l => l.area && clusterAreas.includes(l.area))
      const outCluster = repLeads.filter(l => !l.area || !clusterAreas.includes(l.area))
      repLeads = [...inCluster, ...outCluster]
    } else if (rep.area) {
      // Single area preference
      const preferred = repLeads.filter(l => l.area === rep.area)
      const others = repLeads.filter(l => l.area !== rep.area)
      repLeads = [...preferred, ...others]
    }

    const stops = repLeads.slice(0, leads_per_rep)
    stops.forEach(l => usedLeadIds.add(l.id))

    if (!stops.length) continue

    // Create route
    const { data: route } = await sb.from('sales_routes').insert({
      name: `${rep.name} — ${new Date(date).toLocaleDateString('en', { weekday: 'long', month: 'short', day: 'numeric' })}`,
      date,
      status: 'planned',
      notes: rep.area_cluster ? `Zone: ${rep.area_cluster}` : null,
      salesperson_id: rep.id ?? null,
    }).select().single()

    if (!route) continue

    // Create stops
    const stopRows = stops.map((lead, idx) => ({
      route_id: route.id,
      lead_id: lead.id,
      order_index: idx,
      status: 'pending',
    }))
    await sb.from('sales_route_stops').insert(stopRows)

    createdRoutes.push({
      ...route,
      rep_name: rep.name,
      stops: stops.map((l, idx) => ({
        order_index: idx,
        lead_id: l.id,
        company_name: l.company_name,
        business_type: l.business_type,
        area: l.area,
        address: l.address,
        contact_name: l.contact_name,
        contact_phone: l.contact_phone,
        whatsapp_number: l.whatsapp_number,
        stage: l.stage,
        priority: l.priority,
        score: l._score,
        last_contacted_at: l.last_contacted_at,
        next_follow_up: l.next_follow_up,
      })),
    })
  }

  // Generate WhatsApp queue — leads NOT assigned to physical routes today
  const { data: waLeads } = await sb
    .from('sales_leads')
    .select('id, company_name, contact_name, whatsapp_number, area, business_type, stage, priority, last_contacted_at, next_follow_up, notes')
    .not('stage', 'in', '("closed_won","closed_lost")')
    .not('id', 'in', `(${[...usedLeadIds].join(',') || 'null'})`)
    .not('whatsapp_number', 'is', null)
    .order('priority', { ascending: false })

  const waQueue = (waLeads ?? [])
    .map(l => ({ ...l, _score: scoreLeadForWhatsApp(l, date) }))
    .filter(l => l._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, reps.length * wa_per_rep)

  // Distribute WA queue across reps
  const waByRep: Record<string, any[]> = {}
  reps.forEach((r: Rep) => { waByRep[r.name] = [] })
  waQueue.forEach((lead, i) => {
    const rep = reps[i % reps.length]
    waByRep[rep.name].push(lead)
  })

  return NextResponse.json({
    date,
    routes_created: createdRoutes.length,
    routes: createdRoutes,
    whatsapp_queue: waByRep,
    total_leads_assigned: usedLeadIds.size,
    total_wa_queued: waQueue.length,
  })
}

// GET: fetch today's generated routes with full stop details
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
    .select('*, lead:sales_leads(id, company_name, contact_name, contact_phone, whatsapp_number, address, area, business_type, stage, priority, last_contacted_at, next_follow_up, estimated_value)')
    .in('route_id', routeIds)
    .order('order_index')

  const enriched = routes.map(r => ({
    ...r,
    stops: (stops ?? []).filter(s => s.route_id === r.id),
  }))

  return NextResponse.json({ routes: enriched, date })
}
