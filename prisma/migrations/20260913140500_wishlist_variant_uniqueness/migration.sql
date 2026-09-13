-- Remove old composite unique index on (userId, productId) if it exists
DROP INDEX IF EXISTS "wishlist_items_userId_productId_key";

-- Create partial unique index for SIMPLE products (variantId IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS "wishlist_items_user_product_null_variant_idx"
ON "wishlist_items" ("userId", "productId")
WHERE "variantId" IS NULL;

-- Create partial unique index for VARIABLE products (variantId IS NOT NULL)
CREATE UNIQUE INDEX IF NOT EXISTS "wishlist_items_user_product_variant_idx"
ON "wishlist_items" ("userId", "productId", "variantId")
WHERE "variantId" IS NOT NULL;
