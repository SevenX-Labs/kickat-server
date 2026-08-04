# Products API Guide

All Product catalog, detail, media, variant, related, and review endpoints are served under the base path `/api/v1/products`.

---

## 1. Endpoints Summary

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/products` | No | Browse catalog with pagination, filters, and sorting |
| `GET` | `/api/v1/products/:id` | No | Get detailed information for a single product by UUID v4 |
| `GET` | `/api/v1/products/:id/variants` | No | Get available product SKU variants (size, weight, flavor) |
| `GET` | `/api/v1/products/:id/media` | No | Get all media items (images and videos) for a product |
| `GET` | `/api/v1/products/:id/images` | No | Get image gallery and main image for a product |
| `GET` | `/api/v1/products/:id/videos` | No | Get video demonstrations for a product |
| `GET` | `/api/v1/products/:id/related` | No | Get related products in the same category/species |
| `GET` | `/api/v1/products/:id/reviews` | No | Get paginated customer reviews with filtering and rating breakdown |

---

## 2. Validation & Parameter Rules

| Endpoint / Parameter | Type | Validation Rules |
| :--- | :--- | :--- |
| **id** | UUID | Valid UUID v4 string |
| **page** | Integer | Minimum `1`, default `1` |
| **limit** | Integer | Minimum `1`, max `50` (max `10` for related) |
| **categoryId** | UUID | Valid UUID v4 string |
| **sort** (products) | Enum | `popularity`, `price_asc`, `price_desc`, `newest`, `rating` |
| **sort** (reviews) | Enum | `newest`, `helpful`, `highest`, `lowest` |
| **priceMin** / **priceMax** | Number | Minimum `0` |
| **rating** | Integer | Minimum `1`, maximum `5` |
| **inStock** | Boolean | `true` or `false` |
| **hasPhotos** | Boolean | `true` or `false` |
| **verifiedOnly** | Boolean | `true` or `false` |

---

## 3. Detailed Endpoints & Response Examples

### A. Browse Product Catalog

#### `GET /api/v1/products`

- **Query Params**:
  - `page`: 1
  - `limit`: 10
  - `categoryId`: `c1a23b45-6789-40de-f123-456789abcdef` (optional)
  - `sort`: `price_asc`
  - `priceMin`: 100
  - `priceMax`: 3000
  - `inStock`: `true`
  - `brand`: `Royal Canin`
  - `petSpecies`: `dog`
  - `diet`: `non_veg`
  - `rating`: 4

- **cURL**:
```bash
curl -X GET "http://localhost:3000/api/v1/products?page=1&limit=10&sort=price_asc&petSpecies=dog"
```

##### Success Response (`200 OK`)
```json
{
  "success": true,
  "meta": {
    "total": 35,
    "page": 1,
    "limit": 10,
    "totalPages": 4
  },
  "products": [
    {
      "id": "c1a23b45-6789-40de-f123-456789abcdef",
      "name": "Royal Canin Adult Dog Kibble",
      "slug": "royal-canin-adult-dog-kibble",
      "price": 1499.0,
      "discountPrice": 1299.0,
      "stock": 50,
      "rating": 4.8,
      "reviewsCount": 142,
      "brand": "Royal Canin",
      "petSpecies": "DOG",
      "dietaryPreference": "NON_VEG",
      "category": {
        "id": "cat_01",
        "name": "Dog Food",
        "slug": "dog-food"
      }
    }
  ]
}
```

---

### B. Product Details by UUID

#### `GET /api/v1/products/:id`

- **Path Param**: `id` (UUID v4)
- **cURL**:
```bash
curl -X GET "http://localhost:3000/api/v1/products/c1a23b45-6789-40de-f123-456789abcdef"
```

---

### C. Product Variants

#### `GET /api/v1/products/:id/variants`

- **Path Param**: `id` (UUID v4)
- **cURL**:
```bash
curl -X GET "http://localhost:3000/api/v1/products/c1a23b45-6789-40de-f123-456789abcdef/variants"
```

---

### D. Related Products

#### `GET /api/v1/products/:id/related`

- **Query Param**: `limit` (max 10)
- **cURL**:
```bash
curl -X GET "http://localhost:3000/api/v1/products/c1a23b45-6789-40de-f123-456789abcdef/related?limit=5"
```

---

### E. Product Customer Reviews

#### `GET /api/v1/products/:id/reviews`

- **Query Params**:
  - `page`: 1
  - `limit`: 10
  - `rating`: 5
  - `sort`: `helpful`
  - `hasPhotos`: `true`
  - `verifiedOnly`: `true`

- **cURL**:
```bash
curl -X GET "http://localhost:3000/api/v1/products/c1a23b45-6789-40de-f123-456789abcdef/reviews?sort=helpful&verifiedOnly=true"
```
