# Admin Category Hierarchy & Reordering API Specification

All administrative category management endpoints are served under `/api/v1/admin/categories` and require Admin Authentication (`@AdminAuth()`).

---

## Table of Contents

1. [Architecture & Frontend Integration Overview](#architecture--frontend-integration-overview)
2. [Endpoints Overview](#endpoints-overview)
3. [Sort & Filter Options](#sort--filter-options)
4. [Endpoint Specifications](#endpoint-specifications)
   - [1. List Categories (Flat or Tree with Summary)](#1-list-categories-flat-or-tree-with-summary)
   - [2. Get Category Tree Hierarchy](#2-get-category-tree-hierarchy)
   - [3. Get Category by ID or Slug](#3-get-category-by-id-or-slug)
   - [4. Create Category (Root or Subcategory)](#4-create-category-root-or-subcategory)
   - [5. Update Category Details](#5-update-category-details)
   - [6. Toggle Category Active Status](#6-toggle-category-active-status)
   - [7. Bulk Reorder Categories Display Sequence](#7-bulk-reorder-categories-display-sequence)
   - [8. Delete Category (with Integrity Protections)](#8-delete-category-with-integrity-protections)
5. [Standard Error Response Format](#standard-error-response-format)
6. [Frontend Integration Guide (TypeScript & Axios)](#frontend-integration-guide-typescript--axios)
   - [TypeScript Types & Interfaces](#typescript-types--interfaces)
   - [Production-Ready API Service](#production-ready-api-service)
   - [UI Component Examples](#ui-component-examples)

---

## Architecture & Frontend Integration Overview

- **Base URL:** `https://api.kickat.co.in/api/v1/admin/categories` (or `http://localhost:3000/api/v1/admin/categories` in development)
- **Content Type:** `application/json`
- **Authentication Scheme:** `Authorization: Bearer <accessToken>`
- **Parent/Child Relationship:** Root categories have `parentId = null`. Subcategories reference their parent via `parentId: UUID`.
- **Integrity Protections on Delete:** A category cannot be deleted if active products are still assigned to it or if it has child subcategories. Delete will return `400 Bad Request` with an explicit reason.
- **Tree vs Flat Mode:** `GET /categories?tree=true` or dedicated `GET /categories/tree` returns root categories with their nested `subcategories` arrays populated.

---

## Endpoints Overview

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/categories` | Yes (`Bearer`) | List categories with search, root/sub filters, and counts |
| `GET` | `/api/v1/admin/categories/tree` | Yes (`Bearer`) | Retrieve complete hierarchical category tree |
| `PATCH` | `/api/v1/admin/categories/reorder` | Yes (`Bearer`) | Bulk reorder display sequence index across categories |
| `GET` | `/api/v1/admin/categories/:id` | Yes (`Bearer`) | Retrieve single category details with child list and product count |
| `POST` | `/api/v1/admin/categories` | Yes (`Bearer`) | Create a new root category or subcategory |
| `PATCH` | `/api/v1/admin/categories/:id/status` | Yes (`Bearer`) | Toggle active/inactive status |
| `PATCH` | `/api/v1/admin/categories/:id` | Yes (`Bearer`) | Update category name, slug, image, parent, or order |
| `DELETE` | `/api/v1/admin/categories/:id` | Yes (`Bearer`) | Delete category (prevented if active products or children exist) |

---

## Sort & Filter Options

### Category Sorting (`AdminCategorySortEnum`)
- `order_asc` (Default - Display order sequence 0, 1, 2...)
- `order_desc`
- `name_asc` (Alphabetical A-Z)
- `name_desc`
- `createdAt_desc`
- `createdAt_asc`

---

## Endpoint Specifications

### 1. List Categories (Flat or Tree with Summary)

- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/admin/categories`
- **Headers:** `Authorization: Bearer <accessToken>`

#### Query Parameters
| Parameter | Type | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `search` | `string` | No | - | Fuzzy search in name, slug |
| `isActive` | `boolean` | No | - | Filter by active status |
| `parentId` | `string` | No | - | Filter direct children of a category |
| `isRoot` | `boolean` | No | - | `true` to return root categories only (`parentId = null`) |
| `tree` | `boolean` | No | `false` | `true` to return hierarchical nested tree structure |
| `sort` | `string` | No | `order_asc` | Sort sequence |

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "data": {
    "categories": [
      {
        "id": "cat-uuid-1",
        "name": "Dog Supplies",
        "slug": "dog-supplies",
        "imageUrl": "https://cdn.kickat.co.in/categories/dog.png",
        "parentId": null,
        "isActive": true,
        "order": 1,
        "parent": null,
        "subcategories": [],
        "_count": {
          "products": 45,
          "subcategories": 4
        },
        "createdAt": "2026-08-01T10:00:00.000Z",
        "updatedAt": "2026-09-08T05:00:00.000Z"
      }
    ],
    "summary": {
      "totalCategories": 24,
      "rootCategoriesCount": 6,
      "subcategoriesCount": 18,
      "activeCount": 22,
      "inactiveCount": 2
    }
  }
}
```

---

### 2. Get Category Tree Hierarchy

- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/admin/categories/tree`
- **Headers:** `Authorization: Bearer <accessToken>`

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "data": [
    {
      "id": "cat-root-1",
      "name": "Dog Supplies",
      "slug": "dog-supplies",
      "imageUrl": "https://cdn.kickat.co.in/categories/dog.png",
      "parentId": null,
      "isActive": true,
      "order": 1,
      "_count": { "products": 85, "subcategories": 3 },
      "subcategories": [
        {
          "id": "cat-sub-1",
          "name": "Dry Kibble",
          "slug": "dry-kibble",
          "imageUrl": "https://cdn.kickat.co.in/categories/kibble.png",
          "parentId": "cat-root-1",
          "isActive": true,
          "order": 1,
          "_count": { "products": 42, "subcategories": 0 }
        },
        {
          "id": "cat-sub-2",
          "name": "Chew Toys",
          "slug": "chew-toys",
          "imageUrl": "https://cdn.kickat.co.in/categories/toys.png",
          "parentId": "cat-root-1",
          "isActive": true,
          "order": 2,
          "_count": { "products": 28, "subcategories": 0 }
        }
      ]
    }
  ]
}
```

---

### 3. Get Category by ID or Slug

- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/admin/categories/:id` (Accepts UUID v4 or URL slug)
- **Headers:** `Authorization: Bearer <accessToken>`

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "data": {
    "id": "cat-uuid-1",
    "name": "Dog Supplies",
    "slug": "dog-supplies",
    "imageUrl": "https://cdn.kickat.co.in/categories/dog.png",
    "parentId": null,
    "isActive": true,
    "order": 1,
    "parent": null,
    "subcategories": [
      {
        "id": "cat-sub-1",
        "name": "Dry Kibble",
        "slug": "dry-kibble",
        "isActive": true,
        "order": 1
      }
    ],
    "_count": {
      "products": 45,
      "subcategories": 1
    }
  }
}
```

---

### 4. Create Category (Root or Subcategory)

- **HTTP Method:** `POST`
- **Endpoint:** `/api/v1/admin/categories`
- **Headers:** `Authorization: Bearer <accessToken>`, `Content-Type: application/json`

#### Request Body
```json
{
  "name": "Pet Health & Supplements",
  "slug": "pet-health-supplements",
  "imageUrl": "https://cdn.kickat.co.in/categories/health.png",
  "parentId": null,
  "isActive": true,
  "order": 4
}
```
*(To create a subcategory, pass the parent category's UUID in `parentId`)*

#### Expected Success Response (`201 Created`)
```json
{
  "success": true,
  "message": "Category created successfully",
  "data": {
    "id": "cat-new-uuid",
    "name": "Pet Health & Supplements",
    "slug": "pet-health-supplements",
    "imageUrl": "https://cdn.kickat.co.in/categories/health.png",
    "parentId": null,
    "isActive": true,
    "order": 4,
    "createdAt": "2026-09-08T11:00:00.000Z"
  }
}
```

---

### 5. Update Category Details

- **HTTP Method:** `PATCH`
- **Endpoint:** `/api/v1/admin/categories/:id`
- **Headers:** `Authorization: Bearer <accessToken>`, `Content-Type: application/json`

#### Request Body
```json
{
  "name": "Pet Health, Supplements & Grooming",
  "order": 5,
  "imageUrl": "https://cdn.kickat.co.in/categories/health-updated.png"
}
```

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "message": "Category updated successfully",
  "data": {
    "id": "cat-uuid-1",
    "name": "Pet Health, Supplements & Grooming",
    "slug": "pet-health-supplements-grooming",
    "order": 5,
    "updatedAt": "2026-09-08T11:10:00.000Z"
  }
}
```

---

### 6. Toggle Category Active Status

- **HTTP Method:** `PATCH`
- **Endpoint:** `/api/v1/admin/categories/:id/status`
- **Headers:** `Authorization: Bearer <accessToken>`, `Content-Type: application/json`

#### Request Body
```json
{
  "isActive": false
}
```

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "message": "Category deactivated successfully",
  "data": {
    "id": "cat-uuid-1",
    "isActive": false,
    "updatedAt": "2026-09-08T11:12:00.000Z"
  }
}
```

---

### 7. Bulk Reorder Categories Display Sequence

- **HTTP Method:** `PATCH`
- **Endpoint:** `/api/v1/admin/categories/reorder`
- **Headers:** `Authorization: Bearer <accessToken>`, `Content-Type: application/json`

#### Request Body
```json
{
  "items": [
    { "id": "cat-uuid-1", "order": 0 },
    { "id": "cat-uuid-2", "order": 1 },
    { "id": "cat-uuid-3", "order": 2 }
  ]
}
```

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "message": "Successfully reordered 3 categories"
}
```

---

### 8. Delete Category (with Integrity Protections)

- **HTTP Method:** `DELETE`
- **Endpoint:** `/api/v1/admin/categories/:id`
- **Headers:** `Authorization: Bearer <accessToken>`

#### Error Cases
- Cannot delete if products exist:
  ```json
  {
    "success": false,
    "statusCode": 400,
    "message": "Cannot delete category: 14 products are currently assigned to it. Reassign or delete the products first."
  }
  ```
- Cannot delete if subcategories exist:
  ```json
  {
    "success": false,
    "statusCode": 400,
    "message": "Cannot delete category: 2 child subcategories exist under it. Delete or reassign subcategories first."
  }
  ```

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "message": "Category deleted successfully"
}
```

---

## Frontend Integration Guide (TypeScript & Axios)

### TypeScript Types & Interfaces

```typescript
// types/admin-category.ts

export interface CategorySummary {
  totalCategories: number;
  rootCategoriesCount: number;
  subcategoriesCount: number;
  activeCount: number;
  inactiveCount: number;
}

export interface AdminCategoryItem {
  id: string;
  name: string;
  slug: string;
  imageUrl?: string | null;
  parentId?: string | null;
  isActive: boolean;
  order: number;
  parent?: { id: string; name: string; slug: string } | null;
  subcategories?: AdminCategoryItem[];
  _count?: { products: number; subcategories: number };
  createdAt: string;
  updatedAt: string;
}

export interface AdminCategoriesResponse {
  success: boolean;
  data: {
    categories: AdminCategoryItem[];
    summary: CategorySummary;
  };
}

export interface ReorderCategoryItem {
  id: string;
  order: number;
}
```

### Production-Ready API Service

```typescript
// services/adminCategoryService.ts
import axios from "axios";
import { AdminCategoriesResponse, AdminCategoryItem, ReorderCategoryItem } from "../types/admin-category";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.kickat.co.in/api/v1";

const categoryApi = axios.create({
  baseURL: `${BASE_URL}/admin/categories`,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

categoryApi.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("admin_access_token");
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

export const AdminCategoryService = {
  async getCategories(params?: any): Promise<AdminCategoriesResponse> {
    const res = await categoryApi.get<AdminCategoriesResponse>("", { params });
    return res.data;
  },

  async getCategoryTree(): Promise<{ success: boolean; data: AdminCategoryItem[] }> {
    const res = await categoryApi.get<{ success: boolean; data: AdminCategoryItem[] }>("/tree");
    return res.data;
  },

  async getCategoryById(id: string): Promise<{ success: boolean; data: AdminCategoryItem }> {
    const res = await categoryApi.get<{ success: boolean; data: AdminCategoryItem }>(`/${id}`);
    return res.data;
  },

  async createCategory(payload: any) {
    const res = await categoryApi.post("", payload);
    return res.data;
  },

  async updateCategory(id: string, payload: any) {
    const res = await categoryApi.patch(`/${id}`, payload);
    return res.data;
  },

  async updateStatus(id: string, isActive: boolean) {
    const res = await categoryApi.patch(`/${id}/status`, { isActive });
    return res.data;
  },

  async reorderCategories(items: ReorderCategoryItem[]) {
    const res = await categoryApi.patch("/reorder", { items });
    return res.data;
  },

  async deleteCategory(id: string) {
    const res = await categoryApi.delete(`/${id}`);
    return res.data;
  },
};
```
