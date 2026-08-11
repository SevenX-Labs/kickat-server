# Admin Products Catalog API Specification

All product catalog management endpoints are served under `/api/v1/admin/products` with `@AdminAuth()`.

---

## Endpoints Overview

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/products` | Yes | Search, filter, and paginate products |
| `GET` | `/api/v1/admin/products/:id` | Yes | Get single product details by ID or Slug |
| `POST` | `/api/v1/admin/products` | Yes | Create product with SKU variants and media |
| `PATCH` | `/api/v1/admin/products/:id` | Yes | Update product, variants, and media |
| `PATCH` | `/api/v1/admin/products/:id/status` | Yes | Update product status (`ACTIVE`, `DRAFT`, `INACTIVE`) |
| `PATCH` | `/api/v1/admin/products/:id/stock` | Yes | Quick update product and variant stock levels |
| `DELETE` | `/api/v1/admin/products/:id` | Yes | Soft-delete or permanently delete product |
| `PATCH` | `/api/v1/admin/products/bulk-status` | Yes | Bulk activate/deactivate/draft products |
| `POST` | `/api/v1/admin/products/bulk-delete` | Yes | Bulk soft-delete or permanently delete products |
