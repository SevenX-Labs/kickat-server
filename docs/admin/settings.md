# Admin Platform Settings API Specification

All platform and store configuration endpoints are served under `/api/v1/admin/settings` with `@AdminAuth()`.

---

## Endpoints Overview

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/settings` | Yes | View consolidated settings (API secrets masked) |
| `PATCH` | `/api/v1/admin/settings` | Yes | Bulk update settings across groups |
| `GET` | `/api/v1/admin/settings/general` | Yes | Get general platform settings (app name, support contact, maintenance mode) |
| `PATCH` | `/api/v1/admin/settings/general` | Yes | Update general platform settings |
| `GET` | `/api/v1/admin/settings/store` | Yes | Get store profile & currency settings |
| `PATCH` | `/api/v1/admin/settings/store` | Yes | Update store profile settings |
| `GET` | `/api/v1/admin/settings/payment` | Yes | Get payment gateway settings (Razorpay, COD rules) |
| `PATCH` | `/api/v1/admin/settings/payment` | Yes | Update payment gateway settings |
| `GET` | `/api/v1/admin/settings/tax` | Yes | Get GST tax settings & HSN codes |
| `PATCH` | `/api/v1/admin/settings/tax` | Yes | Update GST tax settings |
| `GET` | `/api/v1/admin/settings/delivery` | Yes | Get shipping fee & free delivery threshold settings |
| `PATCH` | `/api/v1/admin/settings/delivery` | Yes | Update delivery settings |
