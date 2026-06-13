import { NextRequest, NextResponse } from 'next/server'
import { gmailFetch, getHeader, extractBody } from '@/lib/gmail'

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  try {
    const thread = await gmailFetch(`/threads/${id}?format=full`)
    const messages = (thread.messages ?? []).map((msg: any) => {
      const headers = msg.payload?.headers ?? []
      const { text, html } = extractBody(msg.payload)
      return {
        id: msg.id,
        threadId: msg.threadId,
        labelIds: msg.labelIds ?? [],
        snippet: msg.snippet,
        internalDate: msg.internalDate,
        subject: getHeader(headers, 'Subject'),
        from: getHeader(headers, 'From'),
        to: getHeader(headers, 'To'),
        date: getHeader(headers, 'Date'),
        messageId: getHeader(headers, 'Message-ID'),
        inReplyTo: getHeader(headers, 'In-Reply-To'),
        body: text,
        htmlBody: html,
        unread: msg.labelIds?.includes('UNREAD'),
      }
    })

    // Mark thread as read
    try {
      await gmailFetch(`/threads/${id}/modify`, {
        method: 'POST',
        body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
      })
    } catch { /* non-fatal */ }

    return NextResponse.json({ id: thread.id, messages })
  } catch (err: any) {
    if (err.message === 'Not authenticated') {
      return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
    }
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  const action = req.nextUrl.searchParams.get('action')
  if (!id || !action) return NextResponse.json({ error: 'Missing params' }, { status: 400 })

  try {
    const labelMap: Record<string, { addLabelIds?: string[]; removeLabelIds?: string[] }> = {
      star:         { addLabelIds: ['STARRED'] },
      unstar:       { removeLabelIds: ['STARRED'] },
      mark_read:    { removeLabelIds: ['UNREAD'] },
      mark_unread:  { addLabelIds: ['UNREAD'] },
    }
    const body = labelMap[action]
    if (!body) return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    await gmailFetch(`/threads/${id}/modify`, { method: 'POST', body: JSON.stringify(body) })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  const action = req.nextUrl.searchParams.get('action') ?? 'archive'
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  try {
    if (action === 'trash') {
      await gmailFetch(`/threads/${id}/trash`, { method: 'POST' })
    } else {
      // Archive = remove INBOX label
      await gmailFetch(`/threads/${id}/modify`, {
        method: 'POST',
        body: JSON.stringify({ removeLabelIds: ['INBOX'] }),
      })
    }
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
