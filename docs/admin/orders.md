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
   - [6. Confirm Manual COD Refund](#6-confirm-manual-cod-refund)
   - [7. Confirm Warehouse Return Receipt](#7-confirm-warehouse-return-receipt)
   - [8. Retrieve Order Refund Audit History](#8-retrieve-order-refund-audit-history)
   - [9. Generate GST Tax Invoice Data](#9-generate-gst-tax-invoice-data)
   - [10. Download PDF Tax Invoice File](#10-download-pdf-tax-invoice-file)
   - [11. Generate Warehouse Packing Slip](#11-generate-warehouse-packing-slip)
5. [Frontend Integration Guide (TypeScript & Axios)](#frontend-integration-guide-typescript--axios)

---

## Architecture & Frontend Integration Overview

- **Base URL:** `https://api.kickat.co.in/api/v1/admin/orders` (or `http://localhost:3000/api/v1/admin/orders` in development)
- **Content Type:** `application/json`
- **Authentication Scheme:** `Authorization: Bearer <accessToken>`
- **Identifier Support:** Order endpoints accept internal database UUIDs or order numbers (e.g. `ORD-20260908-001`).
- **PDF Generation (`InvoicePdfService`)**: Streams a high-res PDF binary buffer with custom filename headers (`Content-Disposition: attachment; filename="Invoice-ORD-XXXX.pdf"`).
- **Inventory Restock on Cancel**: Cancelling an order automatically restores inventory levels for main products and variant SKUs unless explicitly disabled (`restockItems: false`).
- **Immutable Refund Audit Log**: All processed refunds (gateway & COD) record immutable audit entries with reference numbers and admin IDs.

---

## Endpoints Overview

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/admin/orders` | Search, filter, and paginate order history with KPI metrics |
| `GET` | `/api/v1/admin/orders/:id` | Retrieve single order details including customer, items, tracking |
| `PATCH` | `/api/v1/admin/orders/:id/status` | Update fulfillment state (`PROCESSING`, `SHIPPED`, `DELIVERED`) |
| `POST` | `/api/v1/admin/orders/:id/cancel` | Cancel order and automatically restore stock levels |
| `POST` | `/api/v1/admin/orders/:id/refund` | Initiate gateway refund (Razorpay/Stripe/Wallet) |
| `POST` | `/api/v1/admin/orders/:id/confirm-cod-refund` | Mark manual COD refund as completed with bank reference number |
| `POST` | `/api/v1/admin/orders/returns/:returnId/confirm-received` | Confirm physical receipt of returned goods at warehouse |
| `GET` | `/api/v1/admin/orders/:id/refunds` | Get full audit history of all refunds for an order |
| `GET` | `/api/v1/admin/orders/:id/invoice` | Generate structured GST tax invoice payload |
| `GET` | `/api/v1/admin/orders/:id/invoice/pdf` | Download binary PDF tax invoice file |
| `GET` | `/api/v1/admin/orders/:id/packing-slip` | Generate warehouse fulfillment picking slip |

---

## Order Lifecycle & Payment Enums

```
+-----------+     +------------+     +---------+     +---------+     +-----------+
|  PLACED   | --> | PROCESSING | --> | PACKED  | --> | SHIPPED | --> | DELIVERED |
+-----+-----+     +------------+     +---------+     +---------+     +-----------+
      |
      v
+-----+-----+
| CANCELLED | (Triggers Auto-Restock)
+-----------+
```

---

## Endpoint Specifications

### 1. List Orders

- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/admin/orders`
- **Query Parameters:** `page`, `limit`, `search`, `status`, `paymentStatus`, `startDate`, `endDate`

---

### 2. Get Order Details

- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/admin/orders/:id`

---

### 3. Update Order Fulfillment Status & Tracking

- **HTTP Method:** `PATCH`
- **Endpoint:** `/api/v1/admin/orders/:id/status`

#### Request Body
```json
{
  "status": "SHIPPED",
  "courierPartner": "Delhivery",
  "trackingNumber": "DLH-9928172641",
  "notes": "Handed over to courier"
}
```

---

### 4. Cancel Order & Restock Inventory

- **HTTP Method:** `POST`
- **Endpoint:** `/api/v1/admin/orders/:id/cancel`

#### Request Body
```json
{
  "reason": "Customer requested cancellation before dispatch",
  "restockItems": true
}
```

---

### 5. Process Full or Partial Refund

- **HTTP Method:** `POST`
- **Endpoint:** `/api/v1/admin/orders/:id/refund`

#### Request Body
```json
{
  "amount": 2400.0,
  "reason": "Order cancelled",
  "refundMethod": "ORIGINAL_PAYMENT",
  "notes": "Razorpay auto refund"
}
```

---

### 6. Confirm Manual COD Refund

- **HTTP Method:** `POST`
- **Endpoint:** `/api/v1/admin/orders/:id/confirm-cod-refund`

#### Request Body
```json
{
  "amount": 2400.0,
  "referenceNumber": "UTR99281726419",
  "notes": "Bank transfer executed"
}
```

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "message": "COD refund confirmed and recorded in audit log",
  "data": {
    "refundAuditId": "ref-audit-uuid-1",
    "orderId": "ord-uuid-1",
    "amount": 2400.0,
    "refundMethod": "COD_BANK_TRANSFER",
    "referenceNumber": "UTR99281726419",
    "status": "COMPLETED",
    "confirmedBy": "admin-uuid-1"
  }
}
```

---

### 7. Confirm Warehouse Return Receipt

- **HTTP Method:** `POST`
- **Endpoint:** `/api/v1/admin/orders/returns/:returnId/confirm-received`

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "message": "Return package received and verified at warehouse"
}
```

---

### 8. Retrieve Order Refund Audit History

- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/admin/orders/:id/refunds`

---

### 9. Generate GST Tax Invoice Data

- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/admin/orders/:id/invoice`

---

### 10. Download PDF Tax Invoice File

- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/admin/orders/:id/invoice/pdf`
- **Response Header:** `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="Invoice-ORD-20260908-001.pdf"`

---

### 11. Generate Warehouse Packing Slip

- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/admin/orders/:id/packing-slip`

---

## Frontend Integration Guide (TypeScript & Axios)

```typescript
// services/adminOrderService.ts
import axios from "axios";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://api.kickat.co.in/api/v1";

const orderApi = axios.create({
  baseURL: `${API_BASE}/admin/orders`,
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
  async getOrders(params?: any) {
    const res = await orderApi.get("", { params });
    return res.data;
  },

  async getOrderById(id: string) {
    const res = await orderApi.get(`/${id}`);
    return res.data;
  },

  async updateStatus(id: string, payload: { status: string; courierPartner?: string; trackingNumber?: string }) {
    const res = await orderApi.patch(`/${id}/status`, payload);
    return res.data;
  },

  async cancelOrder(id: string, payload: { reason: string; restockItems?: boolean }) {
    const res = await orderApi.post(`/${id}/cancel`, payload);
    return res.data;
  },

  async processRefund(id: string, payload: { amount?: number; reason: string; refundMethod?: string }) {
    const res = await orderApi.post(`/${id}/refund`, payload);
    return res.data;
  },

  async confirmCodRefund(id: string, payload: { amount: number; referenceNumber: string; notes?: string }) {
    const res = await orderApi.post(`/${id}/confirm-cod-refund`, payload);
    return res.data;
  },

  async confirmReturnReceived(returnId: string) {
    const res = await orderApi.post(`/returns/${returnId}/confirm-received`);
    return res.data;
  },

  async getRefundHistory(id: string) {
    const res = await orderApi.get(`/${id}/refunds`);
    return res.data;
  },

  async getInvoice(id: string) {
    const res = await orderApi.get(`/${id}/invoice`);
    return res.data;
  },

  async downloadInvoicePdf(id: string) {
    const res = await orderApi.get(`/${id}/invoice/pdf`, { responseType: "blob" });
    const url = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Invoice-${id}.pdf`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  },

  async getPackingSlip(id: string) {
    const res = await orderApi.get(`/${id}/packing-slip`);
    return res.data;
  },
};
```
