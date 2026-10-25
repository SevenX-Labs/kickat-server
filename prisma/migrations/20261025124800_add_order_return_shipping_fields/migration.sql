-- AlterTable
ALTER TABLE "order_returns" ADD COLUMN     "courierPartner" TEXT,
ADD COLUMN     "pickupScheduledDate" TIMESTAMP(3),
ADD COLUMN     "returnAwb" TEXT;

-- CreateIndex
CREATE INDEX "order_returns_returnAwb_idx" ON "order_returns"("returnAwb");
