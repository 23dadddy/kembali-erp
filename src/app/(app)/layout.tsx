import { Sidebar } from '@/components/layout/sidebar'
import { LanguageProvider } from '@/components/providers/language-provider'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      <div className="flex h-screen overflow-hidden bg-white">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-auto min-w-0">
          {children}
        </main>
      </div>
    </LanguageProvider>
  )
}
