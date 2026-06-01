'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard, Users, Truck, Package, FileText,
  UserCog, MapPin, Settings, Droplets, BarChart3, Smartphone,
  DollarSign, TrendingUp, Target, Sparkles, RefreshCw, Factory,
  Route, ShoppingCart, PieChart, Tag, Shield, Star, Banknote,
  ScrollText, MessageSquare, ClipboardCheck, RotateCcw, CalendarDays, BookOpen,
  LogOut, MessagesSquare, FolderOpen,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const groups = [
  {
    label: null,
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      { label: 'Executive View', href: '/executive', icon: PieChart },
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
    label: 'AI',
    items: [
      { label: 'AI Command Center', href: '/ai', icon: Sparkles },
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

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="w-60 min-h-screen bg-slate-900 text-white flex flex-col">
      {/* Logo */}
      <div className="flex items-center gap-2 px-6 py-5 border-b border-slate-700">
        <div className="w-8 h-8 bg-cyan-500 rounded-lg flex items-center justify-center">
          <Droplets className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="font-bold text-sm leading-tight">Kembali Water</div>
          <div className="text-xs text-slate-400">Operations Hub</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
        {groups.map((group, gi) => (
          <div key={gi}>
            {group.label && (
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 mb-1">
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
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                      active
                        ? 'bg-cyan-600 text-white'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    )}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    {label}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="px-3 py-4 border-t border-slate-700 space-y-1">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          Sign Out
        </button>
        <p className="text-xs text-slate-600 px-3">Kembali ERP v1.0</p>
      </div>
    </aside>
  )
}
