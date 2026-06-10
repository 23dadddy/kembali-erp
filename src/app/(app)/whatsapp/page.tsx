'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Topbar } from '@/components/layout/topbar'
import {
  Search, Loader2, X, Send, MessageCircle, Plus, Phone,
  MoreHorizontal, ChevronLeft, Smile, CheckCheck, Settings,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useLanguage } from '@/components/providers/language-provider'

// ─── Types ────────────────────────────────────────────────────────────────────

interface WAConversation {
  id: string; phone: string; contact_name: string | null; customer_id: string | null
  last_message: string | null; last_message_at: string | null; unread_count: number
  customer?: { name: string } | null
}

interface WAMessage {
  id: string; conversation_id: string; direction: 'inbound' | 'outbound'
  body: string; status: string; created_at: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'
}
const AV_COLORS = ['#1a73e8','#d93025','#1e8e3e','#e37400','#7627bb','#0097a7','#c62828','#00897b','#3949ab','#6d4c41']
function avColor(s: string) {
  let h = 0; for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h)
  return AV_COLORS[Math.abs(h) % AV_COLORS.length]
}
function waTime(ts: string) {
  const d = new Date(ts), now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 86400000 && now.getDate() === d.getDate()) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  if (diff < 86400000 * 7) return d.toLocaleDateString('en-US', { weekday: 'short' })
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

// ─── Colour palette ───────────────────────────────────────────────────────────
const G = '#25D366', DARK = '#111b21', MID = '#202c33', PANEL = '#0b141a'
const BOUT = '#005c4b', BIN = '#202c33', TEXT = '#e9edef', MUTED = '#8696a0'

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WhatsAppPage() {
  const { t } = useLanguage()
  const [conversations, setConversations] = useState<WAConversation[]>([])
  const [selected, setSelected] = useState<WAConversation | null>(null)
  const [messages, setMessages] = useState<WAMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [msgInput, setMsgInput] = useState('')
  const [sending, setSending] = useState(false)
  const [search, setSearch] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [newPhone, setNewPhone] = useState('')
  const [newName, setNewName] = useState('')
  const [customers, setCustomers] = useState<any[]>([])
  const [newCustomerId, setNewCustomerId] = useState('')
  const [showBroadcast, setShowBroadcast] = useState(false)
  const [broadcastMsg, setBroadcastMsg] = useState('')
  const [broadcasting, setBroadcasting] = useState(false)
  const [broadcastResult, setBroadcastResult] = useState<{ sent: number; failed: number } | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const sb = createClient()

  const loadConversations = useCallback(async () => {
    setLoading(true)
    const { data } = await sb.from('whatsapp_conversations')
      .select('*, customer:customers(name)')
      .order('last_message_at', { ascending: false, nullsFirst: false })
    setConversations(data ?? [])
    setLoading(false)
  }, [])

  const loadMessages = useCallback(async (convId: string) => {
    setLoadingMsgs(true)
    const { data } = await sb.from('whatsapp_messages').select('*').eq('conversation_id', convId).order('created_at', { ascending: true })
    setMessages(data ?? [])
    setLoadingMsgs(false)
    await sb.from('whatsapp_conversations').update({ unread_count: 0 }).eq('id', convId)
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, unread_count: 0 } : c))
  }, [])

  useEffect(() => { loadConversations() }, [loadConversations])
  useEffect(() => { if (selected) loadMessages(selected.id) }, [selected, loadMessages])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // Realtime messages
  useEffect(() => {
    if (!selected) return
    const sb2 = createClient()
    const channel = sb2
      .channel(`wa-page-${selected.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'whatsapp_messages', filter: `conversation_id=eq.${selected.id}` }, payload => {
        setMessages(prev => [...prev, payload.new as WAMessage])
      })
      .subscribe()
    return () => { sb2.removeChannel(channel) }
  }, [selected?.id])

  // Realtime new conversations
  useEffect(() => {
    const sb3 = createClient()
    const channel = sb3
      .channel('wa-convs-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_conversations' }, () => { loadConversations() })
      .subscribe()
    return () => { sb3.removeChannel(channel) }
  }, [loadConversations])

  useEffect(() => {
    sb.from('customers').select('id, name').eq('active', true).order('name').then(({ data }) => setCustomers(data ?? []))
  }, [])

  const sendMessage = async () => {
    if (!msgInput.trim() || !selected || sending) return
    setSending(true)
    const body = msgInput.trim()
    setMsgInput('')
    const optimistic: WAMessage = { id: crypto.randomUUID(), conversation_id: selected.id, direction: 'outbound', body, status: 'sending', created_at: new Date().toISOString() }
    setMessages(prev => [...prev, optimistic])
    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: selected.id, to: selected.phone, body }),
      })
      const data = await res.json()
      if (data.ok) {
        setMessages(prev => prev.map(m => m.id === optimistic.id ? { ...m, id: data.id, status: 'sent' } : m))
        setConversations(prev => prev.map(c => c.id === selected.id ? { ...c, last_message: body, last_message_at: new Date().toISOString() } : c))
      } else {
        setMessages(prev => prev.map(m => m.id === optimistic.id ? { ...m, status: 'failed' } : m))
      }
    } catch {
      setMessages(prev => prev.map(m => m.id === optimistic.id ? { ...m, status: 'failed' } : m))
    }
    setSending(false)
  }

  const createConversation = async () => {
    if (!newPhone.trim()) return
    const { data } = await sb.from('whatsapp_conversations').insert({
      phone: newPhone.trim().startsWith('+') ? newPhone.trim() : `+${newPhone.trim()}`,
      contact_name: newName.trim() || null,
      customer_id: newCustomerId || null,
    }).select('*, customer:customers(name)').single()
    if (data) { setConversations(prev => [data, ...prev]); setSelected(data); setMessages([]) }
    setShowNew(false); setNewPhone(''); setNewName(''); setNewCustomerId('')
  }

  const sendBroadcast = async () => {
    if (!broadcastMsg.trim() || broadcasting) return
    setBroadcasting(true)
    try {
      const res = await fetch('/api/whatsapp/broadcast', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: broadcastMsg }),
      })
      const data = await res.json()
      setBroadcastResult({ sent: data.sent, failed: data.failed })
      setBroadcastMsg('')
      await loadConversations()
    } finally { setBroadcasting(false) }
  }

  const filtered = conversations.filter(c => {
    const s = search.toLowerCase()
    return !s || c.contact_name?.toLowerCase().includes(s) || c.phone.includes(s) || (c.customer as any)?.name?.toLowerCase().includes(s)
  })

  const totalUnread = conversations.reduce((s, c) => s + (c.unread_count ?? 0), 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <Topbar title={`WhatsApp${totalUnread > 0 ? ` (${totalUnread})` : ''}`} />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', background: DARK, fontFamily: 'Segoe UI, Helvetica Neue, sans-serif', minHeight: 0 }}>

        {/* ── Left panel — conversations ────────────────────────────────── */}
        <div style={{ width: 360, flexShrink: 0, display: 'flex', flexDirection: 'column', background: PANEL, borderRight: `1px solid ${MID}` }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: MID, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 40, height: 40, background: G, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <MessageCircle size={20} color="#fff" />
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: TEXT }}>WhatsApp</p>
                <p style={{ margin: 0, fontSize: 12, color: MUTED }}>{t('whatsapp_kembali_biz')}</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={() => { setShowBroadcast(true); setBroadcastResult(null) }}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 8, borderRadius: '50%', display: 'flex' }} title="Broadcast to all">
                <Send size={18} color={MUTED} />
              </button>
              <button onClick={() => setShowNew(true)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 8, borderRadius: '50%', display: 'flex' }} title="New conversation">
                <Plus size={20} color={MUTED} />
              </button>
            </div>
          </div>

          {/* Search */}
          <div style={{ padding: '8px 12px', background: PANEL, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', background: MID, borderRadius: 8, padding: '6px 12px', gap: 8 }}>
              <Search size={16} color={MUTED} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('whatsapp_search')}
                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 14, color: TEXT, fontFamily: 'inherit' }} />
            </div>
          </div>

          {/* Conversations list */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
                <Loader2 size={22} color={MUTED} className="animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 28, textAlign: 'center', color: MUTED, fontSize: 14 }}>
                <MessageCircle size={44} color={MID} style={{ margin: '0 auto 10px' }} />
                <p style={{ margin: 0, fontWeight: 500 }}>{t('whatsapp_no_convs')}</p>
                <p style={{ margin: '6px 0 16px', fontSize: 12 }}>{t('whatsapp_start_hint')}</p>
                <button onClick={() => setShowNew(true)}
                  style={{ background: G, border: 'none', color: '#fff', borderRadius: 20, padding: '10px 20px', cursor: 'pointer', fontSize: 14, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Plus size={16} /> {t('whatsapp_new_chat')}
                </button>
              </div>
            ) : filtered.map(conv => {
              const name = conv.contact_name || (conv.customer as any)?.name || conv.phone
              const isActive = selected?.id === conv.id
              return (
                <div key={conv.id} onClick={() => setSelected(conv)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer', background: isActive ? MID : 'transparent', borderBottom: `1px solid rgba(255,255,255,0.04)`, transition: 'background 0.1s' }}
                  onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.04)' }}
                  onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}>
                  <div style={{ width: 49, height: 49, background: avColor(name), borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 18, fontWeight: 600, color: '#fff' }}>
                    {initials(name)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
                      <span style={{ fontSize: 15, fontWeight: 500, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 190 }}>{name}</span>
                      {conv.last_message_at && <span style={{ fontSize: 12, color: conv.unread_count > 0 ? G : MUTED, flexShrink: 0 }}>{waTime(conv.last_message_at)}</span>}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 13, color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 230 }}>{conv.last_message || conv.phone}</span>
                      {conv.unread_count > 0 && (
                        <span style={{ background: G, color: '#fff', borderRadius: '50%', minWidth: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0, padding: '0 4px' }}>{conv.unread_count}</span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Right panel — chat window ────────────────────────────────── */}
        {!selected ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#222e35', gap: 20 }}>
            <div style={{ width: 180, height: 180, background: MID, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <MessageCircle size={72} color={MUTED} />
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: TEXT, fontSize: 28, fontWeight: 300, margin: '0 0 8px' }}>{t('whatsapp_biz_title')}</p>
              <p style={{ color: MUTED, fontSize: 14, margin: 0, maxWidth: 380, lineHeight: 1.6 }}>
                {t('whatsapp_send_receive')}<br />
                {t('whatsapp_select_conv')}
              </p>
            </div>

            {/* Setup box — always shown so user knows what's needed */}
            <div style={{ background: '#1a2229', borderRadius: 12, padding: '16px 20px', maxWidth: 440, border: '1px solid #2a3942', width: '100%', marginTop: 8 }}>
              <p style={{ color: '#f6bf26', fontSize: 13, margin: '0 0 8px', fontWeight: 600 }}>{t('whatsapp_setup_title')}</p>
              {[
                { label: 'Add TWILIO_ACCOUNT_SID to Vercel env vars', key: 'twilio_sid' },
                { label: 'Add TWILIO_AUTH_TOKEN to Vercel env vars', key: 'twilio_auth' },
                { label: 'Add TWILIO_WHATSAPP_FROM (e.g. whatsapp:+14155238886)', key: 'twilio_from' },
                { label: 'Set Twilio webhook → /api/whatsapp/webhook', key: 'webhook' },
              ].map(item => (
                <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${MUTED}`, flexShrink: 0 }} />
                  <span style={{ color: MUTED, fontSize: 12 }}>{item.label}</span>
                </div>
              ))}
              <Link href="/settings" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8, color: G, fontSize: 13, textDecoration: 'none', fontWeight: 500 }}>
                <Settings size={14} /> Open Settings →
              </Link>
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Chat header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: MID, flexShrink: 0, borderBottom: `1px solid rgba(255,255,255,0.05)` }}>
              <button onClick={() => setSelected(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}>
                <ChevronLeft size={20} color={MUTED} />
              </button>
              <div style={{ width: 40, height: 40, background: avColor(selected.contact_name || selected.phone), borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 600, color: '#fff', flexShrink: 0 }}>
                {initials(selected.contact_name || (selected.customer as any)?.name || selected.phone)}
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 500, color: TEXT }}>
                  {selected.contact_name || (selected.customer as any)?.name || selected.phone}
                </p>
                <p style={{ margin: 0, fontSize: 12, color: MUTED }}>{selected.phone}</p>
              </div>
              {[Phone, Search, MoreHorizontal].map((Icon, i) => (
                <button key={i} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 8, borderRadius: '50%', display: 'flex' }}>
                  <Icon size={20} color={MUTED} />
                </button>
              ))}
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 8px', display: 'flex', flexDirection: 'column', gap: 2, background: '#0b141a' }}>
              {loadingMsgs ? (
                <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}>
                  <Loader2 size={26} color={MUTED} className="animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <div style={{ textAlign: 'center', color: MUTED, fontSize: 13, marginTop: 40 }}>
                  No messages yet. Say hi! 👋
                </div>
              ) : messages.map((msg, i) => {
                const isOut = msg.direction === 'outbound'
                const showDate = i === 0 || new Date(msg.created_at).toDateString() !== new Date(messages[i - 1].created_at).toDateString()
                return (
                  <div key={msg.id}>
                    {showDate && (
                      <div style={{ display: 'flex', justifyContent: 'center', margin: '10px 0 6px' }}>
                        <span style={{ background: '#182229', color: MUTED, fontSize: 12, padding: '4px 14px', borderRadius: 8 }}>
                          {new Date(msg.created_at).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                        </span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: isOut ? 'flex-end' : 'flex-start', marginBottom: 2 }}>
                      <div style={{ maxWidth: '65%', background: isOut ? BOUT : BIN, borderRadius: isOut ? '8px 0 8px 8px' : '0 8px 8px 8px', padding: '6px 10px 8px', boxShadow: '0 1px 2px rgba(0,0,0,0.2)' }}>
                        <p style={{ margin: 0, fontSize: 14.5, color: TEXT, lineHeight: 1.5, wordBreak: 'break-word' }}>{msg.body}</p>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 4, marginTop: 3 }}>
                          <span style={{ fontSize: 11, color: MUTED }}>{waTime(msg.created_at)}</span>
                          {isOut && (
                            msg.status === 'sending' ? <span style={{ fontSize: 11, color: MUTED }}>🕐</span>
                            : msg.status === 'failed' ? <span title="Failed to send">⚠️</span>
                            : <CheckCheck size={14} color="#53bdeb" />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>

            {/* Input bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: MID, flexShrink: 0 }}>
              <button style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 6, display: 'flex' }}>
                <Smile size={22} color={MUTED} />
              </button>
              <div style={{ flex: 1, background: '#2a3942', borderRadius: 10, display: 'flex', alignItems: 'center', padding: '8px 14px' }}>
                <input
                  value={msgInput}
                  onChange={e => setMsgInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                  placeholder={t('whatsapp_type_message')}
                  style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 15, color: TEXT, fontFamily: 'inherit' }}
                  autoFocus
                />
              </div>
              <button onClick={sendMessage} disabled={!msgInput.trim() || sending}
                style={{ background: G, border: 'none', cursor: msgInput.trim() ? 'pointer' : 'default', padding: 11, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: msgInput.trim() ? 1 : 0.5, transition: 'opacity 0.15s', flexShrink: 0 }}>
                {sending ? <Loader2 size={20} color="#fff" className="animate-spin" /> : <Send size={20} color="#fff" />}
              </button>
            </div>
          </div>
        )}

        {/* ── Broadcast modal ──────────────────────────────────────────── */}
        {showBroadcast && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
            <div style={{ background: '#233138', borderRadius: 14, padding: 28, width: 460, boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <h3 style={{ margin: 0, color: TEXT, fontSize: 18, fontWeight: 600 }}>📢 {t('whatsapp_broadcast_title')}</h3>
                <button onClick={() => setShowBroadcast(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4 }}>
                  <X size={20} color={MUTED} />
                </button>
              </div>
              <p style={{ color: MUTED, fontSize: 13, margin: '0 0 16px', lineHeight: 1.5 }}>
                Send a message to <strong style={{ color: TEXT }}>{conversations.length} conversation{conversations.length !== 1 ? 's' : ''}</strong>. Use for announcements, promotions, delivery updates, etc.
              </p>
              <textarea value={broadcastMsg} onChange={e => setBroadcastMsg(e.target.value)}
                placeholder={t('whatsapp_type_message')}
                rows={5}
                style={{ width: '100%', background: '#2a3942', border: '1px solid #3a4a54', borderRadius: 10, padding: '12px 14px', color: TEXT, fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical' }} />
              {broadcastResult && (
                <div style={{ background: broadcastResult.failed > 0 ? '#2d1f1f' : '#1a2d1f', borderRadius: 8, padding: '10px 14px', marginTop: 12 }}>
                  <p style={{ margin: 0, fontSize: 13, color: broadcastResult.failed > 0 ? '#f6bf26' : G }}>
                    ✅ Sent to {broadcastResult.sent} contacts{broadcastResult.failed > 0 ? ` · ❌ ${broadcastResult.failed} failed` : ''}
                  </p>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
                <button onClick={() => setShowBroadcast(false)}
                  style={{ padding: '10px 22px', borderRadius: 8, background: 'transparent', border: '1px solid #3a4a54', color: MUTED, cursor: 'pointer', fontSize: 14 }}>
                  {t('cancel')}
                </button>
                <button onClick={sendBroadcast} disabled={!broadcastMsg.trim() || broadcasting}
                  style={{ padding: '10px 22px', borderRadius: 8, background: G, border: 'none', color: '#fff', cursor: broadcastMsg.trim() && !broadcasting ? 'pointer' : 'default', fontSize: 14, fontWeight: 600, opacity: broadcastMsg.trim() && !broadcasting ? 1 : 0.5, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {broadcasting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} {t('whatsapp_send_broadcast')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── New conversation modal ───────────────────────────────────── */}
        {showNew && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
            <div style={{ background: '#233138', borderRadius: 14, padding: 28, width: 420, boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h3 style={{ margin: 0, color: TEXT, fontSize: 18, fontWeight: 600 }}>{t('whatsapp_new_conv')}</h3>
                <button onClick={() => setShowNew(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4 }}>
                  <X size={20} color={MUTED} />
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, color: MUTED, marginBottom: 5 }}>{t('whatsapp_number_label')}</label>
                  <input value={newPhone} onChange={e => setNewPhone(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') createConversation() }}
                    placeholder="+628123456789"
                    style={{ width: '100%', background: '#2a3942', border: '1px solid #3a4a54', borderRadius: 8, padding: '11px 14px', color: TEXT, fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: MUTED }}>{t('whatsapp_country_hint')}</p>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, color: MUTED, marginBottom: 5 }}>{t('whatsapp_contact_name')}</label>
                  <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Budi Santoso"
                    style={{ width: '100%', background: '#2a3942', border: '1px solid #3a4a54', borderRadius: 8, padding: '11px 14px', color: TEXT, fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, color: MUTED, marginBottom: 5 }}>{t('whatsapp_link_customer')}</label>
                  <select value={newCustomerId} onChange={e => setNewCustomerId(e.target.value)}
                    style={{ width: '100%', background: '#2a3942', border: '1px solid #3a4a54', borderRadius: 8, padding: '11px 14px', color: newCustomerId ? TEXT : MUTED, fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}>
                    <option value="">{t('whatsapp_no_customer')}</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
                  <button onClick={() => setShowNew(false)}
                    style={{ padding: '10px 22px', borderRadius: 8, background: 'transparent', border: '1px solid #3a4a54', color: MUTED, cursor: 'pointer', fontSize: 14 }}>
                    {t('cancel')}
                  </button>
                  <button onClick={createConversation} disabled={!newPhone.trim()}
                    style={{ padding: '10px 22px', borderRadius: 8, background: G, border: 'none', color: '#fff', cursor: newPhone.trim() ? 'pointer' : 'default', fontSize: 14, fontWeight: 600, opacity: newPhone.trim() ? 1 : 0.5 }}>
                    {t('whatsapp_start_chat')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
