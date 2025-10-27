import { createContext, useContext, useMemo, useState } from 'react'

const dict = {
  fr: {
    loadData: 'Charger les données',
    dataLoaded: 'Données chargées',
    loading: 'Chargement...'
  },
  en: {
    loadData: 'Load data',
    dataLoaded: 'Data loaded',
    loading: 'Loading...'
  }
}

const I18nCtx = createContext(null)

export function I18nProvider({ children, defaultLang='fr' }) {
  const [lang, setLang] = useState(defaultLang)
  const t = (key) => (dict[lang] && dict[lang][key]) || key
  const value = useMemo(()=>({ lang, setLang, t }), [lang])
  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>
}

export function useI18n() {
  const ctx = useContext(I18nCtx)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}
