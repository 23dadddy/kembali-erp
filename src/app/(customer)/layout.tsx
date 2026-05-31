import type { ReactNode } from 'react'
import { Droplets } from 'lucide-react'

export default function CustomerLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top nav */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-cyan-500 rounded-lg flex items-center justify-center">
              <Droplets className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-slate-800">Kembali Water</span>
            <span className="text-xs text-slate-400 ml-1">Customer Portal</span>
          </div>
          <nav className="hidden md:flex items-center gap-1 text-sm">
            {[
              { label: 'Dashboard', href: '/customer/dashboard' },
              { label: 'Orders', href: '/customer/orders' },
              { label: 'Bottles', href: '/customer/bottles' },
              { label: 'Invoices', href: '/customer/invoices' },
              { label: 'Support', href: '/customer/support' },
              { label: 'Account', href: '/customer/account' },
            ].map(({ label, href }) => (
              <a key={href} href={href} className="px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-800 transition-colors">
                {label}
              </a>
            ))}
          </nav>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-8">
        {children}
      </main>
    </div>
  )
}
