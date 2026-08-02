import { describe, it, expect } from 'vitest'
import {
  PRESENCE_STATUSES,
  SELECTABLE_PRESENCE_STATUSES,
  presenceStatusSchema,
  normalizePresenceStatus,
  getPresenceMetadata,
  decaysOnShortIdle,
  isDndStatus,
} from './presence-status'

describe('presence-status', () => {
  describe('PRESENCE_STATUSES / SELECTABLE_PRESENCE_STATUSES', () => {
    it('defines exactly the 6 catchy statuses', () => {
      expect(PRESENCE_STATUSES).toEqual([
        'AVAILABLE',
        'COLLABORATING',
        'DEEP_FOCUS',
        'ON_BREAK',
        'IN_MEETING',
        'OFFLINE',
      ])
    })

    it('excludes OFFLINE from the selectable set (system-driven, not user-chosen)', () => {
      expect(SELECTABLE_PRESENCE_STATUSES).not.toContain('OFFLINE')
      expect(SELECTABLE_PRESENCE_STATUSES).toHaveLength(5)
    })
  })

  describe('presenceStatusSchema', () => {
    it('accepts all 6 valid statuses', () => {
      for (const status of PRESENCE_STATUSES) {
        expect(presenceStatusSchema.safeParse(status).success).toBe(true)
      }
    })

    it('rejects unknown values', () => {
      expect(presenceStatusSchema.safeParse('BUSY').success).toBe(false)
      expect(presenceStatusSchema.safeParse('').success).toBe(false)
    })
  })

  describe('normalizePresenceStatus', () => {
    it('maps legacy ONLINE and IDLE to AVAILABLE', () => {
      expect(normalizePresenceStatus('ONLINE')).toBe('AVAILABLE')
      expect(normalizePresenceStatus('IDLE')).toBe('AVAILABLE')
    })

    it('passes through valid catchy statuses unchanged', () => {
      expect(normalizePresenceStatus('DEEP_FOCUS')).toBe('DEEP_FOCUS')
      expect(normalizePresenceStatus('IN_MEETING')).toBe('IN_MEETING')
    })

    it('falls back to OFFLINE for null, undefined, or unknown values', () => {
      expect(normalizePresenceStatus(null)).toBe('OFFLINE')
      expect(normalizePresenceStatus(undefined)).toBe('OFFLINE')
      expect(normalizePresenceStatus('SOMETHING_WEIRD')).toBe('OFFLINE')
    })
  })

  describe('getPresenceMetadata', () => {
    it('returns full metadata for a valid status', () => {
      const meta = getPresenceMetadata('DEEP_FOCUS')
      expect(meta.label).toBe('Deep Focus')
      expect(meta.emoji).toBe('🔴')
      expect(meta.helpAvailable).toBe(false)
    })

    it('falls back to OFFLINE metadata for garbage input without throwing', () => {
      const meta = getPresenceMetadata('not-a-status')
      expect(meta.status).toBe('OFFLINE')
      expect(meta.label).toBe('Offline')
    })

    it('marks AVAILABLE and COLLABORATING as help-available', () => {
      expect(getPresenceMetadata('AVAILABLE').helpAvailable).toBe(true)
      expect(getPresenceMetadata('COLLABORATING').helpAvailable).toBe(true)
    })
  })

  describe('decaysOnShortIdle / isDndStatus', () => {
    it('only AVAILABLE and COLLABORATING decay on the short idle timeout', () => {
      expect(decaysOnShortIdle('AVAILABLE')).toBe(true)
      expect(decaysOnShortIdle('COLLABORATING')).toBe(true)
      expect(decaysOnShortIdle('DEEP_FOCUS')).toBe(false)
      expect(decaysOnShortIdle('ON_BREAK')).toBe(false)
      expect(decaysOnShortIdle('IN_MEETING')).toBe(false)
      expect(decaysOnShortIdle('OFFLINE')).toBe(false)
    })

    it('flags DEEP_FOCUS, ON_BREAK, and IN_MEETING as DND statuses', () => {
      expect(isDndStatus('DEEP_FOCUS')).toBe(true)
      expect(isDndStatus('ON_BREAK')).toBe(true)
      expect(isDndStatus('IN_MEETING')).toBe(true)
      expect(isDndStatus('AVAILABLE')).toBe(false)
      expect(isDndStatus('OFFLINE')).toBe(false)
    })
  })
})
