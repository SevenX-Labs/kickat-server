-- CreateTable
CREATE TABLE "refund_audits" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderReturnId" TEXT,
    "userId" TEXT NOT NULL,
    "paymentId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "refundMethod" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerRefundId" TEXT,
    "transactionReference" TEXT,
    "actorType" TEXT NOT NULL DEFAULT 'ADMIN',
    "initiatedByAdminId" TEXT,
    "confirmedByAdminId" TEXT,
    "initiatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "failureCode" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refund_audits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "refund_audits_idempotencyKey_key" ON "refund_audits"("idempotencyKey");

-- CreateIndex
CREATE INDEX "refund_audits_orderId_idx" ON "refund_audits"("orderId");

-- CreateIndex
CREATE INDEX "refund_audits_userId_idx" ON "refund_audits"("userId");

-- CreateIndex
CREATE INDEX "refund_audits_orderReturnId_idx" ON "refund_audits"("orderReturnId");

-- CreateIndex
CREATE INDEX "refund_audits_providerRefundId_idx" ON "refund_audits"("providerRefundId");

-- CreateIndex
CREATE INDEX "refund_audits_status_idx" ON "refund_audits"("status");

-- AddForeignKey
ALTER TABLE "refund_audits" ADD CONSTRAINT "refund_audits_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_audits" ADD CONSTRAINT "refund_audits_orderReturnId_fkey" FOREIGN KEY ("orderReturnId") REFERENCES "order_returns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_audits" ADD CONSTRAINT "refund_audits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
