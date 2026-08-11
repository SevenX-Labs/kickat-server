# Admin Shipping API Specification

All shipment and logistics management endpoints are served under `/api/v1/admin/shipments` (or `/api/v1/admin/shipping`) with `@AdminAuth()`.

---

## Endpoints Overview

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/shipments` | Yes | List all shipments with filtering, search, and KPI counters |
| `GET` | `/api/v1/admin/shipments/:id` | Yes | Get complete shipment details |
| `GET` | `/api/v1/admin/shipments/:id/tracking` | Yes | Live tracking timeline with checkpoints and courier URL |
| `POST` | `/api/v1/admin/shipments/:id/assign` | Yes | Assign courier partner and generate AWB number |
| `PATCH` | `/api/v1/admin/shipments/:id/status` | Yes | Update shipment status (`SHIPPED`, `OUT_FOR_DELIVERY`, `DELIVERED`, `RTO`) |
