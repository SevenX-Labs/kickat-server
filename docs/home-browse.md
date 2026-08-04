# Home & Browse API Guide

All Home, Category, Product Discovery, and Blog endpoints are served under the base path `/api/v1`.

---

## 1. Endpoints Summary

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/home` | No | Home feed aggregator (Banners, Categories, Trending & Best Sellers). Query `petId` (UUID) for personalized recommendations |
| `GET` | `/api/v1/home/banners` | No | Get active promotional banners |
| `GET` | `/api/v1/categories` | No | Get flat list of active categories |
| `GET` | `/api/v1/categories/tree` | No | Get category tree (Parent categories with subcategories) |
| `GET` | `/api/v1/categories/:id` | No | Get category details by UUID v4 |
| `GET` | `/api/v1/categories/:id/products` | No | Get paginated products for a category with filtering (`priceMin`, `priceMax`, `inStock`, `brand`, `petSpecies`, `diet`) & sorting |
| `GET` | `/api/v1/products/trending` | No | Get trending products list |
| `GET` | `/api/v1/products/best-sellers` | No | Get best sellers list |
| `GET` | `/api/v1/products/recommended` | Optional / `petId` | Personalized product recommendations for logged-in user or guest with `petId` |
| `GET` | `/api/v1/products/buy-again` | Yes | Get past purchased products for authenticated user |
| `GET` | `/api/v1/blogs` | No | Get paginated blog posts list |
| `GET` | `/api/v1/blogs/categories` | No | Get list of blog categories |
| `GET` | `/api/v1/blogs/:slug` | No | Get single blog post by kebab-case slug |

---

## 2. Validation & Parameter Rules

| Endpoint / Parameter | Type | Validation Rules |
| :--- | :--- | :--- |
| **petId** | UUID | Valid UUID v4 string |
| **id** | UUID | Valid UUID v4 string |
| **page** | Integer | Minimum `1`, default `1` |
| **limit** | Integer | Minimum `1`, max `50` (or `20` for trending/best-sellers, `10` for buy-again) |
| **sort** | Enum | `popularity`, `price_asc`, `price_desc`, `newest`, `rating` |
| **petSpecies** | Enum | `dog`, `cat`, `bird`, `fish`, `rabbit`, `other` |
| **diet** | Enum | `veg`, `non_veg` |
| **slug** | String | Valid kebab-case format (`/^[a-z0-9]+(?:-[a-z0-9]+)*$/`) |

---

## 3. Detailed Endpoints & Response Examples

### A. Home Feed Aggregator

#### `GET /api/v1/home`

- **Query Params**: `petId` (UUID v4, optional)
- **cURL**:
```bash
curl -X GET "http://localhost:3000/api/v1/home?petId=c1a23b45-6789-40de-f123-456789abcdef"
```

##### Success (`200 OK`)
```json
{
  "success": true,
  "data": {
    "banners": [
      {
        "id": "b1",
        "title": "Summer Pet Sale",
        "imageUrl": "https://example.com/banner.jpg",
        "linkUrl": "/categories/dog-food"
      }
    ],
    "categories": [
      {
        "id": "cat_1",
        "name": "Dog Food",
        "slug": "dog-food"
      }
    ],
    "trendingProducts": [],
    "bestSellers": []
  }
}
```

---

### B. Category Products Filtered

#### `GET /api/v1/categories/:id/products`

- **Query Params**:
  - `page`: 1
  - `limit`: 10
  - `sort`: `price_asc`
  - `priceMin`: 100
  - `priceMax`: 2000
  - `inStock`: `true`
  - `petSpecies`: `dog`
  - `diet`: `non_veg`
- **cURL**:
```bash
curl -X GET "http://localhost:3000/api/v1/categories/c1a23b45-6789-40de-f123-456789abcdef/products?page=1&limit=10&sort=price_asc&petSpecies=dog"
```

---

### C. Recommended Products

#### `GET /api/v1/products/recommended`

- **Headers**: `Authorization: Bearer <accessToken>` (Optional if `petId` query param is provided)
- **Query Params**: `petId` (UUID optional if authenticated)
- **cURL**:
```bash
curl -X GET "http://localhost:3000/api/v1/products/recommended?petId=c1a23b45-6789-40de-f123-456789abcdef"
```

---

### D. Single Blog Post by Slug

#### `GET /api/v1/blogs/:slug`

- **Path Param**: `slug` (kebab-case)
- **cURL**:
```bash
curl -X GET "http://localhost:3000/api/v1/blogs/top-10-dog-care-tips-2026"
```
