import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import en from './locales/en/translation.json'
import ja from './locales/ja/translation.json'
import ko from './locales/ko/translation.json'
import zh from './locales/zh/translation.json'

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'zh', label: '中文' },
] as const

export type LangCode = (typeof SUPPORTED_LANGUAGES)[number]['code']

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ja: { translation: ja },
    ko: { translation: ko },
    zh: { translation: zh },
  },
  lng: localStorage.getItem('ui.language') ?? navigator.language.split('-')[0] ?? 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

export default i18n
