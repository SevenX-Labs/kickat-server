# Search API Guide

All Search endpoints are served under the base path `/api/v1/search`.

---

## 1. Endpoints Summary

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/search` | No | Full-text product search with filtering and sorting options |
| `GET` | `/api/v1/search/suggestions` | No | Autocomplete query suggestions as the user types |
| `GET` | `/api/v1/search/recent` | Yes | Get list of user's recent search queries |
| `DELETE` | `/api/v1/search/recent/:queryId` | Yes | Delete a specific recent search query |
| `GET` | `/api/v1/search/trending` | No | Get trending search keywords |
| `GET` | `/api/v1/search/filters` | No | Get available search filter facets (brands, price range, species, diets) |

---

## 2. Validation & Parameter Rules

| Endpoint / Parameter | Type | Validation Rules |
| :--- | :--- | :--- |
| **q** (search) | String | Minimum `2` characters, maximum `100` characters |
| **q** (suggestions) | String | Minimum `2` characters, maximum `50` characters |
| **categoryId** | UUID | Valid UUID v4 string |
| **priceMin** / **priceMax** | Number | Minimum `0` |
| **rating** | Integer | Minimum `1`, maximum `5` |
| **sort** | Enum | `relevance`, `price_asc`, `price_desc`, `newest`, `rating` |
| **petSpecies** | Enum | `dog`, `cat`, `bird`, `fish`, `rabbit`, `other` |
| **diet** | Enum | `veg`, `non_veg` |
| **queryId** | String | Search entry ID to delete |

---

## 3. Detailed Endpoints & Response Examples

### A. Full Product Search

#### `GET /api/v1/search`

- **Query Params**:
  - `q`: `dog food` (required, 2–100 chars)
  - `categoryId`: `c1a23b45-6789-40de-f123-456789abcdef` (optional UUID)
  - `priceMin`: 100
  - `priceMax`: 2000
  - `rating`: 4
  - `petSpecies`: `dog`
  - `diet`: `non_veg`
  - `brand`: `Royal Canin`
  - `sort`: `price_asc`
  - `page`: 1
  - `limit`: 10

- **cURL**:
```bash
curl -X GET "http://localhost:3000/api/v1/search?q=dog%20food&sort=price_asc&limit=10"
```

##### Success Response (`200 OK`)
```json
{
  "success": true,
  "query": "dog food",
  "meta": {
    "total": 24,
    "page": 1,
    "limit": 10,
    "totalPages": 3
  },
  "products": [
    {
      "id": "prod_101",
      "name": "Royal Canin Adult Dog Food",
      "slug": "royal-canin-adult-dog-food",
      "price": 1499.0,
      "discountPrice": 1299.0,
      "stock": 45,
      "rating": 4.8,
      "reviewsCount": 120,
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

### B. Search Suggestions

#### `GET /api/v1/search/suggestions`

- **Query Params**: `q` (required, min 2 chars)
- **cURL**:
```bash
curl -X GET "http://localhost:3000/api/v1/search/suggestions?q=dog"
```

##### Success Response (`200 OK`)
```json
{
  "success": true,
  "query": "dog",
  "suggestions": [
    "Dog Food",
    "Dog Toys",
    "Dog Collar",
    "Royal Canin"
  ]
}
```

---

### C. User Recent Search Queries

#### `GET /api/v1/search/recent`

- **Headers**: `Authorization: Bearer <accessToken>`
- **cURL**:
```bash
curl -X GET "http://localhost:3000/api/v1/search/recent" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

##### Success Response (`200 OK`)
```json
{
  "success": true,
  "recentSearches": [
    {
      "id": "search_99",
      "query": "dog food",
      "createdAt": "2026-08-04T19:00:00.000Z"
    }
  ]
}
```

---

### D. Delete Recent Search Query

#### `DELETE /api/v1/search/recent/:queryId`

- **Headers**: `Authorization: Bearer <accessToken>`
- **cURL**:
```bash
curl -X DELETE "http://localhost:3000/api/v1/search/recent/search_99" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

##### Success Response (`200 OK`)
```json
{
  "success": true,
  "message": "Recent search query deleted successfully"
}
```

---

### E. Trending Search Keywords

#### `GET /api/v1/search/trending`

- **cURL**:
```bash
curl -X GET "http://localhost:3000/api/v1/search/trending"
```

##### Success Response (`200 OK`)
```json
{
  "success": true,
  "trending": [
    "Dog Food",
    "Cat Toys",
    "Grain Free Diet",
    "Puppy Shampoo",
    "Rabbit Cage"
  ]
}
```

---

### F. Available Search Filter Facets

#### `GET /api/v1/search/filters`

- **Query Params**: `categoryId` (optional UUID v4)
- **cURL**:
```bash
curl -X GET "http://localhost:3000/api/v1/search/filters"
```

##### Success Response (`200 OK`)
```json
{
  "success": true,
  "filters": {
    "brands": [
      "Royal Canin",
      "Pedigree",
      "Whiskas",
      "Farmina"
    ],
    "priceRange": {
      "min": 99.0,
      "max": 4999.0
    },
    "petSpecies": [
      "DOG",
      "CAT",
      "BIRD"
    ],
    "dietaryPreferences": [
      "VEG",
      "NON_VEG"
    ],
    "sortOptions": [
      "relevance",
      "price_asc",
      "price_desc",
      "newest",
      "rating"
    ]
  }
}
```
