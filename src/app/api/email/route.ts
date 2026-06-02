import { NextRequest, NextResponse } from 'next/server'
import { sendInvoiceEmail, sendDeliveryConfirmationEmail, sendOverdueReminderEmail } from '@/lib/email'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { type, payload } = body

  try {
    let result
    if (type === 'invoice') result = await sendInvoiceEmail(payload)
    else if (type === 'delivery_confirmation') result = await sendDeliveryConfirmationEmail(payload)
    else if (type === 'overdue_reminder') result = await sendOverdueReminderEmail(payload)
    else return NextResponse.json({ error: 'Unknown type' }, { status: 400 })

    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
