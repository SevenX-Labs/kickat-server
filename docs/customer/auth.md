# Customer Authentication API Specification

All customer authentication endpoints are served under `/api/v1/auth`.

---

## Endpoints Overview

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/otp/send` | No | Request 6-digit Mobile OTP via SMS (1 min validity) |
| `POST` | `/api/v1/auth/otp/verify` | No | Verify Mobile OTP; sets `isPhoneVerified: true`, issues tokens |
| `POST` | `/api/v1/auth/google` | No | Authenticate via Google OAuth ID token / code; sets `isEmailVerified: true` |
| `GET` | `/api/v1/auth/login/google` | No | Browser redirect to Google OAuth login consent screen |
| `GET` | `/api/v1/auth/callback/google` | No | Google OAuth redirect callback handler |
| `POST` | `/api/v1/auth/refresh` | Cookie | Rotate 30-day `refreshToken` cookie & issue new Bearer `accessToken` |
| `POST` | `/api/v1/auth/logout` | Yes | Revoke current refresh token family & clear cookie |
| `POST` | `/api/v1/auth/logout-all` | Yes | Revoke all active sessions across all devices |

---

## Endpoint Details

### 1. Send Mobile OTP
`POST /api/v1/auth/otp/send`
- **Request Body**:
```json
{
  "phone": "+919876543210"
}
```
- **Response (`200 OK`)**:
```json
{
  "success": true,
  "message": "OTP sent successfully"
}
```

---

### 2. Verify Mobile OTP
`POST /api/v1/auth/otp/verify`
- **Request Body**:
```json
{
  "phone": "+919876543210",
  "otp": "123456"
}
```
- **Response (`200 OK`)**:
- **Sets Cookie**: `refreshToken=<token>; HttpOnly; Path=/; SameSite=Strict; Max-Age=2592000`
```json
{
  "success": true,
  "accessToken": "eyJhbGciOiJIUzI1Ni...",
  "isNewUser": true,
  "user": {
    "id": "f8d22384-912a-4c2e-b153-9a3c109d7e5f",
    "phone": "+919876543210",
    "isPhoneVerified": true,
    "profileCompleted": false
  }
}
```

---

### 3. Google OAuth Login
`POST /api/v1/auth/google`
- **Request Body**:
```json
{
  "token": "4/0AeaYSH...",
  "redirectUri": "http://localhost:3000/api/v1/auth/callback/google"
}
```
- **Response (`200 OK`)**:
```json
{
  "success": true,
  "accessToken": "eyJhbGciOiJIUzI1...",
  "isNewUser": false,
  "user": {
    "id": "c1a23b45-6789-40de-f123-456789abcdef",
    "email": "user@gmail.com",
    "isEmailVerified": true,
    "isPhoneVerified": false
  }
}
```

---

### 4. Refresh Access Token
`POST /api/v1/auth/refresh`
- **Headers**: `Cookie: refreshToken=<token>`
- **Response (`200 OK`)**:
```json
{
  "success": true,
  "accessToken": "eyJhbGciOiJIUzI1..."
}
```

---

### 5. Logout Session
`POST /api/v1/auth/logout`
- **Headers**: `Authorization: Bearer <accessToken>`, `Cookie: refreshToken=<token>`
- **Response (`200 OK`)**:
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

### 6. Logout All Devices
`POST /api/v1/auth/logout-all`
- **Headers**: `Authorization: Bearer <accessToken>`
- **Response (`200 OK`)**:
```json
{
  "success": true,
  "message": "All sessions revoked successfully"
}
```
