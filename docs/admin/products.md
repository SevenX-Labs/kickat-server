# Admin Product Catalog, Stock Alert & Inventory API Specification

All administrative product management endpoints are served under `/api/v1/admin/products` and require Admin Authentication (`@AdminAuth()`).

---

## Table of Contents

1. [Architecture & Frontend Integration Overview](#architecture--frontend-integration-overview)
2. [Endpoints Overview](#endpoints-overview)
3. [Automated Low Stock Alert System](#automated-low-stock-alert-system)
4. [Endpoint Specifications](#endpoint-specifications)
   - [1. List Products (Filters, Search, Sort, Paginate)](#1-list-products-filters-search-sort-paginate)
   - [2. Get Product Details by ID or Slug](#2-get-product-details-by-id-or-slug)
   - [3. Create New Product with Variants & Media](#3-create-new-product-with-variants--media)
   - [4. Update Product Fields & Variant Stock](#4-update-product-fields--variant-stock)
   - [5. Quick Update Product & Variant Stock](#5-quick-update-product--variant-stock)
   - [6. Toggle Product Active Status](#6-toggle-product-active-status)
   - [7. Bulk Update Product Statuses](#7-bulk-update-product-statuses)
   - [8. Bulk Delete Products](#8-bulk-delete-products)
   - [9. Delete Product (Soft or Permanent)](#9-delete-product-soft-or-permanent)
5. [Frontend Integration Guide (TypeScript & Axios)](#frontend-integration-guide-typescript--axios)

---

## Architecture & Frontend Integration Overview

- **Base URL:** `https://api.kickat.co.in/api/v1/admin/products` (or `http://localhost:3000/api/v1/admin/products` in development)
- **Content Type:** `application/json`
- **Authentication Scheme:** `Authorization: Bearer <accessToken>`
- **Variant Support:** Products support child SKU variants (e.g., `1.5 kg` vs `3 kg`). Inventory is checked at both variant level and base product level.
- **Bulk Operations:** Provides batch endpoints for updating status (`ACTIVE`, `DRAFT`, `INACTIVE`) and bulk deletion across multiple product UUIDs.

---

## Endpoints Overview

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/admin/products` | Search, filter, and paginate products catalog with inventory metrics |
| `GET` | `/api/v1/admin/products/:id` | Retrieve single product details with variants, media, and review counters |
| `POST` | `/api/v1/admin/products` | Create product with optional variants, dietary preference, and media |
| `PATCH` | `/api/v1/admin/products/:id` | Update product metadata, attributes, variants, or category |
| `PATCH` | `/api/v1/admin/products/:id/stock` | Quick adjust stock quantity for product and variant SKUs |
| `PATCH` | `/api/v1/admin/products/:id/status` | Update product publication status (`ACTIVE`, `DRAFT`, `INACTIVE`) |
| `PATCH` | `/api/v1/admin/products/bulk-status` | Bulk update publication status across multiple product IDs |
| `POST` | `/api/v1/admin/products/bulk-delete` | Bulk soft-delete or permanently delete multiple products |
| `DELETE` | `/api/v1/admin/products/:id` | Soft-delete or permanently purge product |

---

## Automated Low Stock Alert System

The Kickat server includes an automated `StockAlertService` that monitors product and variant stock levels:

- **Low Stock Threshold**: Triggers an alert notification when stock falls below configured threshold (default: $\le 5$ units).
- **Out of Stock Alert**: Triggers immediate notification when stock reaches $0$ units.
- **Multi-Channel Dispatch**: Sends email alerts to store managers via Resend or SMTP based on notification settings.

---

## Endpoint Specifications

### 1. List Products

- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/admin/products`
- **Query Parameters:** `page`, `limit`, `search`, `status`, `categoryId`, `petSpecies`, `dietaryPreference`, `stockStatus`

---

### 2. Get Product Details

- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/admin/products/:id`

---

### 3. Quick Update Stock

- **HTTP Method:** `PATCH`
- **Endpoint:** `/api/v1/admin/products/:id/stock`

#### Request Body
```json
{
  "stock": 25,
  "variantStocks": [
    { "variantId": "var-uuid-1", "stock": 15 },
    { "variantId": "var-uuid-2", "stock": 10 }
  ]
}
```

---

### 4. Bulk Update Product Statuses

- **HTTP Method:** `PATCH`
- **Endpoint:** `/api/v1/admin/products/bulk-status`

#### Request Body
```json
{
  "productIds": ["prod-uuid-1", "prod-uuid-2"],
  "status": "ACTIVE"
}
```

---

### 5. Bulk Delete Products

- **HTTP Method:** `POST`
- **Endpoint:** `/api/v1/admin/products/bulk-delete`

#### Request Body
```json
{
  "productIds": ["prod-uuid-1", "prod-uuid-2"],
  "permanent": false
}
```

---

## Frontend Integration Guide (TypeScript & Axios)

```typescript
// services/adminProductService.ts
import axios from "axios";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://api.kickat.co.in/api/v1";

const productApi = axios.create({
  baseURL: `${API_BASE}/admin/products`,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

productApi.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("admin_access_token");
    if (token && config.headers) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const AdminProductService = {
  async getProducts(params?: any) {
    const res = await productApi.get("", { params });
    return res.data;
  },

  async getProductById(id: string) {
    const res = await productApi.get(`/${id}`);
    return res.data;
  },

  async createProduct(payload: any) {
    const res = await productApi.post("", payload);
    return res.data;
  },

  async updateProduct(id: string, payload: any) {
    const res = await productApi.patch(`/${id}`, payload);
    return res.data;
  },

  async updateStatus(id: string, status: "ACTIVE" | "DRAFT" | "INACTIVE") {
    const res = await productApi.patch(`/${id}/status`, { status });
    return res.data;
  },

  async quickUpdateStock(id: string, stock: number, variantStocks?: { variantId: string; stock: number }[]) {
    const res = await productApi.patch(`/${id}/stock`, { stock, variantStocks });
    return res.data;
  },

  async bulkUpdateStatus(productIds: string[], status: "ACTIVE" | "DRAFT" | "INACTIVE") {
    const res = await productApi.patch("/bulk-status", { productIds, status });
    return res.data;
  },

  async bulkDelete(productIds: string[], permanent: boolean = false) {
    const res = await productApi.post("/bulk-delete", { productIds, permanent });
    return res.data;
  },

  async deleteProduct(id: string, permanent?: boolean) {
    const res = await productApi.delete(`/${id}`, { params: { permanent } });
    return res.data;
  },
};
```
