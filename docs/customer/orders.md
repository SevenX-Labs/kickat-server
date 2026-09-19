# Customer Orders API Specification

All customer order endpoints are served under `/api/v1/orders` and return endpoints under `/api/v1/returns`.

---

## Endpoints Overview

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/orders` | Yes | Get paginated order history |
| `GET` | `/api/v1/orders/:id` | Yes | Get detailed order summary |
| `POST` | `/api/v1/orders/:id/cancel` | Yes | Cancel a pending/confirmed order |
| `POST` | `/api/v1/orders/:id/return` | Yes | Request a return for a delivered order |
| `POST` | `/api/v1/orders/:id/reorder` | Yes | Add order items back to cart |
| `GET` | `/api/v1/returns` | Yes | Get paginated returns history |
| `GET` | `/api/v1/returns/:id` | Yes | Get single return request status |

---

## Endpoint Details

### 1. Order History & Details

#### Get All Orders
- **GET** `/api/v1/orders`
- **Query Params:** `page`, `limit`, `status` (e.g., DELIVERED, PENDING)
- **Response:** Paginated list of user's past orders.

#### Get Order by ID
- **GET** `/api/v1/orders/:id`
- **Response:** Comprehensive order payload including items, shipping address, payment status, timeline history, and return eligibility window.

### 2. Post-Purchase Actions

#### Cancel Order
- **POST** `/api/v1/orders/:id/cancel`
- **Request Body:** `{ "reason": "Changed my mind" }`
- **Constraints:** Order can only be cancelled if its status is `PENDING` or `CONFIRMED`.

#### Return Order
- **POST** `/api/v1/orders/:id/return`
- **Request Body:** 
  ```json
  {
    "items": [{ "orderItemId": "uuid", "quantity": 1 }],
    "reason": "Defective item",
    "images": ["url1", "url2"]
  }
  ```
- **Constraints:** Order must be `DELIVERED` and within the return window.

#### Reorder
- **POST** `/api/v1/orders/:id/reorder`
- **Description:** Adds all items from the previous order to the active cart (ignores out of stock items).
