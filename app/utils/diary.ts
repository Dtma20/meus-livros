import type { ProfileLogItem } from '~~/shared/schemas/profile'

export const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
] as const

export interface DiaryMonthBucket {
  month: string
  monthNumber: number | null
  logs: ProfileLogItem[]
}

export interface DiaryGroup {
  title: string
  year: number | null
  months: DiaryMonthBucket[]
}

function compareLogsDesc(a: ProfileLogItem, b: ProfileLogItem): number {
  if (a.finished_on && b.finished_on && a.finished_on !== b.finished_on) {
    return b.finished_on.localeCompare(a.finished_on)
  }
  const timeA = new Date(a.created_at).getTime()
  const timeB = new Date(b.created_at).getTime()
  if (timeA !== timeB) {
    return timeB - timeA
  }
  return b.id.localeCompare(a.id)
}

export function groupDiary(logs: ProfileLogItem[]): DiaryGroup[] {
  if (!logs || logs.length === 0) {
    return []
  }

  const readingNowLogs: ProfileLogItem[] = []
  const finishedLogs: ProfileLogItem[] = []

  for (const log of logs) {
    if (log.finished_on === null) {
      readingNowLogs.push(log)
    } else {
      finishedLogs.push(log)
    }
  }

  const result: DiaryGroup[] = []

  if (readingNowLogs.length > 0) {
    readingNowLogs.sort(compareLogsDesc)
    result.push({
      title: 'Lendo agora',
      year: null,
      months: [
        {
          month: '',
          monthNumber: null,
          logs: readingNowLogs,
        },
      ],
    })
  }

  const yearMap = new Map<number, {
    months: Map<number, ProfileLogItem[]>
    noMonth: ProfileLogItem[]
  }>()

  for (const log of finishedLogs) {
    const parts = (log.finished_on as string).split('-')
    const year = parseInt(parts[0] ?? '', 10)
    if (isNaN(year)) continue

    let yearEntry = yearMap.get(year)
    if (!yearEntry) {
      yearEntry = {
        months: new Map<number, ProfileLogItem[]>(),
        noMonth: [],
      }
      yearMap.set(year, yearEntry)
    }

    if (log.finished_precision === 'ano') {
      yearEntry.noMonth.push(log)
    } else {
      const monthNumber = parseInt(parts[1] ?? '', 10)
      if (isNaN(monthNumber) || monthNumber < 1 || monthNumber > 12) {
        yearEntry.noMonth.push(log)
      } else {
        let monthLogs = yearEntry.months.get(monthNumber)
        if (!monthLogs) {
          monthLogs = []
          yearEntry.months.set(monthNumber, monthLogs)
        }
        monthLogs.push(log)
      }
    }
  }

  const sortedYears = [...yearMap.keys()].sort((a, b) => b - a)

  for (const year of sortedYears) {
    const yearEntry = yearMap.get(year)!
    const monthBuckets: DiaryMonthBucket[] = []

    const sortedMonthNumbers = [...yearEntry.months.keys()].sort((a, b) => b - a)
    for (const monthNumber of sortedMonthNumbers) {
      const mLogs = yearEntry.months.get(monthNumber)!
      mLogs.sort(compareLogsDesc)
      const monthName = MONTH_NAMES[monthNumber - 1] ?? ''
      monthBuckets.push({
        month: monthName,
        monthNumber,
        logs: mLogs,
      })
    }

    if (yearEntry.noMonth.length > 0) {
      yearEntry.noMonth.sort(compareLogsDesc)
      monthBuckets.push({
        month: 'Sem mês',
        monthNumber: null,
        logs: yearEntry.noMonth,
      })
    }

    result.push({
      title: String(year),
      year,
      months: monthBuckets,
    })
  }

  return result
}

export function getDiaryDay(log: ProfileLogItem): number | null {
  if (log.finished_precision !== 'dia' || !log.finished_on) {
    return null
  }
  const parts = log.finished_on.split('-')
  if (parts.length < 3) return null
  const day = parseInt(parts[2] ?? '', 10)
  return isNaN(day) ? null : day
}
