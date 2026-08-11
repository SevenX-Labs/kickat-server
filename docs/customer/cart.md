# Customer Shopping Cart & Guest Cart API Specification

All cart endpoints are served under `/api/v1/cart`.

---

## Endpoints Overview

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/cart` | Yes | Get authenticated user cart summary & items |
| `POST` | `/api/v1/cart/items` | Yes | Add item to cart (`quantity` 1–100) with stock check |
| `PUT` | `/api/v1/cart/items/:itemId` | Yes | Update item quantity in cart |
| `DELETE` | `/api/v1/cart/items/:itemId` | Yes | Remove item from cart |
| `POST` | `/api/v1/cart/buy-now` | Yes | Instant single item buy-now checkout session |
| `POST` | `/api/v1/cart/guest` | No | Add item to guest cart (`guestSessionId` UUID) |
| `GET` | `/api/v1/cart/guest/:sessionId` | No | Get guest cart summary by session ID |
| `POST` | `/api/v1/cart/merge` | Yes | Merge guest cart items into user cart upon login |

---

## Detailed Endpoints

### 1. Get User Cart Summary
`GET /api/v1/cart`
- **Headers**: `Authorization: Bearer <accessToken>`
- **Response (`200 OK`)**:
```json
{
  "success": true,
  "summary": {
    "itemCount": 2,
    "subtotal": 2598.0,
    "productDiscount": 400.0,
    "deliveryFee": 0,
    "grandTotal": 2598.0
  },
  "items": [
    {
      "id": "cart_item_01",
      "productId": "c1a23b45-6789-40de-f123-456789abcdef",
      "quantity": 2,
      "unitPrice": 1299.0,
      "totalPrice": 2598.0
    }
  ]
}
```

---

### 2. Add Item to Cart
`POST /api/v1/cart/items`
- **Request Body**:
```json
{
  "productId": "c1a23b45-6789-40de-f123-456789abcdef",
  "variantId": null,
  "quantity": 2
}
```

---

### 3. Buy Now
`POST /api/v1/cart/buy-now`
- **Request Body**:
```json
{
  "productId": "c1a23b45-6789-40de-f123-456789abcdef",
  "quantity": 1
}
```

---

### 4. Merge Guest Cart
`POST /api/v1/cart/merge`
- **Request Body**:
```json
{
  "guestSessionId": "e5b12a34-7890-41de-a123-9876543210fe"
}
```
