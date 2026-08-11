# Admin Marketing Campaigns API Specification

All marketing campaign endpoints are served under `/api/v1/admin/campaigns` with `@AdminAuth()`.

---

## Endpoints Overview

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/campaigns` | Yes | List WhatsApp, SMS, and Email marketing campaigns |
| `GET` | `/api/v1/admin/campaigns/:id` | Yes | Get campaign details and message template configuration |
| `POST` | `/api/v1/admin/campaigns` | Yes | Create WhatsApp/SMS/Email campaign |
| `PATCH` | `/api/v1/admin/campaigns/:id` | Yes | Edit draft or scheduled campaign |
| `DELETE` | `/api/v1/admin/campaigns/:id` | Yes | Delete or cancel campaign |
| `POST` | `/api/v1/admin/campaigns/:id/send` | Yes | Dispatch campaign through BullMQ queue |
| `POST` | `/api/v1/admin/campaigns/:id/cancel` | Yes | Cancel scheduled/processing campaign |
| `GET` | `/api/v1/admin/campaigns/:id/stats` | Yes | Campaign delivery metrics (Sent, Delivered, Failed, Pending) |
