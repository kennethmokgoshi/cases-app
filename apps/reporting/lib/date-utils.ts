export type DateRangeType = 'today' | 'week' | 'month' | 'quarter' | 'biannual' | 'annual'

export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

export function getDateRange(
  type: DateRangeType,
  referenceDate: Date = new Date()
): { start: Date; end: Date } {
  const ref = new Date(referenceDate)
  const start = new Date(ref)
  const end = new Date(ref)

  switch (type) {
    case 'today':
      start.setHours(0, 0, 0, 0)
      end.setHours(23, 59, 59, 999)
      break
    case 'week': {
      // Week is Monday to Sunday
      const day = ref.getDay() // 0 is Sunday, 1 is Monday, ..., 6 is Saturday
      const diffToMonday = day === 0 ? 6 : day - 1
      start.setDate(ref.getDate() - diffToMonday)
      start.setHours(0, 0, 0, 0)

      const sunday = new Date(start)
      sunday.setDate(start.getDate() + 6)
      sunday.setHours(23, 59, 59, 999)
      end.setTime(sunday.getTime())
      break
    }
    case 'month': {
      // Current Calendar Month (1st 00:00:00 to last day 23:59:59)
      start.setDate(1)
      start.setHours(0, 0, 0, 0)
      const lastDay = new Date(ref.getFullYear(), ref.getMonth() + 1, 0, 23, 59, 59, 999)
      end.setTime(lastDay.getTime())
      break
    }
    case 'quarter': {
      // 3 Months (90 days)
      start.setDate(start.getDate() - 90)
      start.setHours(0, 0, 0, 0)
      end.setHours(23, 59, 59, 999)
      break
    }
    case 'biannual': {
      // 2 Quarters (6 Months / 180 days)
      start.setDate(start.getDate() - 180)
      start.setHours(0, 0, 0, 0)
      end.setHours(23, 59, 59, 999)
      break
    }
    case 'annual': {
      // Annual (12 Months / 365 days)
      start.setDate(start.getDate() - 365)
      start.setHours(0, 0, 0, 0)
      end.setHours(23, 59, 59, 999)
      break
    }
  }

  return { start, end }
}

