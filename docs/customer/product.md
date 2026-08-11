# Customer Products Catalog API Specification

All product endpoints are served under `/api/v1/products`.

---

## Endpoints Overview

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/products` | No | Browse catalog with pagination, filters, and sorting |
| `GET` | `/api/v1/products/:id` | No | Get single product details by UUID |
| `GET` | `/api/v1/products/:id/variants` | No | Get product SKU variants (size, flavor, weight) |
| `GET` | `/api/v1/products/:id/media` | No | Get product images and video demonstrations |
| `GET` | `/api/v1/products/:id/images` | No | Get product image gallery |
| `GET` | `/api/v1/products/:id/videos` | No | Get product video demonstrations |
| `GET` | `/api/v1/products/:id/related` | No | Get related products in same category/species |
| `GET` | `/api/v1/products/:id/reviews` | No | Get product reviews with rating breakdown |
| `GET` | `/api/v1/products/trending` | No | Get trending products list |
| `GET` | `/api/v1/products/best-sellers` | No | Get best sellers list |
| `GET` | `/api/v1/products/recommended` | Optional | Personalized product recommendations |
| `GET` | `/api/v1/products/buy-again` | Yes | Get past purchased products for fast reordering |

---

## Detailed Endpoints

### Browse Products
`GET /api/v1/products`
- **Query Params**:
  - `page`: 1
  - `limit`: 10
  - `categoryId`: `UUID`
  - `sort`: `price_asc` | `price_desc` | `popularity` | `newest` | `rating`
  - `priceMin`: 100
  - `priceMax`: 3000
  - `petSpecies`: `dog` | `cat` | `bird` | `fish` | `rabbit`
  - `diet`: `veg` | `non_veg`
  - `inStock`: `true`
  - `rating`: 4
