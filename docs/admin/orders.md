# Admin Orders API Specification

All order management endpoints are served under `/api/v1/admin/orders` with `@AdminAuth()`.

---

## Endpoints Overview

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/orders` | Yes | List all orders with filters, search, sorting, and pagination |
| `GET` | `/api/v1/admin/orders/:id` | Yes | Detailed order info with customer, items, payment & shipment status |
| `GET` | `/api/v1/admin/orders/:id/invoice` | Yes | Generate official tax invoice with GST breakdown |
| `GET` | `/api/v1/admin/orders/:id/packing-slip` | Yes | Generate warehouse fulfillment packing slip |
| `PATCH` | `/api/v1/admin/orders/:id/status` | Yes | Update order status and courier tracking info |
| `POST` | `/api/v1/admin/orders/:id/cancel` | Yes | Cancel order and restock inventory |
| `POST` | `/api/v1/admin/orders/:id/refund` | Yes | Process full or partial refund for order |
