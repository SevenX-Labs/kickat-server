# Admin Reports & Ledgers API Specification

All reports and financial ledger export endpoints are served under `/api/v1/admin/reports` with `@AdminAuth()`.

---

## Endpoints Overview

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/reports/sales` | Yes | Tabular sales performance report |
| `GET` | `/api/v1/admin/reports/sales/export` | Yes | Downloadable CSV or JSON export of sales ledger (`?format=csv`) |
| `GET` | `/api/v1/admin/reports/orders` | Yes | Order lifecycle and fulfillment report |
| `GET` | `/api/v1/admin/reports/customers` | Yes | Customer acquisition and LTV report |
| `GET` | `/api/v1/admin/reports/products` | Yes | Product inventory movement and sales report |
| `GET` | `/api/v1/admin/reports/refunds` | Yes | Refund requests and returns ledger |
| `GET` | `/api/v1/admin/reports/gst` | Yes | GST tax compliance report |
