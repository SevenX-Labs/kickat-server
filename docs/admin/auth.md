# Admin Authentication API Specification

All admin authentication endpoints are served under `/api/v1/admin/auth`.

---

## Endpoints Overview

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/admin/auth/login` | No | Admin login with email & password |
| `POST` | `/api/v1/admin/auth/forgot-password` | No | Request password reset OTP |
| `POST` | `/api/v1/admin/auth/verify-reset-otp` | No | Verify password reset OTP |
| `POST` | `/api/v1/admin/auth/reset-password` | No | Reset admin password |
| `POST` | `/api/v1/admin/auth/change-password` | Yes | Change logged-in admin password |
| `POST` | `/api/v1/admin/auth/logout` | Yes | Logout active admin session |
| `GET` | `/api/v1/admin/auth/me` | Yes | Get current logged-in admin details |
| `GET` | `/api/v1/admin/auth/sessions` | Yes | Get active admin login sessions |
| `DELETE` | `/api/v1/admin/auth/sessions/:sessionId` | Yes | Revoke specific active admin session |
