# Customer Home & Content API Specification

Endpoints for home feed, promotional banners, product collections (trending, recommended), and blogs under `/api/v1`.

---

## Endpoints Overview

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/home` | No | Aggregated home feed data (banners, categories). Query `petId` for personalized feed |
| `GET` | `/api/v1/home/banners` | No | Active promotional banners |
| `GET` | `/api/v1/home/testimonials` | No | Customer testimonials feed |
| `GET` | `/api/v1/products/trending` | No | Trending/popular products feed |
| `GET` | `/api/v1/products/best-sellers` | No | Top selling products feed |
| `GET` | `/api/v1/products/recommended` | Optional | AI/Rule-based recommended products |
| `GET` | `/api/v1/products/buy-again` | Yes | Items the user has previously purchased |
| `POST`| `/api/v1/products/buy-again/reorder` | Yes | Move a previously bought item directly to cart |
| `GET` | `/api/v1/blogs` | No | Paginated blog articles list |
| `GET` | `/api/v1/blogs/categories` | No | List blog categories |
| `GET` | `/api/v1/blogs/:slug` | No | Get single blog article by kebab-case slug |

---

## Endpoint Details

### 1. Home Feed & Banners
- **`GET /api/v1/home`**: Returns the aggregated layout. Supports optional `?petId=` query to customize the feed based on a pet's profile.
- **`GET /api/v1/home/banners`**: Returns all `ACTIVE` banners ordered by display sequence.
- **`GET /api/v1/home/testimonials`**: Returns testimonials. Supports `?limit=` query parameter (default: 10).

### 2. Product Collections
- **`GET /api/v1/products/trending`**: Returns products with high recent engagement.
- **`GET /api/v1/products/best-sellers`**: Returns items with highest sales volume.
- **`GET /api/v1/products/recommended`**: Uses the `Bearer Token` if available to fetch user-specific recommendations, or optionally accepts `?petId=` query parameter.
- **`GET /api/v1/products/buy-again`**: Requires Authentication. Returns products previously ordered by the user.

### 3. Quick Reordering
- **`POST /api/v1/products/buy-again/reorder`** (or `/api/v1/products/reorder`):
  - **Auth Required:** Yes
  - **Request Body:**
    ```json
    {
      "productId": "uuid",
      "variantId": "uuid", // Optional
      "quantity": 1        // Default: 1
    }
    ```
  - **Description:** Instantly adds a past item back into the user's shopping cart.

### 4. Blog Engine
- **`GET /api/v1/blogs/categories`**: Lists all active blog categories.
- **`GET /api/v1/blogs`**: Paginated feed. Supports `?page=` and `?limit=`.
- **`GET /api/v1/blogs/:slug`**: Retrieve article content, author details, and SEO metadata using its slug.
