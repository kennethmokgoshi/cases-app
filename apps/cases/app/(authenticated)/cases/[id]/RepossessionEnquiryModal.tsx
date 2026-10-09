'use client';

/**
 * RepossessionEnquiryModal — the "Repossession Enquiry" button.
 *
 * Staff pick which credit account is the vehicle, add the vehicle details and the
 * financer's email, PREVIEW the letter, then send it. The server enforces the hard
 * rules (signed POA + ID must be on the case, the account must belong to the case);
 * this modal mirrors them so staff see the blocker before they start typing.
 */

import { useCallback, useEffect, useState } from 'react';
import { toast } from '@zenowethu/ui';

interface AccountOption {
  id: string;
  creditorName: string;
  accountNumber: string | null;
  accountType: string;
  outstandingBalance: number;
  status: string;
  likelyVehicle: boolean;
  providerEmail: string | null;
  providerAttorneyEmail: string | null;
}

interface EnquiryContext {
  clientName: string;
  idNumber: string;
  mandate: { complete: boolean; missing: ('POA' | 'ID')[]; summary: string };
  accounts: AccountOption[];
  preselectedAccountId: string | null;
  defaults: { replyWithinBusinessDays: number; pauseBusinessDays: number };
}

interface LetterPreview {
  subject: string;
  body: string;
  to: string;
  replyBy: string;
  pauseUntil: string;
}

interface ApiError {
  error?: string;
}

interface PostResponse extends ApiError {
  sent?: boolean;
  letter?: LetterPreview;
}

type Step = 'form' | 'preview' | 'sent';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
}

const INPUT = 'w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-gray-600';
const LABEL = 'text-[10px] text-gray-500 mb-1 block';

const rand = (n: number) => `R${n.toLocaleString('en-ZA', { maximumFractionDigits: 0 })}`;

export default function RepossessionEnquiryModal({ isOpen, onClose, caseId }: Props) {
  const [ctx, setCtx] = useState<EnquiryContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [accountId, setAccountId] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [reg, setReg] = useState('');
  const [email, setEmail] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [replyDays, setReplyDays] = useState(5);
  const [pauseDays, setPauseDays] = useState(10);
  const [saveContact, setSaveContact] = useState(false);

  const [step, setStep] = useState<Step>('form');
  const [letter, setLetter] = useState<LetterPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const account = ctx?.accounts.find(a => a.id === accountId) ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetch(`/api/cases/${caseId}/repossession-enquiry`);
      const data: EnquiryContext & ApiError = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load the case accounts');
      setCtx(data);
      setReplyDays(data.defaults.replyWithinBusinessDays);
      setPauseDays(data.defaults.pauseBusinessDays);
      setAccountId(data.preselectedAccountId ?? '');
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load the case accounts');
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    if (!isOpen) return;
    setStep('form');
    setLetter(null);
    setError('');
    setEmail('');
    setEmailTouched(false);
    setSaveContact(false);
    load();
  }, [isOpen, load]);

  // Pre-fill the financer's email from the contact library until staff edit it.
  useEffect(() => {
    if (!emailTouched) setEmail(account?.providerEmail ?? '');
  }, [account, emailTouched]);

  const blocked = !ctx?.mandate.complete;
  const canSubmit = !!account && email.trim().length > 0 && !blocked && !busy;

  const submit = async (action: 'preview' | 'send') => {
    if (!account) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/cases/${caseId}/repossession-enquiry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          creditAccountId: account.id,
          vehicleDescription: vehicle.trim() || undefined,
          registrationNumber: reg.trim() || undefined,
          recipientEmail: email.trim(),
          replyWithinBusinessDays: replyDays,
          pauseBusinessDays: pauseDays,
          saveContact: saveContact && !account.providerEmail,
        }),
      });
      const data: PostResponse = await res.json().catch(() => ({}));
      if (!res.ok || !data.letter) throw new Error(data.error || 'Something went wrong. Please try again.');

      setLetter(data.letter);
      if (action === 'preview') {
        setStep('preview');
      } else {
        setStep('sent');
        toast.success(`Repossession enquiry sent to ${account.creditorName}`);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Something went wrong. Please try again.';
      setError(message);
      if (action === 'send') toast.error('The enquiry was not sent');
    } finally {
      setBusy(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[#1a1d23] rounded-2xl border border-white/10 shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <div>
            <h2 className="text-sm font-semibold text-white">Repossession Enquiry</h2>
            <p className="text-xs text-gray-500">
              {ctx ? `${ctx.clientName} · ID ${ctx.idNumber}` : 'Ask the vehicle financer where enforcement stands'}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-gray-500 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {loading && <p className="text-sm text-gray-500 text-center py-8">Loading the case accounts…</p>}

          {loadError && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-4 py-3 text-sm space-y-2">
              <p>{loadError}</p>
              <button onClick={load} className="underline text-red-300 text-xs">Try again</button>
            </div>
          )}

          {ctx && step === 'form' && (
            <>
              {blocked && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg px-4 py-3 text-sm">
                  <p className="font-semibold">This letter can&apos;t be sent yet.</p>
                  <p className="text-xs mt-1">
                    The case has no {ctx.mandate.missing.map(m => (m === 'POA' ? 'signed POA' : 'ID copy')).join(' or ')}.
                    The financer will not release account information without proof of our authority. Upload it to the
                    Documents tab, then reopen this window.
                  </p>
                </div>
              )}

              {ctx.accounts.length === 0 ? (
                <div className="bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-lg px-4 py-3 text-sm">
                  This case has no credit accounts yet. Sync them from the credit report first, so the letter can
                  name the right account.
                </div>
              ) : (
                <>
                  <div>
                    <label className={LABEL} htmlFor="rep-account">Which account is the vehicle?</label>
                    <select
                      id="rep-account"
                      className={INPUT}
                      value={accountId}
                      onChange={e => { setAccountId(e.target.value); setEmailTouched(false); }}
                    >
                      <option value="" className="bg-[#1a1d23]">Choose the vehicle account…</option>
                      {ctx.accounts.map(a => (
                        <option key={a.id} value={a.id} className="bg-[#1a1d23]">
                          {a.creditorName} · {a.accountNumber ?? 'no account number'} · {a.accountType} · {rand(a.outstandingBalance)}
                          {a.likelyVehicle ? ' · looks like vehicle finance' : ''}
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-gray-600 mt-1">
                      Credit reports don&apos;t always label vehicle finance, so please confirm the account number
                      against the finance agreement.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={LABEL} htmlFor="rep-vehicle">Vehicle make, model, year (optional)</label>
                      <input id="rep-vehicle" className={INPUT} value={vehicle} onChange={e => setVehicle(e.target.value)} placeholder="Toyota Hilux 2.4 GD-6 2021" />
                    </div>
                    <div>
                      <label className={LABEL} htmlFor="rep-reg">Registration number (optional)</label>
                      <input id="rep-reg" className={INPUT} value={reg} onChange={e => setReg(e.target.value)} placeholder="ABC 123 GP" />
                    </div>
                  </div>

                  <div>
                    <label className={LABEL} htmlFor="rep-email">Financer&apos;s Legal / Collections email</label>
                    <input
                      id="rep-email"
                      type="email"
                      className={INPUT}
                      value={email}
                      onChange={e => { setEmail(e.target.value); setEmailTouched(true); }}
                      placeholder="collections@financer.co.za"
                    />
                    {account?.providerAttorneyEmail && email !== account.providerAttorneyEmail && (
                      <button
                        type="button"
                        onClick={() => { setEmail(account.providerAttorneyEmail ?? ''); setEmailTouched(true); }}
                        className="text-[10px] text-indigo-300 underline mt-1"
                      >
                        Use their attorney&apos;s address ({account.providerAttorneyEmail})
                      </button>
                    )}
                    {account && !account.providerEmail && (
                      <label className="flex items-center gap-2 text-[11px] text-gray-400 mt-2">
                        <input type="checkbox" checked={saveContact} onChange={e => setSaveContact(e.target.checked)} />
                        Remember this email for {account.creditorName}
                      </label>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={LABEL} htmlFor="rep-reply">They must reply within (business days)</label>
                      <input id="rep-reply" type="number" min={1} max={30} className={INPUT} value={replyDays} onChange={e => setReplyDays(Number(e.target.value) || 1)} />
                    </div>
                    <div>
                      <label className={LABEL} htmlFor="rep-pause">Ask them to hold off for (business days)</label>
                      <input id="rep-pause" type="number" min={1} max={30} className={INPUT} value={pauseDays} onChange={e => setPauseDays(Number(e.target.value) || 1)} />
                    </div>
                  </div>

                  <p className="text-[11px] text-gray-500 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                    This letter <strong>asks</strong> for information and a short pause. It does not stop a
                    repossession, and it does not say the consumer is under debt review, because no application has
                    been lodged. {ctx.mandate.complete && <>The signed POA and ID copy are attached automatically.</>}
                  </p>
                </>
              )}
            </>
          )}

          {step === 'preview' && letter && (
            <div className="space-y-3">
              <p className="text-xs text-gray-400">
                Check the letter below. Nothing has been sent yet.
              </p>
              <div className="text-[11px] text-gray-400 space-y-0.5">
                <div><span className="text-gray-600">To:</span> {letter.to}</div>
                <div><span className="text-gray-600">Subject:</span> {letter.subject}</div>
                <div><span className="text-gray-600">Reply requested by:</span> {letter.replyBy} · <span className="text-gray-600">Pause requested until:</span> {letter.pauseUntil}</div>
                <div><span className="text-gray-600">Attachments:</span> {ctx?.mandate.summary}</div>
              </div>
              <pre className="whitespace-pre-wrap text-xs text-gray-200 bg-black/30 border border-white/10 rounded-lg p-4 font-sans leading-relaxed">
                {letter.body}
              </pre>
            </div>
          )}

          {step === 'sent' && letter && (
            <div className="text-center py-8 space-y-3">
              <div className="w-14 h-14 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-7 h-7 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-white font-semibold">Enquiry sent</p>
              <p className="text-gray-500 text-sm">
                Sent to {letter.to}. A reply is due by {letter.replyBy}. The letter and attachments are recorded on
                the case timeline — please follow up if there is no reply by then.
              </p>
              <button onClick={onClose} className="mt-2 px-6 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg transition-colors text-sm">Close</button>
            </div>
          )}

          {error && (
            <div role="alert" className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-4 py-2 text-sm">
              {error}
            </div>
          )}
        </div>

        {step !== 'sent' && ctx && (
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-white/5">
            {step === 'preview' ? (
              <>
                <button onClick={() => { setStep('form'); setError(''); }} disabled={busy} className="px-4 py-2 text-sm text-gray-300 hover:text-white disabled:opacity-50">
                  ← Edit details
                </button>
                <button
                  onClick={() => submit('send')}
                  disabled={busy}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
                >
                  {busy ? 'Sending…' : 'Send letter'}
                </button>
              </>
            ) : (
              <>
                <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
                <button
                  onClick={() => submit('preview')}
                  disabled={!canSubmit}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {busy ? 'Preparing…' : 'Preview letter'}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
