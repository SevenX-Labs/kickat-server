# Admin Dashboard API Specification

All executive dashboard endpoints are served under `/api/v1/admin/dashboard` with `@AdminAuth()`.

---

## Endpoints Overview

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/dashboard` | Yes | Overall dashboard summary (metrics, charts, recent activity) |
| `GET` | `/api/v1/admin/dashboard/stats` | Yes | High-level KPI cards (revenue, orders, AOV, customers) |
| `GET` | `/api/v1/admin/dashboard/sales-chart` | Yes | Revenue and orders time-series chart data |
| `GET` | `/api/v1/admin/dashboard/recent-orders` | Yes | Stream of recent orders |
| `GET` | `/api/v1/admin/dashboard/order-status-summary` | Yes | Order count breakdown across statuses |
| `GET` | `/api/v1/admin/dashboard/top-categories` | Yes | Top-selling categories ranked by revenue |
| `GET` | `/api/v1/admin/dashboard/low-stock` | Yes | Products and variants with stock below threshold |
