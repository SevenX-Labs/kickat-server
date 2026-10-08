-- Real courier scan events per order (Shiprocket webhook scans / AWB tracking pulls).
-- CreateTable
CREATE TABLE "order_tracking_events" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "awb" TEXT,
    "shipmentId" TEXT,
    "rawStatus" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "eventAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_tracking_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_tracking_events_orderId_eventAt_idx" ON "order_tracking_events"("orderId", "eventAt");

-- CreateIndex
CREATE UNIQUE INDEX "order_tracking_events_orderId_rawStatus_eventAt_key" ON "order_tracking_events"("orderId", "rawStatus", "eventAt");

-- AddForeignKey
ALTER TABLE "order_tracking_events" ADD CONSTRAINT "order_tracking_events_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

