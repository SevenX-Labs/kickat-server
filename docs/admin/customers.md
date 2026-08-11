# Admin Customers API Specification

All customer management endpoints are served under `/api/v1/admin/customers` with `@AdminAuth()`.

---

## Endpoints Overview

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/customers` | Yes | List customers with search, filter, and pagination |
| `GET` | `/api/v1/admin/customers/:id` | Yes | Detailed customer profile with lifetime spending stats |
| `GET` | `/api/v1/admin/customers/:id/orders` | Yes | Customer's complete order history |
| `GET` | `/api/v1/admin/customers/:id/addresses` | Yes | Customer's saved delivery addresses |
| `GET` | `/api/v1/admin/customers/:id/pets` | Yes | Customer's registered pet profiles |
| `PATCH` | `/api/v1/admin/customers/:id/status` | Yes | Block or unblock customer (revokes tokens on block) |
