# Customer Orders & Returns API Specification

Endpoints for order tracking, status timeline, tax invoice, cancellation, returns under `/api/v1/orders` and `/api/v1/returns`.

---

## Endpoints Overview

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/orders` | Yes | List user orders with status and date filters |
| `GET` | `/api/v1/orders/:id` | Yes | Detailed order details |
| `GET` | `/api/v1/orders/:id/timeline` | Yes | Order status progression timeline |
| `GET` | `/api/v1/orders/:id/tracking` | Yes | Package tracking & carrier info |
| `GET` | `/api/v1/orders/:id/tracking-live` | Yes | Real-time agent GPS location tracking |
| `GET` | `/api/v1/orders/:id/invoice` | Yes | Tax invoice data and PDF URL |
| `PATCH` | `/api/v1/orders/:id/cancel` | Yes | Cancel order prior to packing |
| `POST` | `/api/v1/orders/:id/return` | Yes | Request item return within 7 days |
| `POST` | `/api/v1/orders/:id/reorder` | Yes | Re-add past order items to shopping cart |
| `GET` | `/api/v1/returns` | Yes | List user return requests |
| `GET` | `/api/v1/returns/:id` | Yes | Get single return request details |
