# Admin System & Store Settings API Specification

All configuration endpoints are served under `/api/v1/admin/settings` and require Admin Authentication (`@AdminAuth()`).

---

## Table of Contents

1. [Architecture & Frontend Integration Overview](#architecture--frontend-integration-overview)
2. [Endpoints Overview](#endpoints-overview)
3. [Endpoint Specifications](#endpoint-specifications)
   - [1. Retrieve Consolidated Settings (with Masked Secrets)](#1-retrieve-consolidated-settings)
   - [2. Bulk Update All Settings Groups](#2-bulk-update-all-settings-groups)
   - [3. General Platform Settings](#3-general-platform-settings)
   - [4. Store Profile & Legal Information](#4-store-profile--legal-information)
   - [5. Payment Gateway Configuration (Razorpay & COD)](#5-payment-gateway-configuration)
   - [6. Tax & GST Computation Rules](#6-tax--gst-computation-rules)
   - [7. Delivery & Shipping Fee Rules](#7-delivery--shipping-fee-rules)
4. [Frontend Integration Guide (TypeScript & Axios)](#frontend-integration-guide-typescript--axios)

---

## Architecture & Frontend Integration Overview

- **Base URL:** `https://api.kickat.co.in/api/v1/admin/settings` (or `http://localhost:3000/api/v1/admin/settings` in development)
- **Content Type:** `application/json`
- **Authentication Scheme:** `Authorization: Bearer <accessToken>`
- **Secret Masking:** Secret keys (such as `keySecret` for Razorpay or SMTP passwords) are automatically masked as `••••••••` in `GET` responses to prevent exposure in client consoles.

---

## Endpoints Overview

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/settings` | Yes (`Bearer`) | Retrieve all store configurations across all groups |
| `PATCH` | `/api/v1/admin/settings` | Yes (`Bearer`) | Bulk update configurations across multiple groups |
| `GET` | `/api/v1/admin/settings/general` | Yes (`Bearer`) | General platform settings (store name, maintenance mode, SMTP) |
| `PATCH` | `/api/v1/admin/settings/general` | Yes (`Bearer`) | Update general platform settings |
| `GET` | `/api/v1/admin/settings/store` | Yes (`Bearer`) | Store identity, warehouse address, currency, support contact |
| `PATCH` | `/api/v1/admin/settings/store` | Yes (`Bearer`) | Update store identity details |
| `GET` | `/api/v1/admin/settings/payment` | Yes (`Bearer`) | Payment gateway settings (Razorpay keys, COD limits) |
| `PATCH` | `/api/v1/admin/settings/payment` | Yes (`Bearer`) | Update payment configurations |
| `GET` | `/api/v1/admin/settings/tax` | Yes (`Bearer`) | Tax calculation rules, default GST rate, HSN codes |
| `PATCH` | `/api/v1/admin/settings/tax` | Yes (`Bearer`) | Update GST tax settings |
| `GET` | `/api/v1/admin/settings/delivery` | Yes (`Bearer`) | Delivery pricing, free shipping threshold, estimated ETAs |
| `PATCH` | `/api/v1/admin/settings/delivery` | Yes (`Bearer`) | Update shipping fee rules |

---

## Endpoint Specifications

### 1. Payment Gateway Configuration (`GET` & `PATCH` `/settings/payment`)

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "data": {
    "razorpay": {
      "enabled": true,
      "keyId": "rzp_live_k8214ha",
      "keySecret": "••••••••",
      "webhookSecret": "••••••••"
    },
    "cod": {
      "enabled": true,
      "minOrderAmount": 200.0,
      "maxOrderAmount": 10000.0
    }
  }
}
```

---

### 2. Delivery Settings (`GET` & `PATCH` `/settings/delivery`)

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "data": {
    "defaultShippingFee": 50.0,
    "freeShippingThreshold": 999.0,
    "estimatedDays": 3,
    "courierDefault": "Delhivery",
    "deliveryEnabled": true
  }
}
```

---

## Frontend Integration Guide (TypeScript & Axios)

```typescript
// services/adminSettingsService.ts
import axios from "axios";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.kickat.co.in/api/v1";

const settingsApi = axios.create({
  baseURL: `${BASE_URL}/admin/settings`,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

settingsApi.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("admin_access_token");
    if (token && config.headers) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const AdminSettingsService = {
  async getAll() {
    const res = await settingsApi.get("");
    return res.data;
  },

  async updateAll(payload: any) {
    const res = await settingsApi.patch("", payload);
    return res.data;
  },

  async getGeneral() {
    const res = await settingsApi.get("/general");
    return res.data;
  },

  async updateGeneral(payload: any) {
    const res = await settingsApi.patch("/general", payload);
    return res.data;
  },

  async getStore() {
    const res = await settingsApi.get("/store");
    return res.data;
  },

  async updateStore(payload: any) {
    const res = await settingsApi.patch("/store", payload);
    return res.data;
  },

  async getPayment() {
    const res = await settingsApi.get("/payment");
    return res.data;
  },

  async updatePayment(payload: any) {
    const res = await settingsApi.patch("/payment", payload);
    return res.data;
  },

  async getTax() {
    const res = await settingsApi.get("/tax");
    return res.data;
  },

  async updateTax(payload: any) {
    const res = await settingsApi.patch("/tax", payload);
    return res.data;
  },

  async getDelivery() {
    const res = await settingsApi.get("/delivery");
    return res.data;
  },

  async updateDelivery(payload: any) {
    const res = await settingsApi.patch("/delivery", payload);
    return res.data;
  },
};
```
