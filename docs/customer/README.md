# Customer API Documentation Directory

Welcome to the Customer API documentation directory for Kickat E-Commerce Server.

---

## Consolidated Customer API Reference
- 📘 [Single Master Customer API Guide](customer_api.md)

---

## Domain-Specific API Documentation Files

| Module | Documentation File | Base Path | Key Features |
| :--- | :--- | :--- | :--- |
| **Authentication** | [auth.md](auth.md) | `/api/v1/auth` | SMS OTP, Google OAuth, Refresh token cookie, Logout |
| **Profile & Onboarding** | [profile.md](profile.md) | `/api/v1/users`, `/api/v1/profile` | 3-step onboarding, Delivery addresses, Pet profiles, OTP verification |
| **Cart & Buy Now** | [cart.md](cart.md) | `/api/v1/cart` | Cart summary, Stock check, Instant buy-now, Guest cart merge |
| **Payments** | [payment.md](payment.md) | `/api/v1/payments` | Razorpay order creation, Signature verification, Retries, COD |
| **Products Catalog** | [product.md](product.md) | `/api/v1/products` | Browse catalog, Filters, SKU variants, Media gallery, Recommendations |
| **Categories** | [categories.md](categories.md) | `/api/v1/categories` | Active categories, Category tree, Category products |
| **Checkout** | [checkout.md](checkout.md) | `/api/v1/checkout` | Stock reservation, Pincode serviceability, Idempotent order placement |
| **Home & Content** | [home_browse.md](home_browse.md) | `/api/v1/home`, `/api/v1/blogs` | Banners, Trending products, Best sellers, Editorial blogs |
| **Orders & Returns** | [orders.md](orders.md) | `/api/v1/orders`, `/api/v1/returns` | Status timeline, Package & Live agent tracking, Tax invoices, 7-day returns |
| **Reviews** | [reviews.md](reviews.md) | `/api/v1/reviews` | Verified purchaser reviews, Rating breakdown, Helpful votes |
| **Search** | [search.md](search.md) | `/api/v1/search` | Full-text search, Suggestions, Recent searches, Filter facets |
| **Wishlist** | [wishlist.md](wishlist.md) | `/api/v1/wishlist` | Saved products, Add/Remove wishlist, Move to cart |
| **Notifications** | [notifications.md](notifications.md) | `/api/v1/notifications` | In-app notification feed, Mark read status |
