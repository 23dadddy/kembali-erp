/**
 * Driver GPS tracking
 *
 * POST — driver portal / mobile app sends position every ~30s:
 *   { driverId, lat, lng, heading?, speed_kmh?, accuracy_m? }
 *
 * GET — dispatch map polls latest positions for all drivers (with staff names)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const { driverId, lat, lng, heading, speed_kmh, accuracy_m } = await req.json()
  if (!driverId || lat == null || lng == null) {
    return NextResponse.json({ error: 'driverId, lat, lng required' }, { status: 400 })
  }

  const now = new Date().toISOString()

  const { error } = await sb.from('driver_locations').upsert({
    driver_id: driverId,
    lat, lng,
    heading: heading ?? null,
    speed_kmh: speed_kmh ?? null,
    accuracy_m: accuracy_m ?? null,
    recorded_at: now,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Best-effort history point (for playback / performance analytics)
  sb.from('driver_location_history').insert({ driver_id: driverId, lat, lng, recorded_at: now })
    .then(() => null, () => null)

  return NextResponse.json({ ok: true })
}

export async function GET() {
  // Positions older than 10 minutes are considered offline
  const cutoff = new Date(Date.now() - 10 * 60000).toISOString()
  const { data, error } = await sb
    .from('driver_locations')
    .select('driver_id, lat, lng, heading, speed_kmh, recorded_at, driver:staff(name, role)')
    .gte('recorded_at', cutoff)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ drivers: data ?? [] })
}
