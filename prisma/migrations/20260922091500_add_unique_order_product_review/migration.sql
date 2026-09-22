-- CreateUniqueIndex
CREATE UNIQUE INDEX IF NOT EXISTS "product_reviews_orderId_productId_key" ON "product_reviews"("orderId", "productId");
