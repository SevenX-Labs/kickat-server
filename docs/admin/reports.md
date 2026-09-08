# Admin Financial Reports & Ledger Exports API Specification

All reporting endpoints are served under `/api/v1/admin/reports` and require Admin Authentication (`@AdminAuth()`).

---

## Table of Contents

1. [Architecture & Frontend Integration Overview](#architecture--frontend-integration-overview)
2. [Endpoints Overview](#endpoints-overview)
3. [Endpoint Specifications](#endpoint-specifications)
   - [1. Sales Performance Report](#1-sales-performance-report)
   - [2. Export Sales Ledger (CSV or JSON)](#2-export-sales-ledger-csv-or-json)
   - [3. Order Fulfillment Lifecycle Report](#3-order-fulfillment-lifecycle-report)
   - [4. Customer Acquisition & LTV Report](#4-customer-acquisition--ltv-report)
   - [5. Product Inventory Movement Report](#5-product-inventory-movement-report)
   - [6. Refunds & Returns Ledger](#6-refunds--returns-ledger)
   - [7. GST Compliance Tax Report (CGST, SGST, IGST)](#7-gst-compliance-tax-report-cgst-sgst-igst)
4. [Frontend Integration Guide (TypeScript & Axios)](#frontend-integration-guide-typescript--axios)

---

## Architecture & Frontend Integration Overview

- **Base URL:** `https://api.kickat.co.in/api/v1/admin/reports` (or `http://localhost:3000/api/v1/admin/reports` in development)
- **Content Type:** `application/json` (or `text/csv` for `/sales/export`)
- **Authentication Scheme:** `Authorization: Bearer <accessToken>`
- **Direct CSV Streaming:** The `/sales/export` endpoint streams compliant CSV data directly to the client with `Content-Disposition: attachment; filename="sales-report.csv"`.

---

## Endpoints Overview

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/reports/sales` | Yes (`Bearer`) | Tabular sales report aggregated by day, week, or month |
| `GET` | `/api/v1/admin/reports/sales/export` | Yes (`Bearer`) | Download sales ledger as exported CSV or JSON file |
| `GET` | `/api/v1/admin/reports/orders` | Yes (`Bearer`) | Order fulfillment efficiency, status distribution, and cancel rates |
| `GET` | `/api/v1/admin/reports/customers` | Yes (`Bearer`) | Customer acquisition, repeat purchasing, and lifetime value report |
| `GET` | `/api/v1/admin/reports/products` | Yes (`Bearer`) | Product inventory turnover and sales velocity ledger |
| `GET` | `/api/v1/admin/reports/refunds` | Yes (`Bearer`) | Returns, adjustments, and financial refunds ledger |
| `GET` | `/api/v1/admin/reports/gst` | Yes (`Bearer`) | GST tax report with CGST, SGST, and IGST breakdowns |

---

## Endpoint Specifications

### 1. Export Sales Ledger (CSV or JSON)

- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/admin/reports/sales/export`
- **Headers:** `Authorization: Bearer <accessToken>`
- **Query Params:** `dateFrom`, `dateTo`, `format` (`csv` or `json`)

---

### 2. GST Compliance Tax Report (CGST, SGST, IGST)

- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/admin/reports/gst`
- **Headers:** `Authorization: Bearer <accessToken>`
- **Query Params:** `dateFrom`, `dateTo`

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "data": {
    "totalTaxableAmount": 123127.54,
    "totalTaxCollected": 22162.96,
    "cgst": 11081.48,
    "sgst": 11081.48,
    "igst": 0.0,
    "ordersCount": 384
  }
}
```

---

## Frontend Integration Guide (TypeScript & Axios)

```typescript
// services/adminReportService.ts
import axios from "axios";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.kickat.co.in/api/v1";

const reportApi = axios.create({
  baseURL: `${BASE_URL}/admin/reports`,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

reportApi.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("admin_access_token");
    if (token && config.headers) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const AdminReportService = {
  async getSalesReport(params?: any) {
    const res = await reportApi.get("/sales", { params });
    return res.data;
  },

  async downloadSalesCsv(params?: { dateFrom?: string; dateTo?: string }) {
    const res = await reportApi.get("/sales/export", {
      params: { ...params, format: "csv" },
      responseType: "blob",
    });
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `sales-report-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  },

  async getOrdersReport(params?: any) {
    const res = await reportApi.get("/orders", { params });
    return res.data;
  },

  async getCustomersReport(params?: any) {
    const res = await reportApi.get("/customers", { params });
    return res.data;
  },

  async getProductsReport(params?: any) {
    const res = await reportApi.get("/products", { params });
    return res.data;
  },

  async getRefundsReport(params?: any) {
    const res = await reportApi.get("/refunds", { params });
    return res.data;
  },

  async getGstReport(params?: any) {
    const res = await reportApi.get("/gst", { params });
    return res.data;
  },
};
```
