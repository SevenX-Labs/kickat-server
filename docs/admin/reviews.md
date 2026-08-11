# Admin Reviews API Specification

All review moderation endpoints are served under `/api/v1/admin/reviews` with `@AdminAuth()`.

---

## Endpoints Overview

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/reviews` | Yes | List reviews with status filters (`PENDING`, `APPROVED`, `REJECTED`), search, and metrics |
| `GET` | `/api/v1/admin/reviews/:id` | Yes | Get single review details |
| `PATCH` | `/api/v1/admin/reviews/:id/status` | Yes | Moderate review status (`APPROVED`, `REJECTED`, `PENDING`) |
| `POST` | `/api/v1/admin/reviews/:id/reply` | Yes | Add official store admin response to customer review |
| `PATCH` | `/api/v1/admin/reviews/:id/spam` | Yes | Flag or unflag review as spam |
