-- Add REFUND_INITIATED enum value to PaymentStatusEnum (in-flight refund state)
ALTER TYPE "PaymentStatusEnum" ADD VALUE IF NOT EXISTS 'REFUND_INITIATED';

-- Add machine-readable cancellation reason code alongside the existing free-text cancelReason
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "cancelReasonCode" TEXT;
