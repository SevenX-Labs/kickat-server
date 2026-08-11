# Admin Editorial Blogs CMS API Specification

All blog CMS endpoints are served under `/api/v1/admin/blogs` and `/api/v1/admin/blog-categories` with `@AdminAuth()`.

---

## Endpoints Overview

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/blogs` | Yes | List blog posts with search, category, tag, and publish status filters |
| `GET` | `/api/v1/admin/blogs/:id` | Yes | Get single blog post by ID or Slug |
| `POST` | `/api/v1/admin/blogs` | Yes | Create a new blog post |
| `PATCH` | `/api/v1/admin/blogs/:id` | Yes | Update blog post content, image, tags, or publish status |
| `DELETE` | `/api/v1/admin/blogs/:id` | Yes | Soft-delete or permanently delete blog post (`?permanent=true`) |
| `GET` | `/api/v1/admin/blog-categories` | Yes | List blog categories with post count metrics |
| `POST` | `/api/v1/admin/blog-categories` | Yes | Create a new blog category |
| `PATCH` | `/api/v1/admin/blog-categories/:id` | Yes | Update blog category |
| `DELETE` | `/api/v1/admin/blog-categories/:id` | Yes | Delete blog category |
