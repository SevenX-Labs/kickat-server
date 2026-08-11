# Customer Notifications API Specification

All customer in-app notification endpoints are served under `/api/v1/notifications`.

---

## Endpoints Overview

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/notifications` | Yes | Get paginated in-app notifications feed |
| `PATCH` | `/api/v1/notifications/read-all` | Yes | Mark all notifications as read |
| `PATCH` | `/api/v1/notifications/:id/read` | Yes | Mark single notification as read |
