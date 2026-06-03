import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const GMAIL_ACCOUNT = 'contact@kembaliwater.com'

export async function getAccessToken(): Promise<string | null> {
  const { data } = await sb.from('gmail_tokens').select('*').eq('email', GMAIL_ACCOUNT).single()
  if (!data) return null

  // Refresh if expiring within 5 minutes
  if (data.expiry_date && data.expiry_date - Date.now() < 5 * 60 * 1000) {
    if (!data.refresh_token) return null
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: data.refresh_token,
        grant_type: 'refresh_token',
      }),
    })
    const tokens = await res.json()
    if (!res.ok) return null
    await sb.from('gmail_tokens').update({
      access_token: tokens.access_token,
      expiry_date: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : null,
      updated_at: new Date().toISOString(),
    }).eq('email', GMAIL_ACCOUNT)
    return tokens.access_token
  }
  return data.access_token
}

export async function gmailFetch(path: string, options: RequestInit = {}) {
  const token = await getAccessToken()
  if (!token) throw new Error('Not authenticated')
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message ?? `Gmail API error ${res.status}`)
  }
  return res.json()
}

export function decodeBase64(str: string): string {
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')
}

export function encodeBase64(str: string): string {
  return Buffer.from(str).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function getHeader(headers: { name: string; value: string }[], name: string): string {
  return headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''
}

export function extractBody(payload: any): { text: string; html: string } {
  let text = '', html = ''

  function walk(part: any) {
    if (!part) return
    const mime = part.mimeType ?? ''
    const data = part.body?.data
    if (mime === 'text/plain' && data) text = decodeBase64(data)
    else if (mime === 'text/html' && data) html = decodeBase64(data)
    else if (mime.startsWith('multipart/') && part.parts) {
      for (const p of part.parts) walk(p)
    }
  }
  walk(payload)
  return { text, html }
}
