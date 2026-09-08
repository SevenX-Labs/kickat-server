# Admin Shipping & Logistics Management API Specification

All shipment and fulfillment endpoints are served under `/api/v1/admin/shipments` (and alias `/api/v1/admin/shipping`) and require Admin Authentication (`@AdminAuth()`).

---

## Table of Contents

1. [Architecture & Frontend Integration Overview](#architecture--frontend-integration-overview)
2. [Endpoints Overview](#endpoints-overview)
3. [Endpoint Specifications](#endpoint-specifications)
   - [1. List Shipments (Filter by Courier, Status, AWB, Dates)](#1-list-shipments-filter-by-courier-status-awb-dates)
   - [2. Get Shipment Details](#2-get-shipment-details)
   - [3. Live Tracking Checkpoints & Courier URL](#3-live-tracking-checkpoints--courier-url)
   - [4. Assign Courier Partner & Attach AWB Tracking Number](#4-assign-courier-partner--attach-awb-tracking-number)
   - [5. Update Shipment Status & Milestone Location](#5-update-shipment-status--milestone-location)
4. [Standard Error Response Format](#standard-error-response-format)
5. [Frontend Integration Guide (TypeScript & Axios)](#frontend-integration-guide-typescript--axios)

---

## Architecture & Frontend Integration Overview

- **Base URL:** `https://api.kickat.co.in/api/v1/admin/shipments` (Alias: `https://api.kickat.co.in/api/v1/admin/shipping`)
- **Content Type:** `application/json`
- **Authentication Scheme:** `Authorization: Bearer <accessToken>`
- **Courier Integrations:** Supports automatic courier partner tracking URL generation (Shiprocket, Bluedart, Delhivery, Shadowfax, Xpressbees, DTDC, India Post).
- **Milestone Tracking:** Supports delivery milestones (`SHIPPED`, `OUT_FOR_DELIVERY`, `DELIVERED`, and Return-To-Origin `RTO`).

---

## Endpoints Overview

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/shipments` | Yes (`Bearer`) | List shipments with courier, status, and RTO counters |
| `GET` | `/api/v1/admin/shipments/:id` | Yes (`Bearer`) | Retrieve complete shipment details and customer destination |
| `GET` | `/api/v1/admin/shipments/:id/tracking` | Yes (`Bearer`) | Live tracking checkpoints and courier URL |
| `POST` | `/api/v1/admin/shipments/:id/assign` | Yes (`Bearer`) | Assign courier partner and attach AWB tracking number |
| `PATCH` | `/api/v1/admin/shipments/:id/status` | Yes (`Bearer`) | Update delivery milestone and current location |

---

## Endpoint Specifications

### 1. List Shipments (Filter by Courier, Status, AWB, Dates)

- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/admin/shipments` (or `/api/v1/admin/shipping`)
- **Headers:** `Authorization: Bearer <accessToken>`

#### Query Parameters: `page`, `limit`, `status`, `courier`, `awbNumber`, `orderNumber`, `isRTO`, `dateFrom`, `dateTo`, `sort`

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "data": {
    "shipments": [
      {
        "id": "ord-uuid-1",
        "orderNumber": "ORD-20260908-001",
        "status": "SHIPPED",
        "courierPartner": "Delhivery",
        "awbNumber": "DLH-9928172641",
        "estimatedDelivery": "2026-09-11T18:00:00.000Z",
        "isRTO": false,
        "customer": {
          "name": "Aakash Patel",
          "phone": "+919876543210",
          "city": "Mumbai",
          "pincode": "400001"
        },
        "itemsCount": 2,
        "createdAt": "2026-09-08T06:00:00.000Z"
      }
    ],
    "pagination": { "total": 120, "page": 1, "limit": 10, "totalPages": 12 },
    "summary": {
      "totalShipments": 120,
      "pendingPickup": 6,
      "shippedCount": 18,
      "outForDeliveryCount": 12,
      "deliveredCount": 82,
      "rtoCount": 2
    }
  }
}
```

---

### 2. Live Tracking Checkpoints & Courier URL

- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/admin/shipments/:id/tracking`
- **Headers:** `Authorization: Bearer <accessToken>`

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "data": {
    "orderNumber": "ORD-20260908-001",
    "courierPartner": "Delhivery",
    "awbNumber": "DLH-9928172641",
    "status": "SHIPPED",
    "trackingUrl": "https://www.delhivery.com/track/package/DLH-9928172641",
    "checkpoints": [
      {
        "status": "PACKED",
        "location": "Warehouse Mumbai East Hub",
        "timestamp": "2026-09-08T08:00:00.000Z"
      },
      {
        "status": "SHIPPED",
        "location": "Dispatched via Transit Vehicle",
        "timestamp": "2026-09-08T10:30:00.000Z"
      }
    ]
  }
}
```

---

### 3. Assign Courier Partner & Attach AWB Tracking Number

- **HTTP Method:** `POST`
- **Endpoint:** `/api/v1/admin/shipments/:id/assign`
- **Headers:** `Authorization: Bearer <accessToken>`, `Content-Type: application/json`

#### Request Body
```json
{
  "courierPartner": "Delhivery",
  "awbNumber": "DLH-9928172641",
  "estimatedDelivery": "2026-09-11T18:00:00.000Z",
  "pickupLocation": "Mumbai Central Fulfillment Warehouse",
  "notes": "Fragile pet treats package"
}
```

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "message": "Courier assigned successfully",
  "data": {
    "orderId": "ord-uuid-1",
    "courierPartner": "Delhivery",
    "awbNumber": "DLH-9928172641",
    "orderStatus": "SHIPPED",
    "trackingUrl": "https://www.delhivery.com/track/package/DLH-9928172641"
  }
}
```

---

### 4. Update Shipment Status & Milestone Location

- **HTTP Method:** `PATCH`
- **Endpoint:** `/api/v1/admin/shipments/:id/status`
- **Headers:** `Authorization: Bearer <accessToken>`, `Content-Type: application/json`

#### Request Body
```json
{
  "status": "OUT_FOR_DELIVERY",
  "location": "Bandra Local Delivery Hub",
  "notes": "Driver assigned for delivery today"
}
```

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "message": "Shipment status updated to OUT_FOR_DELIVERY",
  "data": {
    "orderId": "ord-uuid-1",
    "status": "OUT_FOR_DELIVERY",
    "updatedAt": "2026-09-08T11:55:00.000Z"
  }
}
```

---

## Frontend Integration Guide (TypeScript & Axios)

```typescript
// services/adminShippingService.ts
import axios from "axios";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.kickat.co.in/api/v1";

const shippingApi = axios.create({
  baseURL: `${BASE_URL}/admin/shipments`,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

shippingApi.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("admin_access_token");
    if (token && config.headers) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const AdminShippingService = {
  async getShipments(params?: any) {
    const res = await shippingApi.get("", { params });
    return res.data;
  },

  async getTracking(id: string) {
    const res = await shippingApi.get(`/${id}/tracking`);
    return res.data;
  },

  async assignCourier(id: string, payload: any) {
    const res = await shippingApi.post(`/${id}/assign`, payload);
    return res.data;
  },

  async updateStatus(id: string, payload: any) {
    const res = await shippingApi.patch(`/${id}/status`, payload);
    return res.data;
  },
};
```
