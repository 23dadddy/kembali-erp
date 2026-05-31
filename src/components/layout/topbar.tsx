'use client'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { GlobalSearch } from './global-search'
import { NotificationsBell } from './notifications'

interface TopbarProps {
  title: string
}

export function Topbar({ title }: TopbarProps) {
  return (
    <header className="h-14 border-b bg-white flex items-center justify-between px-6">
      <h1 className="text-lg font-semibold text-slate-800">{title}</h1>
      <div className="flex items-center gap-3">
        <div className="hidden md:block">
          <GlobalSearch />
        </div>
        <NotificationsBell />
        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-cyan-600 text-white text-xs">KW</AvatarFallback>
        </Avatar>
      </div>
    </header>
  )
}
