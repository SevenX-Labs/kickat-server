# Reviews API Specification & Guide

All Reviews endpoints are served under `/api/v1/reviews`.

---

## Endpoints Summary

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/reviews` | Yes | Submit a review for a verified purchase |
| `GET` | `/api/v1/reviews` | No | Get paginated list of reviews with filters & sorting |
| `GET` | `/api/v1/reviews/:id` | No | Get detailed review info by review UUID |
| `PATCH` | `/api/v1/reviews/:id/helpful` | Yes | Mark a review as helpful |

---

## 1. Submit Review

#### `POST /api/v1/reviews`

- **Headers**:
  - `Authorization: Bearer <accessToken>`
  - `Content-Type: application/json`
- **Body**:
  ```json
  {
    "productId": "22222222-2222-4222-8222-222222222222",
    "orderId": "33333333-3333-4333-8333-333333333333",
    "rating": 5,
    "comment": "Excellent quality product! My pet absolutely loves it.",
    "photos": ["https://example.com/photo1.jpg"]
  }
  ```
- **Error Codes**:
  - `400`: Invalid input (rating < 1 or > 5, comment length < 10, invalid UUIDs)
  - `401`: Unauthorized
  - `403`: Forbidden (Not a verified purchaser — must have ordered and received the product)
  - `404`: Product not found
  - `409`: Conflict (Review already submitted for this product-order pair)

---

## 2. List Reviews

#### `GET /api/v1/reviews`

- **Headers**: None required (Public)
- **Query Params**:
  - `productId`: UUID v4 (optional)
  - `page`: Integer (default `1`)
  - `limit`: Integer (default `10`)
  - `rating`: Integer 1-5 (optional)
  - `sort`: Enum (`newest`, `helpful`, `highest`, `lowest`, default `newest`)
  - `hasPhotos`: Boolean (optional)
  - `verifiedOnly`: Boolean (optional)
- **Error Codes**:
  - `400`: Invalid query parameters

---

## 3. Get Review Details

#### `GET /api/v1/reviews/:id`

- **Headers**: None required (Public)
- **Param**: `:id` (valid UUID v4)
- **Error Codes**:
  - `400`: Invalid UUID v4
  - `404`: Review not found

---

## 4. Mark Review as Helpful

#### `PATCH /api/v1/reviews/:id/helpful`

- **Headers**: `Authorization: Bearer <accessToken>`
- **Param**: `:id` (valid UUID v4)
- **Error Codes**:
  - `400`: Invalid UUID v4
  - `401`: Unauthorized
  - `404`: Review not found
  - `409`: Conflict (Already marked helpful by this user)
