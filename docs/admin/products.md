# Admin Products & Inventory Management API Specification

All administrative product management endpoints are served under `/api/v1/admin/products` and require Admin Authentication (`@AdminAuth()`).

---

## Table of Contents

1. [Architecture & Frontend Integration Overview](#architecture--frontend-integration-overview)
2. [Endpoints Overview](#endpoints-overview)
3. [Sort & Filter Enums](#sort--filter-enums)
4. [Endpoint Specifications](#endpoint-specifications)
   - [1. List Products (Filter, Search, Sort & Paginate)](#1-list-products-filter-search-sort--paginate)
   - [2. Get Product by ID or Slug](#2-get-product-by-id-or-slug)
   - [3. Create Product (with Variants & Media)](#3-create-product-with-variants--media)
   - [4. Update Product](#4-update-product)
   - [5. Update Product Status](#5-update-product-status)
   - [6. Quick Stock Update (Product & Variants)](#6-quick-stock-update-product--variants)
   - [7. Bulk Status Update](#7-bulk-status-update)
   - [8. Bulk Delete Products](#8-bulk-delete-products)
   - [9. Delete Product (Soft or Permanent)](#9-delete-product-soft-or-permanent)
5. [Standard Error Response Format](#standard-error-response-format)
6. [Frontend Integration Guide (TypeScript & Axios)](#frontend-integration-guide-typescript--axios)
   - [TypeScript Types & Interfaces](#typescript-types--interfaces)
   - [Production-Ready API Service](#production-ready-api-service)
   - [UI Component Examples](#ui-component-examples)

---

## Architecture & Frontend Integration Overview

> [!NOTE]
> **Single-Brand Catalog:** KickAt is a dedicated, single-brand platform. All products belong directly to the KickAt brand; therefore, third-party brand filters and fields are not required.


- **Base URL:** `https://api.kickat.co.in/api/v1/admin/products` (or `http://localhost:3000/api/v1/admin/products` in development)
- **Content Type:** `application/json`
- **Authentication Scheme:** `Authorization: Bearer <accessToken>`
- **Unique Slugs:** Slugs are auto-generated from product title (kebab-case) and made unique (e.g. `royal-canin-puppy-1`) if not explicitly passed.
- **Inventory & Variant System:** A product can have a master stock level and/or granular SKU variants (`ProductVariant`) with independent pricing, stock, attributes, and image URLs.
- **Soft Deletes:** Products are soft-deleted by default (`deletedAt != null`) to preserve historical order integrity. Passing `permanent=true` triggers hard-deletion.

---

## Endpoints Overview

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/products` | Yes (`Bearer`) | List catalog with search, price/stock filters, sorting, and pagination |
| `GET` | `/api/v1/admin/products/:id` | Yes (`Bearer`) | Get complete product details by UUID or URL slug |
| `POST` | `/api/v1/admin/products` | Yes (`Bearer`) | Create new product with variants and media gallery |
| `PATCH` | `/api/v1/admin/products/:id` | Yes (`Bearer`) | Update product fields, attributes, variants, and media |
| `PATCH` | `/api/v1/admin/products/:id/status` | Yes (`Bearer`) | Toggle product publishing status (`ACTIVE`, `DRAFT`, `INACTIVE`) |
| `PATCH` | `/api/v1/admin/products/:id/stock` | Yes (`Bearer`) | Quick update stock quantities for product and variant SKUs |
| `PATCH` | `/api/v1/admin/products/bulk-status` | Yes (`Bearer`) | Bulk update status for an array of product IDs |
| `POST` | `/api/v1/admin/products/bulk-delete` | Yes (`Bearer`) | Bulk soft-delete or permanently purge multiple products |
| `DELETE` | `/api/v1/admin/products/:id` | Yes (`Bearer`) | Soft-delete product (or permanent delete with `?permanent=true`) |

---

## Sort & Filter Enums

### Product Sorting (`AdminProductSortEnum`)
- `createdAt_desc` (Default - Newest first)
- `createdAt_asc` (Oldest first)
- `price_asc` (Lowest price first)
- `price_desc` (Highest price first)
- `name_asc` (Alphabetical A-Z)
- `name_desc` (Alphabetical Z-A)
- `stock_asc` (Lowest stock first)
- `stock_desc` (Highest stock first)
- `rating_desc` (Highest customer rating)

### Product Status (`ProductStatusEnum`)
- `ACTIVE` | `DRAFT` | `INACTIVE`

### Pet Species (`PetSpecies`)
- `DOG` | `CAT` | `BIRD` | `FISH` | `SMALL_ANIMAL` | `OTHER`

### Dietary Preference (`DietaryPreference`)
- `VEG` | `NON_VEG` | `GRAIN_FREE` | `GLUTEN_FREE` | `ORGANIC` | `RAW` | `HYPOALLERGENIC`

---

## Endpoint Specifications

### 1. List Products (Filter, Search, Sort & Paginate)

- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/admin/products`
- **Headers:** `Authorization: Bearer <accessToken>`

#### Query Parameters
| Parameter | Type | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `page` | `number` | No | `1` | Page number |
| `limit` | `number` | No | `10` | Products per page (1 to 100) |
| `search` | `string` | No | - | Fuzzy search in name, slug, description, SKU |
| `status` | `string` | No | - | `ACTIVE`, `DRAFT`, or `INACTIVE` |
| `categoryId` | `string` | No | - | Filter by category UUID |
| `petSpecies` | `string` | No | - | Filter by species (e.g. `DOG`, `CAT`) |
| `dietaryPreference` | `string` | No | - | Filter by diet (e.g. `GRAIN_FREE`, `VEG`) |
| `minPrice` | `number` | No | - | Minimum price filter |
| `maxPrice` | `number` | No | - | Maximum price filter |
| `inStock` | `boolean` | No | - | `true` for stock > 0, `false` for out-of-stock |
| `isLowStock` | `boolean` | No | - | `true` to filter products with stock <= threshold |
| `lowStockThreshold` | `number` | No | `10` | Custom low stock threshold limit |
| `isTrending` | `boolean` | No | - | Filter trending items |
| `isBestSeller` | `boolean` | No | - | Filter best sellers |
| `sort` | `string` | No | `createdAt_desc` | Sort field and direction |

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "data": {
    "products": [
      {
        "id": "prod-uuid-1",
        "name": "Kickat Maxi Puppy Dry Food",
        "slug": "kickat-maxi-puppy-dry-food",
        "description": "Tailored nutrition for large breed puppies.",
        "price": 3250.0,
        "discountPrice": 2999.0,
        "stock": 45,
        "petSpecies": "DOG",
        "dietaryPreference": "NON_VEG",
        "categoryId": "cat-uuid-1",
        "imageUrl": "https://cdn.kickat.co.in/products/kickat-maxi-puppy.png",
        "images": ["https://cdn.kickat.co.in/products/kickat-maxi-puppy-back.png"],
        "status": "ACTIVE",
        "isTrending": true,
        "isBestSeller": true,
        "rating": 4.8,
        "category": {
          "id": "cat-uuid-1",
          "name": "Dog Food",
          "slug": "dog-food"
        },
        "variants": [
          {
            "id": "var-uuid-1",
            "name": "4kg Bag",
            "sku": "KKT-MAXI-4KG",
            "price": 3250.0,
            "stock": 30,
            "attributes": { "weight": "4kg" },
            "imageUrl": "https://cdn.kickat.co.in/products/kkt-4kg.png"
          }
        ],
        "media": [],
        "_count": {
          "reviews": 24,
          "variants": 1
        },
        "createdAt": "2026-09-01T10:00:00.000Z",
        "updatedAt": "2026-09-08T08:00:00.000Z"
      }
    ],
    "pagination": {
      "total": 128,
      "page": 1,
      "limit": 10,
      "totalPages": 13,
      "hasNextPage": true,
      "hasPrevPage": false
    },
    "summary": {
      "totalProducts": 128,
      "activeCount": 115,
      "draftCount": 8,
      "inactiveCount": 5,
      "lowStockCount": 12,
      "outOfStockCount": 3
    }
  }
}
```

---

### 2. Get Product by ID or Slug

- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/admin/products/:id` (Accepts UUID v4 or URL slug)
- **Headers:** `Authorization: Bearer <accessToken>`

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "data": {
    "id": "prod-uuid-1",
    "name": "Kickat Maxi Puppy Dry Food",
    "slug": "kickat-maxi-puppy-dry-food",
    "description": "Tailored nutrition for large breed puppies.",
    "price": 3250.0,
    "discountPrice": 2999.0,
    "stock": 45,
    "petSpecies": "DOG",
    "dietaryPreference": "NON_VEG",
    "categoryId": "cat-uuid-1",
    "imageUrl": "https://cdn.kickat.co.in/products/kickat-maxi-puppy.png",
    "images": [],
    "status": "ACTIVE",
    "isTrending": true,
    "isBestSeller": true,
    "category": {
      "id": "cat-uuid-1",
      "name": "Dog Food",
      "slug": "dog-food"
    },
    "variants": [],
    "media": [],
    "reviews": [],
    "_count": {
      "reviews": 24,
      "variants": 1,
      "wishlistItems": 142,
      "cartItems": 18
    }
  }
}
```

---

### 3. Create Product (with Variants & Media)

- **HTTP Method:** `POST`
- **Endpoint:** `/api/v1/admin/products`
- **Headers:** `Authorization: Bearer <accessToken>`, `Content-Type: application/json`

#### Request Body
> [!NOTE]
> **Canonical Image Pipeline:** Pass up to 9 image URLs in `images[]`. `images[0]` is automatically assigned as the primary `imageUrl`, and relational `ProductMedia` records (type: `IMAGE`, order: 0..N-1) are synchronized atomically. Video is not supported.

```json
{
  "name": "Kickat Natural Chicken & Brown Rice Puppy Dog Food",
  "slug": "kickat-chicken-puppy-food",
  "description": "High-protein dry puppy food formulated for healthy muscle development and gentle digestion.",
  "price": 3299.0,
  "discountPrice": 2799.0,
  "stock": 50,
  "petSpecies": "DOG",
  "dietaryPreference": "GRAIN_FREE",
  "categoryId": "cat-uuid-1",
  "images": [
    "https://cdn.kickat.co.in/products/chicken-puppy-front.png",
    "https://cdn.kickat.co.in/products/chicken-puppy-back.png",
    "https://cdn.kickat.co.in/products/chicken-puppy-kibble.png"
  ],
  "status": "ACTIVE",
  "isTrending": true,
  "isBestSeller": true,
  "seoTitle": "Kickat Natural Chicken & Brown Rice Puppy Food - 100% Pet Safe",
  "seoDescription": "Buy Kickat puppy food with real deboned chicken, brown rice, and probiotics for healthy development.",
  "attributes": {
    "lifeStage": "Puppy",
    "weight": "3 kg",
    "countryOfOrigin": "India",
    "custom": [
      { "label": "Breed Size", "value": "All Breeds" },
      { "label": "Flavor", "value": "Real Chicken" }
    ]
  },
  "highlights": [
    {
      "title": "Real Deboned Chicken #1 Ingredient",
      "description": "Premium quality protein for lean muscle growth",
      "icon": "🍗"
    },
    {
      "title": "DHA & Omega Fatty Acids",
      "description": "Supports cognitive brain & vision development",
      "icon": "🧠"
    }
  ],
  "ingredients": {
    "description": "Deboned chicken, chicken meal, brown rice, oatmeal, barley, chicken fat, flaxseed.",
    "items": ["Deboned Chicken", "Brown Rice", "Flaxseed", "Dried Chicory Root"],
    "nutrition": [
      { "label": "Crude Protein (min)", "value": "28.0%" },
      { "label": "Crude Fat (min)", "value": "16.0%" },
      { "label": "Crude Fiber (max)", "value": "4.0%" },
      { "label": "Moisture (max)", "value": "10.0%" }
    ]
  },
  "feedingGuide": {
    "description": "Feed your puppy 2 to 3 times daily according to expected adult weight.",
    "rows": [
      { "petWeight": "Up to 5 kg", "dailyAmount": "50–100 g" },
      { "petWeight": "5–10 kg", "dailyAmount": "100–180 g" },
      { "petWeight": "10–20 kg", "dailyAmount": "180–300 g" }
    ]
  },
  "careInstructions": [
    "Store in a cool, dry place sealed inside an airtight container.",
    "Always provide fresh, clean drinking water for your pet."
  ],
  "sizeGuide": {
    "enabled": false
  },
  "variants": [
    {
      "name": "1.5 kg",
      "sku": "KKT-CHK-PUP-1.5KG",
      "price": 1699.0,
      "discountPrice": 1499.0,
      "stock": 30,
      "attributes": { "weight": "1.5 kg" },
      "imageUrl": "https://cdn.kickat.co.in/products/chicken-puppy-1.5kg.png"
    },
    {
      "name": "3 kg",
      "sku": "KKT-CHK-PUP-3KG",
      "price": 3299.0,
      "discountPrice": 2799.0,
      "stock": 20,
      "attributes": { "weight": "3 kg" },
      "imageUrl": "https://cdn.kickat.co.in/products/chicken-puppy-front.png"
    }
  ]
}
```

#### Expected Success Response (`201 Created`)
```json
{
  "success": true,
  "message": "Product created successfully",
  "data": {
    "id": "d3b07384-d113-4a62-9e96-a9e99e4b7a12",
    "name": "Kickat Natural Chicken & Brown Rice Puppy Dog Food",
    "slug": "kickat-chicken-puppy-food",
    "description": "High-protein dry puppy food formulated for healthy muscle development and gentle digestion.",
    "price": 3299.0,
    "discountPrice": 2799.0,
    "stock": 50,
    "rating": 4.5,
    "reviewsCount": 0,
    "brand": null,
    "petSpecies": "DOG",
    "dietaryPreference": "GRAIN_FREE",
    "categoryId": "cat-dog-nutrition-uuid",
    "imageUrl": "https://cdn.kickat.co.in/products/chicken-puppy-front.png",
    "images": [
      "https://cdn.kickat.co.in/products/chicken-puppy-front.png",
      "https://cdn.kickat.co.in/products/chicken-puppy-back.png",
      "https://cdn.kickat.co.in/products/chicken-puppy-kibble.png"
    ],
    "status": "ACTIVE",
    "seoTitle": "Kickat Natural Chicken & Brown Rice Puppy Food - 100% Pet Safe",
    "seoDescription": "Buy Kickat puppy food with real deboned chicken, brown rice, and probiotics for healthy development.",
    "attributes": {
      "lifeStage": "Puppy",
      "weight": "3 kg",
      "countryOfOrigin": "India"
    },
    "highlights": [
      {
        "title": "Real Deboned Chicken #1 Ingredient",
        "description": "Premium quality protein for lean muscle growth",
        "icon": "🍗"
      },
      {
        "title": "DHA & Omega Fatty Acids",
        "description": "Supports cognitive brain & vision development",
        "icon": "🧠"
      }
    ],
    "ingredients": {
      "description": "Deboned chicken, chicken meal, brown rice, oatmeal, barley, chicken fat, flaxseed.",
      "items": ["Deboned Chicken", "Brown Rice", "Flaxseed", "Dried Chicory Root"],
      "nutrition": [
        { "label": "Crude Protein (min)", "value": "28.0%" },
        { "label": "Crude Fat (min)", "value": "16.0%" },
        { "label": "Crude Fiber (max)", "value": "4.0%" },
        { "label": "Moisture (max)", "value": "10.0%" }
      ]
    },
    "feedingGuide": {
      "description": "Feed your puppy 2 to 3 times daily according to expected adult weight.",
      "rows": [
        { "petWeight": "Up to 5 kg", "dailyAmount": "50–100 g" },
        { "petWeight": "5–10 kg", "dailyAmount": "100–180 g" },
        { "petWeight": "10–20 kg", "dailyAmount": "180–300 g" }
      ]
    },
    "careInstructions": [
      "Store in a cool, dry place sealed inside an airtight container.",
      "Always provide fresh, clean drinking water for your pet."
    ],
    "sizeGuide": {
      "enabled": false
    },
    "isTrending": true,
    "isBestSeller": true,
    "deletedAt": null,
    "createdAt": "2026-09-08T13:25:00.000Z",
    "updatedAt": "2026-09-08T13:25:00.000Z",
    "category": {
      "id": "cat-dog-nutrition-uuid",
      "name": "Dog Nutrition",
      "slug": "dog-nutrition"
    },
    "variants": [
      {
        "id": "var-uuid-1",
        "productId": "d3b07384-d113-4a62-9e96-a9e99e4b7a12",
        "name": "1.5 kg",
        "sku": "KKT-CHK-PUP-1.5KG",
        "price": 1699.0,
        "discountPrice": 1499.0,
        "stock": 30,
        "attributes": { "weight": "1.5 kg" },
        "imageUrl": "https://cdn.kickat.co.in/products/chicken-puppy-1.5kg.png"
      },
      {
        "id": "var-uuid-2",
        "productId": "d3b07384-d113-4a62-9e96-a9e99e4b7a12",
        "name": "3 kg",
        "sku": "KKT-CHK-PUP-3KG",
        "price": 3299.0,
        "discountPrice": 2799.0,
        "stock": 20,
        "attributes": { "weight": "3 kg" },
        "imageUrl": "https://cdn.kickat.co.in/products/chicken-puppy-front.png"
      }
    ],
    "media": [
      {
        "id": "med-uuid-1",
        "productId": "d3b07384-d113-4a62-9e96-a9e99e4b7a12",
        "type": "IMAGE",
        "url": "https://cdn.kickat.co.in/products/chicken-puppy-front.png",
        "thumbnailUrl": null,
        "order": 0
      },
      {
        "id": "med-uuid-2",
        "productId": "d3b07384-d113-4a62-9e96-a9e99e4b7a12",
        "type": "IMAGE",
        "url": "https://cdn.kickat.co.in/products/chicken-puppy-back.png",
        "thumbnailUrl": null,
        "order": 1
      },
      {
        "id": "med-uuid-3",
        "productId": "d3b07384-d113-4a62-9e96-a9e99e4b7a12",
        "type": "IMAGE",
        "url": "https://cdn.kickat.co.in/products/chicken-puppy-kibble.png",
        "thumbnailUrl": null,
        "order": 2
      }
    ]
  }
}
```

---

### 4. Update Product

- **HTTP Method:** `PATCH`
- **Endpoint:** `/api/v1/admin/products/:id`
- **Headers:** `Authorization: Bearer <accessToken>`, `Content-Type: application/json`

#### Request Body
Accepts any partial subset of fields from Create Product. Passing `variants` or `media` replaces/synchronizes existing lists (existing items identified by `id` are updated, missing IDs are deleted, objects without `id` are created).

```json
{
  "price": 4100.0,
  "discountPrice": 3799.0,
  "stock": 30,
  "isTrending": true
}
```

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "message": "Product updated successfully",
  "data": {
    "id": "prod-uuid-1",
    "name": "Acana Wild Prairie Dog Food",
    "price": 4100.0,
    "discountPrice": 3799.0,
    "stock": 30,
    "updatedAt": "2026-09-08T11:00:00.000Z"
  }
}
```

---

### 5. Update Product Status

- **HTTP Method:** `PATCH`
- **Endpoint:** `/api/v1/admin/products/:id/status`
- **Headers:** `Authorization: Bearer <accessToken>`, `Content-Type: application/json`

#### Request Body
```json
{
  "status": "INACTIVE"
}
```

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "message": "Product status updated to INACTIVE",
  "data": {
    "id": "prod-uuid-1",
    "name": "Acana Wild Prairie Dog Food",
    "slug": "acana-wild-prairie-dog-food",
    "status": "INACTIVE",
    "updatedAt": "2026-09-08T11:05:00.000Z"
  }
}
```

---

### 6. Quick Stock Update (Product & Variants)

- **HTTP Method:** `PATCH`
- **Endpoint:** `/api/v1/admin/products/:id/stock`
- **Headers:** `Authorization: Bearer <accessToken>`, `Content-Type: application/json`

#### Request Body
```json
{
  "stock": 50,
  "variantStocks": [
    {
      "variantId": "var-uuid-1",
      "stock": 25
    },
    {
      "variantId": "var-uuid-2",
      "stock": 25
    }
  ]
}
```

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "message": "Product stock updated successfully",
  "data": {
    "id": "prod-uuid-1",
    "stock": 50,
    "variants": [
      { "id": "var-uuid-1", "stock": 25 },
      { "id": "var-uuid-2", "stock": 25 }
    ]
  }
}
```

---

### 7. Bulk Status Update

- **HTTP Method:** `PATCH`
- **Endpoint:** `/api/v1/admin/products/bulk-status`
- **Headers:** `Authorization: Bearer <accessToken>`, `Content-Type: application/json`

#### Request Body
```json
{
  "productIds": [
    "prod-uuid-1",
    "prod-uuid-2",
    "prod-uuid-3"
  ],
  "status": "ACTIVE"
}
```

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "message": "Successfully updated status to ACTIVE for 3 products",
  "data": {
    "updatedCount": 3,
    "status": "ACTIVE",
    "productIds": ["prod-uuid-1", "prod-uuid-2", "prod-uuid-3"]
  }
}
```

---

### 8. Bulk Delete Products

- **HTTP Method:** `POST`
- **Endpoint:** `/api/v1/admin/products/bulk-delete`
- **Headers:** `Authorization: Bearer <accessToken>`, `Content-Type: application/json`

#### Request Body
```json
{
  "productIds": [
    "prod-uuid-1",
    "prod-uuid-2"
  ],
  "permanent": false
}
```

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "message": "Successfully deleted 2 products",
  "data": {
    "deletedCount": 2,
    "permanent": false
  }
}
```

---

### 9. Delete Product (Soft or Permanent)

- **HTTP Method:** `DELETE`
- **Endpoint:** `/api/v1/admin/products/:id` (Optional query parameter: `?permanent=true`)
- **Headers:** `Authorization: Bearer <accessToken>`

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "message": "Product soft-deleted successfully"
}
```

---

---

## Public Storefront Product Details API (Customer View)

- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/products/:idOrSlug` (public, no authentication required)
- **Parameters:** `idOrSlug` — Product UUID or URL slug (e.g. `kickat-chicken-puppy-food`)

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "product": {
    "id": "d3b07384-d113-4a62-9e96-a9e99e4b7a12",
    "name": "Kickat Natural Chicken & Brown Rice Puppy Dog Food",
    "slug": "kickat-chicken-puppy-food",
    "description": "High-protein dry puppy food formulated for healthy muscle development and gentle digestion.",
    "price": 3299.0,
    "discountPrice": 2799.0,
    "stock": 50,
    "rating": 4.5,
    "reviewsCount": 0,
    "brand": null,
    "petSpecies": "DOG",
    "dietaryPreference": "GRAIN_FREE",
    "categoryId": "cat-dog-nutrition-uuid",
    "isTrending": true,
    "isBestSeller": true,
    "imageUrl": "https://cdn.kickat.co.in/products/chicken-puppy-front.png",
    "images": [
      "https://cdn.kickat.co.in/products/chicken-puppy-front.png",
      "https://cdn.kickat.co.in/products/chicken-puppy-back.png",
      "https://cdn.kickat.co.in/products/chicken-puppy-kibble.png"
    ],
    "status": "ACTIVE",
    "seoTitle": "Kickat Natural Chicken & Brown Rice Puppy Food - 100% Pet Safe",
    "seoDescription": "Buy Kickat puppy food with real deboned chicken, brown rice, and probiotics for healthy development.",
    "attributes": {
      "lifeStage": "Puppy",
      "weight": "3 kg",
      "countryOfOrigin": "India"
    },
    "highlights": [
      {
        "title": "Real Deboned Chicken #1 Ingredient",
        "description": "Premium quality protein for lean muscle growth",
        "icon": "🍗"
      },
      {
        "title": "DHA & Omega Fatty Acids",
        "description": "Supports cognitive brain & vision development",
        "icon": "🧠"
      }
    ],
    "ingredients": {
      "description": "Deboned chicken, chicken meal, brown rice, oatmeal, barley, chicken fat, flaxseed.",
      "items": ["Deboned Chicken", "Brown Rice", "Flaxseed", "Dried Chicory Root"],
      "nutrition": [
        { "label": "Crude Protein (min)", "value": "28.0%" },
        { "label": "Crude Fat (min)", "value": "16.0%" },
        { "label": "Crude Fiber (max)", "value": "4.0%" },
        { "label": "Moisture (max)", "value": "10.0%" }
      ]
    },
    "feedingGuide": {
      "description": "Feed your puppy 2 to 3 times daily according to expected adult weight.",
      "rows": [
        { "petWeight": "Up to 5 kg", "dailyAmount": "50–100 g" },
        { "petWeight": "5–10 kg", "dailyAmount": "100–180 g" },
        { "petWeight": "10–20 kg", "dailyAmount": "180–300 g" }
      ]
    },
    "careInstructions": [
      "Store in a cool, dry place sealed inside an airtight container.",
      "Always provide fresh, clean drinking water for your pet."
    ],
    "sizeGuide": {
      "enabled": false
    },
    "deletedAt": null,
    "createdAt": "2026-09-08T13:25:00.000Z",
    "updatedAt": "2026-09-08T13:25:00.000Z",
    "category": {
      "id": "cat-dog-nutrition-uuid",
      "name": "Dog Nutrition",
      "slug": "dog-nutrition"
    },
    "variants": [
      {
        "id": "var-uuid-1",
        "productId": "d3b07384-d113-4a62-9e96-a9e99e4b7a12",
        "name": "1.5 kg",
        "sku": "KKT-CHK-PUP-1.5KG",
        "price": 1699.0,
        "discountPrice": 1499.0,
        "stock": 30,
        "attributes": { "weight": "1.5 kg" },
        "imageUrl": "https://cdn.kickat.co.in/products/chicken-puppy-1.5kg.png"
      },
      {
        "id": "var-uuid-2",
        "productId": "d3b07384-d113-4a62-9e96-a9e99e4b7a12",
        "name": "3 kg",
        "sku": "KKT-CHK-PUP-3KG",
        "price": 3299.0,
        "discountPrice": 2799.0,
        "stock": 20,
        "attributes": { "weight": "3 kg" },
        "imageUrl": "https://cdn.kickat.co.in/products/chicken-puppy-front.png"
      }
    ],
    "media": [
      {
        "id": "med-uuid-1",
        "productId": "d3b07384-d113-4a62-9e96-a9e99e4b7a12",
        "type": "IMAGE",
        "url": "https://cdn.kickat.co.in/products/chicken-puppy-front.png",
        "thumbnailUrl": null,
        "order": 0
      },
      {
        "id": "med-uuid-2",
        "productId": "d3b07384-d113-4a62-9e96-a9e99e4b7a12",
        "type": "IMAGE",
        "url": "https://cdn.kickat.co.in/products/chicken-puppy-back.png",
        "thumbnailUrl": null,
        "order": 1
      },
      {
        "id": "med-uuid-3",
        "productId": "d3b07384-d113-4a62-9e96-a9e99e4b7a12",
        "type": "IMAGE",
        "url": "https://cdn.kickat.co.in/products/chicken-puppy-kibble.png",
        "thumbnailUrl": null,
        "order": 2
      }
    ]
  }
}
```

## Standard Error Response Format

```typescript
interface ApiErrorResponse {
  success: false;
  statusCode: number;      // 400, 401, 403, 404, 500
  message: string;
  path: string;
  timestamp: string;
  errors: string[];
}
```

---

## Frontend Integration Guide (TypeScript & Axios)

### TypeScript Types & Interfaces

```typescript
// types/admin-product.ts

export type ProductStatus = "ACTIVE" | "DRAFT" | "INACTIVE";
export type PetSpecies = "DOG" | "CAT" | "BIRD" | "FISH" | "SMALL_ANIMAL" | "OTHER";
export type DietaryPreference = "VEG" | "NON_VEG" | "GRAIN_FREE" | "GLUTEN_FREE" | "ORGANIC" | "RAW" | "HYPOALLERGENIC";

export interface CustomProductAttribute {
  label: string;
  value: string;
}

export interface ProductAttributes {
  material?: string;
  lifeStage?: string;
  weight?: string;
  colors?: string[];
  countryOfOrigin?: string;
  dimensions?: string;
  custom?: CustomProductAttribute[];
}

export interface ProductHighlight {
  title: string;
  description: string;
  icon?: string;
}

export interface NutritionItem {
  label: string;
  value: string;
}

export interface ProductIngredients {
  description?: string;
  items?: string[];
  nutrition?: NutritionItem[];
}

export interface FeedingRow {
  petWeight: string;
  dailyAmount: string;
}

export interface ProductFeedingGuide {
  description?: string;
  rows?: FeedingRow[];
}

export interface SizeItem {
  label: string;
  description: string;
}

export interface ProductSizeGuide {
  enabled?: boolean;
  description?: string;
  sizes?: SizeItem[];
  note?: string;
}

export interface ProductVariant {
  id?: string;
  name: string;
  sku?: string | null;
  price: number;
  discountPrice?: number | null;
  stock: number;
  attributes?: Record<string, any>;
  imageUrl?: string | null;
}

export interface ProductMedia {
  id: string;
  type: "IMAGE";
  url: string;
  thumbnailUrl?: string | null;
  order: number;
}

export interface AdminProductItem {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  price: number;
  discountPrice?: number | null;
  stock: number;
  petSpecies?: PetSpecies | null;
  dietaryPreference?: DietaryPreference | null;
  categoryId: string;
  imageUrl: string;
  images: string[];
  status: ProductStatus;
  seoTitle?: string | null;
  seoDescription?: string | null;
  attributes?: ProductAttributes | null;
  highlights?: ProductHighlight[] | null;
  ingredients?: ProductIngredients | null;
  feedingGuide?: ProductFeedingGuide | null;
  careInstructions?: string[];
  sizeGuide?: ProductSizeGuide | null;
  isTrending: boolean;
  isBestSeller: boolean;
  rating: number;
  category?: { id: string; name: string; slug: string };
  variants: ProductVariant[];
  media: ProductMedia[];
  _count?: { reviews: number; variants: number };
  createdAt: string;
  updatedAt: string;
}

export interface AdminProductsResponse {
  success: boolean;
  data: {
    products: AdminProductItem[];
    pagination: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
      hasNextPage: boolean;
      hasPrevPage: boolean;
    };
    summary: {
      totalProducts: number;
      activeCount: number;
      draftCount: number;
      inactiveCount: number;
      lowStockCount: number;
      outOfStockCount: number;
    };
  };
}
```

### Production-Ready API Service

```typescript
// services/adminProductService.ts
import axios from "axios";
import { AdminProductsResponse, AdminProductItem } from "../types/admin-product";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.kickat.co.in/api/v1";

const productApi = axios.create({
  baseURL: `${BASE_URL}/admin/products`,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

productApi.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("admin_access_token");
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

export const AdminProductService = {
  async getProducts(params?: any): Promise<AdminProductsResponse> {
    const res = await productApi.get<AdminProductsResponse>("", { params });
    return res.data;
  },

  async getProductById(id: string): Promise<{ success: boolean; data: AdminProductItem }> {
    const res = await productApi.get<{ success: boolean; data: AdminProductItem }>(`/${id}`);
    return res.data;
  },

  async createProduct(payload: any) {
    const res = await productApi.post("", payload);
    return res.data;
  },

  async updateProduct(id: string, payload: any) {
    const res = await productApi.patch(`/${id}`, payload);
    return res.data;
  },

  async updateStatus(id: string, status: "ACTIVE" | "DRAFT" | "INACTIVE") {
    const res = await productApi.patch(`/${id}/status`, { status });
    return res.data;
  },

  async quickUpdateStock(id: string, stock: number, variantStocks?: { variantId: string; stock: number }[]) {
    const res = await productApi.patch(`/${id}/stock`, { stock, variantStocks });
    return res.data;
  },

  async bulkUpdateStatus(productIds: string[], status: "ACTIVE" | "DRAFT" | "INACTIVE") {
    const res = await productApi.patch("/bulk-status", { productIds, status });
    return res.data;
  },

  async bulkDelete(productIds: string[], permanent: boolean = false) {
    const res = await productApi.post("/bulk-delete", { productIds, permanent });
    return res.data;
  },

  async deleteProduct(id: string, permanent: boolean = false) {
    const res = await productApi.delete(`/${id}`, { params: { permanent } });
    return res.data;
  },
};
```
