export const CacheKeys = {
  homeFeed: (petSpecies?: string) =>
    petSpecies ? `cache:catalog:home:feed:${petSpecies}` : 'cache:catalog:home:feed',
  banners: () => 'cache:catalog:home:banners',
  testimonials: () => 'cache:catalog:home:testimonials',
  categoriesFlat: () => 'cache:catalog:categories:flat',
  categoriesTree: () => 'cache:catalog:categories:tree',
  categoryById: (id: string) => `cache:catalog:category:${id}`,

  productDetails: (idOrSlug: string) => `cache:product:${idOrSlug}:details`,

  shippingServiceability: (cacheKey: string) => `cache:shipping:serviceability:${cacheKey}`,

  orderTracking: (orderId: string) => `cache:order:${orderId}:tracking`,

  stockLock: (variantOrProductId: string) => `lock:stock:${variantOrProductId}`,

  webhookIdempotency: (eventId: string) => `idempotency:webhook:event:${eventId}`,

  searchSuggestions: (prefix: string) => `cache:search:suggest:${prefix.toLowerCase()}`,
  trendingSearches: () => 'trending:searches',
  searchFilters: (categoryId?: string) => `cache:search:filters:${categoryId || 'all'}`,
  popularSearches: () => 'cache:search:popular',

  otpCooldown: (type: string, identifier: string) => `otp:cooldown:${type}:${identifier}`,
  otpAttempts: (otpId: string) => `otp:attempts:${otpId}`,

  adminDashboard: (queryHash: string) => `cache:admin:dashboard:${queryHash}`,

  settingsGroup: (group: string) => `cache:settings:${group}`,
} as const;
