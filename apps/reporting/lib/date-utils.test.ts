import { describe, it, expect } from 'vitest'
import { getDateRange, formatDate, formatTime } from './date-utils'

describe('date-utils', () => {
  describe('getDateRange', () => {
    // Fixed reference date: Wednesday, July 29, 2026 14:30:00
    const fixedRef = new Date(2026, 6, 29, 14, 30, 0)

    it('calculates Today from 00h00 to 23h59', () => {
      const { start, end } = getDateRange('today', fixedRef)
      expect(start.getHours()).toBe(0)
      expect(start.getMinutes()).toBe(0)
      expect(start.getSeconds()).toBe(0)
      expect(end.getHours()).toBe(23)
      expect(end.getMinutes()).toBe(59)
      expect(end.getSeconds()).toBe(59)
      expect(start.getDate()).toBe(29)
    })

    it('calculates This Week from Monday to Sunday', () => {
      // Wednesday July 29, 2026 -> Monday is July 27, Sunday is August 2
      const { start, end } = getDateRange('week', fixedRef)
      expect(start.getDay()).toBe(1) // Monday
      expect(start.getDate()).toBe(27)
      expect(end.getDay()).toBe(0) // Sunday
      expect(end.getDate()).toBe(2)
      expect(end.getMonth()).toBe(7) // August
    })

    it('calculates This Month as full current calendar month', () => {
      const { start, end } = getDateRange('month', fixedRef)
      expect(start.getDate()).toBe(1)
      expect(start.getMonth()).toBe(6) // July
      expect(end.getDate()).toBe(31) // July has 31 days
      expect(end.getMonth()).toBe(6)
    })

    it('calculates Quarter as 90 days', () => {
      const { start, end } = getDateRange('quarter', fixedRef)
      const diffMs = end.getTime() - start.getTime()
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
      expect(diffDays).toBe(90)
    })

    it('calculates Bi-Annual as 180 days (2 quarters)', () => {
      const { start, end } = getDateRange('biannual', fixedRef)
      const diffMs = end.getTime() - start.getTime()
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
      expect(diffDays).toBe(180)
    })

    it('calculates Annual as 365 days (12 months)', () => {
      const { start, end } = getDateRange('annual', fixedRef)
      const diffMs = end.getTime() - start.getTime()
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
      expect(diffDays).toBe(365)
    })
  })

  describe('formatters', () => {
    it('formatDate formats date string properly', () => {
      const date = new Date(2026, 6, 29)
      expect(formatDate(date)).toContain('2026')
      expect(formatDate(date)).toContain('Jul')
    })

    it('formatTime formats time string properly', () => {
      const date = new Date(2026, 6, 29, 14, 30)
      expect(formatTime(date)).toContain('2:30')
    })
  })
})
