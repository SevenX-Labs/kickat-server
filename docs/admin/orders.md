# Admin Order Processing, Invoicing & Refunds API Specification

All administrative order management endpoints are served under `/api/v1/admin/orders` and require Admin Authentication (`@AdminAuth()`).

---

## Table of Contents

1. [Architecture & Frontend Integration Overview](#architecture--frontend-integration-overview)
2. [Endpoints Overview](#endpoints-overview)
3. [Order Lifecycle & Payment Enums](#order-lifecycle--payment-enums)
4. [Endpoint Specifications](#endpoint-specifications)
   - [1. List Orders (Search, Filter, Sort, Paginate)](#1-list-orders-search-filter-sort-paginate)
   - [2. Get Order Details by ID or Order Number](#2-get-order-details-by-id-or-order-number)
   - [3. Update Order Fulfillment Status & Tracking](#3-update-order-fulfillment-status--tracking)
   - [4. Cancel Order & Restock Inventory](#4-cancel-order--restock-inventory)
   - [5. Process Full or Partial Refund](#5-process-full-or-partial-refund)
   - [6. Generate GST Tax Invoice](#6-generate-gst-tax-invoice)
   - [7. Generate Warehouse Packing Slip](#7-generate-warehouse-packing-slip)
5. [Standard Error Response Format](#standard-error-response-format)
6. [Frontend Integration Guide (TypeScript & Axios)](#frontend-integration-guide-typescript--axios)
   - [TypeScript Types & Interfaces](#typescript-types--interfaces)
   - [Production-Ready API Service](#production-ready-api-service)

---

## Architecture & Frontend Integration Overview

- **Base URL:** `https://api.kickat.co.in/api/v1/admin/orders` (or `http://localhost:3000/api/v1/admin/orders` in development)
- **Content Type:** `application/json`
- **Authentication Scheme:** `Authorization: Bearer <accessToken>`
- **Identifier Support:** Single order endpoints accept either internal database UUID or human-readable order number (e.g. `ORD-20260908-001`).
- **Inventory Restock on Cancel:** Cancelling an order automatically restores inventory levels for main products and variant SKUs in a database transaction unless explicitly disabled (`restockItems: false`).
- **GST Invoice & Warehouse Slip:** Dedicated endpoints compute compliant tax breakdowns (CGST + SGST 18% standard) and warehouse picking lists with barcodes.

---

## Endpoints Overview

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/orders` | Yes (`Bearer`) | List orders with multi-status filters, dates, and search |
| `GET` | `/api/v1/admin/orders/:id` | Yes (`Bearer`) | Get full order details, line items, payments, and addresses |
| `PATCH` | `/api/v1/admin/orders/:id/status` | Yes (`Bearer`) | Update fulfillment milestone status and courier tracking info |
| `POST` | `/api/v1/admin/orders/:id/cancel` | Yes (`Bearer`) | Cancel order with reason and automatically restock items |
| `POST` | `/api/v1/admin/orders/:id/refund` | Yes (`Bearer`) | Process gateway or manual refund (full or partial) |
| `GET` | `/api/v1/admin/orders/:id/invoice` | Yes (`Bearer`) | Generate official GST-compliant tax invoice data |
| `GET` | `/api/v1/admin/orders/:id/packing-slip` | Yes (`Bearer`) | Generate warehouse picking and packaging slip |

---

## Order Lifecycle & Payment Enums

### Order Status (`OrderStatusEnum`)
- `PENDING` | `PLACED` | `PROCESSING` | `PACKED` | `SHIPPED` | `OUT_FOR_DELIVERY` | `DELIVERED` | `CANCELLED` | `RETURN_INITIATED` | `RETURNED`

### Payment Status (`PaymentStatusEnum`)
- `PENDING` | `COMPLETED` | `FAILED` | `REFUNDED`

### Sort Field Options (`AdminOrderSortEnum`)
- `createdAt_desc` (Default - Latest orders first)
- `createdAt_asc`
- `grandTotal_desc` (Highest order value first)
- `grandTotal_asc`

---

## Endpoint Specifications

### 1. List Orders (Search, Filter, Sort, Paginate)

- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/admin/orders`
- **Headers:** `Authorization: Bearer <accessToken>`

#### Query Parameters
| Parameter | Type | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `page` | `number` | No | `1` | Page number |
| `limit` | `number` | No | `10` | Items per page (1 to 100) |
| `status` | `string` | No | - | Filter by `OrderStatusEnum` |
| `paymentStatus` | `string` | No | - | Filter by `PaymentStatusEnum` |
| `customerId` | `string` | No | - | Customer UUID |
| `search` | `string` | No | - | Search by customer name, email, phone, or order number |
| `dateFrom` | `string` | No | - | ISO date string for range start |
| `dateTo` | `string` | No | - | ISO date string for range end |
| `sort` | `string` | No | `createdAt_desc` | Sort sequence |

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "data": {
    "orders": [
      {
        "id": "ord-uuid-1",
        "orderNumber": "ORD-20260908-001",
        "customer": {
          "id": "user-uuid-1",
          "name": "Aakash Patel",
          "email": "aakash@gmail.com",
          "phone": "+919876543210"
        },
        "orderStatus": "PLACED",
        "paymentStatus": "COMPLETED",
        "paymentMethod": "UPI",
        "subtotal": 2400.0,
        "deliveryFee": 0.0,
        "grandTotal": 2400.0,
        "itemsCount": 2,
        "itemsSummary": "Royal Canin Mini Adult (2kg) x1, Chew Toy x1",
        "createdAt": "2026-09-08T06:00:00.000Z",
        "updatedAt": "2026-09-08T06:00:00.000Z"
      }
    ],
    "pagination": {
      "total": 384,
      "page": 1,
      "limit": 10,
      "totalPages": 39,
      "hasNextPage": true,
      "hasPrevPage": false
    },
    "summary": {
      "totalOrders": 384,
      "totalRevenue": 145290.5,
      "placedCount": 5,
      "processingCount": 4,
      "shippedCount": 8,
      "deliveredCount": 340,
      "cancelledCount": 12
    }
  }
}
```

---

### 2. Get Order Details by ID or Order Number

- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/admin/orders/:id` (Accepts UUID or orderNumber)
- **Headers:** `Authorization: Bearer <accessToken>`

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "data": {
    "id": "ord-uuid-1",
    "orderNumber": "ORD-20260908-001",
    "orderStatus": "PLACED",
    "paymentStatus": "COMPLETED",
    "paymentMethod": "UPI",
    "subtotal": 2400.0,
    "discount": 0.0,
    "deliveryFee": 0.0,
    "grandTotal": 2400.0,
    "trackingNumber": "AWB-789123456",
    "courierPartner": "Shiprocket",
    "estimatedDelivery": "2026-09-11T18:00:00.000Z",
    "notes": "Please deliver after 2 PM",
    "user": {
      "id": "user-uuid-1",
      "name": "Aakash Patel",
      "email": "aakash@gmail.com",
      "phone": "+919876543210"
    },
    "address": {
      "id": "addr-uuid-1",
      "street": "Flat 402, Sunshine Heights, MG Road",
      "city": "Mumbai",
      "state": "Maharashtra",
      "pincode": "400001",
      "country": "India"
    },
    "items": [
      {
        "id": "item-uuid-1",
        "productId": "prod-uuid-1",
        "variantId": "var-uuid-1",
        "productName": "Royal Canin Mini Adult",
        "variantName": "2kg Bag",
        "quantity": 1,
        "price": 2100.0,
        "totalPrice": 2100.0
      },
      {
        "id": "item-uuid-2",
        "productId": "prod-uuid-2",
        "variantId": null,
        "productName": "Rubber Chew Bone Toy",
        "variantName": null,
        "quantity": 1,
        "price": 300.0,
        "totalPrice": 300.0
      }
    ],
    "payments": [
      {
        "id": "pay-uuid-1",
        "paymentMethod": "UPI",
        "status": "COMPLETED",
        "amount": 2400.0,
        "transactionId": "pay_O7b81923ha",
        "createdAt": "2026-09-08T06:05:00.000Z"
      }
    ],
    "timeline": [
      {
        "status": "PLACED",
        "timestamp": "2026-09-08T06:00:00.000Z"
      }
    ]
  }
}
```

---

### 3. Update Order Fulfillment Status & Tracking

- **HTTP Method:** `PATCH`
- **Endpoint:** `/api/v1/admin/orders/:id/status`
- **Headers:** `Authorization: Bearer <accessToken>`, `Content-Type: application/json`

#### Request Body
```json
{
  "status": "SHIPPED",
  "courierPartner": "Delhivery",
  "trackingNumber": "DLH-9928172641",
  "estimatedDelivery": "2026-09-11T18:00:00.000Z",
  "notes": "Handed over to Delhivery logistics hub"
}
```

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "message": "Order status updated to SHIPPED",
  "data": {
    "id": "ord-uuid-1",
    "orderNumber": "ORD-20260908-001",
    "orderStatus": "SHIPPED",
    "courierPartner": "Delhivery",
    "trackingNumber": "DLH-9928172641",
    "updatedAt": "2026-09-08T11:20:00.000Z"
  }
}
```

---

### 4. Cancel Order & Restock Inventory

- **HTTP Method:** `POST`
- **Endpoint:** `/api/v1/admin/orders/:id/cancel`
- **Headers:** `Authorization: Bearer <accessToken>`, `Content-Type: application/json`

#### Request Body
```json
{
  "reason": "Customer requested cancellation before dispatch",
  "reasonOther": "Customer mistakenly ordered incorrect kibble size",
  "restockItems": true
}
```

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "message": "Order cancelled successfully and inventory restocked",
  "data": {
    "id": "ord-uuid-1",
    "orderNumber": "ORD-20260908-001",
    "orderStatus": "CANCELLED",
    "cancelReason": "Customer requested cancellation before dispatch",
    "cancelledAt": "2026-09-08T11:25:00.000Z"
  }
}
```

---

### 5. Process Full or Partial Refund

- **HTTP Method:** `POST`
- **Endpoint:** `/api/v1/admin/orders/:id/refund`
- **Headers:** `Authorization: Bearer <accessToken>`, `Content-Type: application/json`

#### Request Body
```json
{
  "amount": 2400.0,
  "reason": "Order cancelled by customer",
  "refundMethod": "ORIGINAL_PAYMENT",
  "notes": "Razorpay auto-refund initiated"
}
```

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "message": "Refund processed successfully",
  "data": {
    "orderId": "ord-uuid-1",
    "orderNumber": "ORD-20260908-001",
    "refundAmount": 2400.0,
    "currency": "INR",
    "reason": "Order cancelled by customer",
    "refundMethod": "ORIGINAL_PAYMENT",
    "notes": "Razorpay auto-refund initiated",
    "refundedAt": "2026-09-08T11:30:00.000Z"
  }
}
```

---

### 6. Generate GST Tax Invoice

- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/admin/orders/:id/invoice`
- **Headers:** `Authorization: Bearer <accessToken>`

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "data": {
    "invoiceNumber": "INV-ORD-20260908-001",
    "invoiceDate": "2026-09-08T06:00:00.000Z",
    "orderId": "ord-uuid-1",
    "orderNumber": "ORD-20260908-001",
    "customer": {
      "id": "user-uuid-1",
      "name": "Aakash Patel",
      "email": "aakash@gmail.com",
      "phone": "+919876543210"
    },
    "billingAddress": {
      "street": "Flat 402, Sunshine Heights, MG Road",
      "city": "Mumbai",
      "state": "Maharashtra",
      "pincode": "400001"
    },
    "shippingAddress": {
      "street": "Flat 402, Sunshine Heights, MG Road",
      "city": "Mumbai",
      "state": "Maharashtra",
      "pincode": "400001"
    },
    "items": [
      {
        "id": "item-uuid-1",
        "productName": "Royal Canin Mini Adult",
        "variantName": "2kg Bag",
        "quantity": 1,
        "unitPrice": 2100.0,
        "totalPrice": 2100.0,
        "taxRate": "18%",
        "taxAmount": 378.0
      }
    ],
    "summary": {
      "subtotal": 2400.0,
      "taxBreakdown": {
        "cgst": 216.0,
        "sgst": 216.0,
        "totalTax": 432.0
      },
      "deliveryFee": 0.0,
      "grandTotal": 2400.0
    },
    "payment": {
      "method": "UPI",
      "status": "COMPLETED"
    },
    "downloadUrl": "/api/v1/admin/orders/ord-uuid-1/invoice/pdf"
  }
}
```

---

### 7. Generate Warehouse Packing Slip

- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/admin/orders/:id/packing-slip`
- **Headers:** `Authorization: Bearer <accessToken>`

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "data": {
    "slipNumber": "PACK-ORD-20260908-001",
    "orderNumber": "ORD-20260908-001",
    "orderDate": "2026-09-08T06:00:00.000Z",
    "customer": {
      "name": "Aakash Patel",
      "phone": "+919876543210"
    },
    "shippingAddress": {
      "street": "Flat 402, Sunshine Heights, MG Road",
      "city": "Mumbai",
      "pincode": "400001"
    },
    "courierPartner": "Delhivery",
    "trackingNumber": "DLH-9928172641",
    "packageItems": [
      {
        "itemNumber": 1,
        "productId": "prod-uuid-1",
        "variantId": "var-uuid-1",
        "productName": "Royal Canin Mini Adult",
        "variantName": "2kg Bag",
        "quantity": 1,
        "picked": false
      }
    ],
    "totalItemsCount": 1,
    "totalUnitsCount": 1,
    "barcode": "ORD-20260908-001",
    "generatedAt": "2026-09-08T11:35:00.000Z"
  }
}
```

---

## Frontend Integration Guide (TypeScript & Axios)

### TypeScript Types & Interfaces

```typescript
// types/admin-order.ts

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

export interface AdminOrderItem {
  id: string;
  orderNumber: string;
  customer: { id: string; name: string; email: string | null; phone: string | null };
  orderStatus: OrderStatus;
  paymentStatus: string;
  paymentMethod: string;
  subtotal: number;
  deliveryFee: number;
  grandTotal: number;
  itemsCount: number;
  itemsSummary: string;
  createdAt: string;
}

export interface AdminOrdersResponse {
  success: boolean;
  data: {
    orders: AdminOrderItem[];
    pagination: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
      hasNextPage: boolean;
      hasPrevPage: boolean;
    };
    summary: {
      totalOrders: number;
      totalRevenue: number;
      placedCount: number;
      processingCount: number;
      shippedCount: number;
      deliveredCount: number;
      cancelledCount: number;
    };
  };
}
```

### Production-Ready API Service

```typescript
// services/adminOrderService.ts
import axios from "axios";
import { AdminOrdersResponse } from "../types/admin-order";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.kickat.co.in/api/v1";

const orderApi = axios.create({
  baseURL: `${BASE_URL}/admin/orders`,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

orderApi.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("admin_access_token");
    if (token && config.headers) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const AdminOrderService = {
  async getOrders(params?: any): Promise<AdminOrdersResponse> {
    const res = await orderApi.get<AdminOrdersResponse>("", { params });
    return res.data;
  },

  async getOrderById(id: string) {
    const res = await orderApi.get(`/${id}`);
    return res.data;
  },

  async updateStatus(id: string, payload: { status: string; courierPartner?: string; trackingNumber?: string; notes?: string }) {
    const res = await orderApi.patch(`/${id}/status`, payload);
    return res.data;
  },

  async cancelOrder(id: string, payload: { reason: string; reasonOther?: string; restockItems?: boolean }) {
    const res = await orderApi.post(`/${id}/cancel`, payload);
    return res.data;
  },

  async processRefund(id: string, payload: { amount?: number; reason: string; refundMethod?: string; notes?: string }) {
    const res = await orderApi.post(`/${id}/refund`, payload);
    return res.data;
  },

  async getInvoice(id: string) {
    const res = await orderApi.get(`/${id}/invoice`);
    return res.data;
  },

  async getPackingSlip(id: string) {
    const res = await orderApi.get(`/${id}/packing-slip`);
    return res.data;
  },
};
```
