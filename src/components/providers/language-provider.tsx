'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { translations, type Language, type TranslationKey } from '@/lib/i18n'

interface LanguageContextType {
  language: Language
  setLanguage: (lang: Language) => void
  t: (key: TranslationKey) => string
}

const LanguageContext = createContext<LanguageContextType>({
  language: 'en',
  setLanguage: () => {},
  t: (key) => key,
})

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('en')

  useEffect(() => {
    const saved = localStorage.getItem('erp_language') as Language
    if (saved === 'en' || saved === 'id') setLanguageState(saved)
  }, [])

  const setLanguage = useCallback((lang: Language) => {
    localStorage.setItem('erp_language', lang)
    setLanguageState(lang)
  }, [])

  const t = useCallback((key: TranslationKey): string => {
    return translations[language][key] ?? translations.en[key] ?? key
  }, [language])

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  return useContext(LanguageContext)
}
