import { NextRequest, NextResponse } from 'next/server'
import { gmailFetch, encodeBase64 } from '@/lib/gmail'

interface Attachment {
  name: string
  type: string
  data: string  // base64-encoded content
  size: number
}

function buildMimeEmail(params: {
  to: string; cc?: string; bcc?: string; subject: string; body: string
  from?: string; inReplyTo?: string; references?: string; attachments?: Attachment[]
}): string {
  const { to, cc, bcc, subject, body, from = 'Kembali Water <contact@kembaliwater.com>', inReplyTo, references, attachments } = params
  const hasAttachments = attachments && attachments.length > 0

  const baseHeaders = [
    `From: ${from}`, `To: ${to}`,
    ...(cc ? [`Cc: ${cc}`] : []),
    ...(bcc ? [`Bcc: ${bcc}`] : []),
    `Subject: ${subject}`, `MIME-Version: 1.0`,
    ...(inReplyTo ? [`In-Reply-To: ${inReplyTo}`] : []),
    ...(references ? [`References: ${references}`] : []),
  ]

  if (!hasAttachments) {
    const lines = [...baseHeaders, `Content-Type: text/plain; charset=utf-8`, `Content-Transfer-Encoding: quoted-printable`, '', body]
    return lines.join('\r\n')
  }

  const boundary = `KembaliWater_${Date.now()}_${Math.random().toString(36).slice(2)}`
  const headers = [...baseHeaders, `Content-Type: multipart/mixed; boundary="${boundary}"`]
  const parts: string[] = []

  parts.push([`--${boundary}`, `Content-Type: text/plain; charset=utf-8`, `Content-Transfer-Encoding: quoted-printable`, '', body].join('\r\n'))

  for (const att of attachments!) {
    const b64Lines = att.data.match(/.{1,76}/g)?.join('\r\n') ?? att.data
    parts.push([`--${boundary}`, `Content-Type: ${att.type}; name="${att.name}"`, `Content-Transfer-Encoding: base64`, `Content-Disposition: attachment; filename="${att.name}"`, '', b64Lines].join('\r\n'))
  }
  parts.push(`--${boundary}--`)
  return headers.join('\r\n') + '\r\n\r\n' + parts.join('\r\n')
}

export async function POST(req: NextRequest) {
  const { to, cc, bcc, subject, body, threadId, inReplyTo, references, attachments } = await req.json()
  if (!to || !body) return NextResponse.json({ error: 'Missing to or body' }, { status: 400 })
  const mimeEmail = buildMimeEmail({ to, cc, bcc, subject: subject || '(no subject)', body, inReplyTo, references, attachments })
  const raw = encodeBase64(mimeEmail)

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
