# Admin Store Configuration & Platform Settings Specification

All store configuration endpoints are served under `/api/v1/admin/settings` and require Admin Authentication (`@AdminAuth()`), except for public store metadata served under `/api/v1/settings/public`.

---

## Table of Contents

1. [Architecture & Frontend Integration Overview](#architecture--frontend-integration-overview)
2. [Endpoints Overview](#endpoints-overview)
3. [Setting Groups & Schemas](#setting-groups--schemas)
   - [1. General & Maintenance Settings](#1-general--maintenance-settings)
   - [2. Payment Gateway Configuration](#2-payment-gateway-configuration)
   - [3. Tax & GST Computation Rules](#3-tax--gst-computation-rules)
   - [4. Delivery & Shipping Fee Rules](#4-delivery--shipping-fee-rules)
4. [Public Store Configuration API](#public-store-configuration-api)
5. [Frontend Integration Guide (TypeScript & Axios)](#frontend-integration-guide-typescript--axios)

---

## Architecture & Frontend Integration Overview

- **Base URL:** `https://api.kickat.co.in/api/v1/admin/settings` (or `http://localhost:3000/api/v1/admin/settings` in development)
- **Content Type:** `application/json`
- **Authentication Scheme:** `Authorization: Bearer <accessToken>`
- **Secret Masking:** Sensitive credentials (such as Razorpay `keySecret`, Stripe secret keys, and SMTP passwords) are automatically masked as `••••••••` in GET responses to safeguard production secrets.

---

## Endpoints Overview

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/settings` | Admin | Retrieve consolidated store settings across all 4 groups |
| `PATCH` | `/api/v1/admin/settings` | Admin | Bulk update configurations across multiple groups |
| `GET` | `/api/v1/admin/settings/general` | Admin | General store settings (name, support email, maintenance mode) |
| `PATCH` | `/api/v1/admin/settings/general` | Admin | Update general store settings |
| `GET` | `/api/v1/admin/settings/payment` | Admin | Payment gateway configurations (Razorpay, Stripe, COD limits) |
| `PATCH` | `/api/v1/admin/settings/payment` | Admin | Update payment gateway configurations |
| `GET` | `/api/v1/admin/settings/tax` | Admin | Tax calculation rules, default GST percent, tax-inclusive flags |
| `PATCH` | `/api/v1/admin/settings/tax` | Admin | Update tax & GST rules |
| `GET` | `/api/v1/admin/settings/delivery` | Admin | Delivery pricing, free shipping threshold, estimated ETAs |
| `PATCH` | `/api/v1/admin/settings/delivery` | Admin | Update shipping fee & delivery rules |
| `GET` | `/api/v1/settings/public` | Public | Store public identity (social links, support phone/email, maintenance mode) |

---

## Setting Groups & Schemas

### 1. General & Maintenance Settings (`GET` & `PATCH` `/settings/general`)

#### Sample Response Body
```json
{
  "success": true,
  "data": {
    "storeName": "Kickat Pet Care",
    "supportEmail": "support@kickat.co.in",
    "supportPhone": "+919876543210",
    "maintenanceMode": false,
    "socialLinks": {
      "instagram": "https://instagram.com/kickat_india",
      "facebook": "https://facebook.com/kickatindia"
    }
  }
}
```

---

### 2. Payment Gateway Configuration (`GET` & `PATCH` `/settings/payment`)

#### Request / Response Body Schema
```json
{
  "success": true,
  "data": {
    "cod": {
      "enabled": true,
      "minOrderAmount": 200.0,
      "maxOrderAmount": 10000.0,
      "extraFeeEnabled": true,
      "extraFee": 50.0
    },
    "upi": {
      "enabled": true
    },
    "card": {
      "enabled": true
    },
    "wallet": {
      "enabled": true
    },
    "netbanking": {
      "enabled": true
    }
  }
}
```

#### Field Descriptions for Cash-on-Delivery (COD):
- **`cod.enabled`** (*boolean*): Master toggle to enable or disable COD at checkout.
- **`cod.minOrderAmount`** (*number*): Minimum cart subtotal in ₹ required to use COD (e.g. ₹200).
- **`cod.maxOrderAmount`** (*number*): Maximum cart subtotal in ₹ allowed for COD (e.g. ₹10,000).
- **`cod.extraFeeEnabled`** (*boolean*): Toggle to enable or disable extra COD handling fee.
- **`cod.extraFee`** (*number*): Additional fixed COD handling charge in ₹ added to order grand total when enabled (e.g. ₹50).

---

### 3. Tax & GST Computation Rules (`GET` & `PATCH` `/settings/tax`)

#### Sample Response Body
```json
{
  "success": true,
  "data": {
    "defaultTaxRate": 18.0,
    "taxInclusive": false,
    "gstin": "27AAAAA0000A1Z5"
  }
}
```

---

### 4. Delivery & Shipping Fee Rules (`GET` & `PATCH` `/settings/delivery`)

#### Sample Response Body
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

## Public Store Configuration API

- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/settings/public`
- **Auth:** None (Public)

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "data": {
    "storeName": "Kickat Pet Care",
    "supportEmail": "support@kickat.co.in",
    "supportPhone": "+919876543210",
    "maintenanceMode": false,
    "socialLinks": {
      "instagram": "https://instagram.com/kickat_india",
      "facebook": "https://facebook.com/kickatindia"
    }
  }
}
```

---

## Frontend Integration Guide (TypeScript & Axios)

```typescript
// services/adminSettingsService.ts
import axios from "axios";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://api.kickat.co.in/api/v1";

const settingsApi = axios.create({
  baseURL: `${API_BASE}/admin/settings`,
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

  async getPublicSettings() {
    const res = await axios.get(`${API_BASE}/settings/public`);
    return res.data;
  },
};
```
