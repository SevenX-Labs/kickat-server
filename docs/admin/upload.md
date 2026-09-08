# Admin Media Uploads & File Management API Specification

All file upload endpoints are served under `/api/v1/admin/upload` and require Admin Authentication (`@AdminAuth()`).

---

## Table of Contents

1. [Architecture & Overview](#architecture--overview)
2. [Upload Size Policies](#upload-size-policies)
3. [Endpoints Overview](#endpoints-overview)
4. [Allowed MIME Types](#allowed-mime-types)
5. [Endpoint Specifications](#endpoint-specifications)
   - [1. Get Upload Configuration & Limits (`GET /api/v1/admin/upload/config`)](#1-get-upload-configuration--limits)
   - [2. Upload Single Image (`POST /api/v1/admin/upload` or `/admin/upload/product`)](#2-upload-single-image)
   - [3. Upload Multiple Images (`POST /api/v1/admin/upload/multiple` or `/admin/upload/multiple/product`)](#3-upload-multiple-images)
6. [Standard Error Response Format](#standard-error-response-format)
7. [Frontend Integration Guide (TypeScript & Axios)](#frontend-integration-guide-typescript--axios)

---

## Architecture & Overview

- **Base URL:** `https://api.kickat.co.in/api/v1/admin/upload` (or `http://localhost:3000/api/v1/admin/upload` in development)
- **Content Type:** `multipart/form-data`
- **Authentication Scheme:** `Authorization: Bearer <accessToken>`
- **Storage Target:** Uploads target Supabase Storage (bucket `upload`) with automatic public CDN URL generation. In environments where Supabase credentials are not provided, it falls back seamlessly to local disk storage (`/uploads`).

---

## Upload Size Policies

The backend enforces strict context-aware image size limits:

| Category / Context | Type Parameter | Minimum Size | Maximum Size | Description |
| :--- | :--- | :--- | :--- | :--- |
| **Product Images** | `type=product` | **2 MB** | **3 MB** | High-resolution ecommerce gallery images for products |
| **All Other Images** | `type=category`, `type=blog`, default | **0 MB** (none) | **4 MB** | Category icons, hero banners, blog covers, avatars |

> [!NOTE]
> Custom limits can still be explicitly requested via query parameters `?minSizeMb=<min>&maxSizeMb=<max>` if needed.

---

## Endpoints Overview

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/upload/config` | Yes (`Bearer`) | Get upload constraints, active bucket, and size policies |
| `POST` | `/api/v1/admin/upload` | Yes (`Bearer`) | Upload single image (`file` field, context-aware or defaults to max 4MB) |
| `POST` | `/api/v1/admin/upload/product` | Yes (`Bearer`) | Upload product image (Stored in `products/`, enforces 2MB–3MB) |
| `POST` | `/api/v1/admin/upload/category` | Yes (`Bearer`) | Upload category image (Stored in `categories/`, max 4MB) |
| `POST` | `/api/v1/admin/upload/blog` | Yes (`Bearer`) | Upload blog image (Stored in `blogs/`, max 4MB) |
| `POST` | `/api/v1/admin/upload/multiple` | Yes (`Bearer`) | Batch upload up to 10 images (`files` field, defaults to max 4MB) |
| `POST` | `/api/v1/admin/upload/multiple/product` | Yes (`Bearer`) | Batch upload up to 10 product images (Enforces 2MB min, 3MB max per file) |
| `DELETE` | `/api/v1/admin/upload` | Yes (`Bearer`) | Delete uploaded image file(s) from Supabase or local storage |
| `POST` | `/api/v1/admin/upload/delete` | Yes (`Bearer`) | POST alternative to delete uploaded image file(s) by URL |

---

## Allowed MIME Types

- `image/jpeg`
- `image/jpg`
- `image/png`
- `image/webp`
- `image/gif`
- `image/svg+xml`

---

## Endpoint Specifications

### 1. Get Upload Configuration & Limits

- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/admin/upload/config`
- **Query Parameters:** `type` (optional, e.g. `product`, `category`, `blog`)
- **Headers:** `Authorization: Bearer <accessToken>`

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "config": {
    "bucket": "upload",
    "current": {
      "context": "product",
      "minFileSizeMb": 2,
      "maxFileSizeMb": 3
    },
    "product": {
      "minFileSizeMb": 2,
      "maxFileSizeMb": 3,
      "description": "Product images must be between 2MB and 3MB"
    },
    "allElse": {
      "minFileSizeMb": 0,
      "maxFileSizeMb": 4,
      "description": "All other images (categories, blogs, avatars, etc.) allow up to 4MB"
    },
    "minFileSizeMb": 2,
    "maxFileSizeMb": 3,
    "allowedMimeTypes": [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "image/gif",
      "image/svg+xml"
    ],
    "supabaseConnected": true
  }
}
```

---

### 2. Upload Single Image

- **HTTP Method:** `POST`
- **Endpoint:** `/api/v1/admin/upload` (or `/api/v1/admin/upload/product`)
- **Headers:**
  ```http
  Authorization: Bearer <accessToken>
  Content-Type: multipart/form-data
  ```
- **Form Data Field:** `file` (Binary image file)
- **Optional Query Parameters:**
  - `type`: `'product'` (2MB min, 3MB max) or `'category'` / `'blog'` / `'general'` (max 4MB)
  - `minSizeMb`: Explicit minimum override in MB
  - `maxSizeMb`: Explicit maximum override in MB

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "message": "File uploaded successfully to Supabase Storage",
  "url": "https://mspqduxvrypexahkkxjz.supabase.co/storage/v1/object/public/upload/product/1725798000-puppy-food-a819b2.png",
  "filename": "product/1725798000-puppy-food-a819b2.png",
  "size": 2621440,
  "sizeMb": "2.50 MB",
  "mimetype": "image/png",
  "storageProvider": "supabase",
  "bucket": "upload"
}
```

#### Error Responses
- **`400 Bad Request` — Product file too small (< 2 MB):**
  ```json
  {
    "success": false,
    "statusCode": 400,
    "message": "File size (1.20 MB) is smaller than the minimum required limit of 2 MB for product images. Please upload an image between 2MB and 3MB.",
    "path": "/api/v1/admin/upload",
    "timestamp": "2026-09-08T16:00:00.000Z"
  }
  ```

- **`400 Bad Request` — Product file too large (> 3 MB):**
  ```json
  {
    "success": false,
    "statusCode": 400,
    "message": "File size (3.50 MB) exceeds the maximum allowed limit of 3 MB for product images. Please upload an image between 2MB and 3MB.",
    "path": "/api/v1/admin/upload",
    "timestamp": "2026-09-08T16:00:00.000Z"
  }
  ```

- **`400 Bad Request` — General image too large (> 4 MB):**
  ```json
  {
    "success": false,
    "statusCode": 400,
    "message": "File size (4.80 MB) exceeds the maximum allowed limit of 4 MB. Please upload an image up to 4MB.",
    "path": "/api/v1/admin/upload",
    "timestamp": "2026-09-08T16:00:00.000Z"
  }
  ```

---

### 3. Upload Multiple Images

- **HTTP Method:** `POST`
- **Endpoint:** `/api/v1/admin/upload/multiple` (or `/api/v1/admin/upload/multiple/product`)
- **Headers:**
  ```http
  Authorization: Bearer <accessToken>
  Content-Type: multipart/form-data
  ```
- **Form Data Field:** `files` (Array of binary image files, up to 10 files)
- **Optional Query Parameters:** `type`, `minSizeMb`, `maxSizeMb`

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "total": 2,
  "files": [
    {
      "success": true,
      "message": "File uploaded successfully to Supabase Storage",
      "url": "https://mspqduxvrypexahkkxjz.supabase.co/storage/v1/object/public/upload/product/1725798000-img1.png",
      "filename": "product/1725798000-img1.png",
      "size": 2621440,
      "sizeMb": "2.50 MB",
      "mimetype": "image/png",
      "storageProvider": "supabase"
    },
    {
      "success": true,
      "message": "File uploaded successfully to Supabase Storage",
      "url": "https://mspqduxvrypexahkkxjz.supabase.co/storage/v1/object/public/upload/product/1725798000-img2.png",
      "filename": "product/1725798000-img2.png",
      "size": 2883584,
      "sizeMb": "2.75 MB",
      "mimetype": "image/png",
      "storageProvider": "supabase"
    }
  ]
}
```

---


---

### 4. Delete Uploaded Image File(s)

Deletes uploaded image files from Supabase Storage (bucket `upload`) or local disk. Used when an admin removes an image from a draft or when standalone image removal is needed.

- **HTTP Method:** `DELETE` (or `POST /api/v1/admin/upload/delete`)
- **Endpoint:** `/api/v1/admin/upload`
- **Headers:** `Authorization: Bearer <accessToken>`
- **Optional Query Parameter:** `url` (Single URL)
- **Request Body (Optional / JSON):**
  ```json
  {
    "url": "https://mspqduxvrypexahkkxjz.supabase.co/storage/v1/object/public/upload/product/1725798000-img1.png",
    "urls": [
      "https://mspqduxvrypexahkkxjz.supabase.co/storage/v1/object/public/upload/product/1725798000-img2.png"
    ]
  }
  ```

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "message": "Successfully deleted 2 file(s) from storage",
  "deletedCount": 2
}
```

## Frontend Integration Guide (TypeScript & Axios)

```typescript
// services/adminUploadService.ts
import axios from "axios";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.kickat.co.in/api/v1";

const uploadApi = axios.create({
  baseURL: `${BASE_URL}/admin/upload`,
  withCredentials: true,
});

uploadApi.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("admin_access_token");
    if (token && config.headers) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const AdminUploadService = {
  async getConfig(type?: "product" | "category" | "blog" | "general") {
    const res = await uploadApi.get("/config", { params: { type } });
    return res.data;
  },

  /**
   * Upload Product Image (Enforces 2MB min, 3MB max)
   */
  async uploadProductImage(file: File) {
    const formData = new FormData();
    formData.append("file", file);

    const res = await uploadApi.post("/product", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data;
  },

  /**
   * Upload General Image (Category, Blog, Avatar, etc. - max 4MB)
   */
  async uploadGeneralImage(file: File, type: "category" | "blog" | "general" = "general") {
    const formData = new FormData();
    formData.append("file", file);

    const res = await uploadApi.post("", formData, {
      params: { type },
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data;
  },

  /**
   * Batch Upload Product Images (Enforces 2MB min, 3MB max per file)
   */
  async uploadMultipleProductImages(files: File[]) {
    const formData = new FormData();
    files.forEach((f) => formData.append("files", f));

    const res = await uploadApi.post("/multiple/product", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data;
  },

  /**
   * Delete uploaded file(s) by URL
   */
  async deleteFile(url: string) {
    const res = await uploadApi.delete("", { data: { url } });
    return res.data;
  },

  async deleteFiles(urls: string[]) {
    const res = await uploadApi.delete("", { data: { urls } });
    return res.data;
  },
};
```
