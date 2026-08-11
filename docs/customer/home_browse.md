# Customer Home & Content API Specification

Endpoints for home feed, promotional banners, and blogs under `/api/v1`.

---

## Endpoints Overview

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/home` | No | Aggregated home feed data (banners, categories, trending & best sellers). Query `petId` for personalized feed |
| `GET` | `/api/v1/home/banners` | No | Active promotional banners |
| `GET` | `/api/v1/blogs` | No | Paginated blog articles list |
| `GET` | `/api/v1/blogs/categories` | No | List blog categories |
| `GET` | `/api/v1/blogs/:slug` | No | Get single blog article by kebab-case slug |
