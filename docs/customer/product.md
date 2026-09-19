# Customer Product API Specification

All public product endpoints are served under `/api/v1/products`.

---

## Endpoints Overview

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/products` | No | Get paginated products with advanced filters |
| `GET` | `/api/v1/products/:id` | No | Get full product details |
| `GET` | `/api/v1/products/:id/variants` | No | Get product SKUs/Variants |
| `GET` | `/api/v1/products/:id/media` | No | Get product images & videos |
| `GET` | `/api/v1/products/:id/related` | No | Get related products feed |
| `GET` | `/api/v1/products/:id/reviews` | No | Get paginated product reviews |

---

## Endpoint Details

### 1. Product Search & Catalog

#### Get Products
- **GET** `/api/v1/products`
- **Query Params:** `page`, `limit`, `search`, `categoryId`, `brand`, `priceMin`, `priceMax`, `petSpecies`, `diet`, `sort` (`newest`, `price_asc`, `price_desc`, `popularity`, `rating`).
- **Response:** Paginated products feed (used for catalog, search results, and category pages).

### 2. Product Details

#### Get Single Product
- **GET** `/api/v1/products/:id` (id can be UUID or `slug`)
- **Response:** Full product description, average rating, reviews count, specifications, and primary stock info.

#### Get Product Variants
- **GET** `/api/v1/products/:id/variants`
- **Response:** List of variants (e.g., sizes, flavors, colors) for a `VARIABLE` type product, including variant-specific pricing and stock.

#### Get Media
- **GET** `/api/v1/products/:id/media`
- **Response:** Aggregated list of all images and videos for the product carousel.

### 3. Product Context

#### Get Related Products
- **GET** `/api/v1/products/:id/related`
- **Description:** Returns products from the same category or brand, heavily utilizing caching.

#### Get Product Reviews
- **GET** `/api/v1/products/:id/reviews`
- **Query Params:** `page`, `limit`, `rating` (to filter by 5-star, 4-star, etc).
- **Response:** Paginated user reviews for the product.
