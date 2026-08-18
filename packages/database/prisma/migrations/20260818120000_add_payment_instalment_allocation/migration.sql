-- Allocate a payment to a specific scheduled instalment (month).
-- Null keeps today's behaviour: the payment falls into the FIFO pool that fills
-- the oldest open month first. Set explicitly when staff capture a back-dated
-- month after later months were already recorded (proof brought forward).

ALTER TABLE "Payment" ADD COLUMN "instalmentId" TEXT;

CREATE INDEX "Payment_instalmentId_idx" ON "Payment"("instalmentId");

ALTER TABLE "Payment"
    ADD CONSTRAINT "Payment_instalmentId_fkey"
    FOREIGN KEY ("instalmentId") REFERENCES "PaymentArrangementInstalment"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
