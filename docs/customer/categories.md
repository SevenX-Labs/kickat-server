# Customer Categories API Specification

All categories endpoints are served under `/api/v1/categories`.

---

## Endpoints Overview

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/categories` | No | Get flat list of active categories |
| `GET` | `/api/v1/categories/tree` | No | Get category tree (parent categories with subcategories) |
| `GET` | `/api/v1/categories/:id` | No | Get category details by UUID v4 |
| `GET` | `/api/v1/categories/:id/products` | No | Get paginated products under category with filtering & sorting |

---

## Detailed Endpoints

### 1. Category Tree
`GET /api/v1/categories/tree`

### 2. Category Products
`GET /api/v1/categories/:id/products`
- **Query Params**: `page`, `limit`, `sort`, `priceMin`, `priceMax`, `inStock`, `petSpecies`, `diet`
