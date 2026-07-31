import { describe, it, expect } from 'vitest';
import { formatZAR, formatNumber } from './formatters';

describe('formatZAR', () => {
  it('formats positive number as ZAR currency', () => {
    const formatted = formatZAR(5500);
    expect(formatted).toContain('5');
    expect(formatted).toContain('500');
    expect(formatted).toMatch(/ZAR|R/);
  });

  it('formats zero correctly in ZAR locale', () => {
    const formatted = formatZAR(0);
    expect(formatted).toMatch(/0[,.]00/);
  });

  it('handles null and undefined safely', () => {
    expect(formatZAR(null)).toMatch(/0[,.]00/);
    expect(formatZAR(undefined)).toMatch(/0[,.]00/);
  });

  it('parses numeric string inputs correctly', () => {
    const formatted = formatZAR('12450.50');
    expect(formatted).toContain('12');
    expect(formatted).toContain('450');
  });
});

describe('formatNumber', () => {
  it('formats integer numbers', () => {
    const formatted = formatNumber(1250);
    expect(formatted.replace(/\s|\u00a0/g, ' ')).toBe('1 250');
  });

  it('handles null or undefined', () => {
    expect(formatNumber(null)).toBe('0');
    expect(formatNumber(undefined)).toBe('0');
  });
});
