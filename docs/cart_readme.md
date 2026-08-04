# Cart & Checkout API Guide

All Shopping Cart, Buy-Now, and Guest Cart endpoints are served under the base path `/api/v1/cart`.

---

## 1. Endpoints Summary

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/cart` | Yes | Get authenticated user's cart summary (subtotal, product discount, delivery fee, grand total) and items list |
| `POST` | `/api/v1/cart/items` | Yes | Add product/variant to cart (`quantity` 1–100) with stock check |
| `PUT` | `/api/v1/cart/items/:itemId` | Yes | Update item quantity in cart (`quantity` 1–100) |
| `DELETE` | `/api/v1/cart/items/:itemId` | Yes | Remove specific item from cart |
| `POST` | `/api/v1/cart/buy-now` | Yes | Instant buy-now single item checkout session |
| `POST` | `/api/v1/cart/guest` | No | Add item to guest cart (`guestSessionId` UUID v4) |
| `GET` | `/api/v1/cart/guest/:sessionId` | No | Get guest cart summary by session ID |
| `POST` | `/api/v1/cart/merge` | Yes | Merge guest cart items into authenticated user's cart upon login |

---

## 2. Validation & Parameter Rules

| Parameter / Field | Type | Validation Rules |
| :--- | :--- | :--- |
| **productId** | UUID | Valid UUID v4 string |
| **variantId** | UUID | Optional valid UUID v4 string |
| **itemId** | UUID | Valid UUID v4 string |
| **guestSessionId** / **sessionId** | UUID | Valid UUID v4 string |
| **quantity** | Integer | Minimum `1`, maximum `100` |

---

## 3. Detailed Endpoints & Response Examples

### A. Get User Shopping Cart Summary

#### `GET /api/v1/cart`

- **Headers**: `Authorization: Bearer <accessToken>`
- **cURL**:
```bash
curl -X GET "http://localhost:3000/api/v1/cart" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

##### Success Response (`200 OK`)
```json
{
  "success": true,
  "summary": {
    "itemCount": 3,
    "subtotal": 2998.0,
    "productDiscount": 400.0,
    "deliveryFee": 0,
    "grandTotal": 2998.0
  },
  "items": [
    {
      "id": "cart_item_01",
      "productId": "c1a23b45-6789-40de-f123-456789abcdef",
      "variantId": null,
      "quantity": 2,
      "unitPrice": 1299.0,
      "totalPrice": 2598.0,
      "product": {
        "id": "c1a23b45-6789-40de-f123-456789abcdef",
        "name": "Royal Canin Adult Dog Food",
        "slug": "royal-canin-adult-dog-food",
        "price": 1499.0,
        "discountPrice": 1299.0,
        "stock": 45
      }
    }
  ]
}
```

---

### B. Add Item to Cart

#### `POST /api/v1/cart/items`

- **Headers**:
  - `Authorization: Bearer <accessToken>`
  - `Content-Type: application/json`
- **Request Body**:
```json
{
  "productId": "c1a23b45-6789-40de-f123-456789abcdef",
  "variantId": "var_991",
  "quantity": 2
}
```

##### Error Responses
- `404 Not Found`: `Product not found` or `Product variant not found`
- `409 Conflict`: `Insufficient stock available` or `Maximum allowed item quantity (100) exceeded`

---

### C. Buy Now (Instant Checkout Session)

#### `POST /api/v1/cart/buy-now`

- **Headers**:
  - `Authorization: Bearer <accessToken>`
  - `Content-Type: application/json`
- **Request Body**:
```json
{
  "productId": "c1a23b45-6789-40de-f123-456789abcdef",
  "quantity": 1
}
```

##### Success Response (`200 OK`)
```json
{
  "success": true,
  "message": "Buy now session created successfully",
  "buyNowItem": {
    "productId": "c1a23b45-6789-40de-f123-456789abcdef",
    "productName": "Royal Canin Adult Dog Food",
    "quantity": 1,
    "unitPrice": 1299.0,
    "subtotal": 1299.0,
    "deliveryFee": 0,
    "grandTotal": 1299.0
  }
}
```

---

### D. Merge Guest Cart to User Cart

#### `POST /api/v1/cart/merge`

- **Headers**:
  - `Authorization: Bearer <accessToken>`
  - `Content-Type: application/json`
- **Request Body**:
```json
{
  "guestSessionId": "e5b12a34-7890-41de-a123-9876543210fe"
}
```
