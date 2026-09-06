# Admin Uploads API Specification

All media and file upload endpoints are served under `/api/v1/admin/upload` with `@AdminAuth()`.

---

## Endpoints Overview

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/upload/config` | Yes | Get upload configuration, allowed MIME types, and file size constraints |
| `POST` | `/api/v1/admin/upload` | Yes | Upload single image file (multipart/form-data, size constraint: 2MB to 5MB) |
| `POST` | `/api/v1/admin/upload/multiple` | Yes | Upload multiple image files (multipart/form-data, max 10 files, 2MB to 5MB each) |
