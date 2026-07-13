-- Two kinds of referrers: COMMISSION referrers earn a payout per referral
-- (their clients pay full price); DISCOUNT referrers earn no commission but
-- their clients get discounted pricing.
ALTER TABLE "Referrer" ADD COLUMN "referrerType" TEXT NOT NULL DEFAULT 'COMMISSION';
ALTER TABLE "Referrer" ADD COLUMN "clientDiscountPercent" DECIMAL(65,30);
