'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

// ─── Inline commission helpers (avoids server-only import issues) ──────────────
const CLI_RATE = 0.40

const AIP_TIERS = [
  { monthlyBenefit: 5_000,  retailPremium: 75,  referralFee: 15 },
  { monthlyBenefit: 10_000, retailPremium: 110, referralFee: 20 },
  { monthlyBenefit: 15_000, retailPremium: 135, referralFee: 25 },
] as const

const IND_FUNERAL_TIERS = [
  { coverAmount: 10_000, retailPremium: 75,  referralFee: 17 },
  { coverAmount: 20_000, retailPremium: 105, referralFee: 20 },
  { coverAmount: 30_000, retailPremium: 125, referralFee: 22 },
] as const

const FAM_FUNERAL_TIERS = [
  { coverAmount: 10_000, retailPremium: 90,  referralFee: 19 },
  { coverAmount: 20_000, retailPremium: 130, referralFee: 22 },
  { coverAmount: 30_000, retailPremium: 195, referralFee: 33 },
] as const

function r2(n: number) { return Math.round(n * 100) / 100 }
function zar(n: number) { return `R ${n.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}` }

// ─── Types ─────────────────────────────────────────────────────────────────────

type ProductType = 'CLI' | 'AIP' | 'FUNERAL'
type FuneralCoverType = 'INDIVIDUAL' | 'FAMILY'
type AccountType = 'CHEQUE' | 'SAVINGS'

interface ClientForm {
  firstName: string
  lastName: string
  idNumber: string
  dob: string
  email: string
  phone: string
  address: string
}

interface BankingForm {
  bankName: string
  accountNumber: string
  accountType: AccountType
  debitOrderDate: string
}

interface CreditAccountRow {
  id: string
  creditProvider: string
  accountType: string
  accountNumber: string
  outstandingBalance: string
  currentPremium: string
  newPremium: string
}

interface FuneralDependantRow {
  id: string
  relationship: string
  firstName: string
  lastName: string
  idNumber: string
  coverAmount: string
}

// ─── Step progress bar ──────────────────────────────────────────────────────

const STEPS = ['Product', 'Client', 'Details', 'Review']

function StepBar({ step }: { step: number }) {
  return (
    <div className="flex items-center justify-between mb-10 relative">
      <div className="absolute left-0 top-1/2 w-full h-0.5 bg-white/10 -z-10" />
      {STEPS.map((label, i) => {
        const n = i + 1
        const done = step > n
        const active = step === n
        return (
          <div key={n} className={`flex flex-col items-center gap-2 ${active || done ? 'text-zeno-cyan' : 'text-gray-500'}`}>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm border-4 transition-all bg-zeno-navy
              ${done ? 'border-zeno-cyan text-zeno-cyan' : active ? 'border-zeno-cyan text-zeno-cyan' : 'border-white/10 text-gray-500'}`}>
              {done ? '✓' : n}
            </div>
            <span className="text-xs font-medium bg-zeno-navy px-2">{label}</span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Field helpers ─────────────────────────────────────────────────────────────

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-400 mb-1.5">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

const inputCls = 'w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-zeno-cyan/50 text-sm'
const selectCls = 'w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-zeno-cyan/50 text-sm'

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function NewDCCPPolicyPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Step 1 — product
  const [product, setProduct] = useState<ProductType | null>(null)

  // Step 2 — client + banking
  const [client, setClient] = useState<ClientForm>({
    firstName: '', lastName: '', idNumber: '', dob: '',
    email: '', phone: '', address: '',
  })
  const [banking, setBanking] = useState<BankingForm>({
    bankName: '', accountNumber: '', accountType: 'CHEQUE', debitOrderDate: '1',
  })

  // Step 3a — CLI
  const [creditAccounts, setCreditAccounts] = useState<CreditAccountRow[]>([
    { id: '1', creditProvider: '', accountType: 'Personal Loan', accountNumber: '', outstandingBalance: '', currentPremium: '', newPremium: '' },
  ])
  const [hasPreviousPolicy, setHasPreviousPolicy] = useState(false)
  const [previousInsurerName, setPreviousInsurerName] = useState('')
  const [previousPolicyNumber, setPreviousPolicyNumber] = useState('')
  const [previousPolicySchedule, setPreviousPolicySchedule] = useState(false)
  const [inceptionDate, setInceptionDate] = useState('')

  // Step 3b — AIP
  const [aipBenefit, setAipBenefit] = useState<5000 | 10000 | 15000>(5000)
  const [employerName, setEmployerName] = useState('')
  const [employedSince, setEmployedSince] = useState('')

  // Step 3c — Funeral
  const [funeralCoverType, setFuneralCoverType] = useState<FuneralCoverType>('INDIVIDUAL')
  const [funeralCoverAmount, setFuneralCoverAmount] = useState<10000 | 20000 | 30000>(10000)
  const [beneficiaryName, setBeneficiaryName] = useState('')
  const [beneficiaryRelationship, setBeneficiaryRelationship] = useState('')
  const [dependants, setDependants] = useState<FuneralDependantRow[]>([])

  // ─── Commission preview ──────────────────────────────────────────────────────

  const commission = useMemo(() => {
    if (!product) return null
    if (product === 'CLI') {
      const total = creditAccounts.reduce((s, a) => s + (parseFloat(a.newPremium) || 0), 0)
      const fee = r2(total * CLI_RATE)
      return { retailPremium: r2(total), referralFee: fee, annualFee: r2(fee * 12) }
    }
    if (product === 'AIP') {
      const tier = AIP_TIERS.find(t => t.monthlyBenefit === aipBenefit)!
      return { retailPremium: tier.retailPremium, referralFee: tier.referralFee, annualFee: tier.referralFee * 12 }
    }
    // FUNERAL
    const tiers = funeralCoverType === 'INDIVIDUAL' ? IND_FUNERAL_TIERS : FAM_FUNERAL_TIERS
    const tier = tiers.find(t => t.coverAmount === funeralCoverAmount)!
    return { retailPremium: tier.retailPremium, referralFee: tier.referralFee, annualFee: tier.referralFee * 12 }
  }, [product, creditAccounts, aipBenefit, funeralCoverType, funeralCoverAmount])

  // ─── Helpers — credit accounts ───────────────────────────────────────────────

  function addCreditAccount() {
    setCreditAccounts(prev => [...prev, {
      id: String(Date.now()), creditProvider: '', accountType: 'Personal Loan',
      accountNumber: '', outstandingBalance: '', currentPremium: '', newPremium: '',
    }])
  }

  function removeCreditAccount(id: string) {
    setCreditAccounts(prev => prev.filter(a => a.id !== id))
  }

  function updateCreditAccount(id: string, field: keyof CreditAccountRow, value: string) {
    setCreditAccounts(prev => prev.map(a => a.id === id ? { ...a, [field]: value } : a))
  }

  // ─── Helpers — funeral dependants ────────────────────────────────────────────

  function addDependant() {
    setDependants(prev => [...prev, {
      id: String(Date.now()), relationship: 'CHILD_14_21',
      firstName: '', lastName: '', idNumber: '', coverAmount: '',
    }])
  }

  function removeDependant(id: string) {
    setDependants(prev => prev.filter(d => d.id !== id))
  }

  function updateDependant(id: string, field: keyof FuneralDependantRow, value: string) {
    setDependants(prev => prev.map(d => d.id === id ? { ...d, [field]: value } : d))
  }

  // ─── Validation ──────────────────────────────────────────────────────────────

  function validateStep2(): string | null {
    if (!client.firstName.trim()) return 'First name is required'
    if (!client.lastName.trim()) return 'Last name is required'
    if (!client.idNumber.trim() || client.idNumber.length !== 13) return 'A valid 13-digit SA ID number is required'
    if (!client.dob) return 'Date of birth is required'
    if (!client.phone.trim()) return 'Phone number is required'
    if (!client.address.trim()) return 'Address is required'
    if (!banking.bankName.trim()) return 'Bank name is required'
    if (!banking.accountNumber.trim()) return 'Account number is required'
    const dod = parseInt(banking.debitOrderDate)
    if (isNaN(dod) || dod < 1 || dod > 31) return 'Debit order date must be between 1 and 31'
    return null
  }

  function validateStep3(): string | null {
    if (!inceptionDate) return 'Inception date is required'
    if (product === 'CLI') {
      if (creditAccounts.length === 0) return 'Add at least one credit account'
      for (const a of creditAccounts) {
        if (!a.creditProvider.trim()) return 'Credit provider is required for all accounts'
        if (!a.newPremium || parseFloat(a.newPremium) <= 0) return 'New premium must be greater than 0 for all accounts'
      }
    }
    if (product === 'AIP') {
      if (!employerName.trim()) return 'Employer name is required'
      if (!employedSince) return 'Employment start date is required'
    }
    if (product === 'FUNERAL') {
      if (!beneficiaryName.trim()) return 'Beneficiary name is required'
      if (!beneficiaryRelationship.trim()) return 'Beneficiary relationship is required'
      if (funeralCoverType === 'FAMILY' && dependants.length === 0) return 'Add at least one dependant for family cover'
    }
    return null
  }

  // ─── Navigation ──────────────────────────────────────────────────────────────

  function goToStep2() {
    if (!product) { setError('Please select a product'); return }
    setError(null)
    setStep(2)
  }

  function goToStep3() {
    const err = validateStep2()
    if (err) { setError(err); return }
    setError(null)
    setStep(3)
  }

  function goToStep4() {
    const err = validateStep3()
    if (err) { setError(err); return }
    setError(null)
    setStep(4)
  }

  // ─── Submit ───────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    setSubmitting(true)
    setError(null)
    try {
      const body: Record<string, unknown> = {
        policyType: product,
        clientFirstName: client.firstName,
        clientLastName: client.lastName,
        clientIdNumber: client.idNumber,
        clientDob: client.dob,
        clientEmail: client.email || null,
        clientPhone: client.phone,
        clientAddress: client.address,
        bankName: banking.bankName,
        accountNumber: banking.accountNumber,
        accountType: banking.accountType,
        debitOrderDate: parseInt(banking.debitOrderDate),
        inceptionDate,
        retailPremium: commission!.retailPremium,
        referralFee: commission!.referralFee,
        hasPreviousPolicy,
        previousInsurerName: hasPreviousPolicy ? previousInsurerName : null,
        previousPolicyNumber: hasPreviousPolicy ? previousPolicyNumber : null,
        previousPolicySchedule: hasPreviousPolicy ? previousPolicySchedule : false,
      }

      if (product === 'CLI') {
        body.creditAccounts = creditAccounts.map(a => ({
          creditProvider: a.creditProvider,
          accountType: a.accountType,
          accountNumber: a.accountNumber || null,
          outstandingBalance: parseFloat(a.outstandingBalance) || 0,
          currentPremium: parseFloat(a.currentPremium) || 0,
          newPremium: parseFloat(a.newPremium),
          saving: r2((parseFloat(a.currentPremium) || 0) - parseFloat(a.newPremium)),
        }))
      }

      if (product === 'AIP') {
        body.aipCoverAmount = aipBenefit
        body.employerName = employerName
        body.employedSince = employedSince
      }

      if (product === 'FUNERAL') {
        body.funeralCoverType = funeralCoverType
        body.funeralCoverAmount = funeralCoverAmount
        body.beneficiaryName = beneficiaryName
        body.beneficiaryRelationship = beneficiaryRelationship
        body.dependants = funeralCoverType === 'FAMILY'
          ? dependants.map(d => ({
              relationship: d.relationship,
              firstName: d.firstName,
              lastName: d.lastName,
              idNumber: d.idNumber || null,
              coverAmount: parseInt(d.coverAmount) || 0,
            }))
          : []
      }

      const res = await fetch('/api/dccp/policies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Failed to save policy')
      }

      const { id } = await res.json()
      router.push(`/dccp/policies/${id}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Submission failed')
      setSubmitting(false)
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <Link href="/dccp" className="text-gray-400 hover:text-white text-sm">← DC Credit Protect</Link>
        <span className="text-gray-600">/</span>
        <span className="text-white text-sm">New Policy</span>
      </div>

      <h1 className="text-2xl font-bold text-white mb-8">Capture New DCCP Policy</h1>

      <StepBar step={step} />

      {/* ── STEP 1: Product ───────────────────────────────────────────────────── */}
      {step === 1 && (
        <div className="bg-zeno-blue/30 border border-zeno-cyan/20 rounded-2xl p-8">
          <h2 className="text-lg font-semibold text-white mb-6">Select Product</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {([
              {
                type: 'CLI' as const,
                label: 'Credit Life Insurance',
                icon: '🛡️',
                desc: 'Replace existing credit life cover on personal loans, credit cards, store accounts',
                colour: 'border-cyan-500/40 hover:border-cyan-400',
                activeColour: 'border-cyan-400 bg-cyan-500/10',
              },
              {
                type: 'AIP' as const,
                label: 'Income Protector',
                icon: '💼',
                desc: 'Monthly benefit of R5 000 – R15 000 for permanent employees',
                colour: 'border-purple-500/40 hover:border-purple-400',
                activeColour: 'border-purple-400 bg-purple-500/10',
              },
              {
                type: 'FUNERAL' as const,
                label: 'Funeral Cover',
                icon: '🕊️',
                desc: 'Individual or family cover up to R30 000',
                colour: 'border-orange-500/40 hover:border-orange-400',
                activeColour: 'border-orange-400 bg-orange-500/10',
              },
            ] as const).map(p => (
              <button
                key={p.type}
                onClick={() => setProduct(p.type)}
                className={`p-5 rounded-xl border-2 text-left transition-all ${product === p.type ? p.activeColour : `bg-zeno-blue/20 ${p.colour}`}`}
              >
                <span className="text-3xl mb-3 block">{p.icon}</span>
                <p className="font-semibold text-white mb-1">{p.label}</p>
                <p className="text-xs text-gray-400 leading-relaxed">{p.desc}</p>
              </button>
            ))}
          </div>

          {/* Commission preview for selected product */}
          {product === 'CLI' && (
            <div className="p-4 bg-cyan-500/10 border border-cyan-500/20 rounded-xl mb-6 text-sm">
              <p className="text-cyan-400 font-medium mb-1">Commission: 40% of all replacement premiums</p>
              <p className="text-gray-400">e.g. R500/pm total new premium → <strong className="text-white">R200/pm</strong> referral fee (R2 400/year)</p>
            </div>
          )}
          {product === 'AIP' && (
            <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl mb-6 text-sm">
              <p className="text-purple-400 font-medium mb-2">Fixed fees per tier:</p>
              <div className="grid grid-cols-3 gap-3 text-center">
                {AIP_TIERS.map(t => (
                  <div key={t.monthlyBenefit} className="bg-black/20 rounded-lg p-3">
                    <p className="text-white font-bold">R{t.monthlyBenefit.toLocaleString()}/mo</p>
                    <p className="text-gray-400 text-xs">benefit</p>
                    <p className="text-purple-400 font-semibold mt-1">R{t.referralFee}/pm fee</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {product === 'FUNERAL' && (
            <div className="p-4 bg-orange-500/10 border border-orange-500/20 rounded-xl mb-6 text-sm">
              <p className="text-orange-400 font-medium mb-2">Fixed fees per tier:</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-gray-400 text-xs mb-2">Individual</p>
                  {IND_FUNERAL_TIERS.map(t => (
                    <div key={t.coverAmount} className="flex justify-between text-xs py-1 border-b border-white/5">
                      <span className="text-gray-300">R{t.coverAmount.toLocaleString()}</span>
                      <span className="text-orange-400 font-medium">R{t.referralFee}/pm</span>
                    </div>
                  ))}
                </div>
                <div>
                  <p className="text-gray-400 text-xs mb-2">Family</p>
                  {FAM_FUNERAL_TIERS.map(t => (
                    <div key={t.coverAmount} className="flex justify-between text-xs py-1 border-b border-white/5">
                      <span className="text-gray-300">R{t.coverAmount.toLocaleString()}</span>
                      <span className="text-orange-400 font-medium">R{t.referralFee}/pm</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

          <div className="flex justify-end">
            <button
              onClick={goToStep2}
              className="px-8 py-3 bg-zeno-cyan hover:bg-cyan-400 text-zeno-navy font-bold rounded-lg transition-all"
            >
              Next: Client Details →
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 2: Client + Banking ──────────────────────────────────────────── */}
      {step === 2 && (
        <div className="bg-zeno-blue/30 border border-zeno-cyan/20 rounded-2xl p-8 space-y-8">
          {/* Client */}
          <div>
            <h2 className="text-lg font-semibold text-white mb-5">Client Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="First Name" required>
                <input className={inputCls} value={client.firstName}
                  onChange={e => setClient(c => ({ ...c, firstName: e.target.value }))} />
              </Field>
              <Field label="Last Name" required>
                <input className={inputCls} value={client.lastName}
                  onChange={e => setClient(c => ({ ...c, lastName: e.target.value }))} />
              </Field>
              <Field label="SA ID Number (13 digits)" required>
                <input className={inputCls} maxLength={13} value={client.idNumber}
                  onChange={e => setClient(c => ({ ...c, idNumber: e.target.value.replace(/\D/g, '') }))} />
              </Field>
              <Field label="Date of Birth" required>
                <input type="date" className={inputCls} value={client.dob}
                  onChange={e => setClient(c => ({ ...c, dob: e.target.value }))} />
              </Field>
              <Field label="Phone Number" required>
                <input className={inputCls} value={client.phone}
                  onChange={e => setClient(c => ({ ...c, phone: e.target.value }))} />
              </Field>
              <Field label="Email Address">
                <input type="email" className={inputCls} value={client.email}
                  onChange={e => setClient(c => ({ ...c, email: e.target.value }))} />
              </Field>
              <div className="md:col-span-2">
                <Field label="Residential Address" required>
                  <input className={inputCls} placeholder="Street, Suburb, City, Code"
                    value={client.address}
                    onChange={e => setClient(c => ({ ...c, address: e.target.value }))} />
                </Field>
              </div>
            </div>
          </div>

          {/* Banking */}
          <div>
            <h2 className="text-lg font-semibold text-white mb-5">Banking Details (for debit order)</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Bank Name" required>
                <select className={selectCls} value={banking.bankName}
                  onChange={e => setBanking(b => ({ ...b, bankName: e.target.value }))}>
                  <option value="">Select bank…</option>
                  {['ABSA', 'Capitec', 'First National Bank', 'Nedbank', 'Standard Bank', 'African Bank', 'Investec', 'Bidvest Bank', 'Old Mutual Bank', 'Discovery Bank', 'Ubank', 'TymeBank'].map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </Field>
              <Field label="Account Number" required>
                <input className={inputCls} value={banking.accountNumber}
                  onChange={e => setBanking(b => ({ ...b, accountNumber: e.target.value.replace(/\D/g, '') }))} />
              </Field>
              <Field label="Account Type" required>
                <select className={selectCls} value={banking.accountType}
                  onChange={e => setBanking(b => ({ ...b, accountType: e.target.value as AccountType }))}>
                  <option value="CHEQUE">Cheque / Current</option>
                  <option value="SAVINGS">Savings</option>
                </select>
              </Field>
              <Field label="Debit Order Date (day of month)" required>
                <select className={selectCls} value={banking.debitOrderDate}
                  onChange={e => setBanking(b => ({ ...b, debitOrderDate: e.target.value }))}>
                  {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </Field>
            </div>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex justify-between">
            <button onClick={() => setStep(1)} className="text-gray-400 hover:text-white text-sm">← Back</button>
            <button onClick={goToStep3}
              className="px-8 py-3 bg-zeno-cyan hover:bg-cyan-400 text-zeno-navy font-bold rounded-lg transition-all">
              Next: Product Details →
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Product-specific ──────────────────────────────────────────── */}
      {step === 3 && (
        <div className="bg-zeno-blue/30 border border-zeno-cyan/20 rounded-2xl p-8 space-y-8">
          <h2 className="text-lg font-semibold text-white mb-2">
            {product === 'CLI' && 'Credit Accounts to Replace'}
            {product === 'AIP' && 'Income Protector Details'}
            {product === 'FUNERAL' && 'Funeral Cover Details'}
          </h2>

          {/* ── CLI ── */}
          {product === 'CLI' && (
            <div className="space-y-4">
              <p className="text-xs text-gray-400">Add each credit account being replaced. Excluded: mortgage, home loan, vehicle finance.</p>

              {creditAccounts.map((acc, idx) => (
                <div key={acc.id} className="bg-black/20 border border-white/10 rounded-xl p-5">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-sm font-medium text-gray-300">Account {idx + 1}</span>
                    {creditAccounts.length > 1 && (
                      <button onClick={() => removeCreditAccount(acc.id)} className="text-xs text-red-400 hover:text-red-300">Remove</button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Field label="Credit Provider" required>
                      <input className={inputCls} placeholder="e.g. ABSA, Capitec" value={acc.creditProvider}
                        onChange={e => updateCreditAccount(acc.id, 'creditProvider', e.target.value)} />
                    </Field>
                    <Field label="Account Type" required>
                      <select className={selectCls} value={acc.accountType}
                        onChange={e => updateCreditAccount(acc.id, 'accountType', e.target.value)}>
                        {['Personal Loan', 'Credit Card', 'Store Account', 'Clothing Account', 'Overdraft', 'Short Term Loan'].map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Account Number">
                      <input className={inputCls} placeholder="Optional" value={acc.accountNumber}
                        onChange={e => updateCreditAccount(acc.id, 'accountNumber', e.target.value)} />
                    </Field>
                    <Field label="Outstanding Balance (R)">
                      <input type="number" min="0" className={inputCls} placeholder="0.00" value={acc.outstandingBalance}
                        onChange={e => updateCreditAccount(acc.id, 'outstandingBalance', e.target.value)} />
                    </Field>
                    <Field label="Current Monthly Premium (R)">
                      <input type="number" min="0" step="0.01" className={inputCls} placeholder="0.00" value={acc.currentPremium}
                        onChange={e => updateCreditAccount(acc.id, 'currentPremium', e.target.value)} />
                    </Field>
                    <Field label="New DCCP Premium (R)" required>
                      <input type="number" min="0.01" step="0.01" className={inputCls} placeholder="0.00" value={acc.newPremium}
                        onChange={e => updateCreditAccount(acc.id, 'newPremium', e.target.value)} />
                    </Field>
                  </div>
                  {acc.currentPremium && acc.newPremium && (
                    <div className="mt-3 text-xs text-green-400">
                      Monthly saving: {zar(r2((parseFloat(acc.currentPremium) || 0) - parseFloat(acc.newPremium)))}
                    </div>
                  )}
                </div>
              ))}

              <button onClick={addCreditAccount}
                className="w-full py-3 border border-dashed border-white/20 hover:border-zeno-cyan/40 text-gray-400 hover:text-zeno-cyan rounded-xl text-sm transition-all">
                + Add Another Account
              </button>

              {/* Commission live preview */}
              {commission && commission.retailPremium > 0 && (
                <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
                  <p className="text-xs text-gray-400 mb-2">Commission Preview</p>
                  <div className="flex gap-6 text-sm">
                    <div><span className="text-gray-400">Total New Premium: </span><span className="text-white font-bold">{zar(commission.retailPremium)}/pm</span></div>
                    <div><span className="text-gray-400">Your Fee: </span><span className="text-green-400 font-bold">{zar(commission.referralFee)}/pm</span></div>
                    <div><span className="text-gray-400">Annual: </span><span className="text-green-400 font-bold">{zar(commission.annualFee)}</span></div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── AIP ── */}
          {product === 'AIP' && (
            <div className="space-y-6">
              <div>
                <p className="text-xs text-gray-400 mb-4">Client must be permanently employed ≥20 hours/week, age 18–65.</p>
                <Field label="Monthly Benefit" required>
                  <div className="grid grid-cols-3 gap-3 mt-1">
                    {AIP_TIERS.map(t => (
                      <button
                        key={t.monthlyBenefit}
                        onClick={() => setAipBenefit(t.monthlyBenefit as 5000 | 10000 | 15000)}
                        className={`p-4 rounded-xl border-2 text-center transition-all ${aipBenefit === t.monthlyBenefit ? 'border-purple-400 bg-purple-500/10' : 'border-white/10 bg-black/20 hover:border-purple-500/40'}`}
                      >
                        <p className="font-bold text-white">R{t.monthlyBenefit.toLocaleString()}</p>
                        <p className="text-xs text-gray-400">benefit/mo</p>
                        <p className="text-purple-400 text-sm font-semibold mt-1">R{t.referralFee}/pm fee</p>
                      </button>
                    ))}
                  </div>
                </Field>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Employer Name" required>
                  <input className={inputCls} value={employerName}
                    onChange={e => setEmployerName(e.target.value)} />
                </Field>
                <Field label="Employed Since" required>
                  <input type="date" className={inputCls} value={employedSince}
                    onChange={e => setEmployedSince(e.target.value)} />
                </Field>
              </div>
            </div>
          )}

          {/* ── FUNERAL ── */}
          {product === 'FUNERAL' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-400 mb-2">Cover Type</p>
                  <div className="grid grid-cols-2 gap-3">
                    {(['INDIVIDUAL', 'FAMILY'] as const).map(t => (
                      <button key={t} onClick={() => setFuneralCoverType(t)}
                        className={`py-3 rounded-xl border-2 text-sm font-medium transition-all ${funeralCoverType === t ? 'border-orange-400 bg-orange-500/10 text-orange-300' : 'border-white/10 bg-black/20 text-gray-400 hover:border-orange-500/30'}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-2">Cover Amount</p>
                  <div className="space-y-2">
                    {[10_000, 20_000, 30_000].map(amt => {
                      const tiers = funeralCoverType === 'INDIVIDUAL' ? IND_FUNERAL_TIERS : FAM_FUNERAL_TIERS
                      const tier = tiers.find(t => t.coverAmount === amt)!
                      return (
                        <button key={amt} onClick={() => setFuneralCoverAmount(amt as 10000 | 20000 | 30000)}
                          className={`w-full flex justify-between items-center px-4 py-2.5 rounded-lg border-2 text-sm transition-all ${funeralCoverAmount === amt ? 'border-orange-400 bg-orange-500/10' : 'border-white/10 bg-black/20 hover:border-orange-500/30'}`}>
                          <span className="text-white">R{amt.toLocaleString()}</span>
                          <span className="text-orange-400 font-medium">R{tier.referralFee}/pm fee</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Beneficiary Full Name" required>
                  <input className={inputCls} value={beneficiaryName}
                    onChange={e => setBeneficiaryName(e.target.value)} />
                </Field>
                <Field label="Beneficiary Relationship" required>
                  <input className={inputCls} placeholder="e.g. Spouse, Child, Parent" value={beneficiaryRelationship}
                    onChange={e => setBeneficiaryRelationship(e.target.value)} />
                </Field>
              </div>

              {funeralCoverType === 'FAMILY' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-white">Dependants</p>
                    <button onClick={addDependant}
                      className="text-xs text-zeno-cyan hover:text-cyan-300">+ Add Dependant</button>
                  </div>
                  {dependants.length === 0 && (
                    <p className="text-xs text-gray-500 py-4 text-center border border-dashed border-white/10 rounded-xl">
                      No dependants added. Click + Add Dependant above.
                    </p>
                  )}
                  {dependants.map((dep, idx) => (
                    <div key={dep.id} className="bg-black/20 border border-white/10 rounded-xl p-4">
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-xs text-gray-400">Dependant {idx + 1}</span>
                        <button onClick={() => removeDependant(dep.id)} className="text-xs text-red-400 hover:text-red-300">Remove</button>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <Field label="Relationship">
                          <select className={selectCls} value={dep.relationship}
                            onChange={e => updateDependant(dep.id, 'relationship', e.target.value)}>
                            <option value="HUSBAND">Husband</option>
                            <option value="WIFE">Wife</option>
                            <option value="CHILD_14_21">Child (14–21)</option>
                            <option value="CHILD_7_13">Child (7–13)</option>
                            <option value="CHILD_0_6">Child (0–6)</option>
                            <option value="STILLBORN">Stillborn</option>
                          </select>
                        </Field>
                        <Field label="First Name">
                          <input className={inputCls} value={dep.firstName}
                            onChange={e => updateDependant(dep.id, 'firstName', e.target.value)} />
                        </Field>
                        <Field label="Last Name">
                          <input className={inputCls} value={dep.lastName}
                            onChange={e => updateDependant(dep.id, 'lastName', e.target.value)} />
                        </Field>
                        <Field label="ID Number">
                          <input className={inputCls} value={dep.idNumber}
                            onChange={e => updateDependant(dep.id, 'idNumber', e.target.value)} />
                        </Field>
                        <Field label="Cover Amount (R)">
                          <input type="number" min="0" className={inputCls} value={dep.coverAmount}
                            onChange={e => updateDependant(dep.id, 'coverAmount', e.target.value)} />
                        </Field>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Shared: previous insurance + inception date */}
          <div className="pt-4 border-t border-white/10 space-y-4">
            <Field label="Policy Inception Date" required>
              <input type="date" className={inputCls} value={inceptionDate}
                onChange={e => setInceptionDate(e.target.value)} />
            </Field>

            <div>
              <label className="flex items-center gap-3 cursor-pointer mb-3">
                <input type="checkbox" checked={hasPreviousPolicy}
                  onChange={e => setHasPreviousPolicy(e.target.checked)}
                  className="w-4 h-4 rounded border-white/20 accent-zeno-cyan" />
                <span className="text-sm text-gray-300">Client has existing insurance to replace (waiting period waiver)</span>
              </label>
              {hasPreviousPolicy && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 ml-7">
                  <Field label="Previous Insurer Name">
                    <input className={inputCls} value={previousInsurerName}
                      onChange={e => setPreviousInsurerName(e.target.value)} />
                  </Field>
                  <Field label="Previous Policy Number">
                    <input className={inputCls} value={previousPolicyNumber}
                      onChange={e => setPreviousPolicyNumber(e.target.value)} />
                  </Field>
                  <div className="md:col-span-2">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" checked={previousPolicySchedule}
                        onChange={e => setPreviousPolicySchedule(e.target.checked)}
                        className="w-4 h-4 rounded border-white/20 accent-zeno-cyan" />
                      <span className="text-sm text-gray-300">Client can provide previous policy schedule</span>
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex justify-between">
            <button onClick={() => setStep(2)} className="text-gray-400 hover:text-white text-sm">← Back</button>
            <button onClick={goToStep4}
              className="px-8 py-3 bg-zeno-cyan hover:bg-cyan-400 text-zeno-navy font-bold rounded-lg transition-all">
              Review & Save →
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 4: Review ────────────────────────────────────────────────────── */}
      {step === 4 && commission && (
        <div className="bg-zeno-blue/30 border border-zeno-cyan/20 rounded-2xl p-8 space-y-6">
          <h2 className="text-lg font-semibold text-white">Review & Save</h2>

          {/* Commission highlight */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-zeno-blue/40 p-4 rounded-xl border border-green-500/20 text-center">
              <p className="text-xs text-gray-400 mb-1">Monthly Premium</p>
              <p className="text-xl font-bold text-white">{zar(commission.retailPremium)}</p>
            </div>
            <div className="bg-zeno-blue/40 p-4 rounded-xl border border-green-500/30 text-center">
              <p className="text-xs text-gray-400 mb-1">Your Monthly Fee</p>
              <p className="text-xl font-bold text-green-400">{zar(commission.referralFee)}</p>
            </div>
            <div className="bg-zeno-blue/40 p-4 rounded-xl border border-green-500/20 text-center">
              <p className="text-xs text-gray-400 mb-1">Annual Fee</p>
              <p className="text-xl font-bold text-green-400">{zar(commission.annualFee)}</p>
            </div>
          </div>

          {/* Summary table */}
          <div className="bg-black/20 rounded-xl border border-white/10 divide-y divide-white/5 text-sm">
            <div className="flex justify-between px-5 py-3">
              <span className="text-gray-400">Product</span>
              <span className="text-white font-medium">
                {product === 'CLI' && 'Credit Life Insurance'}
                {product === 'AIP' && `Income Protector — R${aipBenefit.toLocaleString()}/mo benefit`}
                {product === 'FUNERAL' && `Funeral Cover (${funeralCoverType}) — R${funeralCoverAmount.toLocaleString()}`}
              </span>
            </div>
            <div className="flex justify-between px-5 py-3">
              <span className="text-gray-400">Client</span>
              <span className="text-white">{client.firstName} {client.lastName} ({client.idNumber})</span>
            </div>
            <div className="flex justify-between px-5 py-3">
              <span className="text-gray-400">Phone</span>
              <span className="text-white">{client.phone}</span>
            </div>
            <div className="flex justify-between px-5 py-3">
              <span className="text-gray-400">Bank</span>
              <span className="text-white">{banking.bankName} — {banking.accountType} — {banking.accountNumber}</span>
            </div>
            <div className="flex justify-between px-5 py-3">
              <span className="text-gray-400">Debit Order Day</span>
              <span className="text-white">{banking.debitOrderDate}</span>
            </div>
            <div className="flex justify-between px-5 py-3">
              <span className="text-gray-400">Inception Date</span>
              <span className="text-white">{inceptionDate}</span>
            </div>
            {product === 'CLI' && (
              <div className="px-5 py-3">
                <span className="text-gray-400 block mb-2">Credit Accounts ({creditAccounts.length})</span>
                {creditAccounts.map((a, i) => (
                  <div key={a.id} className="flex justify-between text-xs py-1">
                    <span className="text-gray-300">{a.creditProvider} — {a.accountType}</span>
                    <span className="text-zeno-cyan">R{a.newPremium}/pm</span>
                  </div>
                ))}
              </div>
            )}
            {product === 'FUNERAL' && funeralCoverType === 'FAMILY' && dependants.length > 0 && (
              <div className="px-5 py-3">
                <span className="text-gray-400 block mb-2">Dependants ({dependants.length})</span>
                {dependants.map((d, i) => (
                  <div key={d.id} className="flex justify-between text-xs py-1">
                    <span className="text-gray-300">{d.firstName} {d.lastName} ({d.relationship})</span>
                    <span className="text-orange-400">R{d.coverAmount}</span>
                  </div>
                ))}
              </div>
            )}
            {hasPreviousPolicy && (
              <div className="flex justify-between px-5 py-3">
                <span className="text-gray-400">Previous Insurer</span>
                <span className="text-white">{previousInsurerName} — {previousPolicyNumber}</span>
              </div>
            )}
          </div>

          <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-xs text-yellow-300">
            This will save the policy as <strong>DRAFT</strong>. Portal submission to DCCP is done separately once credentials are configured.
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex justify-between items-center">
            <button onClick={() => setStep(3)} disabled={submitting} className="text-gray-400 hover:text-white text-sm">← Back</button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-8 py-3 bg-zeno-cyan hover:bg-cyan-400 text-zeno-navy font-bold rounded-lg transition-all shadow-lg shadow-zeno-cyan/20 flex items-center gap-2 disabled:opacity-50"
            >
              {submitting ? (
                <><div className="w-4 h-4 border-2 border-zeno-navy border-t-transparent rounded-full animate-spin" /> Saving...</>
              ) : (
                'Save Policy as Draft'
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
