# Admin Categories API Specification

All category management endpoints are served under `/api/v1/admin/categories` with `@AdminAuth()`.

---

## Endpoints Overview

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/categories` | Yes | List categories (flat list or tree) with stats |
| `GET` | `/api/v1/admin/categories/tree` | Yes | Get complete category hierarchy tree |
| `GET` | `/api/v1/admin/categories/:id` | Yes | Get single category details |
| `POST` | `/api/v1/admin/categories` | Yes | Create category or subcategory |
| `PATCH` | `/api/v1/admin/categories/:id` | Yes | Update category fields, slug, image, or parentId |
| `PATCH` | `/api/v1/admin/categories/:id/status` | Yes | Activate or deactivate category |
| `PATCH` | `/api/v1/admin/categories/reorder` | Yes | Reorder display sequence across categories |
| `DELETE` | `/api/v1/admin/categories/:id` | Yes | Delete category (protected if products exist) |
