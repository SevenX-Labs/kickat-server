-- Add REFUNDED enum value to PaymentStatusEnum
ALTER TYPE "PaymentStatusEnum" ADD VALUE IF NOT EXISTS 'REFUNDED';

-- Add refund fields to order_returns table
ALTER TABLE "order_returns" ADD COLUMN IF NOT EXISTS "refundAmount" DOUBLE PRECISION;
ALTER TABLE "order_returns" ADD COLUMN IF NOT EXISTS "transactionReference" TEXT;
ALTER TABLE "order_returns" ADD COLUMN IF NOT EXISTS "refundedAt" TIMESTAMP(3);
