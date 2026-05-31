import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Kembali Driver',
  description: 'Driver delivery app',
}

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100">
      {children}
    </div>
  )
}
