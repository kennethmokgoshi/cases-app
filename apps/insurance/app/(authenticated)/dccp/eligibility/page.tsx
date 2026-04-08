'use client'

import { useState } from 'react'
import Link from 'next/link'

// ─── Inline eligibility rules (mirrors dccp-eligibility.ts logic) ───────────

const MIN_AGE = 18
const MAX_AGE = 65
const AIP_MIN_HOURS = 20
const CLI_EXCLUDED = ['MORTGAGE', 'HOME_LOAN', 'VEHICLE_FINANCE', 'CAR_FINANCE']

function calcAge(dob: string): number {
  if (!dob) return 0
  const today = new Date()
  const birth = new Date(dob)
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

type ProductType = 'CLI' | 'AIP' | 'FUNERAL'

interface CheckResult {
  eligible: boolean
  reasons: string[]
  warnings: string[]
}

function checkEligibility(
  product: ProductType,
  dob: string,
  employmentType: string,
  hoursPerWeek: string,
  accountTypes: string[],
): CheckResult {
  const age = calcAge(dob)
  const reasons: string[] = []
  const warnings: string[] = []

  if (!dob) { return { eligible: false, reasons: ['Date of birth is required'], warnings: [] } }

  // Age check — shared
  if (age < MIN_AGE) reasons.push(`Client is ${age} years old — minimum age is ${MIN_AGE}`)
  if (age > MAX_AGE) reasons.push(`Client is ${age} years old — maximum entry age is ${MAX_AGE}`)

  if (product === 'CLI') {
    const eligible_accounts = accountTypes.filter(t => !CLI_EXCLUDED.includes(t.toUpperCase().replace(/\s/g, '_')))
    if (accountTypes.length > 0 && eligible_accounts.length === 0) {
      reasons.push('All selected account types are excluded (mortgage, home loan, vehicle finance, car finance)')
    }
    const excluded = accountTypes.filter(t => CLI_EXCLUDED.includes(t.toUpperCase().replace(/\s/g, '_')))
    if (excluded.length > 0) {
      warnings.push(`These account types will be excluded from CLI replacement: ${excluded.join(', ')}`)
    }
    warnings.push('Waiting period: 6 months for natural death, 12 months for suicide (waived if previous policy schedule provided)')
  }

  if (product === 'AIP') {
    if (!employmentType) {
      reasons.push('Employment type is required for AIP')
    } else if (['SELF_EMPLOYED', 'DIRECTOR', 'CONTRACT'].includes(employmentType)) {
      reasons.push(`AIP is only available to permanent employees — ${employmentType.toLowerCase().replace(/_/g, ' ')} is not eligible`)
    }
    const hrs = parseInt(hoursPerWeek)
    if (!isNaN(hrs) && hrs < AIP_MIN_HOURS) {
      reasons.push(`Client works ${hrs} hours per week — minimum is ${AIP_MIN_HOURS} hours for AIP`)
    }
    warnings.push('3-month waiting period applies for retrenchment and temporary disability benefits')
    warnings.push('Benefit ceases at age 70 or retirement, whichever is earlier')
  }

  if (product === 'FUNERAL') {
    warnings.push('6-month waiting period for natural death')
    warnings.push('12-month waiting period for suicide')
    warnings.push('Accidental death is covered immediately with no waiting period')
    warnings.push('Residential address (not PO Box) required for application')
  }

  return { eligible: reasons.length === 0, reasons, warnings }
}

// ─── Shared account types used in CLI checker ─────────────────────────────────

const ACCOUNT_TYPES = [
  'Personal Loan',
  'Credit Card',
  'Store Account',
  'Clothing Account',
  'Overdraft',
  'Short Term Loan',
  'Mortgage',
  'Home Loan',
  'Vehicle Finance',
  'Car Finance',
]

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function DCCPEligibilityPage() {
  const [product, setProduct] = useState<ProductType>('CLI')
  const [dob, setDob] = useState('')
  const [employmentType, setEmploymentType] = useState('')
  const [hoursPerWeek, setHoursPerWeek] = useState('40')
  const [selectedAccountTypes, setSelectedAccountTypes] = useState<string[]>([])
  const [result, setResult] = useState<CheckResult | null>(null)

  const age = dob ? calcAge(dob) : null

  function toggleAccountType(t: string) {
    setSelectedAccountTypes(prev =>
      prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]
    )
  }

  function handleCheck() {
    const r = checkEligibility(product, dob, employmentType, hoursPerWeek, selectedAccountTypes)
    setResult(r)
  }

  function handleReset() {
    setResult(null)
    setDob('')
    setEmploymentType('')
    setHoursPerWeek('40')
    setSelectedAccountTypes([])
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <Link href="/dccp" className="text-gray-400 hover:text-white text-sm">← DC Credit Protect</Link>
        <span className="text-gray-600">/</span>
        <span className="text-white text-sm">Eligibility Checker</span>
      </div>

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Eligibility Checker</h1>
          <p className="text-gray-400 text-sm mt-1">Verify client eligibility before capturing a policy</p>
        </div>
        {result && (
          <Link href="/dccp/new"
            className="px-4 py-2 bg-zeno-cyan hover:bg-cyan-400 text-zeno-navy font-bold rounded-lg text-sm transition-all">
            Capture Policy →
          </Link>
        )}
      </div>

      {!result ? (
        <div className="bg-zeno-blue/30 border border-zeno-cyan/20 rounded-2xl p-8 space-y-6">
          {/* Product selector */}
          <div>
            <p className="text-sm font-medium text-gray-300 mb-3">Product</p>
            <div className="grid grid-cols-3 gap-3">
              {([
                { type: 'CLI' as const, label: 'Credit Life', icon: '🛡️' },
                { type: 'AIP' as const, label: 'Income Protector', icon: '💼' },
                { type: 'FUNERAL' as const, label: 'Funeral Cover', icon: '🕊️' },
              ]).map(p => (
                <button key={p.type} onClick={() => { setProduct(p.type); setResult(null) }}
                  className={`py-3 px-4 rounded-xl border-2 flex items-center gap-2 text-sm font-medium transition-all ${product === p.type ? 'border-zeno-cyan bg-zeno-cyan/10 text-white' : 'border-white/10 bg-black/20 text-gray-400 hover:border-white/20'}`}>
                  <span>{p.icon}</span>{p.label}
                </button>
              ))}
            </div>
          </div>

          {/* DOB */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Date of Birth {age !== null && <span className="text-gray-500 font-normal">({age} years old)</span>}
            </label>
            <input type="date" value={dob} onChange={e => setDob(e.target.value)}
              className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-zeno-cyan/50 text-sm" />
            {age !== null && age >= MIN_AGE && age <= MAX_AGE && (
              <p className="text-green-400 text-xs mt-1">Age {age} — within eligible range ({MIN_AGE}–{MAX_AGE})</p>
            )}
            {age !== null && (age < MIN_AGE || age > MAX_AGE) && (
              <p className="text-red-400 text-xs mt-1">Age {age} — outside eligible range ({MIN_AGE}–{MAX_AGE})</p>
            )}
          </div>

          {/* AIP-specific */}
          {product === 'AIP' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Employment Type</label>
                <select value={employmentType} onChange={e => setEmploymentType(e.target.value)}
                  className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-zeno-cyan/50 text-sm">
                  <option value="">Select…</option>
                  <option value="PERMANENT">Permanent Employee</option>
                  <option value="CONTRACT">Contract / Fixed Term</option>
                  <option value="SELF_EMPLOYED">Self-Employed</option>
                  <option value="DIRECTOR">Director / Business Owner</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Hours Worked Per Week</label>
                <input type="number" min="0" max="80" value={hoursPerWeek}
                  onChange={e => setHoursPerWeek(e.target.value)}
                  className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-zeno-cyan/50 text-sm" />
                <p className="text-xs text-gray-500 mt-1">Minimum 20 hours per week required</p>
              </div>
            </>
          )}

          {/* CLI-specific */}
          {product === 'CLI' && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-3">Credit Account Types (optional — to check exclusions)</label>
              <div className="grid grid-cols-2 gap-2">
                {ACCOUNT_TYPES.map(t => {
                  const isExcluded = CLI_EXCLUDED.includes(t.toUpperCase().replace(/\s/g, '_'))
                  const isSelected = selectedAccountTypes.includes(t)
                  return (
                    <button key={t} onClick={() => toggleAccountType(t)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm text-left transition-all ${isSelected ? (isExcluded ? 'border-red-500/50 bg-red-500/10 text-red-300' : 'border-zeno-cyan/50 bg-zeno-cyan/10 text-white') : 'border-white/10 bg-black/20 text-gray-400 hover:border-white/20'}`}>
                      <span className={`w-4 h-4 rounded border flex items-center justify-center text-xs flex-shrink-0 ${isSelected ? (isExcluded ? 'border-red-400 bg-red-500/20 text-red-400' : 'border-zeno-cyan bg-zeno-cyan/20 text-zeno-cyan') : 'border-gray-600'}`}>
                        {isSelected && '✓'}
                      </span>
                      {t}
                      {isExcluded && <span className="text-xs text-red-400 ml-auto">excluded</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <button onClick={handleCheck}
            className="w-full py-3 bg-zeno-cyan hover:bg-cyan-400 text-zeno-navy font-bold rounded-lg transition-all">
            Check Eligibility
          </button>
        </div>
      ) : (
        /* ── Result ── */
        <div className="space-y-4">
          {/* Verdict */}
          <div className={`p-6 rounded-2xl border-2 ${result.eligible ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
            <div className="flex items-center gap-4">
              <div className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl font-bold ${result.eligible ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                {result.eligible ? '✓' : '✗'}
              </div>
              <div>
                <p className={`text-xl font-bold ${result.eligible ? 'text-green-400' : 'text-red-400'}`}>
                  {result.eligible ? 'Client is Eligible' : 'Client is Not Eligible'}
                </p>
                <p className="text-gray-400 text-sm">
                  {product === 'CLI' && 'Credit Life Insurance'}
                  {product === 'AIP' && 'Assistance Income Protector'}
                  {product === 'FUNERAL' && 'Funeral Cover'}
                  {dob && ` — Age ${calcAge(dob)}`}
                </p>
              </div>
            </div>
          </div>

          {/* Disqualifying reasons */}
          {result.reasons.length > 0 && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-5">
              <p className="text-sm font-semibold text-red-400 mb-3">Disqualifying Reasons</p>
              <ul className="space-y-2">
                {result.reasons.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-red-300">
                    <span className="text-red-400 mt-0.5 flex-shrink-0">✗</span>
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Warnings / notes */}
          {result.warnings.length > 0 && (
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-5">
              <p className="text-sm font-semibold text-yellow-400 mb-3">Important Notes</p>
              <ul className="space-y-2">
                {result.warnings.map((w, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-yellow-300">
                    <span className="text-yellow-400 mt-0.5 flex-shrink-0">!</span>
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button onClick={handleReset}
              className="flex-1 py-3 bg-zeno-blue/40 hover:bg-zeno-blue/60 border border-white/10 text-white rounded-lg font-medium text-sm transition-all">
              Check Another Client
            </button>
            {result.eligible && (
              <Link href="/dccp/new"
                className="flex-1 py-3 bg-zeno-cyan hover:bg-cyan-400 text-zeno-navy font-bold rounded-lg text-sm text-center transition-all">
                Capture Policy →
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Product rules reference */}
      <div className="mt-8 bg-zeno-blue/20 border border-white/5 rounded-xl p-5">
        <p className="text-xs font-semibold text-gray-400 uppercase mb-3">Quick Reference — Eligibility Rules</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-gray-400">
          <div>
            <p className="text-cyan-400 font-medium mb-1">Credit Life (CLI)</p>
            <ul className="space-y-0.5">
              <li>• Age 18–65</li>
              <li>• Any employment type</li>
              <li>• Excludes mortgage & vehicle</li>
              <li>• Waiting period waived with previous schedule</li>
            </ul>
          </div>
          <div>
            <p className="text-purple-400 font-medium mb-1">Income Protector (AIP)</p>
            <ul className="space-y-0.5">
              <li>• Age 18–65 (benefit to 70)</li>
              <li>• Permanent employees only</li>
              <li>• Min 20 hours/week</li>
              <li>• 3-month waiting period</li>
            </ul>
          </div>
          <div>
            <p className="text-orange-400 font-medium mb-1">Funeral Cover</p>
            <ul className="space-y-0.5">
              <li>• Age 18–65</li>
              <li>• Individual or family cover</li>
              <li>• 6-month natural death waiting</li>
              <li>• Residential address required</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
