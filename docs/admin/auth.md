# Admin Authentication API Specification

All admin authentication endpoints are served under `/api/v1/admin/auth`.

---

## Table of Contents

1. [Architecture & Frontend Integration Overview](#architecture--frontend-integration-overview)
2. [Endpoints Overview](#endpoints-overview)
3. [Endpoint Specifications](#endpoint-specifications)
   - [1. Admin Login](#1-admin-login)
   - [2. Forgot Password (Request OTP)](#2-forgot-password-request-otp)
   - [3. Verify Reset OTP](#3-verify-reset-otp)
   - [4. Reset Password](#4-reset-password)
   - [5. Change Password (Authenticated)](#5-change-password-authenticated)
   - [6. Admin Logout](#6-admin-logout)
   - [7. Get Current Admin Profile (/me)](#7-get-current-admin-profile-me)
   - [8. List Active Sessions](#8-list-active-sessions)
   - [9. Revoke Active Session](#9-revoke-active-session)
4. [Standard Error Response Format](#standard-error-response-format)
5. [Frontend Integration Guide (TypeScript & Axios)](#frontend-integration-guide-typescript--axios)
   - [TypeScript Types & Interfaces](#typescript-types--interfaces)
   - [Production-Ready Axios Client & API Service](#production-ready-axios-client--api-service)
   - [Complete Auth State & UI Workflows](#complete-auth-state--ui-workflows)

---

## Architecture & Frontend Integration Overview

- **Base URL:** `https://api.kickat.co.in/api/v1/admin/auth` (or your staging/production API domain + `/api/v1/admin/auth`)
- **Content Type:** `application/json`
- **Authentication Scheme:** Standard HTTP Bearer token via `Authorization: Bearer <accessToken>` header.
- **Token Lifetimes:**
  - **Access Token (`accessToken`):** 24 hours (`1d`). Contains admin UUID (`sub`), `adminId`, `email`, `role`, and `type: "admin"`.
  - **Refresh Token (`refreshToken`):** 7 days (`7d`). Stored and hashed in the database (`admin_sessions` table).
  - **Reset Token (`resetToken`):** 10 minutes. Single-use UUID v4 issued after successful OTP verification.
- **CORS Support:** Full credentials support (`credentials: true`), configured for `localhost:3000`, `localhost:5173`, `localhost:8080`, and production admin domains.
- **Rate Limits & Protection:**
  - **Forgot Password OTP:** Maximum **3 requests per hour** per `adminId`.
  - **OTP Verification:** Maximum **5 verification attempts per hour** per `adminId`.
  - **Passwords:** Minimum 8 characters, at least 1 uppercase letter, 1 number, and 1 special character.

---

## Endpoints Overview

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/admin/auth/login` | No (Public) | Admin login with `adminId` and `password` |
| `POST` | `/api/v1/admin/auth/forgot-password` | No (Public) | Send 6-digit password reset OTP to admin registered email |
| `POST` | `/api/v1/admin/auth/verify-reset-otp` | No (Public) | Verify 6-digit OTP and obtain temporary `resetToken` |
| `POST` | `/api/v1/admin/auth/reset-password` | No (Public) | Reset admin password using verified `resetToken` |
| `POST` | `/api/v1/admin/auth/change-password` | Yes (`Bearer`) | Change current password while logged in |
| `POST` | `/api/v1/admin/auth/logout` | Yes (`Bearer`) | Invalidate refresh token and revoke active session |
| `GET` | `/api/v1/admin/auth/me` | Yes (`Bearer`) | Retrieve profile details of authenticated admin |
| `GET` | `/api/v1/admin/auth/sessions` | Yes (`Bearer`) | List active login sessions and devices |
| `DELETE` | `/api/v1/admin/auth/sessions/:sessionId` | Yes (`Bearer`) | Revoke a specific active login session by ID |

---

## Endpoint Specifications

### 1. Admin Login

Authenticates admin credentials, creates a tracking session in the database with client IP and User-Agent, and returns access and refresh JWT tokens along with admin profile details.

- **HTTP Method:** `POST`
- **Endpoint:** `/api/v1/admin/auth/login`
- **Authentication:** None (Public)
- **Headers:**
  ```http
  Content-Type: application/json
  ```

#### Request Body
| Field | Type | Required | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `adminId` | `string` | **Yes** | Alphanumeric (`^[a-zA-Z0-9]{4,20}$`), 4 to 20 chars | Unique admin identifier (e.g. `kickat2021`) |
| `password` | `string` | **Yes** | Minimum 8 characters | Admin account password |

**Request Body Example:**
```json
{
  "adminId": "kickat2021",
  "password": "yourPassword123"
}
```

#### Expected Success Response (`201 Created` / `200 OK`)
```json
{
  "success": true,
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjNmE4MzYxNi01NjNiLTQ4NjktOTA2ZC1lNGJjZmRmZWMyNzUiLCJhZG1pbklkIjoia2lja2F0MjAyMSIsImVtYWlsIjoia2lja2F0MjAyMUBnbWFpbC5jb20iLCJyb2xlIjoiU1VQRVJfQURNSU4iLCJ0eXBlIjoiYWRtaW4iLCJpYXQiOjE3MjU3OTgwMDAsImV4cCI6MTcyNTg4NDQwMH0...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjNmE4MzYxNi01NjNiLTQ4NjktOTA2ZC1lNGJjZmRmZWMyNzUiLCJhZG1pbklkIjoia2lja2F0MjAyMSIsImVtYWlsIjoia2lja2F0MjAyMUBnbWFpbC5jb20iLCJyb2xlIjoiU1VQRVJfQURNSU4iLCJ0eXBlIjoiYWRtaW4iLCJpYXQiOjE3MjU3OTgwMDAsImV4cCI6MTcyNjQwMjgwMH0...",
  "admin": {
    "id": "c6a83616-563b-4869-906d-e4bcfdfec275",
    "adminId": "kickat2021",
    "name": "Super Admin",
    "email": "kickat2021@gmail.com",
    "role": "SUPER_ADMIN",
    "permissions": [
      "ALL"
    ]
  }
}
```

#### Error Responses
- **`400 Bad Request`** (Validation failure):
  ```json
  {
    "success": false,
    "statusCode": 400,
    "message": "adminId must be alphanumeric and between 4 and 20 characters",
    "path": "/api/v1/admin/auth/login",
    "timestamp": "2026-09-08T10:30:00.000Z",
    "errors": [
      "adminId must be alphanumeric and between 4 and 20 characters"
    ]
  }
  ```
- **`401 Unauthorized`** (Invalid adminId or password):
  ```json
  {
    "success": false,
    "statusCode": 401,
    "message": "Wrong credentials",
    "path": "/api/v1/admin/auth/login",
    "timestamp": "2026-09-08T10:30:00.000Z",
    "errors": []
  }
  ```
- **`403 Forbidden`** (Account inactive or blocked):
  ```json
  {
    "success": false,
    "statusCode": 403,
    "message": "Account is blocked or inactive",
    "path": "/api/v1/admin/auth/login",
    "timestamp": "2026-09-08T10:30:00.000Z",
    "errors": []
  }
  ```

---

### 2. Forgot Password (Request OTP)

Initiates password recovery. Sends a 6-digit numeric OTP to the registered email linked to the `adminId`. The OTP is valid for 10 minutes.

- **HTTP Method:** `POST`
- **Endpoint:** `/api/v1/admin/auth/forgot-password`
- **Authentication:** None (Public)
- **Headers:**
  ```http
  Content-Type: application/json
  ```

#### Request Body
| Field | Type | Required | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `adminId` | `string` | **Yes** | Alphanumeric (`^[a-zA-Z0-9]{4,20}$`), 4 to 20 chars | Unique admin identifier |

**Request Body Example:**
```json
{
  "adminId": "kickat2021"
}
```

#### Expected Success Response (`201 Created` / `200 OK`)
```json
{
  "success": true,
  "message": "OTP sent successfully to email linked to adminId kickat2021"
}
```

#### Error Responses
- **`404 Not Found`** (Admin ID not registered):
  ```json
  {
    "success": false,
    "statusCode": 404,
    "message": "adminId not found",
    "path": "/api/v1/admin/auth/forgot-password",
    "timestamp": "2026-09-08T10:30:00.000Z",
    "errors": []
  }
  ```
- **`429 Too Many Requests`** (Rate limit exceeded: > 3 per hour):
  ```json
  {
    "success": false,
    "statusCode": 429,
    "message": "Rate limit exceeded — max 3 per hour per adminId",
    "path": "/api/v1/admin/auth/forgot-password",
    "timestamp": "2026-09-08T10:30:00.000Z",
    "errors": []
  }
  ```

---

### 3. Verify Reset OTP

Verifies the 6-digit OTP received via email. On success, generates a single-use UUID `resetToken` valid for 10 minutes. The frontend must store this `resetToken` and send it to `/reset-password`.

- **HTTP Method:** `POST`
- **Endpoint:** `/api/v1/admin/auth/verify-reset-otp`
- **Authentication:** None (Public)
- **Headers:**
  ```http
  Content-Type: application/json
  ```

#### Request Body
| Field | Type | Required | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `adminId` | `string` | **Yes** | Alphanumeric (`^[a-zA-Z0-9]{4,20}$`), 4 to 20 chars | Unique admin identifier |
| `otp` | `string` | **Yes** | Exactly 6 numeric digits (`^\d{6}$`) | 6-digit OTP code received via email |

**Request Body Example:**
```json
{
  "adminId": "kickat2021",
  "otp": "492815"
}
```

#### Expected Success Response (`201 Created` / `200 OK`)
```json
{
  "success": true,
  "resetToken": "e5b8d2cf-247b-4ad0-b852-c36b69fa03b1",
  "expiresAt": "2026-09-08T10:45:00.000Z"
}
```

#### Error Responses
- **`400 Bad Request`** (Invalid OTP format, e.g. non-numeric or not 6 digits):
  ```json
  {
    "success": false,
    "statusCode": 400,
    "message": "otp must be exactly 6 digits",
    "path": "/api/v1/admin/auth/verify-reset-otp",
    "timestamp": "2026-09-08T10:30:00.000Z",
    "errors": ["otp must be exactly 6 digits"]
  }
  ```
- **`401 Unauthorized`** (Wrong or expired OTP):
  ```json
  {
    "success": false,
    "statusCode": 401,
    "message": "Wrong or expired OTP",
    "path": "/api/v1/admin/auth/verify-reset-otp",
    "timestamp": "2026-09-08T10:30:00.000Z",
    "errors": []
  }
  ```
- **`429 Too Many Requests`** (Max 5 attempts exceeded per hour):
  ```json
  {
    "success": false,
    "statusCode": 429,
    "message": "Too many attempts — max 5 per hour",
    "path": "/api/v1/admin/auth/verify-reset-otp",
    "timestamp": "2026-09-08T10:30:00.000Z",
    "errors": []
  }
  ```

---

### 4. Reset Password

Resets the admin account password using the verified `resetToken` received from `/verify-reset-otp`.

- **HTTP Method:** `POST`
- **Endpoint:** `/api/v1/admin/auth/reset-password`
- **Authentication:** None (Public)
- **Headers:**
  ```http
  Content-Type: application/json
  ```

#### Request Body
| Field | Type | Required | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `resetToken` | `string` | **Yes** | Valid UUID v4 | Token returned from `/verify-reset-otp` |
| `newPassword` | `string` | **Yes** | Min 8 chars, 1 uppercase, 1 number, 1 special char | New strong password |
| `confirmPassword` | `string` | **Yes** | Must match `newPassword` | Password confirmation |

> **Password Complexity Rule:**  
> `/^(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/`  
> Minimum 8 characters, at least 1 uppercase letter, 1 number, and 1 special character.

**Request Body Example:**
```json
{
  "resetToken": "e5b8d2cf-247b-4ad0-b852-c36b69fa03b1",
  "newPassword": "NewAdminPassword@2026",
  "confirmPassword": "NewAdminPassword@2026"
}
```

#### Expected Success Response (`201 Created` / `200 OK`)
```json
{
  "success": true,
  "message": "Password updated successfully"
}
```

#### Error Responses
- **`400 Bad Request`** (Passwords do not match or fail complexity rule):
  ```json
  {
    "success": false,
    "statusCode": 400,
    "message": "passwords do not match",
    "path": "/api/v1/admin/auth/reset-password",
    "timestamp": "2026-09-08T10:30:00.000Z",
    "errors": []
  }
  ```
- **`401 Unauthorized`** (Invalid or expired reset token):
  ```json
  {
    "success": false,
    "statusCode": 401,
    "message": "invalid or expired resetToken",
    "path": "/api/v1/admin/auth/reset-password",
    "timestamp": "2026-09-08T10:30:00.000Z",
    "errors": []
  }
  ```
- **`410 Gone`** (Token was already consumed):
  ```json
  {
    "success": false,
    "statusCode": 410,
    "message": "token already used",
    "path": "/api/v1/admin/auth/reset-password",
    "timestamp": "2026-09-08T10:30:00.000Z",
    "errors": []
  }
  ```

---

### 5. Change Password (Authenticated)

Enables an authenticated admin to change their password from the admin settings / profile area. Requires verifying the current existing password.

- **HTTP Method:** `POST`
- **Endpoint:** `/api/v1/admin/auth/change-password`
- **Authentication:** Admin Auth (`Bearer <accessToken>`)
- **Headers:**
  ```http
  Authorization: Bearer <accessToken>
  Content-Type: application/json
  ```

#### Request Body
| Field | Type | Required | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `currentPassword` | `string` | **Yes** | String | Admin's current existing password |
| `newPassword` | `string` | **Yes** | Min 8 chars, 1 uppercase, 1 number, 1 special char | New strong password (cannot match current) |
| `confirmPassword` | `string` | **Yes** | Must match `newPassword` | New password confirmation |

**Request Body Example:**
```json
{
  "currentPassword": "CurrentPassword@2026",
  "newPassword": "NewAdminPassword@2026",
  "confirmPassword": "NewAdminPassword@2026"
}
```

#### Expected Success Response (`201 Created` / `200 OK`)
```json
{
  "success": true,
  "message": "Password changed successfully"
}
```

#### Error Responses
- **`400 Bad Request`** (Passwords do not match or new password is same as current):
  ```json
  {
    "success": false,
    "statusCode": 400,
    "message": "New password must be different from current password",
    "path": "/api/v1/admin/auth/change-password",
    "timestamp": "2026-09-08T10:30:00.000Z",
    "errors": []
  }
  ```
- **`401 Unauthorized`** (Current password incorrect or Bearer token missing/invalid):
  ```json
  {
    "success": false,
    "statusCode": 401,
    "message": "wrong current password",
    "path": "/api/v1/admin/auth/change-password",
    "timestamp": "2026-09-08T10:30:00.000Z",
    "errors": []
  }
  ```

---

### 6. Admin Logout

Terminates the admin's active session in the database and revokes the refresh token.

- **HTTP Method:** `POST`
- **Endpoint:** `/api/v1/admin/auth/logout`
- **Authentication:** Admin Auth (`Bearer <accessToken>`)
- **Headers:**
  ```http
  Authorization: Bearer <accessToken>
  Content-Type: application/json
  ```

#### Request Body
| Field | Type | Required | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `refreshToken` | `string` | **Yes** | String (JWT token) | The refresh token issued upon login |

**Request Body Example:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### Expected Success Response (`201 Created` / `200 OK`)
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

#### Error Responses
- **`401 Unauthorized`** (Invalid or expired access token):
  ```json
  {
    "success": false,
    "statusCode": 401,
    "message": "Unauthorized access",
    "path": "/api/v1/admin/auth/logout",
    "timestamp": "2026-09-08T10:30:00.000Z",
    "errors": []
  }
  ```

---

### 7. Get Current Admin Profile (/me)

Fetches account details, roles, and granular permissions for the currently authenticated admin.

- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/admin/auth/me`
- **Authentication:** Admin Auth (`Bearer <accessToken>`)
- **Headers:**
  ```http
  Authorization: Bearer <accessToken>
  ```

#### Request Body: None

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "admin": {
    "id": "c6a83616-563b-4869-906d-e4bcfdfec275",
    "adminId": "kickat2021",
    "name": "Super Admin",
    "email": "kickat2021@gmail.com",
    "role": "SUPER_ADMIN",
    "permissions": [
      "ALL"
    ]
  }
}
```

#### Error Responses
- **`401 Unauthorized`** (Missing or expired Bearer token):
  ```json
  {
    "success": false,
    "statusCode": 401,
    "message": "Unauthorized access",
    "path": "/api/v1/admin/auth/me",
    "timestamp": "2026-09-08T10:30:00.000Z",
    "errors": []
  }
  ```

---

### 8. List Active Sessions

Returns all active, non-revoked sessions for the authenticated admin along with IP address and User-Agent metadata.

- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/admin/auth/sessions`
- **Authentication:** Admin Auth (`Bearer <accessToken>`)
- **Headers:**
  ```http
  Authorization: Bearer <accessToken>
  ```

#### Request Body: None

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "sessions": [
    {
      "id": "9d8e57fc-e82b-4221-a3f8-80f074a3f124",
      "ipAddress": "127.0.0.1",
      "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "createdAt": "2026-09-08T10:15:00.000Z",
      "expiresAt": "2026-09-15T10:15:00.000Z"
    }
  ]
}
```

---

### 9. Revoke Active Session

Revokes an active session by its UUID. The backend prevents self-revocation (an admin cannot revoke the session associated with the active Bearer token).

- **HTTP Method:** `DELETE`
- **Endpoint:** `/api/v1/admin/auth/sessions/:sessionId`
- **Authentication:** Admin Auth (`Bearer <accessToken>`)
- **Headers:**
  ```http
  Authorization: Bearer <accessToken>
  ```

#### URL Parameters
| Parameter | Type | Required | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `sessionId` | `string` | **Yes** | Valid UUID v4 | Session ID to revoke |

#### Example Request URL
```http
DELETE /api/v1/admin/auth/sessions/9d8e57fc-e82b-4221-a3f8-80f074a3f124
```

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "message": "Session terminated successfully"
}
```

#### Error Responses
- **`400 Bad Request`** (`sessionId` is not a valid UUID):
  ```json
  {
    "success": false,
    "statusCode": 400,
    "message": "sessionId must be a valid UUID v4",
    "path": "/api/v1/admin/auth/sessions/invalid-id",
    "timestamp": "2026-09-08T10:30:00.000Z",
    "errors": ["sessionId must be a valid UUID v4"]
  }
  ```
- **`404 Not Found`** (Session not found or belongs to another admin):
  ```json
  {
    "success": false,
    "statusCode": 404,
    "message": "session not found",
    "path": "/api/v1/admin/auth/sessions/9d8e57fc-e82b-4221-a3f8-80f074a3f124",
    "timestamp": "2026-09-08T10:30:00.000Z",
    "errors": []
  }
  ```
- **`409 Conflict`** (Cannot revoke the current session being used):
  ```json
  {
    "success": false,
    "statusCode": 409,
    "message": "cannot delete current active session",
    "path": "/api/v1/admin/auth/sessions/9d8e57fc-e82b-4221-a3f8-80f074a3f124",
    "timestamp": "2026-09-08T10:30:00.000Z",
    "errors": []
  }
  ```

---

## Standard Error Response Format

All API errors adhere to this standard structure from the NestJS global `AllExceptionsFilter`:

```typescript
interface ApiErrorResponse {
  success: false;
  statusCode: number;      // HTTP Status Code (400, 401, 403, 404, 409, 429, 500)
  message: string;         // Human-readable primary error message
  path: string;            // The request URL path
  timestamp: string;       // ISO 8601 date string
  errors: string[];        // Detailed validation error list (empty if non-validation error)
}
```

---

## Frontend Integration Guide (TypeScript & Axios)

Use this complete integration setup to connect your admin frontend (React, Next.js, Vue, Vite, etc.) to the Kickat server.

### TypeScript Types & Interfaces

```typescript
// types/admin-auth.ts

export interface AdminUser {
  id: string;
  adminId: string;
  name: string;
  email: string;
  role: string;
  permissions: string[];
}

export interface AdminLoginPayload {
  adminId: string;
  password: string;
}

export interface AdminLoginResponse {
  success: boolean;
  accessToken: string;
  refreshToken: string;
  admin: AdminUser;
}

export interface AdminForgotPasswordPayload {
  adminId: string;
}

export interface AdminVerifyOtpPayload {
  adminId: string;
  otp: string;
}

export interface AdminVerifyOtpResponse {
  success: boolean;
  resetToken: string;
  expiresAt: string;
}

export interface AdminResetPasswordPayload {
  resetToken: string;
  newPassword: string;
  confirmPassword: string;
}

export interface AdminChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface AdminLogoutPayload {
  refreshToken: string;
}

export interface AdminSessionItem {
  id: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
  expiresAt: string;
}

export interface AdminSessionsResponse {
  success: boolean;
  sessions: AdminSessionItem[];
}

export interface AdminBaseResponse {
  success: boolean;
  message: string;
}

export interface ApiErrorResponse {
  success: false;
  statusCode: number;
  message: string;
  path: string;
  timestamp: string;
  errors: string[];
}
```

---

### Production-Ready Axios Client & API Service

```typescript
// services/adminAuthService.ts
import axios, { AxiosError } from "axios";
import {
  AdminLoginPayload,
  AdminLoginResponse,
  AdminForgotPasswordPayload,
  AdminVerifyOtpPayload,
  AdminVerifyOtpResponse,
  AdminResetPasswordPayload,
  AdminChangePasswordPayload,
  AdminSessionsResponse,
  AdminBaseResponse,
  AdminUser,
} from "../types/admin-auth";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.kickat.co.in/api/v1";

export const adminApiClient = axios.create({
  baseURL: `${BASE_URL}/admin/auth`,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
});

// Request Interceptor: Attach Access Token to all outgoing requests
adminApiClient.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("admin_access_token");
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Response Interceptor: Automatically handle 401 Unauthorized (session expiry)
adminApiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      // Clear local storage and redirect to login if session is expired
      localStorage.removeItem("admin_access_token");
      localStorage.removeItem("admin_refresh_token");
      localStorage.removeItem("admin_profile");
      if (!window.location.pathname.includes("/admin/login")) {
        window.location.href = "/admin/login?session_expired=true";
      }
    }
    return Promise.reject(error);
  }
);

export const AdminAuthService = {
  /**
   * 1. Admin Login
   */
  async login(payload: AdminLoginPayload): Promise<AdminLoginResponse> {
    const res = await adminApiClient.post<AdminLoginResponse>("/login", payload);
    const { accessToken, refreshToken, admin } = res.data;

    if (typeof window !== "undefined") {
      localStorage.setItem("admin_access_token", accessToken);
      localStorage.setItem("admin_refresh_token", refreshToken);
      localStorage.setItem("admin_profile", JSON.stringify(admin));
    }

    return res.data;
  },

  /**
   * 2. Request Forgot Password OTP
   */
  async forgotPassword(payload: AdminForgotPasswordPayload): Promise<AdminBaseResponse> {
    const res = await adminApiClient.post<AdminBaseResponse>("/forgot-password", payload);
    return res.data;
  },

  /**
   * 3. Verify OTP and obtain resetToken
   */
  async verifyResetOtp(payload: AdminVerifyOtpPayload): Promise<AdminVerifyOtpResponse> {
    const res = await adminApiClient.post<AdminVerifyOtpResponse>("/verify-reset-otp", payload);
    return res.data;
  },

  /**
   * 4. Reset Password using resetToken
   */
  async resetPassword(payload: AdminResetPasswordPayload): Promise<AdminBaseResponse> {
    const res = await adminApiClient.post<AdminBaseResponse>("/reset-password", payload);
    return res.data;
  },

  /**
   * 5. Change Password (Authenticated admin)
   */
  async changePassword(payload: AdminChangePasswordPayload): Promise<AdminBaseResponse> {
    const res = await adminApiClient.post<AdminBaseResponse>("/change-password", payload);
    return res.data;
  },

  /**
   * 6. Admin Logout
   */
  async logout(): Promise<AdminBaseResponse> {
    const refreshToken = localStorage.getItem("admin_refresh_token") || "";
    try {
      const res = await adminApiClient.post<AdminBaseResponse>("/logout", { refreshToken });
      return res.data;
    } finally {
      localStorage.removeItem("admin_access_token");
      localStorage.removeItem("admin_refresh_token");
      localStorage.removeItem("admin_profile");
    }
  },

  /**
   * 7. Get Current Admin Profile (/me)
   */
  async getProfile(): Promise<{ success: boolean; admin: AdminUser }> {
    const res = await adminApiClient.get<{ success: boolean; admin: AdminUser }>("/me");
    return res.data;
  },

  /**
   * 8. List Active Sessions
   */
  async getSessions(): Promise<AdminSessionsResponse> {
    const res = await adminApiClient.get<AdminSessionsResponse>("/sessions");
    return res.data;
  },

  /**
   * 9. Revoke a Specific Session
   */
  async revokeSession(sessionId: string): Promise<AdminBaseResponse> {
    const res = await adminApiClient.delete<AdminBaseResponse>(`/sessions/${sessionId}`);
    return res.data;
  },
};
```

---

### Complete Auth State & UI Workflows

#### Flow 1: Admin Login Screen
```typescript
import React, { useState } from "react";
import { AdminAuthService } from "../services/adminAuthService";

export const AdminLoginForm = () => {
  const [adminId, setAdminId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await AdminAuthService.login({
        adminId: adminId.trim(),
        password,
      });

      console.log("Logged in successfully as:", response.admin.name);
      window.location.href = "/admin/dashboard";
    } catch (err: any) {
      const serverMsg =
        err.response?.data?.message ||
        err.response?.data?.errors?.[0] ||
        "Login failed. Please check your credentials.";
      setError(serverMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {error && <div className="error-alert">{error}</div>}
      <input
        type="text"
        placeholder="Admin ID (e.g. kickat2021)"
        value={adminId}
        onChange={(e) => setAdminId(e.target.value)}
        required
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      <button type="submit" disabled={loading}>
        {loading ? "Authenticating..." : "Login"}
      </button>
    </form>
  );
};
```

#### Flow 2: 3-Step Password Recovery UI
```typescript
import React, { useState } from "react";
import { AdminAuthService } from "../services/adminAuthService";

export const AdminForgotPasswordWizard = () => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [adminId, setAdminId] = useState("");
  const [otp, setOtp] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Step 1: Send OTP to Email
  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await AdminAuthService.forgotPassword({ adminId: adminId.trim() });
      setSuccessMsg(res.message);
      setStep(2);
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to send reset OTP.");
    }
  };

  // Step 2: Verify 6-digit OTP
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await AdminAuthService.verifyResetOtp({
        adminId: adminId.trim(),
        otp: otp.trim(),
      });
      setResetToken(res.resetToken);
      setSuccessMsg("OTP verified successfully. Please enter your new password.");
      setStep(3);
    } catch (err: any) {
      setError(err.response?.data?.message || "Invalid or expired OTP.");
    }
  };

  // Step 3: Set New Password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      const res = await AdminAuthService.resetPassword({
        resetToken,
        newPassword,
        confirmPassword,
      });
      setSuccessMsg(res.message + " Redirecting to login...");
      setTimeout(() => {
        window.location.href = "/admin/login";
      }, 2000);
    } catch (err: any) {
      setError(err.response?.data?.message || "Password reset failed.");
    }
  };

  return (
    <div>
      {error && <p className="text-red-500">{error}</p>}
      {successMsg && <p className="text-green-500">{successMsg}</p>}

      {step === 1 && (
        <form onSubmit={handleRequestOtp}>
          <h3>Step 1: Enter Admin ID</h3>
          <input
            type="text"
            placeholder="Admin ID"
            value={adminId}
            onChange={(e) => setAdminId(e.target.value)}
            required
          />
          <button type="submit">Send Reset OTP</button>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={handleVerifyOtp}>
          <h3>Step 2: Enter 6-Digit OTP</h3>
          <input
            type="text"
            maxLength={6}
            placeholder="6-digit OTP"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            required
          />
          <button type="submit">Verify OTP</button>
        </form>
      )}

      {step === 3 && (
        <form onSubmit={handleResetPassword}>
          <h3>Step 3: Create New Password</h3>
          <input
            type="password"
            placeholder="New Password (min 8 chars, uppercase, number, symbol)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Confirm New Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
          <button type="submit">Reset Password</button>
        </form>
      )}
    </div>
  );
};
```
