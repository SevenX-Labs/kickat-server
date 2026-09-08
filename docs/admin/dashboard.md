# Admin Executive Dashboard API Specification

All executive dashboard endpoints are served under `/api/v1/admin/dashboard` and require Admin Authentication (`@AdminAuth()`).

---

## Table of Contents

1. [Architecture & Frontend Integration Overview](#architecture--frontend-integration-overview)
2. [Endpoints Overview](#endpoints-overview)
3. [Period & Query Parameter Enums](#period--query-parameter-enums)
4. [Endpoint Specifications](#endpoint-specifications)
   - [1. Unified Dashboard Summary (`GET /api/v1/admin/dashboard`)](#1-unified-dashboard-summary-get-apiv1admindashboard)
   - [2. High-Level KPI Stats (`GET /api/v1/admin/dashboard/stats`)](#2-high-level-kpi-stats-get-apiv1admindashboardstats)
   - [3. Sales Time-Series Chart Data (`GET /api/v1/admin/dashboard/sales-chart`)](#3-sales-time-series-chart-data-get-apiv1admindashboardsales-chart)
   - [4. Recent Orders Feed (`GET /api/v1/admin/dashboard/recent-orders`)](#4-recent-orders-feed-get-apiv1admindashboardrecent-orders)
   - [5. Order Status Lifecycle Distribution (`GET /api/v1/admin/dashboard/order-status-summary`)](#5-order-status-lifecycle-distribution-get-apiv1admindashboardorder-status-summary)
   - [6. Top-Selling Categories (`GET /api/v1/admin/dashboard/top-categories`)](#6-top-selling-categories-get-apiv1admindashboardtop-categories)
   - [7. Low-Stock & Out-of-Stock Alerts (`GET /api/v1/admin/dashboard/low-stock`)](#7-low-stock--out-of-stock-alerts-get-apiv1admindashboardlow-stock)
5. [Standard Error Response Format](#standard-error-response-format)
6. [Frontend Integration Guide (TypeScript & React / Axios)](#frontend-integration-guide-typescript--react--axios)
   - [TypeScript Types & Interfaces](#typescript-types--interfaces)
   - [Production-Ready API Service](#production-ready-api-service)
   - [Dashboard UI Implementation Examples](#dashboard-ui-implementation-examples)

---

## Architecture & Frontend Integration Overview

- **Base URL:** `https://api.kickat.co.in/api/v1/admin/dashboard` (or `http://localhost:3000/api/v1/admin/dashboard` in development)
- **Content Type:** `application/json`
- **Authentication Scheme:** Standard HTTP Bearer Token:
  ```http
  Authorization: Bearer <accessToken>
  ```
- **Performance Optimization:** 
  - The unified endpoint `GET /api/v1/admin/dashboard` aggregates all dashboard widgets in parallel using `Promise.all`. For initial page loads, call this single endpoint to fetch everything at once.
  - Granular endpoints (`/stats`, `/sales-chart`, `/recent-orders`, `/low-stock`) allow re-fetching individual widgets when the user toggles a period filter (e.g. from `7d` to `30d`), changes a status tab, or paginates tables without reloading the entire dashboard.

---

## Endpoints Overview

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/dashboard` | Yes (`Bearer`) | Consolidated dashboard summary (stats, charts, categories, orders, stock alerts, payment methods) |
| `GET` | `/api/v1/admin/dashboard/stats` | Yes (`Bearer`) | High-level KPI cards (revenue, orders, customers, today's sales, pending orders, stock alerts, growth %) |
| `GET` | `/api/v1/admin/dashboard/sales-chart` | Yes (`Bearer`) | Time-series chart series (revenue, orders, items, AOV) grouped by hour, day, week, or month |
| `GET` | `/api/v1/admin/dashboard/recent-orders` | Yes (`Bearer`) | Latest customer orders stream with customer contact, order items summary, and payment details |
| `GET` | `/api/v1/admin/dashboard/order-status-summary` | Yes (`Bearer`) | Order volume, gross revenue, and percentage breakdown across all 10 order lifecycle statuses |
| `GET` | `/api/v1/admin/dashboard/top-categories` | Yes (`Bearer`) | Best-performing store categories ranked by gross revenue, units sold, and % share |
| `GET` | `/api/v1/admin/dashboard/low-stock` | Yes (`Bearer`) | Paginated inventory warnings for products and SKU variants below threshold |

---

## Period & Query Parameter Enums

### Period Options (`DashboardPeriodEnum`)
Used by `/dashboard`, `/stats`, `/sales-chart`, and `/top-categories`:
- `'today'` – Current day from 00:00:00 to 23:59:59 (comparison: yesterday)
- `'this_week'` – From Monday of current week to now (comparison: previous week)
- `'7d'` – Last 7 rolling days (**Default**) (comparison: previous 7 days)
- `'this_month'` – Current calendar month (comparison: previous month)
- `'30d'` – Last 30 rolling days (comparison: previous 30 days)
- `'this_year'` – Current calendar year (comparison: previous year)
- `'12m'` – Last 12 rolling months (comparison: previous 12 months)
- `'all'` – All-time history (no date filter applied)
- `'custom'` – User-defined date range (requires `startDate` and `endDate` in ISO 8601 format)

### Chart Grouping Options (`ChartGroupByEnum`)
Used by `/sales-chart`:
- `'hour'` – Hourly buckets (auto-selected when `period=today`)
- `'day'` – Daily buckets (auto-selected for `7d`, `30d`, `this_week`, `this_month`)
- `'week'` – Weekly buckets (starting from Sunday)
- `'month'` – Monthly buckets (auto-selected for `this_year`, `12m`)

### Order Status Filter Options (`OrderStatusEnum`)
Used by `/recent-orders`:
- `'PENDING'` | `'PLACED'` | `'PROCESSING'` | `'PACKED'` | `'SHIPPED'` | `'OUT_FOR_DELIVERY'` | `'DELIVERED'` | `'CANCELLED'` | `'RETURN_INITIATED'` | `'RETURNED'`

---

## Endpoint Specifications

### 1. Unified Dashboard Summary (`GET /api/v1/admin/dashboard`)

Fetches all dashboard components in a single consolidated request for rapid initial page load.

- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/admin/dashboard`
- **Authentication:** Admin Auth (`Bearer <accessToken>`)
- **Headers:**
  ```http
  Authorization: Bearer <accessToken>
  ```

#### Query Parameters
| Parameter | Type | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `period` | `string` | No | `7d` | Time window (`today`, `this_week`, `7d`, `this_month`, `30d`, `this_year`, `12m`, `all`, `custom`) |
| `startDate` | `string` (ISO 8601) | No | - | Start date (required if `period=custom`, e.g. `2026-08-01T00:00:00Z`) |
| `endDate` | `string` (ISO 8601) | No | - | End date (required if `period=custom`, e.g. `2026-08-31T23:59:59Z`) |
| `lowStockThreshold` | `number` | No | `10` | Low inventory alert threshold (1 to 100) |
| `recentOrdersLimit` | `number` | No | `10` | Number of recent orders to return (1 to 50) |
| `topCategoriesLimit` | `number` | No | `5` | Number of top categories to return (1 to 20) |

#### Example Request URL
```http
GET /api/v1/admin/dashboard?period=7d&lowStockThreshold=10&recentOrdersLimit=5&topCategoriesLimit=5
```

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalRevenue": 145290.5,
      "totalOrders": 384,
      "totalCustomers": 512,
      "todayOrders": 14,
      "todayRevenue": 4820.0,
      "pendingOrders": 12,
      "pendingOrdersBreakdown": {
        "pending": 3,
        "placed": 5,
        "processing": 4
      },
      "lowStockProducts": 8,
      "outOfStockProducts": 2,
      "totalInventoryAlerts": 10,
      "refundRequests": 1,
      "totalRefundRequests": 4,
      "periodMetrics": {
        "period": "7d",
        "startDate": "2026-09-01T05:00:00.000Z",
        "endDate": "2026-09-08T05:00:00.000Z",
        "revenue": 34250.0,
        "orders": 85,
        "newCustomers": 28,
        "newCustomersToday": 4,
        "growth": {
          "revenuePercentage": 14.5,
          "ordersPercentage": 8.2,
          "customersPercentage": 12.0
        }
      }
    },
    "salesChart": {
      "period": "7d",
      "groupBy": "day",
      "startDate": "2026-09-01T05:00:00.000Z",
      "endDate": "2026-09-08T05:00:00.000Z",
      "summary": {
        "totalRevenue": 34250.0,
        "totalOrders": 85,
        "totalItems": 142,
        "averageOrderValue": 402.94
      },
      "chartData": [
        {
          "date": "2026-09-01",
          "label": "Sep 1",
          "revenue": 4800.0,
          "ordersCount": 12,
          "itemsCount": 20,
          "averageOrderValue": 400.0
        }
      ]
    },
    "orderStatusSummary": {
      "totalOrders": 384,
      "breakdown": [
        {
          "status": "DELIVERED",
          "label": "Delivered",
          "count": 320,
          "percentage": 83.33,
          "revenue": 122000.0
        }
      ]
    },
    "topCategories": {
      "period": "7d",
      "totalCategories": 5,
      "totalRevenue": 34250.0,
      "categories": [
        {
          "categoryId": "cat-uuid-1",
          "name": "Dog Food",
          "slug": "dog-food",
          "imageUrl": "https://cdn.kickat.co.in/categories/dog-food.png",
          "totalRevenue": 18250.0,
          "totalUnitsSold": 64,
          "productsCount": 8,
          "percentageOfTotal": 53.28
        }
      ]
    },
    "recentOrders": {
      "total": 5,
      "orders": [
        {
          "id": "e4bcfdfc-1122-4869-906d-e4bcfdfec275",
          "orderNumber": "ORD-20260908-001",
          "customer": {
            "id": "user-uuid-1",
            "name": "Rahul Sharma",
            "email": "rahul.sharma@gmail.com",
            "phone": "+919876543210"
          },
          "orderStatus": "PLACED",
          "paymentStatus": "COMPLETED",
          "paymentMethod": "UPI",
          "subtotal": 1200.0,
          "deliveryFee": 50.0,
          "grandTotal": 1250.0,
          "itemsCount": 2,
          "itemsSummary": "Royal Canin Puppy 3kg x1, Dog Chew Bone x1",
          "items": [
            {
              "id": "item-uuid-1",
              "productId": "prod-uuid-1",
              "productName": "Royal Canin Puppy 3kg",
              "variantName": "3kg Bag",
              "quantity": 1,
              "price": 1050.0,
              "totalPrice": 1050.0
            }
          ],
          "latestPayment": {
            "id": "pay-uuid-1",
            "status": "COMPLETED",
            "paymentMethod": "UPI",
            "amount": 1250.0
          },
          "createdAt": "2026-09-08T04:30:00.000Z",
          "updatedAt": "2026-09-08T04:30:00.000Z"
        }
      ]
    },
    "lowStockProducts": {
      "threshold": 10,
      "totalLowStockItems": 10,
      "page": 1,
      "limit": 10,
      "items": [
        {
          "id": "prod-uuid-2",
          "type": "PRODUCT",
          "productId": "prod-uuid-2",
          "variantId": null,
          "name": "Cat Scratching Post",
          "slug": "cat-scratching-post",
          "sku": null,
          "imageUrl": "https://cdn.kickat.co.in/products/post.png",
          "category": "Cat Toys",
          "price": 899.0,
          "currentStock": 0,
          "isOutOfStock": true,
          "status": "ACTIVE"
        }
      ]
    },
    "paymentMethodSummary": {
      "totalOrders": 384,
      "totalAmount": 145290.5,
      "breakdown": [
        {
          "method": "UPI",
          "count": 250,
          "totalAmount": 95000.0,
          "completedCount": 245,
          "pendingCount": 5,
          "percentage": 65.1
        },
        {
          "method": "CARD",
          "count": 80,
          "totalAmount": 34000.0,
          "completedCount": 78,
          "pendingCount": 2,
          "percentage": 20.83
        },
        {
          "method": "COD",
          "count": 54,
          "totalAmount": 16290.5,
          "completedCount": 42,
          "pendingCount": 12,
          "percentage": 14.06
        }
      ]
    }
  }
}
```

---

### 2. High-Level KPI Stats (`GET /api/v1/admin/dashboard/stats`)

Returns all headline summary metrics, today's activity, inventory alerts, and growth percentages compared to the previous period.

- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/admin/dashboard/stats`
- **Authentication:** Admin Auth (`Bearer <accessToken>`)
- **Headers:**
  ```http
  Authorization: Bearer <accessToken>
  ```

#### Query Parameters
| Parameter | Type | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `period` | `string` | No | `7d` | Time window for period metrics & growth calculation |
| `startDate` | `string` (ISO 8601) | No | - | Start date for custom period |
| `endDate` | `string` (ISO 8601) | No | - | End date for custom period |
| `lowStockThreshold` | `number` | No | `10` | Inventory threshold for warning count |

#### Example Request URL
```http
GET /api/v1/admin/dashboard/stats?period=30d&lowStockThreshold=5
```

#### Expected Success Response (`200 OK`)
```json
{
  "totalRevenue": 145290.5,
  "totalOrders": 384,
  "totalCustomers": 512,
  "todayOrders": 14,
  "todayRevenue": 4820.0,
  "pendingOrders": 12,
  "pendingOrdersBreakdown": {
    "pending": 3,
    "placed": 5,
    "processing": 4
  },
  "lowStockProducts": 8,
  "outOfStockProducts": 2,
  "totalInventoryAlerts": 10,
  "refundRequests": 1,
  "totalRefundRequests": 4,
  "periodMetrics": {
    "period": "30d",
    "startDate": "2026-08-09T05:00:00.000Z",
    "endDate": "2026-09-08T05:00:00.000Z",
    "revenue": 112450.0,
    "orders": 290,
    "newCustomers": 94,
    "newCustomersToday": 4,
    "growth": {
      "revenuePercentage": 18.25,
      "ordersPercentage": 12.4,
      "customersPercentage": 15.0
    }
  }
}
```

---

### 3. Sales Time-Series Chart Data (`GET /api/v1/admin/dashboard/sales-chart`)

Returns bucketed time-series sales revenue, orders count, total units sold, and Average Order Value (AOV). Missing date intervals are pre-populated with zeroes so charts render without gaps.

- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/admin/dashboard/sales-chart`
- **Authentication:** Admin Auth (`Bearer <accessToken>`)
- **Headers:**
  ```http
  Authorization: Bearer <accessToken>
  ```

#### Query Parameters
| Parameter | Type | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `period` | `string` | No | `7d` | Time interval (`today`, `this_week`, `7d`, `this_month`, `30d`, `this_year`, `12m`, `all`, `custom`) |
| `groupBy` | `string` | No | Auto | Aggregation bucket (`hour`, `day`, `week`, `month`) |
| `startDate` | `string` (ISO 8601) | No | - | Filter from date |
| `endDate` | `string` (ISO 8601) | No | - | Filter to date |

#### Example Request URL
```http
GET /api/v1/admin/dashboard/sales-chart?period=7d&groupBy=day
```

#### Expected Success Response (`200 OK`)
```json
{
  "period": "7d",
  "groupBy": "day",
  "startDate": "2026-09-01T05:00:00.000Z",
  "endDate": "2026-09-08T05:00:00.000Z",
  "summary": {
    "totalRevenue": 34250.0,
    "totalOrders": 85,
    "totalItems": 142,
    "averageOrderValue": 402.94
  },
  "chartData": [
    {
      "date": "2026-09-01",
      "label": "Sep 1",
      "revenue": 4800.0,
      "ordersCount": 12,
      "itemsCount": 20,
      "averageOrderValue": 400.0
    },
    {
      "date": "2026-09-02",
      "label": "Sep 2",
      "revenue": 5200.0,
      "ordersCount": 14,
      "itemsCount": 25,
      "averageOrderValue": 371.43
    },
    {
      "date": "2026-09-03",
      "label": "Sep 3",
      "revenue": 3950.0,
      "ordersCount": 9,
      "itemsCount": 16,
      "averageOrderValue": 438.89
    }
  ]
}
```

---

### 4. Recent Orders Feed (`GET /api/v1/admin/dashboard/recent-orders`)

Returns a stream of recent orders with customer profile information, concise line item summaries, order fulfillment status, and payment details.

- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/admin/dashboard/recent-orders`
- **Authentication:** Admin Auth (`Bearer <accessToken>`)
- **Headers:**
  ```http
  Authorization: Bearer <accessToken>
  ```

#### Query Parameters
| Parameter | Type | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `limit` | `number` | No | `10` | Max items to return (1 to 50) |
| `status` | `string` | No | - | Filter by `OrderStatusEnum` (e.g. `PENDING`, `PLACED`, `PROCESSING`, `SHIPPED`, `DELIVERED`, `CANCELLED`) |

#### Example Request URL
```http
GET /api/v1/admin/dashboard/recent-orders?limit=10&status=PLACED
```

#### Expected Success Response (`200 OK`)
```json
{
  "total": 1,
  "orders": [
    {
      "id": "ord-98214-uuid",
      "orderNumber": "ORD-20260908-001",
      "customer": {
        "id": "user-uuid-1",
        "name": "Jane Doe",
        "email": "jane.doe@gmail.com",
        "phone": "+919876543210"
      },
      "orderStatus": "PLACED",
      "paymentStatus": "COMPLETED",
      "paymentMethod": "UPI",
      "subtotal": 1200.0,
      "deliveryFee": 50.0,
      "grandTotal": 1250.0,
      "itemsCount": 2,
      "itemsSummary": "Royal Canin Puppy Food (3kg) x1, Chew Bone x1",
      "items": [
        {
          "id": "item-1",
          "productId": "prod-1",
          "productName": "Royal Canin Puppy Food",
          "variantName": "3kg",
          "quantity": 1,
          "price": 1050.0,
          "totalPrice": 1050.0
        },
        {
          "id": "item-2",
          "productId": "prod-2",
          "productName": "Chew Bone",
          "variantName": null,
          "quantity": 1,
          "price": 150.0,
          "totalPrice": 150.0
        }
      ],
      "latestPayment": {
        "id": "pay-1",
        "status": "COMPLETED",
        "paymentMethod": "UPI",
        "amount": 1250.0
      },
      "createdAt": "2026-09-08T04:30:00.000Z",
      "updatedAt": "2026-09-08T04:30:00.000Z"
    }
  ]
}
```

---

### 5. Order Status Lifecycle Distribution (`GET /api/v1/admin/dashboard/order-status-summary`)

Returns count, total order volume, and percentage across all 10 order fulfillment lifecycle statuses. Ideal for rendering order status pipeline charts or progress meters.

- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/admin/dashboard/order-status-summary`
- **Authentication:** Admin Auth (`Bearer <accessToken>`)
- **Headers:**
  ```http
  Authorization: Bearer <accessToken>
  ```

#### Query Parameters: None

#### Expected Success Response (`200 OK`)
```json
{
  "totalOrders": 384,
  "breakdown": [
    {
      "status": "PENDING",
      "label": "Pending",
      "count": 3,
      "percentage": 0.78,
      "revenue": 1450.0
    },
    {
      "status": "PLACED",
      "label": "Placed",
      "count": 5,
      "percentage": 1.3,
      "revenue": 3200.0
    },
    {
      "status": "PROCESSING",
      "label": "Processing",
      "count": 4,
      "percentage": 1.04,
      "revenue": 2100.0
    },
    {
      "status": "PACKED",
      "label": "Packed",
      "count": 2,
      "percentage": 0.52,
      "revenue": 950.0
    },
    {
      "status": "SHIPPED",
      "label": "Shipped",
      "count": 8,
      "percentage": 2.08,
      "revenue": 4500.0
    },
    {
      "status": "OUT_FOR_DELIVERY",
      "label": "Out for Delivery",
      "count": 6,
      "percentage": 1.56,
      "revenue": 3100.0
    },
    {
      "status": "DELIVERED",
      "label": "Delivered",
      "count": 340,
      "percentage": 88.54,
      "revenue": 125000.0
    },
    {
      "status": "CANCELLED",
      "label": "Cancelled",
      "count": 12,
      "percentage": 3.13,
      "revenue": 4200.0
    },
    {
      "status": "RETURN_INITIATED",
      "label": "Return Initiated",
      "count": 1,
      "percentage": 0.26,
      "revenue": 450.0
    },
    {
      "status": "RETURNED",
      "label": "Returned",
      "count": 3,
      "percentage": 0.78,
      "revenue": 980.5
    }
  ]
}
```

---

### 6. Top-Selling Categories (`GET /api/v1/admin/dashboard/top-categories`)

Ranks product categories by gross sales revenue, total units sold, and contribution percentage to total store sales.

- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/admin/dashboard/top-categories`
- **Authentication:** Admin Auth (`Bearer <accessToken>`)
- **Headers:**
  ```http
  Authorization: Bearer <accessToken>
  ```

#### Query Parameters
| Parameter | Type | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `period` | `string` | No | `all` | Filter period (`today`, `7d`, `30d`, `this_month`, `this_year`, `12m`, `all`, `custom`) |
| `limit` | `number` | No | `5` | Top N categories to return (1 to 20) |
| `startDate` | `string` (ISO 8601) | No | - | Optional range start |
| `endDate` | `string` (ISO 8601) | No | - | Optional range end |

#### Example Request URL
```http
GET /api/v1/admin/dashboard/top-categories?period=30d&limit=5
```

#### Expected Success Response (`200 OK`)
```json
{
  "period": "30d",
  "totalCategories": 6,
  "totalRevenue": 112450.0,
  "categories": [
    {
      "categoryId": "cat-uuid-1",
      "name": "Dog Food & Treats",
      "slug": "dog-food-treats",
      "imageUrl": "https://cdn.kickat.co.in/categories/dog-food.png",
      "totalRevenue": 61847.5,
      "totalUnitsSold": 240,
      "productsCount": 16,
      "percentageOfTotal": 55.0
    },
    {
      "categoryId": "cat-uuid-2",
      "name": "Cat Litter & Accessories",
      "slug": "cat-litter-accessories",
      "imageUrl": "https://cdn.kickat.co.in/categories/cat-litter.png",
      "totalRevenue": 28112.5,
      "totalUnitsSold": 110,
      "productsCount": 9,
      "percentageOfTotal": 25.0
    },
    {
      "categoryId": "cat-uuid-3",
      "name": "Pet Health & Grooming",
      "slug": "pet-health-grooming",
      "imageUrl": "https://cdn.kickat.co.in/categories/grooming.png",
      "totalRevenue": 16867.5,
      "totalUnitsSold": 75,
      "productsCount": 12,
      "percentageOfTotal": 15.0
    }
  ]
}
```

---

### 7. Low-Stock & Out-of-Stock Alerts (`GET /api/v1/admin/dashboard/low-stock`)

Returns products and specific SKU variants whose stock level is less than or equal to the threshold, sorted with lowest/out-of-stock items first.

- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/admin/dashboard/low-stock`
- **Authentication:** Admin Auth (`Bearer <accessToken>`)
- **Headers:**
  ```http
  Authorization: Bearer <accessToken>
  ```

#### Query Parameters
| Parameter | Type | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `threshold` | `number` | No | `10` | Max stock quantity threshold (1 to 100) |
| `limit` | `number` | No | `20` | Max items per page (1 to 100) |
| `page` | `number` | No | `1` | Page number for pagination |

#### Example Request URL
```http
GET /api/v1/admin/dashboard/low-stock?threshold=10&page=1&limit=20
```

#### Expected Success Response (`200 OK`)
```json
{
  "threshold": 10,
  "totalLowStockItems": 3,
  "page": 1,
  "limit": 20,
  "items": [
    {
      "id": "prod-uuid-1",
      "type": "PRODUCT",
      "productId": "prod-uuid-1",
      "variantId": null,
      "name": "Cat Scratching Tree (Extra Large)",
      "slug": "cat-scratching-tree-xl",
      "sku": null,
      "imageUrl": "https://cdn.kickat.co.in/products/tree.png",
      "category": "Cat Toys",
      "price": 2499.0,
      "currentStock": 0,
      "isOutOfStock": true,
      "status": "ACTIVE"
    },
    {
      "id": "var-uuid-10",
      "type": "VARIANT",
      "productId": "prod-uuid-5",
      "variantId": "var-uuid-10",
      "name": "Leather Dog Harness - Black / Large",
      "slug": "leather-dog-harness",
      "sku": "HARN-BLK-LG",
      "imageUrl": "https://cdn.kickat.co.in/variants/harness-black.png",
      "category": "Dog Accessories",
      "price": 799.0,
      "currentStock": 2,
      "isOutOfStock": false,
      "status": "ACTIVE"
    },
    {
      "id": "prod-uuid-8",
      "type": "PRODUCT",
      "productId": "prod-uuid-8",
      "variantId": null,
      "name": "Salmon Oil Supplement 250ml",
      "slug": "salmon-oil-supplement-250ml",
      "sku": null,
      "imageUrl": "https://cdn.kickat.co.in/products/salmon.png",
      "category": "Health & Supplements",
      "price": 649.0,
      "currentStock": 4,
      "isOutOfStock": false,
      "status": "ACTIVE"
    }
  ]
}
```

---

## Standard Error Response Format

Errors return the uniform NestJS `AllExceptionsFilter` format:

```typescript
interface ApiErrorResponse {
  success: false;
  statusCode: number;      // 400 (Bad Request), 401 (Unauthorized), 403 (Forbidden), 500
  message: string;         // Descriptive error message
  path: string;            // The request URL (e.g. /api/v1/admin/dashboard/stats)
  timestamp: string;       // ISO 8601 timestamp
  errors: string[];        // Array of validation error details (if 400)
}
```

#### Common Status Codes
- **`400 Bad Request`**: Query parameters failed validation (e.g. invalid date string, negative threshold, unsupported enum value).
- **`401 Unauthorized`**: Missing or expired Bearer access token (`"Unauthorized access"`).
- **`403 Forbidden`**: Authenticated account is not an active admin (`"Admin access required"`).

---

## Frontend Integration Guide (TypeScript & React / Axios)

### TypeScript Types & Interfaces

```typescript
// types/admin-dashboard.ts

export type DashboardPeriod =
  | "today"
  | "this_week"
  | "7d"
  | "this_month"
  | "30d"
  | "this_year"
  | "12m"
  | "all"
  | "custom";

export type ChartGroupBy = "hour" | "day" | "week" | "month";

export type OrderStatus =
  | "PENDING"
  | "PLACED"
  | "PROCESSING"
  | "PACKED"
  | "SHIPPED"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLED"
  | "RETURN_INITIATED"
  | "RETURNED";

export interface DashboardStatsResponse {
  totalRevenue: number;
  totalOrders: number;
  totalCustomers: number;
  todayOrders: number;
  todayRevenue: number;
  pendingOrders: number;
  pendingOrdersBreakdown: {
    pending: number;
    placed: number;
    processing: number;
  };
  lowStockProducts: number;
  outOfStockProducts: number;
  totalInventoryAlerts: number;
  refundRequests: number;
  totalRefundRequests: number;
  periodMetrics: {
    period: DashboardPeriod;
    startDate: string;
    endDate: string;
    revenue: number;
    orders: number;
    newCustomers: number;
    newCustomersToday: number;
    growth: {
      revenuePercentage: number;
      ordersPercentage: number;
      customersPercentage: number;
    };
  };
}

export interface ChartDataPoint {
  date: string;
  label: string;
  revenue: number;
  ordersCount: number;
  itemsCount: number;
  averageOrderValue: number;
}

export interface SalesChartResponse {
  period: DashboardPeriod;
  groupBy: ChartGroupBy;
  startDate: string;
  endDate: string;
  summary: {
    totalRevenue: number;
    totalOrders: number;
    totalItems: number;
    averageOrderValue: number;
  };
  chartData: ChartDataPoint[];
}

export interface OrderItemSummary {
  id: string;
  productId: string;
  productName: string;
  variantName: string | null;
  quantity: number;
  price: number;
  totalPrice: number;
}

export interface RecentOrderCustomer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

export interface RecentOrderItem {
  id: string;
  orderNumber: string;
  customer: RecentOrderCustomer;
  orderStatus: OrderStatus;
  paymentStatus: string;
  paymentMethod: string;
  subtotal: number;
  deliveryFee: number;
  grandTotal: number;
  itemsCount: number;
  itemsSummary: string;
  items: OrderItemSummary[];
  latestPayment: {
    id: string;
    status: string;
    paymentMethod: string;
    amount: number;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecentOrdersResponse {
  total: number;
  orders: RecentOrderItem[];
}

export interface OrderStatusBreakdownItem {
  status: OrderStatus;
  label: string;
  count: number;
  percentage: number;
  revenue: number;
}

export interface OrderStatusSummaryResponse {
  totalOrders: number;
  breakdown: OrderStatusBreakdownItem[];
}

export interface TopCategoryItem {
  categoryId: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  totalRevenue: number;
  totalUnitsSold: number;
  productsCount: number;
  percentageOfTotal: number;
}

export interface TopCategoriesResponse {
  period: DashboardPeriod;
  totalCategories: number;
  totalRevenue: number;
  categories: TopCategoryItem[];
}

export interface LowStockItem {
  id: string;
  type: "PRODUCT" | "VARIANT";
  productId: string;
  variantId: string | null;
  name: string;
  slug: string;
  sku: string | null;
  imageUrl: string | null;
  category: string;
  price: number;
  currentStock: number;
  isOutOfStock: boolean;
  status: string;
}

export interface LowStockResponse {
  threshold: number;
  totalLowStockItems: number;
  page: number;
  limit: number;
  items: LowStockItem[];
}

export interface PaymentMethodBreakdownItem {
  method: string;
  count: number;
  totalAmount: number;
  completedCount: number;
  pendingCount: number;
  percentage: number;
}

export interface PaymentMethodSummaryResponse {
  totalOrders: number;
  totalAmount: number;
  breakdown: PaymentMethodBreakdownItem[];
}

export interface UnifiedDashboardResponse {
  success: boolean;
  data: {
    summary: DashboardStatsResponse;
    salesChart: SalesChartResponse;
    orderStatusSummary: OrderStatusSummaryResponse;
    topCategories: TopCategoriesResponse;
    recentOrders: RecentOrdersResponse;
    lowStockProducts: LowStockResponse;
    paymentMethodSummary: PaymentMethodSummaryResponse;
  };
}
```

---

### Production-Ready API Service

```typescript
// services/adminDashboardService.ts
import axios from "axios";
import {
  DashboardPeriod,
  ChartGroupBy,
  OrderStatus,
  UnifiedDashboardResponse,
  DashboardStatsResponse,
  SalesChartResponse,
  RecentOrdersResponse,
  OrderStatusSummaryResponse,
  TopCategoriesResponse,
  LowStockResponse,
} from "../types/admin-dashboard";

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "https://api.kickat.co.in/api/v1";

const dashboardApi = axios.create({
  baseURL: `${BASE_URL}/admin/dashboard`,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
});

// Attach Authorization Bearer Token
dashboardApi.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("admin_access_token");
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Auto-redirect on expired session
dashboardApi.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("admin_access_token");
      if (!window.location.pathname.includes("/admin/login")) {
        window.location.href = "/admin/login?session_expired=true";
      }
    }
    return Promise.reject(err);
  }
);

export const AdminDashboardService = {
  /**
   * 1. Get Unified Dashboard Summary (All widgets in 1 call)
   */
  async getUnifiedDashboard(params?: {
    period?: DashboardPeriod;
    startDate?: string;
    endDate?: string;
    lowStockThreshold?: number;
    recentOrdersLimit?: number;
    topCategoriesLimit?: number;
  }): Promise<UnifiedDashboardResponse> {
    const res = await dashboardApi.get<UnifiedDashboardResponse>("", { params });
    return res.data;
  },

  /**
   * 2. Get High-Level KPI Summary & Growth Stats
   */
  async getStats(params?: {
    period?: DashboardPeriod;
    startDate?: string;
    endDate?: string;
    lowStockThreshold?: number;
  }): Promise<DashboardStatsResponse> {
    const res = await dashboardApi.get<DashboardStatsResponse>("/stats", { params });
    return res.data;
  },

  /**
   * 3. Get Time-Series Sales Chart Data
   */
  async getSalesChart(params?: {
    period?: DashboardPeriod;
    groupBy?: ChartGroupBy;
    startDate?: string;
    endDate?: string;
  }): Promise<SalesChartResponse> {
    const res = await dashboardApi.get<SalesChartResponse>("/sales-chart", { params });
    return res.data;
  },

  /**
   * 4. Get Stream of Recent Orders
   */
  async getRecentOrders(params?: {
    limit?: number;
    status?: OrderStatus;
  }): Promise<RecentOrdersResponse> {
    const res = await dashboardApi.get<RecentOrdersResponse>("/recent-orders", { params });
    return res.data;
  },

  /**
   * 5. Get Order Status Lifecycle Breakdown
   */
  async getOrderStatusSummary(): Promise<OrderStatusSummaryResponse> {
    const res = await dashboardApi.get<OrderStatusSummaryResponse>("/order-status-summary");
    return res.data;
  },

  /**
   * 6. Get Top-Selling Categories
   */
  async getTopCategories(params?: {
    period?: DashboardPeriod;
    limit?: number;
    startDate?: string;
    endDate?: string;
  }): Promise<TopCategoriesResponse> {
    const res = await dashboardApi.get<TopCategoriesResponse>("/top-categories", { params });
    return res.data;
  },

  /**
   * 7. Get Low-Stock & Out-of-Stock Warnings
   */
  async getLowStock(params?: {
    threshold?: number;
    limit?: number;
    page?: number;
  }): Promise<LowStockResponse> {
    const res = await dashboardApi.get<LowStockResponse>("/low-stock", { params });
    return res.data;
  },
};
```

---

### Dashboard UI Implementation Examples

#### Example 1: High-Level KPI Cards with Growth Indicators
```tsx
import React, { useEffect, useState } from "react";
import { AdminDashboardService } from "../services/adminDashboardService";
import { DashboardStatsResponse, DashboardPeriod } from "../types/admin-dashboard";

export const DashboardStatsCards: React.FC = () => {
  const [stats, setStats] = useState<DashboardStatsResponse | null>(null);
  const [period, setPeriod] = useState<DashboardPeriod>("7d");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    AdminDashboardService.getStats({ period })
      .then((data) => setStats(data))
      .catch((err) => console.error("Failed to fetch dashboard stats:", err))
      .finally(() => setLoading(false));
  }, [period]);

  if (loading || !stats) {
    return <div className="p-4">Loading KPI Metrics...</div>;
  }

  const { growth } = stats.periodMetrics;

  return (
    <div className="space-y-4">
      {/* Period Selector Tabs */}
      <div className="flex gap-2">
        {(["today", "7d", "30d", "this_month", "this_year"] as DashboardPeriod[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-3 py-1 rounded text-sm font-medium ${
              period === p ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"
            }`}
          >
            {p.replace("_", " ").toUpperCase()}
          </button>
        ))}
      </div>

      {/* Grid of Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Total Revenue */}
        <div className="p-4 bg-white rounded-lg shadow border">
          <p className="text-sm text-gray-500 font-medium">Period Revenue</p>
          <h3 className="text-2xl font-bold mt-1">₹{stats.periodMetrics.revenue.toLocaleString()}</h3>
          <span
            className={`text-xs font-semibold mt-2 inline-block ${
              growth.revenuePercentage >= 0 ? "text-green-600" : "text-red-600"
            }`}
          >
            {growth.revenuePercentage >= 0 ? "▲ +" : "▼ "}
            {growth.revenuePercentage}% vs prev. period
          </span>
        </div>

        {/* Total Orders */}
        <div className="p-4 bg-white rounded-lg shadow border">
          <p className="text-sm text-gray-500 font-medium">Period Orders</p>
          <h3 className="text-2xl font-bold mt-1">{stats.periodMetrics.orders}</h3>
          <span
            className={`text-xs font-semibold mt-2 inline-block ${
              growth.ordersPercentage >= 0 ? "text-green-600" : "text-red-600"
            }`}
          >
            {growth.ordersPercentage >= 0 ? "▲ +" : "▼ "}
            {growth.ordersPercentage}% vs prev. period
          </span>
        </div>

        {/* Pending Orders Alert */}
        <div className="p-4 bg-white rounded-lg shadow border">
          <p className="text-sm text-gray-500 font-medium">Pending Fulfillment</p>
          <h3 className="text-2xl font-bold text-amber-600 mt-1">{stats.pendingOrders}</h3>
          <p className="text-xs text-gray-400 mt-2">
            {stats.pendingOrdersBreakdown.placed} placed, {stats.pendingOrdersBreakdown.processing} in processing
          </p>
        </div>

        {/* Low Stock Warning */}
        <div className="p-4 bg-white rounded-lg shadow border">
          <p className="text-sm text-gray-500 font-medium">Stock Alerts</p>
          <h3 className="text-2xl font-bold text-red-600 mt-1">{stats.totalInventoryAlerts}</h3>
          <p className="text-xs text-gray-400 mt-2">
            {stats.outOfStockProducts} out-of-stock, {stats.lowStockProducts} low-stock
          </p>
        </div>
      </div>
    </div>
  );
};
```

#### Example 2: Recent Orders Activity Stream
```tsx
import React, { useEffect, useState } from "react";
import { AdminDashboardService } from "../services/adminDashboardService";
import { RecentOrderItem } from "../types/admin-dashboard";

export const DashboardRecentOrdersTable: React.FC = () => {
  const [orders, setOrders] = useState<RecentOrderItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AdminDashboardService.getRecentOrders({ limit: 5 })
      .then((res) => setOrders(res.orders))
      .catch((err) => console.error("Error loading orders:", err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div>Loading latest orders...</div>;

  return (
    <div className="bg-white rounded-lg shadow border overflow-hidden">
      <div className="px-4 py-3 border-b flex justify-between items-center">
        <h3 className="font-semibold text-gray-800">Recent Orders</h3>
        <a href="/admin/orders" className="text-sm text-blue-600 hover:underline">
          View All →
        </a>
      </div>
      <table className="w-full text-left text-sm">
        <thead className="bg-gray-50 text-gray-600 border-b">
          <tr>
            <th className="p-3">Order #</th>
            <th className="p-3">Customer</th>
            <th className="p-3">Items Summary</th>
            <th className="p-3">Amount</th>
            <th className="p-3">Status</th>
            <th className="p-3">Date</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id} className="border-b hover:bg-gray-50">
              <td className="p-3 font-medium text-blue-600">
                <a href={`/admin/orders/${order.id}`}>{order.orderNumber}</a>
              </td>
              <td className="p-3">{order.customer.name}</td>
              <td className="p-3 text-gray-500 truncate max-w-xs">{order.itemsSummary}</td>
              <td className="p-3 font-semibold">₹{order.grandTotal.toFixed(2)}</td>
              <td className="p-3">
                <span className="px-2 py-1 rounded text-xs font-semibold bg-blue-100 text-blue-800">
                  {order.orderStatus}
                </span>
              </td>
              <td className="p-3 text-gray-400">
                {new Date(order.createdAt).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
```
