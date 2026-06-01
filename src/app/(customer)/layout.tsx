'use client'

import type { ReactNode } from 'react'
import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Droplets, LogOut, Menu, X } from 'lucide-react'
import { getPortalCustomer, signOutCustomer, type PortalCustomer } from '@/lib/customer-auth'
import Link from 'next/link'

const NAV = [
  { label: 'Dashboard', href: '/customer/dashboard' },
  { label: 'Orders', href: '/customer/orders' },
  { label: 'Bottles', href: '/customer/bottles' },
  { label: 'Invoices', href: '/customer/invoices' },
  { label: 'Support', href: '/customer/support' },
  { label: 'Account', href: '/customer/account' },
]

export default function CustomerLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [customer, setCustomer] = useState<PortalCustomer | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)

  const isLoginPage = pathname === '/customer/login'

  useEffect(() => {
    if (!isLoginPage) getPortalCustomer().then(setCustomer)
  }, [isLoginPage])

  const handleSignOut = async () => {
    await signOutCustomer()
    router.push('/customer/login')
  }

  if (isLoginPage) return <>{children}</>

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-7 h-7 bg-cyan-500 rounded-lg flex items-center justify-center">
              <Droplets className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-slate-800 hidden sm:block">Kembali Water</span>
            <span className="text-xs text-slate-400 hidden sm:block">Partner Portal</span>
          </div>

          <nav className="hidden md:flex items-center gap-0.5 text-sm flex-1 justify-center">
            {NAV.map(({ label, href }) => (
              <Link key={href} href={href}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  pathname === href ? 'bg-cyan-50 text-cyan-700' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                }`}>
                {label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3 flex-shrink-0">
            {customer && <span className="hidden sm:block text-sm text-slate-600 font-medium truncate max-w-40">{customer.name}</span>}
            <button onClick={handleSignOut} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-700 transition-colors" title="Sign out">
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:block">Sign out</span>
            </button>
            <button className="md:hidden text-slate-500" onClick={() => setMobileOpen(o => !o)}>
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="md:hidden border-t border-slate-100 px-4 py-2 space-y-1">
            {NAV.map(({ label, href }) => (
              <Link key={href} href={href} onClick={() => setMobileOpen(false)}
                className={`block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  pathname === href ? 'bg-cyan-50 text-cyan-700' : 'text-slate-600 hover:bg-slate-100'
                }`}>
                {label}
              </Link>
            ))}
          </div>
        )}
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {children}
      </main>
    </div>
  )
}
