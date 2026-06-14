import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const isVercelCron = req.headers.get('x-vercel-cron') === '1'
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization')

  if (!isVercelCron && cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const baseUrl = `https://${req.headers.get('host')}`

  // Run discovery across all Bali areas and business types
  const res = await fetch(`${baseUrl}/api/sales/discover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}), // uses all defaults (all areas, all types)
  })

  const result = await res.json()

  return NextResponse.json({
    message: 'Monthly lead scrape complete',
    date: new Date().toISOString().split('T')[0],
    ...result,
  })
}
