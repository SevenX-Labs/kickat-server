# Admin Testimonials & Social Proof API Specification

All administrative testimonial management endpoints are served under `/api/v1/admin/testimonials` and require Admin Authentication (`@AdminAuth()`).

---

## Table of Contents

1. [Architecture & Frontend Integration Overview](#architecture--frontend-integration-overview)
2. [Endpoints Overview](#endpoints-overview)
3. [Testimonial Moderation & Reordering Engine](#testimonial-moderation--reordering-engine)
4. [Endpoint Specifications](#endpoint-specifications)
   - [1. List Testimonials (Search, Status Filter, Pagination)](#1-list-testimonials-search-status-filter-pagination)
   - [2. Get Testimonial Details by ID](#2-get-testimonial-details-by-id)
   - [3. Create New Testimonial](#3-create-new-testimonial)
   - [4. Update Testimonial Details](#4-update-testimonial-details)
   - [5. Toggle Active Display Status](#5-toggle-active-display-status)
   - [6. Batch Reorder Testimonials Display Sequence](#6-batch-reorder-testimonials-display-sequence)
   - [7. Delete Testimonial (Soft or Permanent)](#7-delete-testimonial-soft-or-permanent)
5. [Frontend Integration Guide (TypeScript & Axios)](#frontend-integration-guide-typescript--axios)

---

## Architecture & Frontend Integration Overview

- **Base URL:** `https://api.kickat.co.in/api/v1/admin/testimonials` (or `http://localhost:3000/api/v1/admin/testimonials` in development)
- **Content Type:** `application/json`
- **Authentication Scheme:** `Authorization: Bearer <accessToken>`
- **Homepage Visibility**: Only active testimonials (`isActive: true`) are exposed on the public homepage feed (`GET /api/v1/home`).
- **Display Ordering**: Testimonials feature an integer `order` sequence for drag-and-drop homepage reordering.

---

## Endpoints Overview

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/testimonials` | Admin | List all testimonials with status filters, search, and summary stats |
| `GET` | `/api/v1/admin/testimonials/:id` | Admin | Get single testimonial details |
| `POST` | `/api/v1/admin/testimonials` | Admin | Create a new homepage testimonial |
| `PATCH` | `/api/v1/admin/testimonials/:id` | Admin | Partial edit of testimonial details |
| `PUT` | `/api/v1/admin/testimonials/:id` | Admin | Full update of testimonial details |
| `PATCH` | `/api/v1/admin/testimonials/:id/status` | Admin | Toggle active state (show/hide on homepage) |
| `PATCH` | `/api/v1/admin/testimonials/reorder` | Admin | Batch update display ordering sequence |
| `DELETE` | `/api/v1/admin/testimonials/:id` | Admin | Soft-delete or permanently purge testimonial |

---

## Testimonial Moderation & Reordering Engine

The testimonial system allows admins to display verified customer reviews, pet owner feedback, and celebrity endorsements on the customer storefront.

### Business Rules & Constraints
- **Rating Constraint**: Integer rating between `1` and `5` stars (`@Min(1) @Max(5)`).
- **Avatar Image**: Optional avatar image URL (`authorAvatar`). Default avatar placeholder is returned if `null`.
- **Order Sequence**: Integer display position. `PATCH /reorder` accepts an array of `{ id: string, order: number }` items for transactional reordering.

---

## Endpoint Specifications

### 1. List Testimonials

- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/admin/testimonials`
- **Headers:** `Authorization: Bearer <accessToken>`
- **Query Parameters:**
  - `page` (optional, default: `1`): Page number
  - `limit` (optional, default: `10`): Items per page
  - `search` (optional): Filter by author name, pet type, or content text
  - `isActive` (optional): Filter by active status (`true` / `false`)

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "data": {
    "testimonials": [
      {
        "id": "testim-uuid-1",
        "authorName": "Priya Sharma",
        "authorTitle": "Dog Parent to Bruno (Golden Retriever)",
        "authorAvatar": "https://cdn.kickat.co.in/avatars/priya.png",
        "content": "Kickat's puppy kibble transformed Bruno's coat health! Delivery is super fast.",
        "rating": 5,
        "petType": "Dog",
        "isActive": true,
        "order": 1,
        "createdAt": "2026-09-10T08:00:00.000Z",
        "updatedAt": "2026-09-10T08:00:00.000Z"
      }
    ],
    "pagination": {
      "total": 12,
      "page": 1,
      "limit": 10,
      "totalPages": 2,
      "hasNextPage": true,
      "hasPrevPage": false
    },
    "summary": {
      "totalCount": 12,
      "activeCount": 10,
      "inactiveCount": 2,
      "averageRating": 4.8
    }
  }
}
```

---

### 2. Get Testimonial Details by ID

- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/admin/testimonials/:id`
- **Headers:** `Authorization: Bearer <accessToken>`

---

### 3. Create New Testimonial

- **HTTP Method:** `POST`
- **Endpoint:** `/api/v1/admin/testimonials`
- **Headers:** `Authorization: Bearer <accessToken>`, `Content-Type: application/json`

#### Request Body Schema
```json
{
  "authorName": "Rohan Verma",
  "authorTitle": "Cat Parent to Whiskers",
  "authorAvatar": "https://cdn.kickat.co.in/avatars/rohan.png",
  "content": "Best feline wet food selection in India! Whiskers loves the salmon pate.",
  "rating": 5,
  "petType": "Cat",
  "isActive": true,
  "order": 2
}
```

---

### 4. Update Testimonial Details

- **HTTP Method:** `PATCH` or `PUT`
- **Endpoint:** `/api/v1/admin/testimonials/:id`
- **Headers:** `Authorization: Bearer <accessToken>`, `Content-Type: application/json`

#### Request Body Schema
```json
{
  "content": "Updated testimonial text content with revised review phrasing.",
  "rating": 5
}
```

---

### 5. Toggle Active Display Status

- **HTTP Method:** `PATCH`
- **Endpoint:** `/api/v1/admin/testimonials/:id/status`
- **Headers:** `Authorization: Bearer <accessToken>`, `Content-Type: application/json`

#### Request Body Schema
```json
{
  "isActive": false
}
```

---

### 6. Batch Reorder Testimonials Display Sequence

- **HTTP Method:** `PATCH`
- **Endpoint:** `/api/v1/admin/testimonials/reorder`
- **Headers:** `Authorization: Bearer <accessToken>`, `Content-Type: application/json`

#### Request Body Schema
```json
{
  "items": [
    { "id": "testim-uuid-1", "order": 1 },
    { "id": "testim-uuid-2", "order": 2 },
    { "id": "testim-uuid-3", "order": 3 }
  ]
}
```

---

### 7. Delete Testimonial

- **HTTP Method:** `DELETE`
- **Endpoint:** `/api/v1/admin/testimonials/:id`
- **Headers:** `Authorization: Bearer <accessToken>`
- **Query Parameters:** `permanent` (`true` / `false`)

---

## Frontend Integration Guide (TypeScript & Axios)

```typescript
// services/adminTestimonialService.ts
import axios from "axios";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://api.kickat.co.in/api/v1";

const testimonialApi = axios.create({
  baseURL: `${API_BASE}/admin/testimonials`,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

testimonialApi.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("admin_access_token");
    if (token && config.headers) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export interface TestimonialItem {
  id: string;
  authorName: string;
  authorTitle?: string | null;
  authorAvatar?: string | null;
  content: string;
  rating: number;
  petType?: string | null;
  isActive: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export const AdminTestimonialService = {
  async getAll(params?: { page?: number; limit?: number; search?: string; isActive?: boolean }) {
    const res = await testimonialApi.get("", { params });
    return res.data;
  },

  async getById(id: string) {
    const res = await testimonialApi.get(`/${id}`);
    return res.data;
  },

  async create(payload: Omit<TestimonialItem, "id" | "createdAt" | "updatedAt">) {
    const res = await testimonialApi.post("", payload);
    return res.data;
  },

  async update(id: string, payload: Partial<TestimonialItem>) {
    const res = await testimonialApi.patch(`/${id}`, payload);
    return res.data;
  },

  async toggleStatus(id: string, isActive: boolean) {
    const res = await testimonialApi.patch(`/${id}/status`, { isActive });
    return res.data;
  },

  async reorder(items: { id: string; order: number }[]) {
    const res = await testimonialApi.patch("/reorder", { items });
    return res.data;
  },

  async delete(id: string, permanent: boolean = false) {
    const res = await testimonialApi.delete(`/${id}`, { params: { permanent } });
    return res.data;
  },
};
```
