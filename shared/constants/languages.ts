export interface LanguageOption {
  code: string
  label: string
}

/**
 * ISO 639-1 language options with Portuguese display labels.
 */
export const LANGUAGES: readonly LanguageOption[] = [
  { code: 'pt', label: 'Português' },
  { code: 'en', label: 'Inglês' },
  { code: 'es', label: 'Espanhol' },
  { code: 'fr', label: 'Francês' },
  { code: 'de', label: 'Alemão' },
  { code: 'it', label: 'Italiano' },
  { code: 'ru', label: 'Russo' },
  { code: 'ja', label: 'Japonês' },
  { code: 'zh', label: 'Chinês' },
  { code: 'la', label: 'Latim' },
  { code: 'el', label: 'Grego' },
  { code: 'he', label: 'Hebraico' },
  { code: 'ar', label: 'Árabe' },
  { code: 'no', label: 'Norueguês' },
  { code: 'nl', label: 'Holandês' },
  { code: 'pl', label: 'Polonês' },
  { code: 'sv', label: 'Sueco' },
  { code: 'ko', label: 'Coreano' },
] as const
