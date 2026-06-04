/**
 * GET /api/whatsapp/status
 *
 * Returns Twilio connection status and optionally validates credentials
 * by making a lightweight API call to Twilio.
 *
 * Query params:
 *   ?test=1   → Actually calls Twilio API to verify credentials
 */

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const test = req.nextUrl.searchParams.get('test') === '1'

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_WHATSAPP_FROM

  const configured = !!(accountSid && authToken && from)

  if (!configured) {
    return NextResponse.json({
      connected: false,
      configured: false,
      missing: [
        !accountSid && 'TWILIO_ACCOUNT_SID',
        !authToken && 'TWILIO_AUTH_TOKEN',
        !from && 'TWILIO_WHATSAPP_FROM',
      ].filter(Boolean),
      message: 'Twilio environment variables not set',
    })
  }

  if (!test) {
    // Just report env vars are present, don't call Twilio
    return NextResponse.json({
      connected: true,
      configured: true,
      from,
      accountSid: accountSid.slice(0, 8) + '...',
      message: 'Twilio credentials configured',
    })
  }

  // Test mode — actually call Twilio to verify credentials
  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        },
      }
    )
    const data = await res.json()

    if (!res.ok) {
      return NextResponse.json({
        connected: false,
        configured: true,
        error: data.message ?? 'Invalid credentials',
        message: 'Twilio credentials are invalid',
      })
    }

    return NextResponse.json({
      connected: true,
      configured: true,
      from,
      accountSid: accountSid.slice(0, 8) + '...',
      accountName: data.friendly_name,
      accountStatus: data.status,
      message: `Connected as "${data.friendly_name}"`,
    })
  } catch (e: any) {
    return NextResponse.json({
      connected: false,
      configured: true,
      error: e.message,
      message: 'Could not reach Twilio API',
    })
  }
}
