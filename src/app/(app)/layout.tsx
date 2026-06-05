import { Sidebar } from '@/components/layout/sidebar'
import { FloatingAI } from '@/components/layout/floating-ai'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-auto min-w-0">
        {children}
      </main>
      <FloatingAI />
    </div>
  )
}
