# Customer Product Reviews API Specification

All customer review endpoints are served under `/api/v1/reviews`.

---

## Endpoints Overview

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/reviews` | Yes | Submit review for verified purchase |
| `GET` | `/api/v1/reviews` | No | Public reviews listing with rating filters and sorting |
| `GET` | `/api/v1/reviews/:id` | No | Get single review details |
| `PATCH` | `/api/v1/reviews/:id/helpful` | Yes | Vote review as helpful |
