# Admin Business Intelligence & Analytics API Specification

All analytics endpoints are served under `/api/v1/admin/analytics` and require Admin Authentication (`@AdminAuth()`).

---

## Table of Contents

1. [Architecture & Frontend Integration Overview](#architecture--frontend-integration-overview)
2. [Endpoints Overview](#endpoints-overview)
3. [Time-Grouping Enums](#time-grouping-enums)
4. [Endpoint Specifications](#endpoint-specifications)
   - [1. Sales Performance Trends (`GET /api/v1/admin/analytics/sales`)](#1-sales-performance-trends)
   - [2. Gross & Net Revenue Analytics (`GET /api/v1/admin/analytics/revenue`)](#2-gross--net-revenue-analytics)
   - [3. Order Volume & Heatmaps (`GET /api/v1/admin/analytics/orders`)](#3-order-volume--heatmaps)
   - [4. Customer Acquisition & Cohort Retention (`GET /api/v1/admin/analytics/customers`)](#4-customer-acquisition--cohort-retention)
   - [5. Product Performance & Inventory Health (`GET /api/v1/admin/analytics/products`)](#5-product-performance--inventory-health)
5. [Frontend Integration Guide (TypeScript & Axios)](#frontend-integration-guide-typescript--axios)

---

## Architecture & Frontend Integration Overview

- **Base URL:** `https://api.kickat.co.in/api/v1/admin/analytics` (or `http://localhost:3000/api/v1/admin/analytics` in development)
- **Content Type:** `application/json`
- **Authentication Scheme:** `Authorization: Bearer <accessToken>`
- **Granular Grouping:** Supports aggregation by `day`, `week`, or `month` with custom `dateFrom` and `dateTo` ISO strings.

---

## Endpoints Overview

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/analytics/sales` | Yes (`Bearer`) | Time-series sales trends, total units sold, and Average Order Value (AOV) |
| `GET` | `/api/v1/admin/analytics/revenue` | Yes (`Bearer`) | Gross revenue, discounts, refunds, net revenue, and growth comparisons |
| `GET` | `/api/v1/admin/analytics/orders` | Yes (`Bearer`) | Order volume trends, status breakdown, and peak ordering time heatmaps |
| `GET` | `/api/v1/admin/analytics/customers` | Yes (`Bearer`) | Customer acquisition, repeat buyer rates, and top store spenders |
| `GET` | `/api/v1/admin/analytics/products` | Yes (`Bearer`) | Top products by revenue, category velocity, and inventory health |

---

## Time-Grouping Enums

### Group By (`AnalyticsGroupByEnum`)
- `day` (Daily granularity)
- `week` (Weekly granularity)
- `month` (Monthly granularity)

---

## Endpoint Specifications

### 1. Sales Performance Trends

- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/admin/analytics/sales`
- **Headers:** `Authorization: Bearer <accessToken>`
- **Query Params:** `dateFrom`, `dateTo`, `groupBy` (`day`, `week`, `month`)

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "data": {
    "totalSales": 145290.5,
    "totalUnitsSold": 412,
    "averageOrderValue": 402.94,
    "trends": [
      {
        "date": "2026-09-01",
        "sales": 14200.0,
        "orders": 35,
        "units": 52,
        "aov": 405.71
      }
    ]
  }
}
```

---

### 2. Gross & Net Revenue Analytics

- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/admin/analytics/revenue`
- **Headers:** `Authorization: Bearer <accessToken>`
- **Query Params:** `dateFrom`, `dateTo`, `groupBy`

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "data": {
    "grossRevenue": 152000.0,
    "discounts": 4309.5,
    "refunds": 2400.0,
    "netRevenue": 145290.5,
    "breakdown": [
      {
        "period": "2026-09-01",
        "gross": 15000.0,
        "discounts": 500.0,
        "refunds": 0.0,
        "net": 14500.0
      }
    ]
  }
}
```

---

### 3. Order Volume & Heatmaps

- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/admin/analytics/orders`
- **Headers:** `Authorization: Bearer <accessToken>`
- **Query Params:** `dateFrom`, `dateTo`

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "data": {
    "totalOrders": 384,
    "completionRate": 88.54,
    "cancellationRate": 3.13,
    "hourlyHeatmap": [
      { "hour": 14, "ordersCount": 42 },
      { "hour": 19, "ordersCount": 58 },
      { "hour": 20, "ordersCount": 65 }
    ]
  }
}
```

---

### 4. Customer Acquisition & Cohort Retention

- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/admin/analytics/customers`
- **Headers:** `Authorization: Bearer <accessToken>`

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "data": {
    "newCustomers": 94,
    "repeatCustomerRate": 34.2,
    "topSpenders": [
      {
        "id": "user-uuid-1",
        "name": "Pooja Hegde",
        "email": "pooja.hegde@gmail.com",
        "totalOrders": 8,
        "totalSpent": 14250.0
      }
    ]
  }
}
```

---

### 5. Product Performance & Inventory Health

- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/admin/analytics/products`
- **Headers:** `Authorization: Bearer <accessToken>`
- **Query Params:** `limit` (default: 10), `dateFrom`, `dateTo`

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "data": {
    "topProducts": [
      {
        "id": "prod-uuid-1",
        "name": "Royal Canin Maxi Puppy Dry Food",
        "unitsSold": 140,
        "revenue": 45500.0
      }
    ],
    "inventoryHealth": {
      "healthyStockCount": 110,
      "lowStockCount": 12,
      "outOfStockCount": 3
    }
  }
}
```

---

## Frontend Integration Guide (TypeScript & Axios)

```typescript
// services/adminAnalyticsService.ts
import axios from "axios";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.kickat.co.in/api/v1";

const analyticsApi = axios.create({
  baseURL: `${BASE_URL}/admin/analytics`,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

analyticsApi.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("admin_access_token");
    if (token && config.headers) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const AdminAnalyticsService = {
  async getSalesAnalytics(params?: { dateFrom?: string; dateTo?: string; groupBy?: "day" | "week" | "month" }) {
    const res = await analyticsApi.get("/sales", { params });
    return res.data;
  },

  async getRevenueAnalytics(params?: { dateFrom?: string; dateTo?: string; groupBy?: "day" | "week" | "month" }) {
    const res = await analyticsApi.get("/revenue", { params });
    return res.data;
  },

  async getOrderAnalytics(params?: { dateFrom?: string; dateTo?: string }) {
    const res = await analyticsApi.get("/orders", { params });
    return res.data;
  },

  async getCustomerAnalytics(params?: { dateFrom?: string; dateTo?: string }) {
    const res = await analyticsApi.get("/customers", { params });
    return res.data;
  },

  async getProductAnalytics(params?: { limit?: number; dateFrom?: string; dateTo?: string }) {
    const res = await analyticsApi.get("/products", { params });
    return res.data;
  },
};
```
