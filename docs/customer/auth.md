# Customer Authentication API Specification

All customer authentication endpoints are served under `/api/v1/auth`.

---

## Endpoints Overview

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/otp/send` | No | Send OTP to mobile number |
| `POST` | `/api/v1/auth/otp/verify` | No | Verify mobile OTP and login/register |
| `POST` | `/api/v1/auth/email-otp/send` | No | Send OTP to email address |
| `POST` | `/api/v1/auth/email-otp/verify` | No | Verify email OTP |
| `GET`  | `/api/v1/auth/login/google` | No | Redirect to Google OAuth consent screen |
| `POST` | `/api/v1/auth/google` | No | Authenticate via Google ID token (direct) |
| `POST` | `/api/v1/auth/refresh` | No | Refresh access token using cookie |
| `POST` | `/api/v1/auth/logout` | Yes | Logout current device session |
| `POST` | `/api/v1/auth/logout-all` | Yes | Logout all active sessions for user |

---

## Detailed Endpoints

### 1. Mobile OTP Authentication

#### Send OTP
- **POST** `/api/v1/auth/otp/send`
- **Request Body:**
  ```json
  {
    "phone": "+919876543210"
  }
  ```
- **Response (200 OK):** `{ "success": true, "message": "OTP sent successfully" }`

#### Verify OTP
- **POST** `/api/v1/auth/otp/verify`
- **Request Body:**
  ```json
  {
    "phone": "+919876543210",
    "otp": "123456"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "accessToken": "eyJ...",
    "isNewUser": false,
    "user": { "id": "uuid", "phone": "+919876543210" }
  }
  ```
  *(Note: A `refreshToken` is securely set as an HTTP-only cookie)*

### 2. Email OTP Authentication

#### Send Email OTP
- **POST** `/api/v1/auth/email-otp/send`
- **Request Body:** `{ "email": "user@example.com" }`

#### Verify Email OTP
- **POST** `/api/v1/auth/email-otp/verify`
- **Request Body:** `{ "email": "user@example.com", "otp": "123456" }`
- **Response:** Similar to mobile OTP verify.

### 3. Google OAuth Authentication

#### Direct Token Authentication
- **POST** `/api/v1/auth/google`
- **Request Body:** `{ "idToken": "google_jwt_token_here" }`
- **Response:** Returns `accessToken` and sets `refreshToken` cookie.

### 4. Session Management

#### Refresh Token
- **POST** `/api/v1/auth/refresh`
- **Headers/Cookies:** Requires `refreshToken` cookie.
- **Response (200 OK):** `{ "success": true, "accessToken": "new_eyJ..." }`

#### Logout
- **POST** `/api/v1/auth/logout`
- **Headers:** `Authorization: Bearer <accessToken>`
- **Response (200 OK):** `{ "success": true, "message": "Logged out successfully" }`

#### Logout All Devices
- **POST** `/api/v1/auth/logout-all`
- **Headers:** `Authorization: Bearer <accessToken>`
- **Response (200 OK):** `{ "success": true, "message": "Logged out from all devices" }`
