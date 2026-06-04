import { NextRequest, NextResponse } from 'next/server'
import { gmailFetch, encodeBase64 } from '@/lib/gmail'

interface Attachment {
  name: string
  type: string
  data: string  // base64-encoded content
  size: number
}

function buildMimeEmail(params: {
  to: string
  subject: string
  body: string
  from?: string
  inReplyTo?: string
  references?: string
  attachments?: Attachment[]
}): string {
  const { to, subject, body, from = 'Kembali Water <contact@kembaliwater.com>', inReplyTo, references, attachments } = params

  const hasAttachments = attachments && attachments.length > 0

  if (!hasAttachments) {
    // Plain text email — simple RFC 2822
    const lines = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/plain; charset=utf-8`,
      `Content-Transfer-Encoding: quoted-printable`,
    ]
    if (inReplyTo) lines.push(`In-Reply-To: ${inReplyTo}`)
    if (references) lines.push(`References: ${references}`)
    const fullBody = `${body}\r\n\r\n-- \r\nKembali Water`
    lines.push('', fullBody)
    return lines.join('\r\n')
  }

  // Multipart/mixed for attachments
  const boundary = `KembaliWater_${Date.now()}_${Math.random().toString(36).slice(2)}`

  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
  ]
  if (inReplyTo) headers.push(`In-Reply-To: ${inReplyTo}`)
  if (references) headers.push(`References: ${references}`)

  const parts: string[] = []

  // Body part
  const fullBody = `${body}\r\n\r\n-- \r\nKembali Water`
  parts.push([
    `--${boundary}`,
    `Content-Type: text/plain; charset=utf-8`,
    `Content-Transfer-Encoding: quoted-printable`,
    '',
    fullBody,
  ].join('\r\n'))

  // Attachment parts
  for (const att of attachments) {
    // Split base64 into 76-char lines (MIME standard)
    const b64Lines = att.data.match(/.{1,76}/g)?.join('\r\n') ?? att.data
    parts.push([
      `--${boundary}`,
      `Content-Type: ${att.type}; name="${att.name}"`,
      `Content-Transfer-Encoding: base64`,
      `Content-Disposition: attachment; filename="${att.name}"`,
      '',
      b64Lines,
    ].join('\r\n'))
  }

  // Closing boundary
  parts.push(`--${boundary}--`)

  return headers.join('\r\n') + '\r\n\r\n' + parts.join('\r\n')
}

export async function POST(req: NextRequest) {
  const { to, subject, body, threadId, inReplyTo, references, attachments } = await req.json()

  if (!to || !body) return NextResponse.json({ error: 'Missing to or body' }, { status: 400 })

  const mimeEmail = buildMimeEmail({ to, subject: subject || '(no subject)', body, inReplyTo, references, attachments })
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
