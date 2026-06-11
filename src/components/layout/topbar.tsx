'use client'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { GlobalSearch } from './global-search'
import { NotificationsBell } from './notifications'
import { useLanguage } from '@/components/providers/language-provider'
import type { TranslationKey } from '@/lib/i18n'

interface TopbarProps {
  title: string
  titleIsKey?: boolean
}

export function Topbar({ title, titleIsKey }: TopbarProps) {
  const { t } = useLanguage()
  const displayTitle = titleIsKey ? t(title as TranslationKey) : title

  return (
    <header className="h-14 border-b bg-white flex items-center justify-between px-6">
      <h1 className="text-lg font-semibold text-slate-800">{displayTitle}</h1>
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
