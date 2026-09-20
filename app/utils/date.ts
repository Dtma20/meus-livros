/**
 * Formats a Date, ISO date string, or timestamp into a relative time string in pt-BR.
 * Examples:
 * - "há poucos instantes"
 * - "há 2 minutos"
 * - "há 1 hora"
 * - "há 3 horas"
 * - "há 2 dias"
 * - "há 1 semana"
 * - "há 2 semanas"
 * - "há 1 mês"
 * - "há 2 meses"
 * - "há 1 ano"
 * - "há 2 anos"
 */
export function formatRelativeDate(
  date: Date | string | number | null | undefined,
  now: Date = new Date(),
): string {
  if (!date) return ''
  const target = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(target.getTime())) return ''

  const diffMs = Math.max(0, now.getTime() - target.getTime())
  const diffSeconds = Math.floor(diffMs / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSeconds < 60) {
    return 'há poucos instantes'
  }
  if (diffMinutes < 60) {
    return diffMinutes === 1 ? 'há 1 minuto' : `há ${diffMinutes} minutos`
  }
  if (diffHours < 24) {
    return diffHours === 1 ? 'há 1 hora' : `há ${diffHours} horas`
  }
  if (diffDays < 7) {
    return diffDays === 1 ? 'há 1 dia' : `há ${diffDays} dias`
  }

  const diffWeeks = Math.floor(diffDays / 7)
  if (diffDays < 30) {
    return diffWeeks === 1 ? 'há 1 semana' : `há ${diffWeeks} semanas`
  }

  if (diffDays < 365) {
    const diffMonths = Math.floor(diffDays / 30)
    return diffMonths === 1 ? 'há 1 mês' : `há ${diffMonths} meses`
  }

  const diffYears = Math.floor(diffDays / 365)
  return diffYears === 1 ? 'há 1 ano' : `há ${diffYears} anos`
}

/**
 * Formats a date into full pt-BR locale date and time for title/tooltip attributes.
 */
export function formatFullDate(
  date: Date | string | number | null | undefined,
): string {
  if (!date) return ''
  const target = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(target.getTime())) return ''

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(target)
}
