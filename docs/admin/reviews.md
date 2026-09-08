# Admin Customer Reviews & Moderation API Specification

All review moderation endpoints are served under `/api/v1/admin/reviews` and require Admin Authentication (`@AdminAuth()`).

---

## Table of Contents

1. [Architecture & Frontend Integration Overview](#architecture--frontend-integration-overview)
2. [Endpoints Overview](#endpoints-overview)
3. [Review Moderation Enums](#review-moderation-enums)
4. [Endpoint Specifications](#endpoint-specifications)
   - [1. List Reviews (Filter by Status, Star Rating, Spam, Search)](#1-list-reviews-filter-by-status-star-rating-spam-search)
   - [2. Get Review Details](#2-get-review-details)
   - [3. Moderate Review Publishing Status](#3-moderate-review-publishing-status)
   - [4. Add or Update Official Store Reply](#4-add-or-update-official-store-reply)
   - [5. Flag or Unflag Review as Spam](#5-flag-or-unflag-review-as-spam)
5. [Standard Error Response Format](#standard-error-response-format)
6. [Frontend Integration Guide (TypeScript & Axios)](#frontend-integration-guide-typescript--axios)
   - [TypeScript Types & Interfaces](#typescript-types--interfaces)
   - [Production-Ready API Service](#production-ready-api-service)

---

## Architecture & Frontend Integration Overview

- **Base URL:** `https://api.kickat.co.in/api/v1/admin/reviews` (or `http://localhost:3000/api/v1/admin/reviews` in development)
- **Content Type:** `application/json`
- **Authentication Scheme:** `Authorization: Bearer <accessToken>`
- **Moderation Workflow:** Customer reviews are submitted as `PENDING`. Store admins approve reviews (`APPROVED`) to make them publicly visible on product pages or reject them (`REJECTED`) with an optional internal reason.
- **Store Reply:** Admins can append an official store reply (e.g. thanking the customer or resolving a complaint).
- **Spam Flagging:** Flagging a review as spam (`isSpam: true`) immediately hides it from customer storefronts and moves it to the spam moderation queue.

---

## Endpoints Overview

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/reviews` | Yes (`Bearer`) | List reviews with status filters, star rating, spam flag, and search |
| `GET` | `/api/v1/admin/reviews/:id` | Yes (`Bearer`) | Retrieve single review details including customer profile and store reply |
| `PATCH` | `/api/v1/admin/reviews/:id/status` | Yes (`Bearer`) | Moderate status (`APPROVED`, `REJECTED`, `PENDING`) |
| `POST` | `/api/v1/admin/reviews/:id/reply` | Yes (`Bearer`) | Post or update an official store response |
| `PATCH` | `/api/v1/admin/reviews/:id/spam` | Yes (`Bearer`) | Flag or unflag review as spam |

---

## Review Moderation Enums

### Moderation Status (`ReviewStatusEnum`)
- `PENDING` (Under review)
- `APPROVED` (Published to storefront)
- `REJECTED` (Hidden from storefront)

### Sort Options (`AdminReviewSortEnum`)
- `createdAt_desc` (Newest first)
- `createdAt_asc`
- `rating_desc` (Highest stars first)
- `rating_asc` (Lowest stars first)
- `helpfulCount_desc` (Most upvoted reviews first)

---

## Endpoint Specifications

### 1. List Reviews (Filter by Status, Star Rating, Spam, Search)

- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/admin/reviews`
- **Headers:** `Authorization: Bearer <accessToken>`

#### Query Parameters
| Parameter | Type | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `page` | `number` | No | `1` | Page number |
| `limit` | `number` | No | `10` | Items per page (1 to 100) |
| `status` | `string` | No | - | `PENDING`, `APPROVED`, `REJECTED` |
| `isSpam` | `boolean` | No | - | Filter spam-flagged reviews |
| `rating` | `number` | No | - | Filter by star rating (1 to 5) |
| `productId` | `string` | No | - | Filter reviews for specific product UUID |
| `search` | `string` | No | - | Match review title, comment, user name |
| `sort` | `string` | No | `createdAt_desc` | Sort order |

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "data": {
    "reviews": [
      {
        "id": "rev-uuid-1",
        "rating": 5,
        "title": "Excellent puppy food!",
        "comment": "My golden retriever puppy loves this food and his coat has become so shiny.",
        "status": "APPROVED",
        "isSpam": false,
        "helpfulCount": 12,
        "adminReply": "Thank you for the wonderful feedback! We are thrilled to hear your pup loves it.",
        "user": {
          "id": "user-uuid-1",
          "name": "Pooja Hegde",
          "email": "pooja.hegde@gmail.com"
        },
        "product": {
          "id": "prod-uuid-1",
          "name": "Royal Canin Maxi Puppy Dry Food",
          "imageUrl": "https://cdn.kickat.co.in/products/rc-puppy.png"
        },
        "createdAt": "2026-09-02T14:30:00.000Z",
        "updatedAt": "2026-09-03T10:00:00.000Z"
      }
    ],
    "pagination": {
      "total": 45,
      "page": 1,
      "limit": 10,
      "totalPages": 5,
      "hasNextPage": true,
      "hasPrevPage": false
    },
    "summary": {
      "totalReviews": 45,
      "pendingCount": 4,
      "approvedCount": 38,
      "rejectedCount": 3,
      "spamCount": 1,
      "averageRating": 4.65
    }
  }
}
```

---

### 2. Get Review Details

- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/admin/reviews/:id`
- **Headers:** `Authorization: Bearer <accessToken>`

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "data": {
    "id": "rev-uuid-1",
    "rating": 5,
    "title": "Excellent puppy food!",
    "comment": "My golden retriever puppy loves this food.",
    "status": "APPROVED",
    "isSpam": false,
    "helpfulCount": 12,
    "adminReply": "Thank you for the feedback!",
    "user": {
      "id": "user-uuid-1",
      "name": "Pooja Hegde",
      "email": "pooja.hegde@gmail.com"
    },
    "product": {
      "id": "prod-uuid-1",
      "name": "Royal Canin Maxi Puppy Dry Food"
    },
    "createdAt": "2026-09-02T14:30:00.000Z"
  }
}
```

---

### 3. Moderate Review Publishing Status

- **HTTP Method:** `PATCH`
- **Endpoint:** `/api/v1/admin/reviews/:id/status`
- **Headers:** `Authorization: Bearer <accessToken>`, `Content-Type: application/json`

#### Request Body
```json
{
  "status": "APPROVED",
  "rejectionReason": null
}
```

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "message": "Review status updated to APPROVED",
  "data": {
    "id": "rev-uuid-1",
    "status": "APPROVED",
    "updatedAt": "2026-09-08T11:45:00.000Z"
  }
}
```

---

### 4. Add or Update Official Store Reply

- **HTTP Method:** `POST`
- **Endpoint:** `/api/v1/admin/reviews/:id/reply`
- **Headers:** `Authorization: Bearer <accessToken>`, `Content-Type: application/json`

#### Request Body
```json
{
  "reply": "Thank you for shopping with Kickat! Glad your puppy is enjoying the meal."
}
```

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "message": "Store reply posted successfully",
  "data": {
    "id": "rev-uuid-1",
    "adminReply": "Thank you for shopping with Kickat! Glad your puppy is enjoying the meal.",
    "updatedAt": "2026-09-08T11:50:00.000Z"
  }
}
```

---

### 5. Flag or Unflag Review as Spam

- **HTTP Method:** `PATCH`
- **Endpoint:** `/api/v1/admin/reviews/:id/spam`
- **Headers:** `Authorization: Bearer <accessToken>`, `Content-Type: application/json`

#### Request Body
```json
{
  "isSpam": true
}
```

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "message": "Review flagged as spam",
  "data": {
    "id": "rev-uuid-1",
    "isSpam": true,
    "status": "REJECTED",
    "updatedAt": "2026-09-08T11:52:00.000Z"
  }
}
```

---

## Frontend Integration Guide (TypeScript & Axios)

```typescript
// types/admin-review.ts
export type ReviewStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface AdminReviewItem {
  id: string;
  rating: number;
  title: string;
  comment: string;
  status: ReviewStatus;
  isSpam: boolean;
  helpfulCount: number;
  adminReply?: string | null;
  user: { id: string; name: string; email: string };
  product: { id: string; name: string; imageUrl: string };
  createdAt: string;
}

export interface AdminReviewsResponse {
  success: boolean;
  data: {
    reviews: AdminReviewItem[];
    pagination: { total: number; page: number; limit: number; totalPages: number };
    summary: { totalReviews: number; pendingCount: number; approvedCount: number; rejectedCount: number; spamCount: number; averageRating: number };
  };
}
```

```typescript
// services/adminReviewService.ts
import axios from "axios";
import { AdminReviewsResponse } from "../types/admin-review";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.kickat.co.in/api/v1";

const reviewApi = axios.create({
  baseURL: `${BASE_URL}/admin/reviews`,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

reviewApi.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("admin_access_token");
    if (token && config.headers) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const AdminReviewService = {
  async getReviews(params?: any): Promise<AdminReviewsResponse> {
    const res = await reviewApi.get<AdminReviewsResponse>("", { params });
    return res.data;
  },

  async getReviewById(id: string) {
    const res = await reviewApi.get(`/${id}`);
    return res.data;
  },

  async updateStatus(id: string, status: "APPROVED" | "REJECTED" | "PENDING", rejectionReason?: string) {
    const res = await reviewApi.patch(`/${id}/status`, { status, rejectionReason });
    return res.data;
  },

  async reply(id: string, reply: string) {
    const res = await reviewApi.post(`/${id}/reply`, { reply });
    return res.data;
  },

  async toggleSpam(id: string, isSpam: boolean) {
    const res = await reviewApi.patch(`/${id}/spam`, { isSpam });
    return res.data;
  },
};
```
