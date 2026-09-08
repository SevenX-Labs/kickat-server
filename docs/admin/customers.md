# Admin Customer Directory & Profiles API Specification

All administrative customer management endpoints are served under `/api/v1/admin/customers` and require Admin Authentication (`@AdminAuth()`).

---

## Table of Contents

1. [Architecture & Frontend Integration Overview](#architecture--frontend-integration-overview)
2. [Endpoints Overview](#endpoints-overview)
3. [Sort & Filter Enums](#sort--filter-enums)
4. [Endpoint Specifications](#endpoint-specifications)
   - [1. List Customers (Search, Filter, Sort & Paginate)](#1-list-customers-search-filter-sort--paginate)
   - [2. Get Complete Customer Profile with Lifetime Stats](#2-get-complete-customer-profile-with-lifetime-stats)
   - [3. Customer Order History](#3-customer-order-history)
   - [4. Customer Saved Addresses](#4-customer-saved-addresses)
   - [5. Customer Registered Pet Profiles](#5-customer-registered-pet-profiles)
   - [6. Block or Unblock Customer Account](#6-block-or-unblock-customer-account)
5. [Standard Error Response Format](#standard-error-response-format)
6. [Frontend Integration Guide (TypeScript & Axios)](#frontend-integration-guide-typescript--axios)
   - [TypeScript Types & Interfaces](#typescript-types--interfaces)
   - [Production-Ready API Service](#production-ready-api-service)

---

## Architecture & Frontend Integration Overview

- **Base URL:** `https://api.kickat.co.in/api/v1/admin/customers` (or `http://localhost:3000/api/v1/admin/customers` in development)
- **Content Type:** `application/json`
- **Authentication Scheme:** `Authorization: Bearer <accessToken>`
- **Security & Blocking:** When an admin blocks a customer account (`isBlocked: true`), the backend immediately and automatically revokes all of that user's active session refresh tokens in the database, locking them out of mobile and web apps immediately.
- **Lifetime Value Tracking:** Customer listings and profile views calculate total lifetime spend (excluding cancelled orders), total orders count, average order value (AOV), and pet profile counts.

---

## Endpoints Overview

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/customers` | Yes (`Bearer`) | Directory search, filter by verification status, blocked flag, spend |
| `GET` | `/api/v1/admin/customers/:id` | Yes (`Bearer`) | Comprehensive customer profile, lifetime metrics, pets, addresses |
| `GET` | `/api/v1/admin/customers/:id/orders` | Yes (`Bearer`) | Paginated order history for specific customer |
| `GET` | `/api/v1/admin/customers/:id/addresses` | Yes (`Bearer`) | Saved delivery addresses list |
| `GET` | `/api/v1/admin/customers/:id/pets` | Yes (`Bearer`) | Registered pet profiles (dogs, cats, age, breed) |
| `PATCH` | `/api/v1/admin/customers/:id/status` | Yes (`Bearer`) | Block/unblock account with instant session revocation |

---

## Sort & Filter Enums

### Customer Sorting (`AdminCustomerSortEnum`)
- `createdAt_desc` (Default - Newest registrations first)
- `createdAt_asc`
- `name_asc` (A-Z)
- `name_desc` (Z-A)

---

## Endpoint Specifications

### 1. List Customers (Search, Filter, Sort & Paginate)

- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/admin/customers`
- **Headers:** `Authorization: Bearer <accessToken>`

#### Query Parameters
| Parameter | Type | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `page` | `number` | No | `1` | Page number |
| `limit` | `number` | No | `10` | Items per page (1 to 100) |
| `search` | `string` | No | - | Match name, email, or phone |
| `isBlocked` | `boolean` | No | - | Filter blocked/active accounts |
| `isEmailVerified` | `boolean` | No | - | Filter verified email accounts |
| `isPhoneVerified` | `boolean` | No | - | Filter verified phone accounts |
| `isProfileComplete` | `boolean` | No | - | Filter completed profiles |
| `dateFrom` | `string` | No | - | Registration date from |
| `dateTo` | `string` | No | - | Registration date to |
| `sort` | `string` | No | `createdAt_desc` | Sort sequence |

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "data": {
    "customers": [
      {
        "id": "user-uuid-1",
        "name": "Pooja Hegde",
        "email": "pooja.hegde@gmail.com",
        "phone": "+919876543210",
        "gender": "FEMALE",
        "dob": "1994-05-12T00:00:00.000Z",
        "isProfileComplete": true,
        "isEmailVerified": true,
        "isPhoneVerified": true,
        "isBlocked": false,
        "ordersCount": 8,
        "petsCount": 2,
        "addressesCount": 2,
        "totalSpent": 14250.0,
        "lastOrderDate": "2026-09-04T12:00:00.000Z",
        "createdAt": "2026-06-15T09:00:00.000Z",
        "updatedAt": "2026-09-04T12:00:00.000Z"
      }
    ],
    "pagination": {
      "total": 512,
      "page": 1,
      "limit": 10,
      "totalPages": 52,
      "hasNextPage": true,
      "hasPrevPage": false
    },
    "summary": {
      "totalCustomers": 512,
      "activeCustomersCount": 508,
      "blockedCustomersCount": 4,
      "verifiedCustomersCount": 490
    }
  }
}
```

---

### 2. Get Complete Customer Profile with Lifetime Stats

- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/admin/customers/:id`
- **Headers:** `Authorization: Bearer <accessToken>`

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "data": {
    "id": "user-uuid-1",
    "name": "Pooja Hegde",
    "email": "pooja.hegde@gmail.com",
    "phone": "+919876543210",
    "gender": "FEMALE",
    "dob": "1994-05-12T00:00:00.000Z",
    "isProfileComplete": true,
    "isEmailVerified": true,
    "isPhoneVerified": true,
    "isBlocked": false,
    "stats": {
      "totalOrders": 8,
      "validOrdersCount": 8,
      "totalSpent": 14250.0,
      "averageOrderValue": 1781.25,
      "lastOrderDate": "2026-09-04T12:00:00.000Z",
      "petsCount": 2,
      "addressesCount": 2,
      "wishlistCount": 5,
      "cartCount": 1
    },
    "addresses": [
      {
        "id": "addr-1",
        "street": "12A Palm Meadows",
        "city": "Bengaluru",
        "state": "Karnataka",
        "pincode": "560066",
        "isDefault": true
      }
    ],
    "pets": [
      {
        "id": "pet-1",
        "name": "Bruno",
        "species": "DOG",
        "breed": "Golden Retriever",
        "age": 3,
        "gender": "MALE",
        "weight": 32.5
      }
    ],
    "createdAt": "2026-06-15T09:00:00.000Z",
    "updatedAt": "2026-09-04T12:00:00.000Z"
  }
}
```

---

### 3. Customer Order History

- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/admin/customers/:id/orders`
- **Headers:** `Authorization: Bearer <accessToken>`

#### Query Parameters: `page`, `limit`, `status` (`OrderStatusEnum`)

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "data": {
    "customer": {
      "id": "user-uuid-1",
      "name": "Pooja Hegde",
      "email": "pooja.hegde@gmail.com"
    },
    "orders": [
      {
        "id": "ord-uuid-5",
        "orderNumber": "ORD-20260904-002",
        "orderStatus": "DELIVERED",
        "paymentStatus": "COMPLETED",
        "paymentMethod": "UPI",
        "grandTotal": 2450.0,
        "itemsCount": 2,
        "itemsSummary": "Royal Canin Golden Retriever Adult (3kg) x1",
        "createdAt": "2026-09-04T12:00:00.000Z"
      }
    ],
    "pagination": {
      "total": 8,
      "page": 1,
      "limit": 10,
      "totalPages": 1,
      "hasNextPage": false,
      "hasPrevPage": false
    }
  }
}
```

---

### 4. Customer Saved Addresses

- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/admin/customers/:id/addresses`
- **Headers:** `Authorization: Bearer <accessToken>`

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "data": {
    "total": 1,
    "addresses": [
      {
        "id": "addr-1",
        "street": "12A Palm Meadows",
        "city": "Bengaluru",
        "state": "Karnataka",
        "pincode": "560066",
        "isDefault": true
      }
    ]
  }
}
```

---

### 5. Customer Registered Pet Profiles

- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/admin/customers/:id/pets`
- **Headers:** `Authorization: Bearer <accessToken>`

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "data": {
    "total": 1,
    "pets": [
      {
        "id": "pet-1",
        "name": "Bruno",
        "species": "DOG",
        "breed": "Golden Retriever",
        "gender": "MALE",
        "age": 3
      }
    ]
  }
}
```

---

### 6. Block or Unblock Customer Account

- **HTTP Method:** `PATCH`
- **Endpoint:** `/api/v1/admin/customers/:id/status`
- **Headers:** `Authorization: Bearer <accessToken>`, `Content-Type: application/json`

#### Request Body
```json
{
  "isBlocked": true,
  "reason": "Repeated fraudulent COD cancellations"
}
```

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "message": "Customer blocked successfully and active sessions revoked",
  "data": {
    "id": "user-uuid-1",
    "name": "Pooja Hegde",
    "isBlocked": true,
    "updatedAt": "2026-09-08T11:40:00.000Z"
  }
}
```

---

## Frontend Integration Guide (TypeScript & Axios)

### TypeScript Types & Interfaces

```typescript
// types/admin-customer.ts

export interface CustomerSummary {
  totalCustomers: number;
  activeCustomersCount: number;
  blockedCustomersCount: number;
  verifiedCustomersCount: number;
}

export interface AdminCustomerItem {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  gender?: string | null;
  isProfileComplete: boolean;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  isBlocked: boolean;
  ordersCount: number;
  petsCount: number;
  addressesCount: number;
  totalSpent: number;
  lastOrderDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminCustomersResponse {
  success: boolean;
  data: {
    customers: AdminCustomerItem[];
    pagination: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
      hasNextPage: boolean;
      hasPrevPage: boolean;
    };
    summary: CustomerSummary;
  };
}
```

### Production-Ready API Service

```typescript
// services/adminCustomerService.ts
import axios from "axios";
import { AdminCustomersResponse } from "../types/admin-customer";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.kickat.co.in/api/v1";

const customerApi = axios.create({
  baseURL: `${BASE_URL}/admin/customers`,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

customerApi.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("admin_access_token");
    if (token && config.headers) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const AdminCustomerService = {
  async getCustomers(params?: any): Promise<AdminCustomersResponse> {
    const res = await customerApi.get<AdminCustomersResponse>("", { params });
    return res.data;
  },

  async getCustomerById(id: string) {
    const res = await customerApi.get(`/${id}`);
    return res.data;
  },

  async getCustomerOrders(id: string, params?: any) {
    const res = await customerApi.get(`/${id}/orders`, { params });
    return res.data;
  },

  async getCustomerAddresses(id: string) {
    const res = await customerApi.get(`/${id}/addresses`);
    return res.data;
  },

  async getCustomerPets(id: string) {
    const res = await customerApi.get(`/${id}/pets`);
    return res.data;
  },

  async updateCustomerStatus(id: string, isBlocked: boolean, reason?: string) {
    const res = await customerApi.patch(`/${id}/status`, { isBlocked, reason });
    return res.data;
  },
};
```
