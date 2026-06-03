import { NextRequest, NextResponse } from 'next/server'
import { gmailFetch, getHeader, extractBody } from '@/lib/gmail'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') ?? 'in:inbox'
  const maxResults = req.nextUrl.searchParams.get('maxResults') ?? '50'
  const pageToken = req.nextUrl.searchParams.get('pageToken') ?? ''

  try {
    // List thread IDs
    const params = new URLSearchParams({ q, maxResults })
    if (pageToken) params.set('pageToken', pageToken)
    const list = await gmailFetch(`/threads?${params}`)

    if (!list.threads?.length) {
      return NextResponse.json({ threads: [], nextPageToken: null })
    }

    // Fetch metadata for each thread (lightweight — just headers)
    const threads = await Promise.all(
      list.threads.map(async (t: { id: string }) => {
        try {
          const thread = await gmailFetch(`/threads/${t.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date&metadataHeaders=To`)
          const msgs = thread.messages ?? []
          const first = msgs[0]
          const last = msgs[msgs.length - 1]
          const firstHeaders = first?.payload?.headers ?? []
          const lastHeaders = last?.payload?.headers ?? []
          const unread = msgs.some((m: any) => m.labelIds?.includes('UNREAD'))
          const starred = msgs.some((m: any) => m.labelIds?.includes('STARRED'))
          const snippet = last?.snippet ?? ''

          return {
            id: thread.id,
            historyId: thread.historyId,
            messageCount: msgs.length,
            subject: getHeader(firstHeaders, 'Subject') || '(no subject)',
            from: getHeader(lastHeaders, 'From') || getHeader(firstHeaders, 'From'),
            to: getHeader(firstHeaders, 'To'),
            date: getHeader(lastHeaders, 'Date'),
            internalDate: last?.internalDate ?? first?.internalDate,
            snippet,
            unread,
            starred,
            labelIds: [...new Set(msgs.flatMap((m: any) => m.labelIds ?? []))],
          }
        } catch {
          return null
        }
      })
    )

    return NextResponse.json({
      threads: threads.filter(Boolean),
      nextPageToken: list.nextPageToken ?? null,
    })
  } catch (err: any) {
    if (err.message === 'Not authenticated') {
      return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
    }
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
