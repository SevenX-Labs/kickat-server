# Orders API Specification & Guide

All Orders endpoints are served under `/api/v1/orders` and require standard JWT authentication (`Authorization: Bearer <accessToken>`).

---

## Endpoints Summary

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/orders` | Yes | List user orders with filtering by `status`, `type`, and date range |
| `GET` | `/api/v1/orders/:id` | Yes | Get detailed order info by order UUID |
| `GET` | `/api/v1/orders/:id/timeline` | Yes | Get status progression timeline for an order |
| `GET` | `/api/v1/orders/:id/tracking` | Yes | Get package tracking details & history |
| `GET` | `/api/v1/orders/:id/tracking-live` | Yes | Get real-time delivery agent & location tracking |
| `GET` | `/api/v1/orders/:id/invoice` | Yes | Get tax invoice data and PDF download URL |
| `PATCH` | `/api/v1/orders/:id/cancel` | Yes | Cancel order with cancellation reason |
| `POST` | `/api/v1/orders/:id/return` | Yes | Request item return within 7-day window |
| `POST` | `/api/v1/orders/:id/reorder` | Yes | Re-add items from previous order to user cart |

---

## 1. List Orders

#### `GET /api/v1/orders`

- **Headers**: `Authorization: Bearer <accessToken>`
- **Query Params**:
  - `page`: Integer (default `1`)
  - `limit`: Integer (default `10`)
  - `status`: Enum (`pending`, `processing`, `packed`, `shipped`, `out_for_delivery`, `delivered`, `cancelled`, `returned`)
  - `dateFrom`: ISO date string (`YYYY-MM-DD`)
  - `dateTo`: ISO date string (`YYYY-MM-DD`)
  - `type`: Enum (`ongoing`, `past`, `all`)
- **Error Codes**:
  - `400`: Invalid query parameters
  - `401`: Unauthorized

---

## 2. Get Order Details

#### `GET /api/v1/orders/:id`

- **Headers**: `Authorization: Bearer <accessToken>`
- **Param**: `:id` (valid UUID v4)
- **Error Codes**:
  - `400`: Invalid UUID v4
  - `401`: Unauthorized
  - `403`: Forbidden (Not your order)
  - `404`: Order not found

---

## 3. Get Order Timeline

#### `GET /api/v1/orders/:id/timeline`

- **Headers**: `Authorization: Bearer <accessToken>`
- **Param**: `:id` (valid UUID v4)
- **Error Codes**: `400` (invalid UUID), `401` (unauthorized), `403` (not your order), `404` (order not found)

---

## 4. Get Tracking Info

#### `GET /api/v1/orders/:id/tracking`

- **Headers**: `Authorization: Bearer <accessToken>`
- **Param**: `:id` (valid UUID v4)
- **Error Codes**: `400` (invalid UUID), `401` (unauthorized), `403` (not your order), `404` (order not found)

---

## 5. Get Live Tracking Info

#### `GET /api/v1/orders/:id/tracking-live`

- **Headers**: `Authorization: Bearer <accessToken>`
- **Param**: `:id` (valid UUID v4)
- **Error Codes**: `400` (invalid UUID), `401` (unauthorized), `403` (not your order), `404` (order not found)

---

## 6. Get Order Invoice

#### `GET /api/v1/orders/:id/invoice`

- **Headers**: `Authorization: Bearer <accessToken>`
- **Param**: `:id` (valid UUID v4)
- **Error Codes**: `400` (invalid UUID), `401` (unauthorized), `403` (not your order), `404` (order not found)

---

## 7. Cancel Order

#### `PATCH /api/v1/orders/:id/cancel`

- **Headers**: `Authorization: Bearer <accessToken>`
- **Param**: `:id` (valid UUID v4)
- **Body**:
  ```json
  {
    "reason": "changed_mind",
    "reasonOther": "Optional description if reason is other (max 200 chars)"
  }
  ```
- **Error Codes**:
  - `400`: Invalid input / invalid UUID
  - `401`: Unauthorized
  - `403`: Forbidden (Not your order)
  - `404`: Order not found
  - `409`: Conflict (Order already packed, shipped, delivered, or cancelled)

---

## 8. Request Return

#### `POST /api/v1/orders/:id/return`

- **Headers**: `Authorization: Bearer <accessToken>`
- **Param**: `:id` (valid UUID v4)
- **Body**:
  ```json
  {
    "items": [
      {
        "orderItemId": "33333333-3333-4333-8333-333333333333",
        "reason": "damaged",
        "reasonOther": "Item packaging was torn",
        "photos": ["https://example.com/photo1.jpg"]
      }
    ],
    "pickupInstructions": "Leave package with front desk"
  }
  ```
- **Error Codes**:
  - `400`: Invalid input / invalid UUID
  - `401`: Unauthorized
  - `403`: Forbidden (Not your order)
  - `404`: Order not found
  - `409`: Conflict (Order not delivered, return window expired > 7 days, return already initiated)

---

## 9. Reorder Items

#### `POST /api/v1/orders/:id/reorder`

- **Headers**: `Authorization: Bearer <accessToken>`
- **Param**: `:id` (valid UUID v4)
- **Error Codes**:
  - `400`: Invalid UUID v4
  - `401`: Unauthorized
  - `403`: Forbidden (Not your order)
  - `404`: Order not found
  - `409`: Conflict (Product discontinued or out of stock)

---

# Returns API Specification

All Returns endpoints are served under `/api/v1/returns` and require standard JWT authentication (`Authorization: Bearer <accessToken>`).

---

## 10. List Returns

#### `GET /api/v1/returns`

- **Headers**: `Authorization: Bearer <accessToken>`
- **Query Params**:
  - `page`: Integer (default `1`)
  - `limit`: Integer (default `10`)
  - `status`: Enum (`pending`, `approved`, `rejected`, `pickup_scheduled`, `picked_up`, `refunded`)
- **Error Codes**:
  - `401`: Unauthorized

---

## 11. Get Return Details

#### `GET /api/v1/returns/:id`

- **Headers**: `Authorization: Bearer <accessToken>`
- **Param**: `:id` (valid UUID v4)
- **Error Codes**:
  - `400`: Invalid UUID v4
  - `401`: Unauthorized
  - `403`: Forbidden (Not your return)
  - `404`: Return not found

