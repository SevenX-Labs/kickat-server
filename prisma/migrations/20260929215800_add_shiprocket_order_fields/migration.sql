-- AlterTable
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "shippingProvider" TEXT,
ADD COLUMN IF NOT EXISTS "shiprocketOrderId" TEXT,
ADD COLUMN IF NOT EXISTS "shiprocketShipmentId" TEXT;
