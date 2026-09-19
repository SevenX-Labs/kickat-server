# Customer Wishlist API Specification

All wishlist endpoints are served under `/api/v1/wishlist`.

---

## Endpoints Overview

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/wishlist` | Yes | List items in user's wishlist |
| `POST` | `/api/v1/wishlist` | Yes | Add product or variant to wishlist |
| `DELETE` | `/api/v1/wishlist/:productId` | Yes | Remove product from wishlist |
| `POST` | `/api/v1/wishlist/:productId/move-to-cart` | Yes | Move wishlist item directly to shopping cart |

---

## Endpoint Details

### 1. Get Wishlist

Retrieve a paginated list of items in the authenticated user's wishlist.

- **Method:** `GET`
- **Route:** `/api/v1/wishlist`
- **Authentication:** Required (Bearer Token)

**Query Parameters:**
| Field | Type | Description |
| :--- | :--- | :--- |
| `page` | Integer | Page number (default: 1, min: 1) |
| `limit` | Integer | Items per page (default: 10, min: 1, max: 50) |

**Response (200 OK):**
```json
{
  "success": true,
  "meta": {
    "total": 5,
    "page": 1,
    "limit": 10,
    "totalPages": 1
  },
  "items": [
    {
      "id": "uuid",
      "userId": "uuid",
      "productId": "uuid",
      "variantId": "uuid | null",
      "createdAt": "2023-01-01T00:00:00.000Z",
      "updatedAt": "2023-01-01T00:00:00.000Z",
      "product": { /* Product details including category */ },
      "variant": { /* Variant details if applicable */ }
    }
  ]
}
```

### 2. Add to Wishlist

Add a product or specific product variant to the wishlist.

- **Method:** `POST`
- **Route:** `/api/v1/wishlist`
- **Authentication:** Required (Bearer Token)

**Request Body:**
```json
{
  "productId": "uuid",
  "variantId": "uuid" // Optional. Must NOT be provided for SIMPLE products, MUST be provided for VARIABLE products.
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Product added to wishlist",
  "item": {
    "id": "uuid",
    "userId": "uuid",
    "productId": "uuid",
    "variantId": "uuid | null",
    "createdAt": "2023-01-01T00:00:00.000Z",
    "updatedAt": "2023-01-01T00:00:00.000Z",
    "product": { /* ... */ },
    "variant": { /* ... */ }
  }
}
```

**Error Responses:**
- `400 Bad Request`: `variantId` missing for VARIABLE products, or present for SIMPLE products.
- `404 Not Found`: Product not found.
- `409 Conflict`: Product variant is already in wishlist.

### 3. Remove from Wishlist

Remove a specific product or variant from the wishlist.

- **Method:** `DELETE`
- **Route:** `/api/v1/wishlist/:productId`
- **Authentication:** Required (Bearer Token)

**URL Parameters:**
- `productId` (UUID) - The ID of the product.

**Query Parameters:**
| Field | Type | Description |
| :--- | :--- | :--- |
| `variantId` | UUID | Optional. Specific variant ID to remove if it's a variable product. |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Product removed from wishlist"
}
```

**Error Responses:**
- `404 Not Found`: Product variant not in wishlist.

### 4. Move to Cart

Move a wishlist item directly into the user's shopping cart and remove it from the wishlist.

- **Method:** `POST`
- **Route:** `/api/v1/wishlist/:productId/move-to-cart`
- **Authentication:** Required (Bearer Token)

**URL Parameters:**
- `productId` (UUID) - The ID of the product.

**Query Parameters:**
| Field | Type | Description |
| :--- | :--- | :--- |
| `variantId` | UUID | Optional. Specific variant ID if it's a variable product. |

**Request Body:**
```json
{
  "quantity": 1 // Optional. Default is 1, minimum is 1.
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Product moved to cart successfully"
}
```

**Error Responses:**
- `404 Not Found`: Product variant not in wishlist.
- `409 Conflict`: Product is out of stock (available stock < quantity).
```
