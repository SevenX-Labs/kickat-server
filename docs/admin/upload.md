# Admin Media Uploads & File Management API Specification

All file upload endpoints are served under `/api/v1/admin/upload` and require Admin Authentication (`@AdminAuth()`).

---

## Table of Contents

1. [Architecture & Frontend Integration Overview](#architecture--frontend-integration-overview)
2. [Endpoints Overview](#endpoints-overview)
3. [File Constraints & Allowed MIME Types](#file-constraints--allowed-mime-types)
4. [Endpoint Specifications](#endpoint-specifications)
   - [1. Get Upload Configuration & Limits (`GET /api/v1/admin/upload/config`)](#1-get-upload-configuration--limits)
   - [2. Upload Single Image (`POST /api/v1/admin/upload`)](#2-upload-single-image)
   - [3. Upload Multiple Images (`POST /api/v1/admin/upload/multiple`)](#3-upload-multiple-images)
5. [Standard Error Response Format](#standard-error-response-format)
6. [Frontend Integration Guide (TypeScript & Axios)](#frontend-integration-guide-typescript--axios)

---

## Architecture & Frontend Integration Overview

- **Base URL:** `https://api.kickat.co.in/api/v1/admin/upload` (or `http://localhost:3000/api/v1/admin/upload` in development)
- **Content Type:** `multipart/form-data`
- **Authentication Scheme:** `Authorization: Bearer <accessToken>`
- **Storage Target:** Uploads target Supabase Storage (bucket `upload`) with automatic public CDN URL generation. In environments where Supabase credentials are not provided, it falls back seamlessly to local disk storage (`/uploads`).
- **File Size Policy:**
  - **Minimum Size:** 2 MB
  - **Maximum Size:** 5 MB
  - *(Can be customized via optional query parameters `?minSizeMb=1&maxSizeMb=10`)*

---

## Endpoints Overview

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/upload/config` | Yes (`Bearer`) | Get upload constraints, allowed MIME types, and active bucket |
| `POST` | `/api/v1/admin/upload` | Yes (`Bearer`) | Upload single image (`file` field, 2MB–5MB size constraint) |
| `POST` | `/api/v1/admin/upload/multiple` | Yes (`Bearer`) | Upload up to 10 images in batch (`files` field, 2MB–5MB per file) |

---

## File Constraints & Allowed MIME Types

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
- **Headers:** `Authorization: Bearer <accessToken>`

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "config": {
    "bucket": "upload",
    "minFileSizeMb": 2,
    "maxFileSizeMb": 5,
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
- **Endpoint:** `/api/v1/admin/upload`
- **Headers:**
  ```http
  Authorization: Bearer <accessToken>
  Content-Type: multipart/form-data
  ```
- **Form Data Field:** `file` (Binary image file, 2MB to 5MB)
- **Optional Query Parameters:** `minSizeMb`, `maxSizeMb`

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "message": "File uploaded successfully to Supabase Storage",
  "url": "https://mspqduxvrypexahkkxjz.supabase.co/storage/v1/object/public/upload/1725798000-puppy-food-a819b2.png",
  "filename": "1725798000-puppy-food-a819b2.png",
  "size": 2621440,
  "sizeMb": "2.50 MB",
  "mimetype": "image/png",
  "storageProvider": "supabase",
  "bucket": "upload"
}
```

#### Error Responses
- **`400 Bad Request`** (File too small or exceeds size limit):
  ```json
  {
    "success": false,
    "statusCode": 400,
    "message": "File size (1.20 MB) is smaller than the minimum required limit of 2 MB. Please upload an image between 2MB and 5MB.",
    "path": "/api/v1/admin/upload",
    "timestamp": "2026-09-08T11:55:00.000Z",
    "errors": []
  }
  ```

---

### 3. Upload Multiple Images

- **HTTP Method:** `POST`
- **Endpoint:** `/api/v1/admin/upload/multiple`
- **Headers:**
  ```http
  Authorization: Bearer <accessToken>
  Content-Type: multipart/form-data
  ```
- **Form Data Field:** `files` (Array of binary image files, max 10 files)

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "total": 2,
  "files": [
    {
      "success": true,
      "message": "File uploaded successfully to Supabase Storage",
      "url": "https://mspqduxvrypexahkkxjz.supabase.co/storage/v1/object/public/upload/1725798000-img1.png",
      "filename": "1725798000-img1.png",
      "size": 2621440,
      "sizeMb": "2.50 MB",
      "mimetype": "image/png",
      "storageProvider": "supabase"
    },
    {
      "success": true,
      "message": "File uploaded successfully to Supabase Storage",
      "url": "https://mspqduxvrypexahkkxjz.supabase.co/storage/v1/object/public/upload/1725798000-img2.png",
      "filename": "1725798000-img2.png",
      "size": 3145728,
      "sizeMb": "3.00 MB",
      "mimetype": "image/png",
      "storageProvider": "supabase"
    }
  ]
}
```

---

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
  async getConfig() {
    const res = await uploadApi.get("/config");
    return res.data;
  },

  async uploadSingle(file: File, options?: { minSizeMb?: number; maxSizeMb?: number }) {
    const formData = new FormData();
    formData.append("file", file);

    const res = await uploadApi.post("", formData, {
      params: options,
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data;
  },

  async uploadMultiple(files: File[], options?: { minSizeMb?: number; maxSizeMb?: number }) {
    const formData = new FormData();
    files.forEach((f) => formData.append("files", f));

    const res = await uploadApi.post("/multiple", formData, {
      params: options,
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data;
  },
};
```
