'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard, Users, Package, FileText,
  UserCog, Settings, BarChart3,
  DollarSign, Factory,
  Shield, Truck,
  ScrollText, MessageSquare, ClipboardCheck,
  LogOut, MessagesSquare, FolderOpen, Mail,
  ShoppingCart, Truck as DispatchIcon, Receipt, BookOpen, Headphones,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useEffect } from 'react'
import { getCustomers, getInvoices, getStaff, getLeads } from '@/lib/db'

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
      { label: 'Dispatch', href: '/dispatch', icon: DispatchIcon },
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
  {
    label: 'Workspace',
    items: [
      { label: 'Communications', href: '/communications', icon: MessagesSquare },
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

  return (
    <aside className="w-52 min-h-screen flex flex-col" style={{ background: '#0F172A' }}>
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
        <p className="text-slate-600 px-3 pt-1" style={{ fontSize: '11px' }}>Kembali ERP v2.0</p>
      </div>
    </aside>
  )
}
