# Kickat Customer API Documentation

Welcome to the Kickat Customer API documentation. These endpoints power the customer-facing frontend interfaces (web and mobile app) for the e-commerce platform.

All APIs are prefixed with `/api/v1`.

## Authentication & Security

- **Authentication Method:** JWT via HTTP `Authorization: Bearer <token>` header.
- **Session Management:** Secure HTTP-only cookies are used for refresh tokens.
- **Rate Limiting:** Most endpoints are throttled to prevent abuse. Strict limits apply to public endpoints (e.g., guest cart, search, OTP send).

## API Modules

Detailed endpoint specifications are broken down by domain:

### Core E-Commerce
- **[Home & Content (Banners, Trending, Blogs)](home_browse.md)**
- **[Categories & Tree](categories.md)**
- **[Product Catalog](product.md)**
- **[Search & Filters](search.md)**
- **[Reviews & Ratings](reviews.md)**

### Shopping & Checkout
- **[Cart Management (User & Guest)](cart.md)**
- **[Checkout Flow (Validation & Options)](checkout.md)**
- **[Payments & Webhooks (Razorpay/COD)](payment.md)**

### Post-Purchase & Account
- **[Order History & Returns](orders.md)**
- **[Authentication (OTP, Google)](auth.md)**
- **[User Profile (Addresses, Pets)](profile.md)**
- **[Wishlist](wishlist.md)**
- **[In-App Notifications](notifications.md)**

## Standard Conventions

### Response Wrapping
Most endpoints return a standardized success wrapper:
```json
{
  "success": true,
  "message": "Optional human-readable message",
  "data": { ... } // Or direct payload properties like "items", "categories"
}
```

### Pagination
Lists use a standard offset pagination model utilizing `page` and `limit` query parameters.
```json
{
  "meta": {
    "total": 150,
    "page": 1,
    "limit": 10,
    "totalPages": 15
  }
}
```

### Error Handling
Error responses include an HTTP status code alongside a clear JSON payload.
```json
{
  "statusCode": 400,
  "message": ["quantity must be an integer"],
  "error": "Bad Request"
}
```
