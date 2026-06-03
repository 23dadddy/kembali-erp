import { NextRequest, NextResponse } from 'next/server'
import { gmailFetch, encodeBase64 } from '@/lib/gmail'

export async function POST(req: NextRequest) {
  const { to, subject, body, threadId, inReplyTo, references } = await req.json()

  if (!to || !body) return NextResponse.json({ error: 'Missing to or body' }, { status: 400 })

  // Build RFC 2822 email
  const lines = [
    `From: Kembali Water <contact@kembaliwater.com>`,
    `To: ${to}`,
    `Subject: ${subject || '(no subject)'}`,
    `Content-Type: text/plain; charset=utf-8`,
  ]
  if (inReplyTo) lines.push(`In-Reply-To: ${inReplyTo}`)
  if (references) lines.push(`References: ${references}`)
  lines.push('', body, '', '-- ', 'Kembali Water')

  const raw = encodeBase64(lines.join('\r\n'))

  try {
    const payload: any = { raw }
    if (threadId) payload.threadId = threadId

    const sent = await gmailFetch('/messages/send', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    return NextResponse.json({ ok: true, id: sent.id, threadId: sent.threadId })
  } catch (err: any) {
    if (err.message === 'Not authenticated') {
      return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
    }
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
