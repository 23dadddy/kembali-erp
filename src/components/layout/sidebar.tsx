'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard, Users, Truck, Package, FileText,
  UserCog, MapPin, Settings, BarChart3, Smartphone,
  DollarSign, TrendingUp, Target, Sparkles, RefreshCw, Factory,
  Route, ShoppingCart, PieChart, Tag, Shield, Star, Banknote,
  ScrollText, MessageSquare, ClipboardCheck, RotateCcw, CalendarDays, BookOpen,
  LogOut, MessagesSquare, FolderOpen,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useEffect } from 'react'
import { getCustomers, getInvoices, getStaff, getLeads } from '@/lib/db'

const groups = [
  {
    label: null,
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      { label: 'Executive View', href: '/executive', icon: PieChart },
      { label: 'AI Command Center', href: '/ai', icon: Sparkles },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'TrakOps', href: '/trakops', icon: Truck },
      { label: 'Deliveries', href: '/deliveries', icon: MapPin },
      { label: 'Calendar', href: '/calendar', icon: CalendarDays },
      { label: 'Customers', href: '/customers', icon: Users },
      { label: 'CRM & Sales', href: '/crm', icon: Target },
      { label: 'Contracts', href: '/contracts', icon: ScrollText },
      { label: 'Subscriptions', href: '/subscriptions', icon: RefreshCw },
      { label: 'Routes', href: '/routes', icon: Route },
      { label: 'Orders', href: '/orders', icon: ShoppingCart },
      { label: 'Production', href: '/production', icon: Factory },
      { label: 'Inventory', href: '/inventory', icon: Package },
      { label: 'Bottle Tracking', href: '/bottles', icon: RotateCcw },
      { label: 'Procurement', href: '/procurement', icon: ShoppingCart },
      { label: 'Support', href: '/support', icon: MessageSquare },
    ],
  },
  {
    label: 'Finance',
    items: [
      { label: 'Invoices', href: '/invoices', icon: FileText },
      { label: 'Credit Notes', href: '/credit-notes', icon: FileText },
      { label: 'Finance', href: '/finance', icon: DollarSign },
      { label: 'Payroll', href: '/payroll', icon: Banknote },
      { label: 'Pricing', href: '/pricing', icon: DollarSign },
      { label: 'Promotions', href: '/promotions', icon: Tag },
      { label: 'Accounts', href: '/accounts', icon: BookOpen },
      { label: 'Reports', href: '/reports', icon: BarChart3 },
    ],
  },
  {
    label: 'Team',
    items: [
      { label: 'HR & Drivers', href: '/hr', icon: UserCog },
      { label: 'Fleet', href: '/fleet', icon: Truck },
      { label: 'Performance', href: '/performance', icon: Star },
      { label: 'Safety', href: '/safety', icon: Shield },
      { label: 'Driver App', href: '/portal', icon: Smartphone },
      { label: 'Driver Checklist', href: '/checklist', icon: ClipboardCheck },
    ],
  },
  {
    label: 'Workspace',
    items: [
      { label: 'Team Chat', href: '/chat', icon: MessagesSquare },
      { label: 'Documents', href: '/documents', icon: FolderOpen },
    ],
  },
  {
    label: 'System',
    items: [
      { label: 'Settings', href: '/settings', icon: Settings },
    ],
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  // Warm the cache for the most-visited pages as soon as the sidebar mounts
  useEffect(() => {
    // Fire in sequence with small delays to avoid hammering Supabase on initial load
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

  return (
    <aside className="w-56 min-h-screen flex flex-col" style={{ background: '#0F172A' }}>
      {/* Wordmark */}
      <div className="px-5 py-5 border-b border-slate-800">
        <div className="font-semibold text-white tracking-tight" style={{ fontSize: '15px' }}>Kembali Water</div>
        <div className="text-slate-500 mt-0.5" style={{ fontSize: '11px' }}>Operations Hub</div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-4 overflow-y-auto">
        {groups.map((group, gi) => (
          <div key={gi}>
            {group.label && (
              <p className="font-semibold text-slate-500 uppercase tracking-wider px-3 mb-1" style={{ fontSize: '10px', letterSpacing: '0.08em' }}>
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map(({ label, href, icon: Icon }) => {
                const active = pathname === href || pathname.startsWith(href + '/')
                return (
                  <Link
                    key={href}
                    href={href}
                    prefetch={true}
                    className={cn(
                      'flex items-center gap-2.5 px-3 py-1.5 rounded-md font-medium transition-colors',
                      active
                        ? 'text-white'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    )}
                    style={active ? { background: '#0EA5A4', fontSize: '13px' } : { fontSize: '13px' }}
                  >
                    <Icon className={cn('w-3.5 h-3.5 flex-shrink-0', active ? 'text-white' : 'text-slate-500')} />
                    {label}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="px-2 py-4 border-t border-slate-800 space-y-0.5">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          style={{ fontSize: '13px' }}
        >
          <LogOut className="w-3.5 h-3.5 flex-shrink-0 text-slate-500" />
          Sign Out
        </button>
        <p className="text-slate-600 px-3 pt-1" style={{ fontSize: '11px' }}>Kembali ERP v1.0</p>
      </div>
    </aside>
  )
}
