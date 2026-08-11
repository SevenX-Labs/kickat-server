# Admin BI & Analytics API Specification

All analytics endpoints are served under `/api/v1/admin/analytics` with `@AdminAuth()`.

---

## Endpoints Overview

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/analytics/sales` | Yes | Sales performance trends, units sold, and AOV |
| `GET` | `/api/v1/admin/analytics/revenue` | Yes | Gross & net revenue, refunds, and period comparisons |
| `GET` | `/api/v1/admin/analytics/orders` | Yes | Order volume breakdown and hourly distribution |
| `GET` | `/api/v1/admin/analytics/customers` | Yes | Customer acquisition trends and retention rate |
| `GET` | `/api/v1/admin/analytics/products` | Yes | Best-selling products and category revenue |
