# Production Security Configuration & Architecture Guide

This document outlines the production-level security configurations, architectural assumptions, and hardening mechanisms implemented in the Kickat NestJS backend.

---

## 1. Deployment Architecture & TLS Responsibility

```text
Client (Web / Mobile)
   │
   │  HTTPS (TLS 1.2 / 1.3)
   ▼
Edge / Reverse Proxy / Load Balancer (Nginx / Cloudflare / AWS ALB)
   │
   │  Internal Network (HTTP with X-Forwarded-* headers)
   ▼
NestJS Application Server (Express)
```

### Trust Proxy Configuration
- The application enables Express `'trust proxy', 1` via `app.getHttpAdapter().getInstance().set('trust proxy', 1)`.
- This ensures that:
  - Client IP addresses are accurately retrieved from `X-Forwarded-For` for Throttler rate limiting, brute-force mitigation, and audit trails.
  - `req.secure` and `X-Forwarded-Proto` accurately reflect client HTTPS connections.
  - Secure cookies (`secure: true`, `sameSite: 'strict'`, `httpOnly: true`) are properly enforced.

---

## 2. CORS (Cross-Origin Resource Sharing)

- **Environment-Aware Whitelisting**:
  - In production (`NODE_ENV=production`), CORS is restricted strictly to domains defined in `ALLOWED_ORIGINS` or `CORS_ORIGINS` (comma-separated list, e.g. `https://kickat.co.in,https://admin.kickat.co.in`).
  - In non-production/local environments, standard development origins (`http://localhost:3000`, `http://localhost:5173`, `http://127.0.0.1:3000`, etc.) are permitted.
  - Non-browser requests without `Origin` headers (e.g. mobile apps, backend microservices, curl) are permitted.
- **Allowed Methods**: `GET, HEAD, PUT, PATCH, POST, DELETE, OPTIONS`
- **Allowed Request Headers**: `Content-Type, Authorization, x-request-id, Idempotency-Key, x-razorpay-signature, x-requested-with, Accept, Origin`
- **Exposed Response Headers**: `x-request-id, Content-Range, X-Total-Count`
- **Preflight Caching**: `maxAge: 86400` (24 hours)
- **Credentials**: `credentials: true` (only allowed for explicitly whitelisted origins, preventing credential leakage to arbitrary origins).

---

## 3. HTTP Security Headers (Helmet)

Helmet middleware is registered globally with the following hardened policies:

| Header | Value / Policy | Purpose |
| :--- | :--- | :--- |
| `X-Powered-By` | **Disabled** (`hidePoweredBy: true`) | Prevents technology fingerprinting (Express). |
| `X-Content-Type-Options` | `nosniff` | Blocks MIME-type sniffing attacks. |
| `X-Frame-Options` | `DENY` | Prevents Clickjacking attacks by forbidding iframe embedding. |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Protects privacy and sensitive URL parameters on cross-origin requests. |
| `Cross-Origin-Resource-Policy` | `cross-origin` | Allows CDN/media resources to be loaded by authorized web clients. |
| `Strict-Transport-Security` (HSTS) | `max-age=31536000; includeSubDomains; preload` | Enforces HTTPS connections in production (1-year duration). |
| `Content-Security-Policy` | Managed at Edge / CDN | Kept permissive on the API level to ensure Swagger UI and payment modal integrations operate seamlessly. |

---

## 4. Request Resource Limits & Denial-of-Service (DoS) Protection

- **JSON Body Limit**: `2mb` (prevents memory exhaustion from oversized JSON submissions).
- **Urlencoded Body Limit**: `2mb`
- **Raw Body Support**: Maintained for Razorpay HMAC webhook verification (`{ rawBody: true }`).
- **Response Compression**: Gzip/Deflate compression enabled globally via `compression()` middleware.

---

## 5. DTO Validation & Pagination Abuse Prevention

- **Global Validation Pipe**:
  - `whitelist: true` (strips unrecognized payload attributes).
  - `forbidNonWhitelisted: true` (rejects requests containing unexpected attributes).
  - `transform: true` with `enableImplicitConversion: true`.
- **Bounded Pagination**:
  - All public and customer listing query DTOs enforce `@Min(1)` and `@Max(50)` on `limit`.
  - Admin listing query DTOs enforce `@Min(1)` and `@Max(100)` on `limit`.
  - String search queries enforce strict `@Length(2, 100)` constraints.

---

## 6. Error Information Leakage Prevention

- **Global Exception Filter (`AllExceptionsFilter`)**:
  - In production (`NODE_ENV=production`), unhandled `500 Internal Server Error` exceptions return a sanitized generic message:
    ```json
    {
      "success": false,
      "statusCode": 500,
      "message": "Internal server error",
      "path": "/api/v1/...",
      "timestamp": "2026-08-17T10:40:00.000Z",
      "errors": []
    }
    ```
  - Internal database table names, SQL statements, Prisma internal errors, and stack traces are **never** leaked to clients.
  - Complete error details and stack traces are logged internally to the server logger for diagnostics.

---

## 7. Rate Limiting (Throttler) Tiers

Rate limiting is enforced at the IP level via `@nestjs/throttler`:

| Tier Name | Scope / Endpoint | Window | Limit |
| :--- | :--- | :--- | :--- |
| `otp-send-short` | Mobile & Email OTP send | 10 Minutes | 3 requests / IP |
| `otp-send-long` | Mobile & Email OTP send | 1 Hour | 20 requests / IP |
| `otp-verify` | OTP Verification attempts | 1 Hour | 20 attempts / IP |
| `search` | Full-text search & suggestions | 1 Minute | 30 requests / IP |
| `products` | Product catalog browsing | 1 Minute | 60 requests / IP |
| `guest-cart` | Guest cart modifications | 1 Minute | 20 requests / IP |
| `reviews-helpful` | Review helpful votes | 1 Minute | 20 requests / IP |

---

## 8. Secrets & Environment Configuration

- **Environment Variables**:
  - `JWT_ACCESS_SECRET`: Secret key for signing short-lived access tokens (15m).
  - `JWT_REFRESH_SECRET`: Secret key for signing refresh tokens (30d).
  - `DATABASE_URL`: PostgreSQL connection string with connection pooling.
  - `RAZORPAY_KEY_ID` & `RAZORPAY_KEY_SECRET`: Gateway credentials.
  - `RAZORPAY_WEBHOOK_SECRET`: Webhook HMAC verification secret.
  - `ALLOWED_ORIGINS`: Comma-separated list of allowed production web domains.
- **Bootstrap Security Checks**:
  - The application logs startup warnings in production if default/development JWT secrets are detected.
