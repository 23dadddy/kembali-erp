'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard, Users, Package, FileText,
  UserCog, Settings,
  DollarSign, Factory,
  Truck,
  ScrollText, LogOut,
  ShoppingCart, Receipt, BookOpen, Headphones,
  Mail, MessageCircle, MessagesSquare,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useEffect, useState } from 'react'
import { getCustomers, getInvoices, getStaff, getLeads } from '@/lib/db'
import { useLanguage } from '@/components/providers/language-provider'

// ─── Unread badge component ──────────────────────────────────────────────────
function Badge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span className="ml-auto flex-shrink-0 bg-red-500 text-white text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 leading-none">
      {count > 99 ? '99+' : count}
    </span>
  )
}

// ─── Sidebar nav groups ───────────────────────────────────────────────────────
const groups = [
  {
    label: null,
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Orders', href: '/orders', icon: ShoppingCart },
      { label: 'Dispatch', href: '/dispatch', icon: Truck },
      { label: 'Customers', href: '/customers', icon: Users },
      { label: 'Sales', href: '/crm', icon: ScrollText },
      { label: 'Support', href: '/support', icon: Headphones },
      { label: 'Inventory', href: '/inventory', icon: Package },
      { label: 'Production', href: '/production', icon: Factory },
    ],
  },
  {
    label: 'Finance',
    items: [
      { label: 'Billing', href: '/billing', icon: FileText },
      { label: 'Accounting', href: '/accounting', icon: DollarSign },
    ],
  },
  {
    label: 'People & Fleet',
    items: [
      { label: 'People', href: '/people', icon: UserCog },
      { label: 'Fleet', href: '/fleet', icon: Truck },
    ],
  },
]

// Comms items are handled separately so we can attach live badges
const commsItems = [
  { label: 'Email', href: '/communications', icon: Mail, badgeKey: 'email' as const },
  { label: 'WhatsApp', href: '/whatsapp', icon: MessageCircle, badgeKey: 'whatsapp' as const },
  { label: 'Internal Chat', href: '/chat', icon: MessagesSquare, badgeKey: 'chat' as const },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { t } = useLanguage()

  // Live unread counts
  const [waUnread, setWaUnread] = useState(0)
  const [chatUnread, setChatUnread] = useState(0)

  // WhatsApp: sum of unread_count across all conversations
  useEffect(() => {
    const sb = createClient()
    const load = async () => {
      const { data } = await sb.from('whatsapp_conversations').select('unread_count')
      const total = (data ?? []).reduce((s: number, c: any) => s + (c.unread_count ?? 0), 0)
      setWaUnread(total)
    }
    load()
    const ch = sb.channel('sidebar-wa-unread')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_conversations' }, load)
      .subscribe()
    return () => { sb.removeChannel(ch) }
  }, [])

  // Chat: count messages from others since last time user visited /chat
  useEffect(() => {
    const sb = createClient()
    const load = async () => {
      try {
        const lastVisit = localStorage.getItem('chat_last_visit') ?? new Date(0).toISOString()
        const { data: { user } } = await sb.auth.getUser()
        const { data: myStaff } = user
          ? await sb.from('staff').select('id').eq('auth_user_id', user.id).single()
          : { data: null }

        let q = sb.from('chat_messages')
          .select('id', { count: 'exact', head: true })
          .gt('created_at', lastVisit)
          .is('recipient_id', null) // channel messages only (not DMs)

        if (myStaff?.id) q = q.neq('sender_id', myStaff.id)
        else if (user?.id) q = q.neq('sender_id', user.id)

        const { count } = await q
        setChatUnread(count ?? 0)
      } catch { setChatUnread(0) }
    }
    load()
    const ch = sb.channel('sidebar-chat-unread')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, load)
      .subscribe()
    return () => { sb.removeChannel(ch) }
  }, [])

  // When user navigates to /chat, clear the chat badge and update last_visit
  useEffect(() => {
    if (pathname === '/chat') {
      localStorage.setItem('chat_last_visit', new Date().toISOString())
      setChatUnread(0)
    }
    if (pathname === '/whatsapp') {
      // Mark WA conversations as read (handled in the WA page itself)
    }
  }, [pathname])

  // Warm cache
  useEffect(() => {
    const t1 = setTimeout(() => getCustomers(), 200)
    const t2 = setTimeout(() => getInvoices(), 600)
    const t3 = setTimeout(() => getStaff(), 1000)
    const t4 = setTimeout(() => getLeads(), 1400)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4) }
  }, [])

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const badgeCounts: Record<string, number> = {
    email: 0, // Gmail unread handled inside the Gmail tab itself
    whatsapp: waUnread,
    chat: chatUnread,
  }

  return (
    <aside className="w-52 min-h-screen flex flex-col" style={{ background: '#EDE6DC' }}>
      {/* Logo */}
      <div className="px-4 py-5 border-b border-[#D5CEC4]">
        <img src="/logo.png" alt="Kembali Water" className="w-full max-w-[148px]" style={{ filter: 'brightness(0)' }} />
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-4 overflow-y-auto">
        {/* Dashboard */}
        <div className="space-y-0.5">
          {[{ label: t('nav_dashboard'), href: '/dashboard', icon: LayoutDashboard }].map(({ label, href, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/')
            return (
              <Link key={href} href={href} prefetch={true}
                className={cn('flex items-center gap-2.5 px-3 py-1.5 rounded-md font-medium transition-colors', active ? 'text-white' : 'text-[#5A5248] hover:text-[#1A1A1A] hover:bg-[#D9D0C5]')}
                style={active ? { background: '#5BA3A0', fontSize: '13px' } : { fontSize: '13px' }}>
                <Icon className={cn('w-3.5 h-3.5 flex-shrink-0', active ? 'text-white' : 'text-[#8C8078]')} />
                {label}
              </Link>
            )
          })}
        </div>

        {/* Operations */}
        <div>
          <p className="font-semibold text-[#8C8078] uppercase tracking-wider px-3 mb-1" style={{ fontSize: '10px', letterSpacing: '0.08em' }}>{t('nav_operations')}</p>
          <div className="space-y-0.5">
            {[
              { label: t('nav_orders'), href: '/orders', icon: ShoppingCart },
              { label: t('nav_dispatch'), href: '/dispatch', icon: Truck },
              { label: t('nav_customers'), href: '/customers', icon: Users },
              { label: t('nav_sales'), href: '/crm', icon: ScrollText },
              { label: t('nav_support'), href: '/support', icon: Headphones },
              { label: t('nav_inventory'), href: '/inventory', icon: Package },
              { label: t('nav_production'), href: '/production', icon: Factory },
            ].map(({ label, href, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(href + '/')
              return (
                <Link key={href} href={href} prefetch={true}
                  className={cn('flex items-center gap-2.5 px-3 py-1.5 rounded-md font-medium transition-colors', active ? 'text-white' : 'text-[#5A5248] hover:text-[#1A1A1A] hover:bg-[#D9D0C5]')}
                  style={active ? { background: '#5BA3A0', fontSize: '13px' } : { fontSize: '13px' }}>
                  <Icon className={cn('w-3.5 h-3.5 flex-shrink-0', active ? 'text-white' : 'text-[#8C8078]')} />
                  {label}
                </Link>
              )
            })}
          </div>
        </div>

        {/* Finance */}
        <div>
          <p className="font-semibold text-[#8C8078] uppercase tracking-wider px-3 mb-1" style={{ fontSize: '10px', letterSpacing: '0.08em' }}>{t('nav_finance')}</p>
          <div className="space-y-0.5">
            {[
              { label: t('nav_billing'), href: '/billing', icon: FileText },
              { label: t('nav_accounting'), href: '/accounting', icon: DollarSign },
            ].map(({ label, href, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(href + '/')
              return (
                <Link key={href} href={href} prefetch={true}
                  className={cn('flex items-center gap-2.5 px-3 py-1.5 rounded-md font-medium transition-colors', active ? 'text-white' : 'text-[#5A5248] hover:text-[#1A1A1A] hover:bg-[#D9D0C5]')}
                  style={active ? { background: '#5BA3A0', fontSize: '13px' } : { fontSize: '13px' }}>
                  <Icon className={cn('w-3.5 h-3.5 flex-shrink-0', active ? 'text-white' : 'text-[#8C8078]')} />
                  {label}
                </Link>
              )
            })}
          </div>
        </div>

        {/* People & Fleet */}
        <div>
          <p className="font-semibold text-[#8C8078] uppercase tracking-wider px-3 mb-1" style={{ fontSize: '10px', letterSpacing: '0.08em' }}>{t('nav_people_fleet')}</p>
          <div className="space-y-0.5">
            {[
              { label: t('nav_people'), href: '/people', icon: UserCog },
              { label: t('nav_fleet'), href: '/fleet', icon: Truck },
            ].map(({ label, href, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(href + '/')
              return (
                <Link key={href} href={href} prefetch={true}
                  className={cn('flex items-center gap-2.5 px-3 py-1.5 rounded-md font-medium transition-colors', active ? 'text-white' : 'text-[#5A5248] hover:text-[#1A1A1A] hover:bg-[#D9D0C5]')}
                  style={active ? { background: '#5BA3A0', fontSize: '13px' } : { fontSize: '13px' }}>
                  <Icon className={cn('w-3.5 h-3.5 flex-shrink-0', active ? 'text-white' : 'text-[#8C8078]')} />
                  {label}
                </Link>
              )
            })}
          </div>
        </div>

        {/* Communications section with live badges */}
        <div>
          <p className="font-semibold text-[#8C8078] uppercase tracking-wider px-3 mb-1" style={{ fontSize: '10px', letterSpacing: '0.08em' }}>
            {t('nav_communications')}
          </p>
          <div className="space-y-0.5">
            {[
              { label: t('nav_email'), href: '/communications', icon: Mail, badgeKey: 'email' as const },
              { label: t('nav_whatsapp'), href: '/whatsapp', icon: MessageCircle, badgeKey: 'whatsapp' as const },
              { label: t('nav_chat'), href: '/chat', icon: MessagesSquare, badgeKey: 'chat' as const },
            ].map(({ label, href, icon: Icon, badgeKey }) => {
              const active = pathname === href || pathname.startsWith(href + '/')
              const count = badgeCounts[badgeKey] ?? 0
              return (
                <Link key={href} href={href} prefetch={true}
                  className={cn('flex items-center gap-2.5 px-3 py-1.5 rounded-md font-medium transition-colors', active ? 'text-white' : 'text-[#5A5248] hover:text-[#1A1A1A] hover:bg-[#D9D0C5]')}
                  style={active ? { background: '#5BA3A0', fontSize: '13px' } : { fontSize: '13px' }}>
                  <Icon className={cn('w-3.5 h-3.5 flex-shrink-0', active ? 'text-white' : 'text-[#8C8078]')} />
                  <span className="flex-1 min-w-0 truncate">{label}</span>
                  <Badge count={count} />
                </Link>
              )
            })}
          </div>
        </div>

        {/* System */}
        <div>
          <p className="font-semibold text-[#8C8078] uppercase tracking-wider px-3 mb-1" style={{ fontSize: '10px', letterSpacing: '0.08em' }}>
            {t('nav_system')}
          </p>
          <div className="space-y-0.5">
            {[{ label: t('nav_settings'), href: '/settings', icon: Settings }].map(({ label, href, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(href + '/')
              return (
                <Link key={href} href={href} prefetch={true}
                  className={cn('flex items-center gap-2.5 px-3 py-1.5 rounded-md font-medium transition-colors', active ? 'text-white' : 'text-[#5A5248] hover:text-[#1A1A1A] hover:bg-[#D9D0C5]')}
                  style={active ? { background: '#5BA3A0', fontSize: '13px' } : { fontSize: '13px' }}>
                  <Icon className={cn('w-3.5 h-3.5 flex-shrink-0', active ? 'text-white' : 'text-[#8C8078]')} />
                  {label}
                </Link>
              )
            })}
          </div>
        </div>
      </nav>

      <div className="px-2 py-4 border-t border-[#D5CEC4] space-y-0.5">
        <button onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[#5A5248] hover:bg-[#D9D0C5] hover:text-[#1A1A1A] transition-colors"
          style={{ fontSize: '13px' }}>
          <LogOut className="w-3.5 h-3.5 flex-shrink-0 text-[#8C8078]" />
          {t('nav_sign_out')}
        </button>
        <p className="text-[#8C8078] px-3 pt-1" style={{ fontSize: '11px' }}>Kembali ERP v2.0</p>
      </div>
    </aside>
  )
}
