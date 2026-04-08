import { describe, it, expect } from 'vitest'
import {
  calculateCliCommission,
  calculateAipCommission,
  calculateFuneralCommission,
  calculatePortfolioCommission,
  calculateClientSaving,
  formatZAR,
} from './dccp-commission'

// ─── CLI ──────────────────────────────────────────────────────────────────────

describe('calculateCliCommission', () => {
  it('calculates 40% of the total monthly premium', () => {
    const result = calculateCliCommission(500)
    expect(result.policyType).toBe('CLI')
    expect(result.retailPremium).toBe(500)
    expect(result.referralFee).toBe(200)
    expect(result.annualFee).toBe(2400)
  })

  it('rounds to 2 decimal places', () => {
    const result = calculateCliCommission(333.33)
    expect(result.referralFee).toBe(133.33)
  })

  it('handles small premiums', () => {
    const result = calculateCliCommission(50)
    expect(result.referralFee).toBe(20)
    expect(result.annualFee).toBe(240)
  })

  it('handles zero premium', () => {
    const result = calculateCliCommission(0)
    expect(result.retailPremium).toBe(0)
    expect(result.referralFee).toBe(0)
  })

  it('returns correct annual fee (12x monthly fee)', () => {
    const result = calculateCliCommission(1000)
    expect(result.annualFee).toBe(result.referralFee * 12)
  })
})

// ─── AIP ──────────────────────────────────────────────────────────────────────

describe('calculateAipCommission', () => {
  it('returns correct tier for R5 000 benefit', () => {
    const result = calculateAipCommission(5_000)
    expect(result.policyType).toBe('AIP')
    expect(result.retailPremium).toBe(75)
    expect(result.referralFee).toBe(15)
    expect(result.annualFee).toBe(180)
  })

  it('returns correct tier for R10 000 benefit', () => {
    const result = calculateAipCommission(10_000)
    expect(result.retailPremium).toBe(110)
    expect(result.referralFee).toBe(20)
    expect(result.annualFee).toBe(240)
  })

  it('returns correct tier for R15 000 benefit', () => {
    const result = calculateAipCommission(15_000)
    expect(result.retailPremium).toBe(135)
    expect(result.referralFee).toBe(25)
    expect(result.annualFee).toBe(300)
  })

  it('throws for invalid monthly benefit', () => {
    expect(() => calculateAipCommission(7_500 as never)).toThrow('Invalid AIP monthly benefit')
  })

  it('annual fee equals 12x referral fee for all tiers', () => {
    for (const benefit of [5_000, 10_000, 15_000] as const) {
      const r = calculateAipCommission(benefit)
      expect(r.annualFee).toBe(r.referralFee * 12)
    }
  })
})

// ─── Funeral ──────────────────────────────────────────────────────────────────

describe('calculateFuneralCommission', () => {
  describe('Individual cover', () => {
    it('R10 000 individual cover', () => {
      const r = calculateFuneralCommission('INDIVIDUAL', 10_000)
      expect(r.policyType).toBe('FUNERAL')
      expect(r.retailPremium).toBe(75)
      expect(r.referralFee).toBe(17)
      expect(r.annualFee).toBe(204)
    })

    it('R20 000 individual cover', () => {
      const r = calculateFuneralCommission('INDIVIDUAL', 20_000)
      expect(r.retailPremium).toBe(105)
      expect(r.referralFee).toBe(20)
    })

    it('R30 000 individual cover', () => {
      const r = calculateFuneralCommission('INDIVIDUAL', 30_000)
      expect(r.retailPremium).toBe(125)
      expect(r.referralFee).toBe(22)
    })
  })

  describe('Family cover', () => {
    it('R10 000 family cover', () => {
      const r = calculateFuneralCommission('FAMILY', 10_000)
      expect(r.retailPremium).toBe(90)
      expect(r.referralFee).toBe(19)
    })

    it('R20 000 family cover', () => {
      const r = calculateFuneralCommission('FAMILY', 20_000)
      expect(r.retailPremium).toBe(130)
      expect(r.referralFee).toBe(22)
    })

    it('R30 000 family cover — highest tier', () => {
      const r = calculateFuneralCommission('FAMILY', 30_000)
      expect(r.retailPremium).toBe(195)
      expect(r.referralFee).toBe(33)
      expect(r.annualFee).toBe(396)
    })
  })

  it('throws for invalid cover amount', () => {
    expect(() => calculateFuneralCommission('INDIVIDUAL', 15_000 as never)).toThrow('Invalid Funeral cover amount')
  })

  it('family and individual differ at the same cover amount', () => {
    const ind = calculateFuneralCommission('INDIVIDUAL', 10_000)
    const fam = calculateFuneralCommission('FAMILY', 10_000)
    expect(fam.retailPremium).toBeGreaterThan(ind.retailPremium)
    expect(fam.referralFee).toBeGreaterThan(ind.referralFee)
  })
})

// ─── Portfolio ────────────────────────────────────────────────────────────────

describe('calculatePortfolioCommission', () => {
  it('aggregates correctly across multiple calculations', () => {
    const cli = calculateCliCommission(400)
    const aip = calculateAipCommission(5_000)
    const result = calculatePortfolioCommission([cli, aip])
    expect(result.totalMonthlyPremium).toBe(400 + 75)
    expect(result.totalMonthlyFee).toBe(160 + 15)
    expect(result.totalAnnualFee).toBe((160 + 15) * 12)
    expect(result.breakdown).toHaveLength(2)
  })

  it('returns zeros for empty array', () => {
    const result = calculatePortfolioCommission([])
    expect(result.totalMonthlyPremium).toBe(0)
    expect(result.totalMonthlyFee).toBe(0)
  })
})

// ─── Client saving ────────────────────────────────────────────────────────────

describe('calculateClientSaving', () => {
  it('calculates monthly and annual saving', () => {
    const result = calculateClientSaving(1000, 750)
    expect(result.monthlySaving).toBe(250)
    expect(result.annualSaving).toBe(3000)
  })

  it('returns zero when premiums are equal', () => {
    const result = calculateClientSaving(500, 500)
    expect(result.monthlySaving).toBe(0)
    expect(result.annualSaving).toBe(0)
  })

  it('returns negative saving when new premium is higher (edge case)', () => {
    const result = calculateClientSaving(100, 150)
    expect(result.monthlySaving).toBe(-50)
    expect(result.annualSaving).toBe(-600)
  })
})

// ─── Formatting ───────────────────────────────────────────────────────────────

describe('formatZAR', () => {
  it('formats a round number', () => {
    expect(formatZAR(1000)).toBe('R 1\u00a0000,00')
  })

  it('formats with cents', () => {
    expect(formatZAR(1234.5)).toContain('1')
  })

  it('formats zero', () => {
    expect(formatZAR(0)).toContain('0')
  })
})
