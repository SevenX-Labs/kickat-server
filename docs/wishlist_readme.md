# Wishlist API Guide

All Wishlist endpoints are served under the base path `/api/v1/wishlist` and require standard JWT authentication (`Authorization: Bearer <accessToken>`).

---

## 1. Endpoints Summary

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/wishlist` | Yes | Get paginated list of products in user's wishlist |
| `POST` | `/api/v1/wishlist` | Yes | Add a product (or product variant) to user's wishlist |
| `DELETE` | `/api/v1/wishlist/:productId` | Yes | Remove a product from user's wishlist |
| `POST` | `/api/v1/wishlist/:productId/move-to-cart` | Yes | Move a wishlist product directly to user's shopping cart |

---

## 2. Validation & Parameter Rules

| Endpoint / Parameter | Type | Validation Rules |
| :--- | :--- | :--- |
| **productId** | UUID | Valid UUID v4 string |
| **variantId** | UUID | Optional valid UUID v4 string |
| **quantity** | Integer | Minimum `1`, default `1` |
| **page** | Integer | Minimum `1`, default `1` |
| **limit** | Integer | Minimum `1`, max `50` |

---

## 3. Detailed Endpoints & Response Examples

### A. Get User Wishlist

#### `GET /api/v1/wishlist`

- **Headers**: `Authorization: Bearer <accessToken>`
- **Query Params**: `page=1`, `limit=10`
- **cURL**:
```bash
curl -X GET "http://localhost:3000/api/v1/wishlist?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

##### Success Response (`200 OK`)
```json
{
  "success": true,
  "meta": {
    "total": 2,
    "page": 1,
    "limit": 10,
    "totalPages": 1
  },
  "items": [
    {
      "id": "wish_01",
      "userId": "user_123",
      "productId": "c1a23b45-6789-40de-f123-456789abcdef",
      "variantId": null,
      "createdAt": "2026-08-04T23:00:00.000Z",
      "product": {
        "id": "c1a23b45-6789-40de-f123-456789abcdef",
        "name": "Royal Canin Adult Dog Kibble",
        "slug": "royal-canin-adult-dog-kibble",
        "price": 1499.0,
        "discountPrice": 1299.0,
        "stock": 50,
        "rating": 4.8,
        "category": {
          "id": "cat_01",
          "name": "Dog Food",
          "slug": "dog-food"
        }
      },
      "variant": null
    }
  ]
}
```

---

### B. Add Product to Wishlist

#### `POST /api/v1/wishlist`

- **Headers**:
  - `Authorization: Bearer <accessToken>`
  - `Content-Type: application/json`
- **Request Body**:
```json
{
  "productId": "c1a23b45-6789-40de-f123-456789abcdef",
  "variantId": "var_991"
}
```
- **cURL**:
```bash
curl -X POST "http://localhost:3000/api/v1/wishlist" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"productId": "c1a23b45-6789-40de-f123-456789abcdef"}'
```

##### Success Response (`201 Created`)
```json
{
  "success": true,
  "message": "Product added to wishlist",
  "item": {
    "id": "wish_02",
    "userId": "user_123",
    "productId": "c1a23b45-6789-40de-f123-456789abcdef",
    "createdAt": "2026-08-04T23:15:00.000Z"
  }
}
```

##### Conflict Response (`409 Conflict`)
```json
{
  "statusCode": 409,
  "message": "Product already in wishlist",
  "error": "Conflict"
}
```

---

### C. Remove Product from Wishlist

#### `DELETE /api/v1/wishlist/:productId`

- **Headers**: `Authorization: Bearer <accessToken>`
- **cURL**:
```bash
curl -X DELETE "http://localhost:3000/api/v1/wishlist/c1a23b45-6789-40de-f123-456789abcdef" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

##### Success Response (`200 OK`)
```json
{
  "success": true,
  "message": "Product removed from wishlist"
}
```

---

### D. Move Wishlist Item to Shopping Cart

#### `POST /api/v1/wishlist/:productId/move-to-cart`

- **Headers**:
  - `Authorization: Bearer <accessToken>`
  - `Content-Type: application/json`
- **Request Body**:
```json
{
  "quantity": 2
}
```
- **cURL**:
```bash
curl -X POST "http://localhost:3000/api/v1/wishlist/c1a23b45-6789-40de-f123-456789abcdef/move-to-cart" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"quantity": 1}'
```

##### Success Response (`200 OK`)
```json
{
  "success": true,
  "message": "Product moved to cart successfully"
}
```
