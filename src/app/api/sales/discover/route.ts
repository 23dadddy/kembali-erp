import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

// Bali areas with lat/lng center points for nearby search
const BALI_AREAS = [
  { name: 'Seminyak',   lat: -8.6897, lng: 115.1635 },
  { name: 'Canggu',     lat: -8.6478, lng: 115.1385 },
  { name: 'Ubud',       lat: -8.5069, lng: 115.2625 },
  { name: 'Kuta',       lat: -8.7195, lng: 115.1686 },
  { name: 'Sanur',      lat: -8.7015, lng: 115.2621 },
  { name: 'Nusa Dua',   lat: -8.8004, lng: 115.2327 },
  { name: 'Jimbaran',   lat: -8.7795, lng: 115.1648 },
  { name: 'Uluwatu',    lat: -8.8292, lng: 115.0849 },
  { name: 'Berawa',     lat: -8.6579, lng: 115.1281 },
  { name: 'Legian',     lat: -8.7014, lng: 115.1666 },
  { name: 'Denpasar',   lat: -8.6705, lng: 115.2126 },
]

const BUSINESS_TYPES = [
  { type: 'lodging',     label: 'Hotel' },
  { type: 'restaurant',  label: 'Restaurant' },
  { type: 'spa',         label: 'Spa' },
  { type: 'gym',         label: 'Gym' },
  { type: 'cafe',        label: 'Café' },
]

async function searchPlaces(lat: number, lng: number, type: string, radius = 2000): Promise<any[]> {
  if (!MAPS_KEY || MAPS_KEY === 'YOUR_GOOGLE_MAPS_API_KEY_HERE') return []
  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&type=${type}&key=${MAPS_KEY}`
  try {
    const res = await fetch(url)
    const data = await res.json()
    return data.results ?? []
  } catch {
    return []
  }
}

export async function POST(req: NextRequest) {
  const { areas = BALI_AREAS.map(a => a.name), types = BUSINESS_TYPES.map(t => t.type) } = await req.json().catch(() => ({}))

  if (!MAPS_KEY || MAPS_KEY === 'YOUR_GOOGLE_MAPS_API_KEY_HERE') {
    return NextResponse.json({ error: 'Google Maps API key not configured', setup_required: true }, { status: 400 })
  }

  // Load existing business names to deduplicate
  const { data: existing } = await sb.from('sales_leads').select('company_name, address')
  const existingNames = new Set((existing ?? []).map((l: any) => l.company_name.toLowerCase().trim()))

  const discovered: any[] = []
  const selectedAreas = BALI_AREAS.filter(a => areas.includes(a.name))
  const selectedTypes = BUSINESS_TYPES.filter(t => types.includes(t.type))

  for (const area of selectedAreas) {
    for (const btype of selectedTypes) {
      const results = await searchPlaces(area.lat, area.lng, btype.type)
      for (const place of results) {
        const name = place.name?.trim()
        if (!name) continue
        if (existingNames.has(name.toLowerCase())) continue

        discovered.push({
          company_name: name,
          business_type: btype.label,
          area: area.name,
          address: place.vicinity ?? null,
          lat: place.geometry?.location?.lat ?? null,
          lng: place.geometry?.location?.lng ?? null,
          stage: 'prospect',
          priority: place.rating >= 4.5 ? 'high' : place.rating >= 4.0 ? 'medium' : 'low',
          source: 'Google Places',
          notes: place.rating ? `Google rating: ${place.rating} (${place.user_ratings_total ?? 0} reviews)` : null,
          google_place_id: place.place_id,
        })

        existingNames.add(name.toLowerCase())
      }
      // small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 100))
    }
  }

  return NextResponse.json({ discovered, count: discovered.length })
}

export async function PUT(req: NextRequest) {
  // Bulk insert selected discovered leads
  const { leads } = await req.json()
  if (!Array.isArray(leads) || leads.length === 0) {
    return NextResponse.json({ error: 'No leads provided' }, { status: 400 })
  }

  const toInsert = leads.map(({ google_place_id, ...l }: any) => l)
  const { error, data } = await sb.from('sales_leads').insert(toInsert).select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ inserted: data?.length ?? 0 })
}
