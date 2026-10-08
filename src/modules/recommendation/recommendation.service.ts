import { Injectable } from '@nestjs/common';
import { PetSpecies, Product } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * ---------------------------------------------------------------------------
 * SCORING WEIGHTS  (tune these to change recommendation behaviour)
 * ---------------------------------------------------------------------------
 * Every candidate product earns points for each profile signal it matches.
 * A higher weight means that signal pushes a product further up the list.
 */
const SCORE_WEIGHTS = {
  /** Candidate sits in a category the customer has engaged with. */
  CATEGORY_MATCH: 5,
  /** Candidate targets the same pet species the customer shops for. */
  PET_TYPE_MATCH: 4,
  /** Candidate is from a brand the customer has engaged with. */
  BRAND_MATCH: 3,
  /** Candidate name/description/brand matches a past search keyword. */
  KEYWORD_MATCH: 3,
  /** Candidate price falls inside the customer's observed price band. */
  PRICE_BAND_MATCH: 2,
  /** Candidate shares BOTH a category AND brand with a signal (same group). */
  CATEGORY_BRAND_COMBO: 2,
  /** Per-point multiplier applied to the product rating (quality tie-breaker). */
  RATING_WEIGHT: 0.5,
};

/**
 * How strongly each kind of behaviour expresses intent. A purchase says far
 * more about taste than a single page view, so signals are weighted by source
 * when we build the interest profile.
 */
const SIGNAL_WEIGHTS = {
  ORDER: 5,
  CART: 4,
  WISHLIST: 3,
  RECENTLY_VIEWED: 2,
};

/** Price band is the average signal price widened by this fraction each way. */
const PRICE_BAND_TOLERANCE = 0.4; // ±40%

/** Upper bound on the candidate pool we score in memory (keeps queries cheap). */
const CANDIDATE_POOL_SIZE = 200;

/** A product + its relations, as returned to the client. */
type ProductWithRelations = Product & {
  category?: unknown;
  variants?: unknown;
};

/** Weighted affinity maps derived from the customer's activity. */
interface InterestProfile {
  categoryAffinity: Map<string, number>;
  petAffinity: Map<PetSpecies, number>;
  brandAffinity: Map<string, number>;
  keywords: string[];
  priceSamples: number[];
  /** Products to exclude from "Suggested for You" (already seen / owned). */
  excludedProductIds: Set<string>;
  /** Whether the customer has ANY activity at all. */
  hasActivity: boolean;
}

@Injectable()
export class RecommendationService {
  private static readonly DEFAULT_LIMIT = 10;
  private static readonly MAX_LIMIT = 20;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /customer/products/recommended  ("Suggested for You")
   *
   * Flow:
   *  1. userId comes from the JWT (passed in by the controller).
   *  2. Fetch the customer's searches, views, wishlist, cart and orders.
   *  3. Derive an interest profile (categories, pet type, brands, price band).
   *  4. Score candidate products against that profile.
   *  5. Exclude products already viewed / carted / ordered.
   *  6. Keep only available, active, in-stock products.
   *  7. Rank by score and return the top N.
   * Cold-start customers (no activity) get a non-personalised fallback.
   */
  async getRecommended(userId: string, limit?: number) {
    const take = Math.min(
      limit ?? RecommendationService.DEFAULT_LIMIT,
      RecommendationService.MAX_LIMIT,
    );

    const profile = await this.buildInterestProfile(userId);

    // ---- Cold start: no signals at all -> fallback, do NOT fabricate ----
    if (!profile.hasActivity) {
      const products = await this.getFallbackProducts(take);
      return {
        success: true,
        personalized: false,
        products,
      };
    }

    const candidates = await this.fetchCandidates(profile, take);

    // Score every candidate and sort high-to-low.
    const ranked = candidates
      .map((product) => ({
        product,
        score: this.scoreProduct(product, profile),
      }))
      // Keep only products that actually matched something.
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, take)
      .map((entry) => entry.product);

    // If the profile was too thin to produce matches, fall back gracefully.
    if (ranked.length === 0) {
      const products = await this.getFallbackProducts(
        take,
        profile.excludedProductIds,
      );
      return {
        success: true,
        personalized: false,
        products,
      };
    }

    return {
      success: true,
      personalized: true,
      products: ranked,
    };
  }

  /**
   * Gathers all five behavioural signals for the customer in parallel and
   * condenses them into weighted affinity maps + an exclusion set.
   */
  private async buildInterestProfile(userId: string): Promise<InterestProfile> {
    // Only consider orders that still represent genuine intent.
    const [searches, recentlyViewed, wishlist, cart, orderItems] =
      await Promise.all([
        this.prisma.recentSearch.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: { query: true },
        }),
        this.prisma.recentlyViewed.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            productId: true,
            product: {
              select: {
                categoryId: true,
                petSpecies: true,
                brand: true,
                price: true,
                discountPrice: true,
              },
            },
          },
        }),
        this.prisma.wishlistItem.findMany({
          where: { userId },
          select: {
            productId: true,
            product: {
              select: {
                categoryId: true,
                petSpecies: true,
                brand: true,
                price: true,
                discountPrice: true,
              },
            },
          },
        }),
        this.prisma.cartItem.findMany({
          where: { userId },
          select: {
            productId: true,
            product: {
              select: {
                categoryId: true,
                petSpecies: true,
                brand: true,
                price: true,
                discountPrice: true,
              },
            },
          },
        }),
        // OrderItem has no direct Product relation in the schema, so we only
        // pull productIds here and batch-load those products below.
        this.prisma.orderItem.findMany({
          where: { order: { userId, orderStatus: { not: 'CANCELLED' } } },
          select: { productId: true },
        }),
      ]);

    // Batch-fetch the ordered products in a single query (avoids N+1).
    const orderProductIds = [...new Set(orderItems.map((i) => i.productId))];
    const orderedProducts = orderProductIds.length
      ? await this.prisma.product.findMany({
          where: { id: { in: orderProductIds } },
          select: {
            id: true,
            categoryId: true,
            petSpecies: true,
            brand: true,
            price: true,
            discountPrice: true,
          },
        })
      : [];

    const categoryAffinity = new Map<string, number>();
    const petAffinity = new Map<PetSpecies, number>();
    const brandAffinity = new Map<string, number>();
    const priceSamples: number[] = [];
    const excludedProductIds = new Set<string>();

    // Helper: fold one signal product into the affinity maps, weighted by source.
    const absorb = (
      product: {
        categoryId: string;
        petSpecies: PetSpecies | null;
        brand: string | null;
        price: number;
        discountPrice: number | null;
      } | null,
      weight: number,
    ) => {
      if (!product) return;
      categoryAffinity.set(
        product.categoryId,
        (categoryAffinity.get(product.categoryId) ?? 0) + weight,
      );
      if (product.petSpecies) {
        petAffinity.set(
          product.petSpecies,
          (petAffinity.get(product.petSpecies) ?? 0) + weight,
        );
      }
      if (product.brand) {
        const brand = product.brand.toLowerCase();
        brandAffinity.set(brand, (brandAffinity.get(brand) ?? 0) + weight);
      }
      priceSamples.push(product.discountPrice ?? product.price);
    };

    // Orders are the strongest signal; views the weakest.
    for (const product of orderedProducts) {
      absorb(product, SIGNAL_WEIGHTS.ORDER);
      excludedProductIds.add(product.id); // don't re-recommend purchases
    }
    for (const item of cart) {
      absorb(item.product, SIGNAL_WEIGHTS.CART);
      excludedProductIds.add(item.productId); // already in cart
    }
    for (const item of wishlist) {
      absorb(item.product, SIGNAL_WEIGHTS.WISHLIST);
      // Wishlist is NOT excluded — the customer wants it but hasn't acted yet.
    }
    for (const item of recentlyViewed) {
      absorb(item.product, SIGNAL_WEIGHTS.RECENTLY_VIEWED);
      excludedProductIds.add(item.productId); // don't repeat what they just saw
    }

    // Normalise search terms into lowercase keyword tokens.
    const keywords = this.extractKeywords(searches.map((s) => s.query));

    const hasActivity =
      searches.length > 0 ||
      recentlyViewed.length > 0 ||
      wishlist.length > 0 ||
      cart.length > 0 ||
      orderItems.length > 0;

    return {
      categoryAffinity,
      petAffinity,
      brandAffinity,
      keywords,
      priceSamples,
      excludedProductIds,
      hasActivity,
    };
  }

  /**
   * Builds a bounded candidate pool: active, in-stock products that match at
   * least one facet of the profile and are not already seen/owned. Scoring
   * then happens in memory so we never issue a query per candidate (no N+1).
   */
  private async fetchCandidates(
    profile: InterestProfile,
    take: number,
  ): Promise<ProductWithRelations[]> {
    const categoryIds = [...profile.categoryAffinity.keys()];
    const petSpecies = [...profile.petAffinity.keys()];
    const brands = [...profile.brandAffinity.keys()];

    // OR across every profile facet so we only pull plausibly-relevant rows.
    const orConditions: any[] = [];
    if (categoryIds.length)
      orConditions.push({ categoryId: { in: categoryIds } });
    if (petSpecies.length)
      orConditions.push({ petSpecies: { in: petSpecies } });
    if (brands.length) {
      orConditions.push({
        OR: brands.map((b) => ({ brand: { equals: b, mode: 'insensitive' } })),
      });
    }
    for (const keyword of profile.keywords) {
      orConditions.push({ name: { contains: keyword, mode: 'insensitive' } });
      orConditions.push({ brand: { contains: keyword, mode: 'insensitive' } });
      orConditions.push({
        description: { contains: keyword, mode: 'insensitive' },
      });
    }

    // Nothing to match on (e.g. only blank searches) -> no personalised pool.
    if (orConditions.length === 0) return [];

    return this.prisma.product.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        stock: { gt: 0 }, // filter out out-of-stock products
        id: { notIn: [...profile.excludedProductIds] }, // exclude seen/owned
        OR: orConditions,
      },
      orderBy: { rating: 'desc' },
      take: Math.max(CANDIDATE_POOL_SIZE, take),
      include: {
        variants: true,
        category: { select: { id: true, name: true, slug: true } },
      },
    });
  }

  /**
   * Relevance score for a single candidate against the interest profile.
   * Each matched facet contributes its weight scaled by how strongly that
   * facet appears in the customer's history.
   */
  private scoreProduct(product: Product, profile: InterestProfile): number {
    let score = 0;

    const categoryWeight =
      profile.categoryAffinity.get(product.categoryId) ?? 0;
    if (categoryWeight > 0) {
      score += SCORE_WEIGHTS.CATEGORY_MATCH * categoryWeight;
    }

    if (product.petSpecies) {
      const petWeight = profile.petAffinity.get(product.petSpecies) ?? 0;
      if (petWeight > 0) score += SCORE_WEIGHTS.PET_TYPE_MATCH * petWeight;
    }

    let brandWeight = 0;
    if (product.brand) {
      brandWeight = profile.brandAffinity.get(product.brand.toLowerCase()) ?? 0;
      if (brandWeight > 0) score += SCORE_WEIGHTS.BRAND_MATCH * brandWeight;
    }

    // "Same variant group": same category AND same brand as something the
    // customer engaged with — a strong signal of a close substitute.
    if (categoryWeight > 0 && brandWeight > 0) {
      score += SCORE_WEIGHTS.CATEGORY_BRAND_COMBO;
    }

    // Keyword match from past searches.
    if (profile.keywords.length) {
      const haystack = `${product.name} ${product.brand ?? ''} ${
        product.description ?? ''
      }`.toLowerCase();
      if (profile.keywords.some((kw) => haystack.includes(kw))) {
        score += SCORE_WEIGHTS.KEYWORD_MATCH;
      }
    }

    // Price-band match: candidate priced near the customer's typical spend.
    if (profile.priceSamples.length) {
      const avg =
        profile.priceSamples.reduce((sum, p) => sum + p, 0) /
        profile.priceSamples.length;
      const lower = avg * (1 - PRICE_BAND_TOLERANCE);
      const upper = avg * (1 + PRICE_BAND_TOLERANCE);
      const effectivePrice = product.discountPrice ?? product.price;
      if (effectivePrice >= lower && effectivePrice <= upper) {
        score += SCORE_WEIGHTS.PRICE_BAND_MATCH;
      }
    }

    // Quality tie-breaker so better-rated products edge ahead on equal matches.
    score += product.rating * SCORE_WEIGHTS.RATING_WEIGHT;

    return score;
  }

  /**
   * Cold-start / fallback feed. Reuses the existing best-seller & trending
   * flags, then tops up with newest arrivals — all real queries, no fake data.
   */
  private async getFallbackProducts(
    take: number,
    exclude: Set<string> = new Set(),
  ): Promise<ProductWithRelations[]> {
    const baseWhere = {
      deletedAt: null,
      status: 'ACTIVE' as const,
      stock: { gt: 0 },
      id: { notIn: [...exclude] },
    };

    const include = {
      variants: true,
      category: { select: { id: true, name: true, slug: true } },
    };

    // Best sellers first, then trending, then newest — de-duplicated, capped.
    const [bestSellers, trending, newArrivals] = await Promise.all([
      this.prisma.product.findMany({
        where: { ...baseWhere, isBestSeller: true },
        orderBy: { reviewsCount: 'desc' },
        take,
        include,
      }),
      this.prisma.product.findMany({
        where: { ...baseWhere, isTrending: true },
        orderBy: { rating: 'desc' },
        take,
        include,
      }),
      this.prisma.product.findMany({
        where: baseWhere,
        orderBy: { createdAt: 'desc' },
        take,
        include,
      }),
    ]);

    const deduped = new Map<string, ProductWithRelations>();
    for (const product of [...bestSellers, ...trending, ...newArrivals]) {
      if (!deduped.has(product.id)) deduped.set(product.id, product);
      if (deduped.size >= take) break;
    }

    return [...deduped.values()].slice(0, take);
  }

  /**
   * Turns raw search strings into a de-duplicated set of lowercase keyword
   * tokens, dropping very short/noise tokens.
   */
  private extractKeywords(queries: string[]): string[] {
    const tokens = new Set<string>();
    for (const query of queries) {
      for (const raw of query.toLowerCase().split(/[^a-z0-9]+/)) {
        if (raw.length >= 3) tokens.add(raw);
      }
    }
    return [...tokens];
  }
}
