# Authentication API Reference

All authentication endpoints are served under the base path `/api/v1/auth`.

---

## Endpoints Summary

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/otp/send` | No | Request 6-digit Mobile OTP via SMS |
| `POST` | `/api/v1/auth/otp/verify` | No | Verify 6-digit Mobile OTP and receive tokens |
| `POST` | `/api/v1/auth/google` | No | Authenticate with Gmail / Google OAuth authorization code |
| `POST` | `/api/v1/auth/refresh` | No (Uses Cookie) | Rotate Refresh Token cookie and issue new Access Token |
| `POST` | `/api/v1/auth/logout` | Yes (Bearer Token) | Revoke current session & clear refresh cookie |
| `POST` | `/api/v1/auth/logout-all` | Yes (Bearer Token) | Revoke all active sessions across devices |
| `POST` | `/api/v1/auth/logout-allx` | Yes (Bearer Token) | Alias for `/api/v1/auth/logout-all` |

---

## 1. Send Mobile OTP

### `POST /api/v1/auth/otp/send`

Request 6-digit Mobile OTP via SMS (`+91` followed by exactly 10 digits starting 6–9).

- **Headers**: `Content-Type: application/json`
- **Request Body**:
```json
{
  "phone": "+919876543210"
}
```

- **cURL**:
```bash
curl -X POST http://localhost:3000/api/v1/auth/otp/send \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+919876543210"
  }'
```

#### Expected Responses

##### Success (`200 OK`)
```json
{
  "success": true,
  "message": "OTP sent successfully to +919876543210"
}
```

##### Validation Error (`400 Bad Request`)
```json
{
  "statusCode": 400,
  "message": [
    "phone must be +91 followed by exactly 10 digits starting with 6-9"
  ],
  "error": "Bad Request"
}
```

##### Rate Limit Exceeded (`429 Too Many Requests`)
```json
{
  "statusCode": 429,
  "message": "Rate limit exceeded — max 5 per hour per identifier"
}
```

---

## 2. Verify Mobile OTP

### `POST /api/v1/auth/otp/verify`

Verify 6-digit SMS OTP code to authenticate user and receive Access Token & HttpOnly Refresh Token Cookie.

- **Headers**: `Content-Type: application/json`
- **Request Body**:
```json
{
  "identifier": "+919876543210",
  "otp": "123456"
}
```

- **cURL**:
```bash
curl -X POST http://localhost:3000/api/v1/auth/otp/verify \
  -i \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "+919876543210",
    "otp": "123456"
  }'
```

#### Expected Responses

##### Success (`200 OK`)
- **Sets Cookie**: `refreshToken=eyJhbGciOiJIUzI1...; HttpOnly; Path=/; SameSite=Lax`
- **Response Body**:
```json
{
  "success": true,
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmOGQy...",
  "user": {
    "id": "f8d22384-912a-4c2e-b153-9a3c109d7e5f",
    "email": null,
    "phone": "+919876543210",
    "name": null,
    "isEmailVerified": false,
    "isPhoneVerified": true
  }
}
```

##### Wrong or Expired OTP (`401 Unauthorized`)
```json
{
  "statusCode": 401,
  "message": "Wrong or expired OTP",
  "error": "Unauthorized"
}
```

##### Too Many Failed Attempts (`429 Too Many Requests`)
```json
{
  "statusCode": 429,
  "message": "Too many attempts — max 5 per hour"
}
```

---

## 3. Gmail / Google Login

### `POST /api/v1/auth/google`

- **Headers**: `Content-Type: application/json`
- **Request Body**:
```json
{
  "code": "4/0AQlBsWE...",
  "redirectUri": "http://localhost:3000/api/v1/auth/callback/google"
}
```

- **cURL**:
```bash
curl -X POST http://localhost:3000/api/v1/auth/google \
  -i \
  -H "Content-Type: application/json" \
  -d '{
    "code": "4/0AQlBsWE...",
    "redirectUri": "http://localhost:3000/api/v1/auth/callback/google"
  }'
```

#### Expected Responses

##### Success (`200 OK`)
- **Sets Cookie**: `refreshToken=eyJhbGciOiJIUzI1...; HttpOnly; Path=/`
- **Response Body**:
```json
{
  "success": true,
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "c1a23b45-6789-40de-f123-456789abcdef",
    "email": "user@gmail.com",
    "phone": null,
    "name": "John Doe",
    "isEmailVerified": true,
    "isPhoneVerified": false
  }
}
```

##### Google Verification Failed (`401 Unauthorized`)
```json
{
  "statusCode": 401,
  "message": "Google verification failed, email not verified",
  "error": "Unauthorized"
}
```

---

## 4. Refresh Token

### `POST /api/v1/auth/refresh`

- **Headers**: `Cookie: refreshToken=<token>`
- **Request Body**: None

- **cURL**:
```bash
curl -X POST http://localhost:3000/api/v1/auth/refresh \
  -i \
  -b "refreshToken=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

#### Expected Responses

##### Success (`200 OK`)
- **Rotates Cookie**: New `refreshToken` cookie set in response header
- **Response Body**:
```json
{
  "success": true,
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "f8d22384-912a-4c2e-b153-9a3c109d7e5f",
    "email": "user@gmail.com",
    "phone": null,
    "name": "John Doe",
    "isEmailVerified": true,
    "isPhoneVerified": false
  }
}
```

##### Invalid / Reused Refresh Token (`401 Unauthorized`)
```json
{
  "statusCode": 401,
  "message": "Missing, invalid, or reused refresh token",
  "error": "Unauthorized"
}
```

---

## 5. Logout

### `POST /api/v1/auth/logout`

- **Headers**:
  - `Authorization: Bearer <accessToken>`
  - `Cookie: refreshToken=<refreshToken>` (Optional)
- **Request Body**: None

- **cURL**:
```bash
curl -X POST http://localhost:3000/api/v1/auth/logout \
  -i \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -b "refreshToken=YOUR_REFRESH_TOKEN"
```

#### Expected Responses

##### Success (`200 OK`)
- **Clears Cookie**: `refreshToken=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
- **Response Body**:
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

##### Unauthorized (`401 Unauthorized`)
```json
{
  "statusCode": 401,
  "message": "Unauthorized access",
  "error": "Unauthorized"
}
```

---

## 6. Logout All Devices

### `POST /api/v1/auth/logout-all` (or `/api/v1/auth/logout-allx`)

- **Headers**: `Authorization: Bearer <accessToken>`
- **Request Body**:
```json
{
  "password": "UserPassword123!"
}
```

- **cURL**:
```bash
curl -X POST http://localhost:3000/api/v1/auth/logout-all \
  -i \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "password": "UserPassword123!"
  }'
```

#### Expected Responses

##### Success (`200 OK`)
```json
{
  "success": true,
  "message": "Logged out from all devices successfully"
}
```

##### Password Required (`400 Bad Request`)
```json
{
  "statusCode": 400,
  "message": "Password required for logout-all",
  "error": "Bad Request"
}
```

##### Wrong Password / Unauthorized (`401 Unauthorized`)
```json
{
  "statusCode": 401,
  "message": "Wrong password",
  "error": "Unauthorized"
}
```
