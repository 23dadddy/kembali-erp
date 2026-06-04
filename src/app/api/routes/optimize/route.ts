/**
 * POST /api/routes/optimize
 *
 * Takes a route_id, fetches all stops with customer addresses,
 * calls Google Maps Directions API with waypoint optimization,
 * and updates stop_order in the database.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const { routeId, origin } = await req.json()

  if (!routeId) return NextResponse.json({ error: 'routeId required' }, { status: 400 })

  const mapsKey = process.env.GOOGLE_MAPS_API_KEY
  if (!mapsKey) return NextResponse.json({ error: 'GOOGLE_MAPS_API_KEY not configured' }, { status: 500 })

  const supabase = await createClient()

  // Fetch stops with customer addresses
  const { data: stops, error } = await supabase
    .from('route_stops')
    .select('id, stop_order, customers(id, name, address, city)')
    .eq('route_id', routeId)
    .order('stop_order')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!stops || stops.length === 0) return NextResponse.json({ error: 'No stops found' }, { status: 400 })
  if (stops.length < 2) return NextResponse.json({ error: 'Need at least 2 stops to optimize' }, { status: 400 })

  // Build addresses
  const addresses = stops.map((s: any) => {
    const customer = s.customers
    const addr = [customer?.address, customer?.city, 'Bali, Indonesia'].filter(Boolean).join(', ')
    return encodeURIComponent(addr)
  })

  // Use origin if provided, otherwise use first stop as origin
  const startAddress = origin
    ? encodeURIComponent(origin)
    : addresses[0]

  // Waypoints = all stops except origin (we optimize the order)
  const waypoints = addresses.map((a: string) => a).join('|')

  // Call Google Maps Directions API with optimize:true
  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${startAddress}&destination=${startAddress}&waypoints=optimize:true|${waypoints}&mode=driving&key=${mapsKey}`

  const res = await fetch(url)
  const data = await res.json()

  if (data.status !== 'OK') {
    return NextResponse.json({
      error: `Google Maps error: ${data.status} — ${data.error_message ?? 'unknown'}`,
    }, { status: 400 })
  }

  // Google returns the optimized waypoint order as an array of indices
  const optimizedOrder: number[] = data.routes[0].waypoint_order

  // Calculate total distance and duration
  const legs = data.routes[0].legs
  const totalDistance = legs.reduce((sum: number, leg: any) => sum + leg.distance.value, 0)
  const totalDuration = legs.reduce((sum: number, leg: any) => sum + leg.duration.value, 0)

  // Update stop_order in database based on optimized order
  const updates = optimizedOrder.map((originalIndex: number, newOrder: number) => ({
    id: stops[originalIndex].id,
    stop_order: newOrder + 1,
  }))

  for (const update of updates) {
    await supabase
      .from('route_stops')
      .update({ stop_order: update.stop_order })
      .eq('id', update.id)
  }

  // Update route with estimated distance and duration
  await supabase
    .from('routes')
    .update({
      estimated_km: Math.round(totalDistance / 1000 * 10) / 10,
      estimated_duration_mins: Math.round(totalDuration / 60),
    })
    .eq('id', routeId)

  // Build response with the new ordered stops
  const orderedStops = optimizedOrder.map((originalIndex: number, newOrder: number) => ({
    id: stops[originalIndex].id,
    stop_order: newOrder + 1,
    customer: (stops[originalIndex] as any).customers,
    leg: {
      distance: legs[newOrder].distance.text,
      duration: legs[newOrder].duration.text,
    },
  }))

  return NextResponse.json({
    success: true,
    optimizedStops: orderedStops,
    totalDistance: `${Math.round(totalDistance / 1000 * 10) / 10} km`,
    totalDuration: `${Math.round(totalDuration / 60)} min`,
    mapsUrl: data.routes[0].summary,
  })
}
