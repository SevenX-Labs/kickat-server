# Admin Editorial Blogs & CMS API Specification

All content management endpoints are served under `/api/v1/admin/blogs` and `/api/v1/admin/blog-categories` and require Admin Authentication (`@AdminAuth()`).

---

## Table of Contents

1. [Architecture & Frontend Integration Overview](#architecture--frontend-integration-overview)
2. [Endpoints Overview](#endpoints-overview)
3. [Endpoint Specifications: Blogs](#endpoint-specifications-blogs)
   - [1. List Blog Posts](#1-list-blog-posts)
   - [2. Get Blog Post Details by ID or Slug](#2-get-blog-post-details-by-id-or-slug)
   - [3. Create Blog Article](#3-create-blog-article)
   - [4. Update Blog Article](#4-update-blog-article)
   - [5. Delete Blog Article](#5-delete-blog-article)
4. [Endpoint Specifications: Blog Categories](#endpoint-specifications-blog-categories)
   - [6. List Blog Categories](#6-list-blog-categories)
   - [7. Create Blog Category](#7-create-blog-category)
   - [8. Update Blog Category](#8-update-blog-category)
   - [9. Delete Blog Category](#9-delete-blog-category)
5. [Frontend Integration Guide (TypeScript & Axios)](#frontend-integration-guide-typescript--axios)

---

## Architecture & Frontend Integration Overview

- **Base URLs:** 
  - Articles: `https://api.kickat.co.in/api/v1/admin/blogs`
  - Categories: `https://api.kickat.co.in/api/v1/admin/blog-categories`
- **Content Type:** `application/json`
- **Authentication Scheme:** `Authorization: Bearer <accessToken>`
- **Rich Content & SEO:** Supports markdown or HTML body content, meta summary, tags array, custom cover images, and auto-generated URL slugs.

---

## Endpoints Overview

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/blogs` | Yes (`Bearer`) | List blog posts with category, tag, and publish status filters |
| `GET` | `/api/v1/admin/blogs/:id` | Yes (`Bearer`) | Retrieve single blog post by UUID or slug |
| `POST` | `/api/v1/admin/blogs` | Yes (`Bearer`) | Create and draft or publish a new article |
| `PATCH` | `/api/v1/admin/blogs/:id` | Yes (`Bearer`) | Update blog post title, slug, content, banner, tags |
| `DELETE` | `/api/v1/admin/blogs/:id` | Yes (`Bearer`) | Soft-delete article (or permanent with `?permanent=true`) |
| `GET` | `/api/v1/admin/blog-categories` | Yes (`Bearer`) | List all blog categories with article counts |
| `POST` | `/api/v1/admin/blog-categories` | Yes (`Bearer`) | Create new blog category |
| `PATCH` | `/api/v1/admin/blog-categories/:id` | Yes (`Bearer`) | Update blog category details |
| `DELETE` | `/api/v1/admin/blog-categories/:id` | Yes (`Bearer`) | Delete a blog category |

---

## Endpoint Specifications: Blogs

### 1. List Blog Posts

- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/admin/blogs`
- **Headers:** `Authorization: Bearer <accessToken>`

#### Query Parameters: `page`, `limit`, `search`, `categoryId`, `tag`, `isPublished`, `sort`

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "data": {
    "posts": [
      {
        "id": "blog-uuid-1",
        "title": "Top 10 Essential Nutrition Tips for Golden Retriever Puppies",
        "slug": "top-10-nutrition-tips-golden-retriever-puppies",
        "summary": "A comprehensive guide on protein intake and joint health.",
        "coverImage": "https://cdn.kickat.co.in/blogs/puppy-nutrition.png",
        "isPublished": true,
        "viewCount": 1420,
        "tags": ["puppy", "nutrition", "golden-retriever"],
        "authorName": "Dr. Sneha Rao (Veterinarian)",
        "publishedAt": "2026-08-20T10:00:00.000Z",
        "createdAt": "2026-08-18T09:00:00.000Z"
      }
    ],
    "pagination": { "total": 18, "page": 1, "limit": 10, "totalPages": 2 },
    "summary": { "total": 18, "published": 15, "drafts": 3 }
  }
}
```

---

### 2. Create Blog Article

- **HTTP Method:** `POST`
- **Endpoint:** `/api/v1/admin/blogs`
- **Headers:** `Authorization: Bearer <accessToken>`, `Content-Type: application/json`

#### Request Body
```json
{
  "title": "Monsoon Care: Protecting Your Dog from Skin Allergies",
  "slug": "monsoon-care-protecting-dog-skin-allergies",
  "content": "<h2>Keeping Paws Dry</h2><p>Fungal infections spike during humidity...</p>",
  "summary": "Essential tips for paw care and coat drying during the monsoon season.",
  "coverImage": "https://cdn.kickat.co.in/blogs/monsoon-paws.png",
  "categoryId": "cat-blog-uuid-1",
  "tags": ["monsoon", "health", "skin-care"],
  "isPublished": true,
  "authorName": "Kickat Care Team"
}
```

#### Expected Success Response (`201 Created`)
```json
{
  "success": true,
  "message": "Blog post created successfully",
  "data": {
    "id": "blog-new-uuid",
    "title": "Monsoon Care: Protecting Your Dog from Skin Allergies",
    "slug": "monsoon-care-protecting-dog-skin-allergies",
    "isPublished": true
  }
}
```

---

## Endpoint Specifications: Blog Categories

### 6. List Blog Categories

- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/admin/blog-categories`
- **Headers:** `Authorization: Bearer <accessToken>`

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "data": [
    {
      "id": "cat-blog-uuid-1",
      "name": "Pet Health & Wellness",
      "slug": "pet-health-wellness",
      "description": "Veterinary advice, nutrition tips, and grooming best practices.",
      "order": 1,
      "isActive": true,
      "_count": { "posts": 8 }
    }
  ]
}
```

---

## Frontend Integration Guide (TypeScript & Axios)

```typescript
// services/adminBlogService.ts
import axios from "axios";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.kickat.co.in/api/v1";

const blogApi = axios.create({
  baseURL: `${BASE_URL}/admin`,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

blogApi.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("admin_access_token");
    if (token && config.headers) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const AdminBlogService = {
  async getPosts(params?: any) {
    const res = await blogApi.get("/blogs", { params });
    return res.data;
  },

  async getPostById(id: string) {
    const res = await blogApi.get(`/blogs/${id}`);
    return res.data;
  },

  async createPost(payload: any) {
    const res = await blogApi.post("/blogs", payload);
    return res.data;
  },

  async updatePost(id: string, payload: any) {
    const res = await blogApi.patch(`/blogs/${id}`, payload);
    return res.data;
  },

  async deletePost(id: string, permanent: boolean = false) {
    const res = await blogApi.delete(`/blogs/${id}`, { params: { permanent: String(permanent) } });
    return res.data;
  },

  async getCategories(params?: any) {
    const res = await blogApi.get("/blog-categories", { params });
    return res.data;
  },

  async createCategory(payload: any) {
    const res = await blogApi.post("/blog-categories", payload);
    return res.data;
  },

  async updateCategory(id: string, payload: any) {
    const res = await blogApi.patch(`/blog-categories/${id}`, payload);
    return res.data;
  },

  async deleteCategory(id: string) {
    const res = await blogApi.delete(`/blog-categories/${id}`);
    return res.data;
  },
};
```
