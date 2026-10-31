-- AlterTable
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "sku" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "products_sku_key" ON "products"("sku");
