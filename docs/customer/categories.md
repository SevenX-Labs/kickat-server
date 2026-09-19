# Customer Categories API Specification

All customer category endpoints are served under `/api/v1/categories`. These endpoints are public (no authentication required) and are designed to fetch active categories and their associated products.

---

## Endpoints Overview

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/categories` | No | Get flat list of active categories |
| `GET` | `/api/v1/categories/tree` | No | Get category tree (parent categories with subcategories) |
| `GET` | `/api/v1/categories/:id` | No | Get category details by UUID or slug |
| `GET` | `/api/v1/categories/:id/products` | No | Get paginated products under category with filtering & sorting |

---

## Endpoint Details

### 1. Get Categories (Flat List)

Retrieve a flat list of all active categories, ordered by their display `order`.

- **Method:** `GET`
- **Route:** `/api/v1/categories`
- **Authentication:** No

**Response (200 OK):**
```json
{
  "success": true,
  "categories": [
    {
      "id": "uuid",
      "name": "Dog Supplies",
      "slug": "dog-supplies",
      "imageUrl": "https://cdn.kickat.co.in/categories/dog.png",
      "parentId": null,
      "isActive": true,
      "order": 1,
      "createdAt": "2023-01-01T00:00:00.000Z",
      "updatedAt": "2023-01-01T00:00:00.000Z"
    }
  ]
}
```

### 2. Get Category Tree

Retrieve all active root categories along with their active children (subcategories).

- **Method:** `GET`
- **Route:** `/api/v1/categories/tree`
- **Authentication:** No

**Response (200 OK):**
```json
{
  "success": true,
  "categories": [
    {
      "id": "uuid",
      "name": "Dog Supplies",
      "slug": "dog-supplies",
      "imageUrl": "https://cdn.kickat.co.in/categories/dog.png",
      "parentId": null,
      "isActive": true,
      "order": 1,
      "createdAt": "2023-01-01T00:00:00.000Z",
      "updatedAt": "2023-01-01T00:00:00.000Z",
      "children": [
        {
          "id": "child-uuid",
          "name": "Dry Kibble",
          "slug": "dry-kibble",
          "imageUrl": "https://cdn.kickat.co.in/categories/dry-kibble.png",
          "parentId": "uuid",
          "isActive": true,
          "order": 1,
          "createdAt": "2023-01-01T00:00:00.000Z",
          "updatedAt": "2023-01-01T00:00:00.000Z"
        }
      ]
    }
  ]
}
```

### 3. Get Category by ID or Slug

Retrieve details for a specific active category using either its UUID or string slug. Also includes its immediate children.

- **Method:** `GET`
- **Route:** `/api/v1/categories/:id`
- **Authentication:** No

**URL Parameters:**
- `id` (String) - Can be a valid UUID v4 or the category `slug`.

**Response (200 OK):**
```json
{
  "success": true,
  "category": {
    "id": "uuid",
    "name": "Dog Supplies",
    "slug": "dog-supplies",
    "imageUrl": "https://cdn.kickat.co.in/categories/dog.png",
    "parentId": null,
    "isActive": true,
    "order": 1,
    "createdAt": "2023-01-01T00:00:00.000Z",
    "updatedAt": "2023-01-01T00:00:00.000Z",
    "children": [
       /* Array of child categories */
    ]
  }
}
```

**Error Responses:**
- `404 Not Found`: Category not found or inactive.

### 4. Get Category Products

Retrieve a paginated list of active products belonging to the specified category (including all nested subcategories). Supports extensive filtering and sorting.

- **Method:** `GET`
- **Route:** `/api/v1/categories/:id/products`
- **Authentication:** No

**URL Parameters:**
- `id` (String) - Can be a valid UUID v4 or the category `slug`.

**Query Parameters:**
| Field | Type | Description |
| :--- | :--- | :--- |
| `page` | Integer | Page number (default: 1) |
| `limit` | Integer | Items per page (default: 10) |
| `sort` | String | Sort method (`popularity`, `price_asc`, `price_desc`, `rating`, default: `newest`) |
| `priceMin` | Float | Minimum price filter |
| `priceMax` | Float | Maximum price filter |
| `inStock` | Boolean | If `true`, only returns products with `stock > 0` |
| `brand` | String | Filter by brand name (case-insensitive partial match) |
| `petSpecies` | String | Filter by pet species (e.g., `DOG`, `CAT`) |
| `diet` | String | Filter by dietary preference |

**Response (200 OK):**
```json
{
  "success": true,
  "category": {
    "id": "uuid",
    "name": "Dog Supplies",
    "slug": "dog-supplies"
  },
  "meta": {
    "total": 45,
    "page": 1,
    "limit": 10,
    "totalPages": 5
  },
  "products": [
    {
      "id": "product-uuid",
      "name": "Premium Dog Food",
      "slug": "premium-dog-food",
      "price": 29.99,
      "stock": 100,
      "rating": 4.5,
      "reviewsCount": 24,
      "categoryId": "uuid",
      "status": "ACTIVE"
      /* ... other product fields ... */
    }
  ]
}
```

**Error Responses:**
- `404 Not Found`: Category not found or inactive.
