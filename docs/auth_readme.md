# Authentication API & Testing Guide

All authentication endpoints are served under the base path `/api/v1/auth`.

---

## 1. Quick Start & Server Execution

### Starting the Server
Start the development server with hot-reloading using `nodemon`:

```bash
# Start server with nodemon
npx nodemon

# OR run Nest CLI dev server
npm run start:dev
```

### Testing Google Sign-In via HTML Page
Open [google-auth-test.html](file:///home/sahil-hode/Workspace/sevenx%20labs/kickat-ecommerce/kickat-server/google-auth-test.html) directly in your browser or navigate to `http://localhost:3000/api/v1/auth/google-test` to test Google OAuth popup login & token exchange.

### Running Automated Tests
```bash
# Run unit tests
npm test

# Run unit tests with coverage
npm run test:cov
```

---

## 2. Endpoints Summary

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/otp/send` | No | Request 6-digit Mobile OTP via SMS (1 min validity) |
| `POST` | `/api/v1/auth/otp/verify` | No | Verify 6-digit Mobile OTP and receive tokens |
| `POST` | `/api/v1/auth/google` | No | Authenticate with Gmail / Google OAuth ID Token or Authorization Code |
| `GET` | `/api/v1/auth/login/google` | No | Browser redirect to Google OAuth login page |
| `GET` | `/api/v1/auth/callback/google` | No | Google OAuth callback redirect handler |
| `POST` | `/api/v1/auth/refresh` | No (Uses Cookie) | Rotate 30-day Refresh Token cookie and issue new Access Token |
| `POST` | `/api/v1/auth/logout` | Yes (Bearer Token) | Revoke current session & clear refresh cookie |
| `POST` | `/api/v1/auth/logout-all` | Yes (Bearer Token) | Revoke all active sessions across devices |
| `GET` | `/api/v1/users/me` | Yes (Bearer Token) | Get latest user details, onboarding status, addresses & pet profiles |

---

## 3. Endpoints Detail & Expected Responses

### A. Send Mobile OTP

#### `POST /api/v1/auth/otp/send`

Request 6-digit Mobile OTP via SMS (`+91` followed by exactly 10 digits starting 6–9). OTP is valid for **1 minute**.

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
  -d '{"phone": "+919876543210"}'
```

#### Expected Responses

##### Success (`200 OK`)
```json
{
  "success": true,
  "message": "OTP sent successfully"
}
```

##### Invalid Phone Number (`400 Bad Request`)
```json
{
  "statusCode": 400,
  "message": [
    "phone must be a valid Indian phone number starting with +91 followed by 10 digits"
  ],
  "error": "Bad Request"
}
```

---

### B. Verify Mobile OTP

#### `POST /api/v1/auth/otp/verify`

Verify 6-digit Mobile OTP. Sets an HTTP-only 30-day `refreshToken` cookie and returns an `accessToken` with user flags.

- **Headers**: `Content-Type: application/json`
- **Request Body**:
```json
{
  "phone": "+919876543210",
  "otp": "123456"
}
```

- **cURL**:
```bash
curl -X POST http://localhost:3000/api/v1/auth/otp/verify \
  -i \
  -H "Content-Type: application/json" \
  -d '{"phone": "+919876543210", "otp": "123456"}'
```

#### Expected Responses

##### Success (`200 OK`)
- **Sets Cookie**: `refreshToken=eyJhbGciOiJIUzI1...; HttpOnly; Path=/; SameSite=Strict; Max-Age=2592000`
- **Response Body**:
```json
{
  "success": true,
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "isNewUser": true,
  "user": {
    "id": "f8d22384-912a-4c2e-b153-9a3c109d7e5f",
    "email": null,
    "phone": "+919876543210",
    "name": null,
    "isNewUser": true,
    "profileCompleted": false,
    "isProfileComplete": false,
    "isEmailVerified": false,
    "isPhoneVerified": true
  }
}
```

##### Wrong or Expired OTP (`401 Unauthorized`)
```json
{
  "statusCode": 401,
  "message": "Invalid or expired OTP",
  "error": "Unauthorized"
}
```

---

### C. Google OAuth Login

#### `POST /api/v1/auth/google`

Authenticate with a Google ID Token or Google Authorization Code. Pre-fills user email & name and sets `isEmailVerified: true`.

- **Headers**: `Content-Type: application/json`
- **Request Body**:
```json
{
  "token": "4/0AeaYSH...",
  "redirectUri": "http://localhost:3000/api/v1/auth/callback/google"
}
```

- **cURL**:
```bash
curl -X POST http://localhost:3000/api/v1/auth/google \
  -i \
  -H "Content-Type: application/json" \
  -d '{
    "token": "PASTE_GOOGLE_TOKEN_HERE"
  }'
```

#### Expected Responses

##### Success (`200 OK`)
```json
{
  "success": true,
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "isNewUser": false,
  "user": {
    "id": "c1a23b45-6789-40de-f123-456789abcdef",
    "email": "user@gmail.com",
    "phone": null,
    "name": "John Doe",
    "isNewUser": false,
    "profileCompleted": false,
    "isProfileComplete": false,
    "isEmailVerified": true,
    "isPhoneVerified": false
  }
}
```

---

### D. Rotate Refresh Token

#### `POST /api/v1/auth/refresh`

Rotates the 30-day `refreshToken` HTTP-only cookie and returns a fresh `accessToken`.

- **Headers**: Requires `Cookie: refreshToken=<token>`
- **cURL**:
```bash
curl -X POST http://localhost:3000/api/v1/auth/refresh \
  -i \
  -b "refreshToken=PASTE_REFRESH_TOKEN_COOKIE_HERE"
```

##### Success (`200 OK`)
- **Sets Cookie**: New `refreshToken` cookie.
- **Response Body**:
```json
{
  "success": true,
  "accessToken": "eyJhbGciOiJIUzI1Ni..."
}
```

---

### E. Logout (Single Device)

#### `POST /api/v1/auth/logout`

Revokes the current refresh token family and clears the cookie.

- **Headers**:
  - `Authorization: Bearer <accessToken>`
  - `Cookie: refreshToken=<token>`
- **cURL**:
```bash
curl -X POST http://localhost:3000/api/v1/auth/logout \
  -i \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -b "refreshToken=YOUR_REFRESH_COOKIE"
```

---

### F. Logout (All Devices)

#### `POST /api/v1/auth/logout-all`

Revokes all active sessions and refresh tokens across all devices for the current user.

- **Headers**: `Authorization: Bearer <accessToken>`
- **cURL**:
```bash
curl -X POST http://localhost:3000/api/v1/auth/logout-all \
  -i \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## 4. Full Authentication Testing Flow

### Step 1: Send Mobile OTP
```bash
curl -X POST http://localhost:3000/api/v1/auth/otp/send \
  -H "Content-Type: application/json" \
  -d '{"phone": "+919876543210"}'
```
Check your server console output to see the logged OTP (e.g. `[MOBILE OTP SENT] To: +919876543210 | OTP: 654321`).

### Step 2: Verify Mobile OTP
```bash
curl -X POST http://localhost:3000/api/v1/auth/otp/verify \
  -i \
  -H "Content-Type: application/json" \
  -d '{"phone": "+919876543210", "otp": "654321"}'
```
Save the returned `accessToken` string and `set-cookie: refreshToken=...` value.

### Step 3: Fetch Current User State (`GET /users/me`)
```bash
curl -X GET http://localhost:3000/api/v1/users/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```
Check `profileCompleted` field. If `false`, proceed to profile onboarding ([docs/profile-creation.md](file:///home/sahil-hode/Workspace/sevenx%20labs/kickat-ecommerce/kickat-server/docs/profile-creation.md)).
