-- CreateEnum
CREATE TYPE "PayoutMethodEnum" AS ENUM ('UPI', 'BANK_TRANSFER', 'ORIGINAL_PAYMENT');

-- CreateEnum
CREATE TYPE "QcStatusEnum" AS ENUM ('PENDING', 'PASSED', 'FAILED');

-- AlterEnum
ALTER TYPE "OrderStatusEnum" ADD VALUE 'RTO_INITIATED';
ALTER TYPE "OrderStatusEnum" ADD VALUE 'RTO_IN_TRANSIT';
ALTER TYPE "OrderStatusEnum" ADD VALUE 'RTO_DELIVERED';

-- AlterTable (Order: RTO fields)
ALTER TABLE "orders" ADD COLUMN "rtoInitiatedAt" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN "rtoDeliveredAt" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN "rtoAwb" TEXT;
ALTER TABLE "orders" ADD COLUMN "rtoReason" TEXT;

-- AlterTable (OrderReturn: COD payout + QC fields)
ALTER TABLE "order_returns" ADD COLUMN "payoutMethod" "PayoutMethodEnum";
ALTER TABLE "order_returns" ADD COLUMN "upiId" TEXT;
ALTER TABLE "order_returns" ADD COLUMN "bankAccountNumber" TEXT;
ALTER TABLE "order_returns" ADD COLUMN "bankIfscCode" TEXT;
ALTER TABLE "order_returns" ADD COLUMN "bankAccountName" TEXT;
ALTER TABLE "order_returns" ADD COLUMN "qcStatus" "QcStatusEnum";
ALTER TABLE "order_returns" ADD COLUMN "qcNotes" TEXT;
ALTER TABLE "order_returns" ADD COLUMN "qcCompletedAt" TIMESTAMP(3);
ALTER TABLE "order_returns" ADD COLUMN "reversePickupId" TEXT;
