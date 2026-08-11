# Complete Customer API Reference Guide

Welcome to the Kickat E-Commerce Customer API reference guide. All endpoints are served under the base URL prefix `/api/v1`.

---

## Quick Navigation

- [1. System & Health API](#1-system--health-api)
- [2. Authentication API](#2-authentication-api)
- [3. User Identity & Verification](#3-user-identity--verification)
- [4. Profile & Pet Onboarding](#4-profile--pet-onboarding)
- [5. Home Feed & Content](#5-home-feed--content)
- [6. Products Catalog](#6-products-catalog)
- [7. Categories Catalog](#7-categories-catalog)
- [8. Search & Discovery](#8-search--discovery)
- [9. Cart & Guest Checkout](#9-cart--guest-checkout)
- [10. Wishlist Management](#10-wishlist-management)
- [11. Checkout & Order Placement](#11-checkout--order-placement)
- [12. Orders & Tracking](#12-orders--tracking)
- [13. Returns & Refunds](#13-returns--refunds)
- [14. Payments Processing](#14-payments-processing)
- [15. Customer Product Reviews](#15-customer-product-reviews)
- [16. User Notifications](#16-user-notifications)

---

## 1. System & Health API

### GET `/api/v1/health`
- **Auth Required**: No
- **Description**: Returns server uptime, health status, and ISO timestamp.
- **Response (`200 OK`)**:
  ```json
  {
    "status": "ok",
    "timestamp": "2026-08-11T20:17:36.000Z",
    "uptime": 3600.42
  }
  ```

### GET `/api/v1/ready`
- **Auth Required**: No
- **Description**: Verifies database connectivity using Prisma SELECT 1 query.
- **Response (`200 OK`)**:
  ```json
  {
    "status": "ready",
    "database": "connected",
    "timestamp": "2026-08-11T20:17:36.000Z"
  }
  ```

### GET `/api/v1/metrics`
- **Auth Required**: No
- **Description**: Node process memory and uptime metrics.

---

## 2. Authentication API

Base Path: `/api/v1/auth`

### POST `/api/v1/auth/otp/send`
- **Auth Required**: No
- **Request Body**:
  ```json
  {
    "phone": "+919876543210"
  }
  ```
- **Description**: Sends a 6-digit OTP via SMS (valid for 1 minute).
- **Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "message": "OTP sent successfully"
  }
  ```

### POST `/api/v1/auth/otp/verify`
- **Auth Required**: No
- **Request Body**:
  ```json
  {
    "phone": "+919876543210",
    "otp": "123456"
  }
  ```
- **Description**: Verifies Mobile OTP. Sets HTTP-only `refreshToken` cookie (30 days) and returns Bearer `accessToken`.
- **Response (`200 OK`)**:
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

### POST `/api/v1/auth/google`
- **Auth Required**: No
- **Request Body**:
  ```json
  {
    "token": "4/0AeaYSH...",
    "redirectUri": "http://localhost:3000/api/v1/auth/callback/google"
  }
  ```
- **Description**: Authenticates via Google OAuth ID token or Code. Sets `isEmailVerified: true`.

### GET `/api/v1/auth/login/google`
- **Auth Required**: No
- **Description**: Redirects browser directly to Google OAuth consent screen.

### GET `/api/v1/auth/callback/google`
- **Auth Required**: No
- **Query Params**: `code`
- **Description**: Google OAuth callback handler.

### POST `/api/v1/auth/refresh`
- **Auth Required**: No (Uses HTTP-only `refreshToken` cookie)
- **Description**: Rotates refresh token cookie and issues new `accessToken`.

### POST `/api/v1/auth/logout`
- **Auth Required**: Yes (`Bearer <accessToken>`)
- **Description**: Revokes current refresh token session and clears cookie.

### POST `/api/v1/auth/logout-all`
- **Auth Required**: Yes (`Bearer <accessToken>`)
- **Description**: Revokes all active sessions across all devices for current user.

---

## 3. User Identity & Verification

Base Path: `/api/v1/users`

### GET `/api/v1/users/me`
- **Auth Required**: Yes (`Bearer <accessToken>`)
- **Description**: Retrieves logged in user state, `profileCompleted` status, saved addresses, and pet profiles.

### POST `/api/v1/users/me/recently-viewed`
- **Auth Required**: Yes
- **Request Body**: `{ "productId": "UUID" }`
- **Description**: Adds product to user's recently viewed history.

### GET `/api/v1/users/me/recently-viewed`
- **Auth Required**: Yes
- **Description**: Returns list of products recently viewed by user.

### POST `/api/v1/users/email/send-verification`
- **Auth Required**: Yes
- **Request Body**: `{ "email": "user@example.com" }`
- **Description**: Sends 6-digit email OTP via SMTP.

### POST `/api/v1/users/email/verify`
- **Auth Required**: Yes
- **Request Body**: `{ "email": "user@example.com", "otp": "123456" }`
- **Description**: Verifies email OTP and sets `isEmailVerified: true`.

### POST `/api/v1/users/mobile/send-verification`
- **Auth Required**: Yes
- **Request Body**: `{ "phone": "+919876543210" }`
- **Description**: Sends mobile verification OTP to logged-in user.

### POST `/api/v1/users/mobile/verify`
- **Auth Required**: Yes
- **Request Body**: `{ "phone": "+919876543210", "otp": "123456" }`
- **Description**: Verifies mobile OTP for logged-in user.

---

## 4. Profile & Pet Onboarding

Base Path: `/api/v1/profile`

### GET `/api/v1/profile`
- **Auth Required**: Yes
- **Description**: Fetches user profile, delivery addresses, and pet profiles.

### POST `/api/v1/profile/basic`
- **Auth Required**: Yes
- **Request Body**:
  ```json
  {
    "name": "Sahil Hode",
    "email": "sahil@example.com",
    "gender": "MALE",
    "dob": "2000-05-15"
  }
  ```
- **Description**: Step 1 of onboarding: save basic profile info.

### POST `/api/v1/profile/address` or `/api/v1/profile/addresses`
- **Auth Required**: Yes
- **Request Body**:
  ```json
  {
    "type": "HOME",
    "houseFlat": "Flat 402, Sunshine Heights",
    "buildingStreet": "MG Road",
    "landmark": "Near City Mall",
    "city": "Mumbai",
    "state": "Maharashtra",
    "country": "India",
    "pincode": "400001",
    "isDefault": true
  }
  ```
- **Description**: Step 2 of onboarding: add delivery address.

### POST `/api/v1/profile/pet` or `/api/v1/profile/pets`
- **Auth Required**: Yes
- **Request Body**:
  ```json
  {
    "species": "DOG",
    "name": "Bruno",
    "breed": "Labrador Retriever",
    "age": 2,
    "ageUnit": "YEARS",
    "gender": "MALE",
    "weight": 24.5,
    "weightUnit": "KG",
    "dietaryPreference": "BOTH",
    "allergies": ["Grain"]
  }
  ```
- **Description**: Step 3 of onboarding: add pet profile. Automatically marks `profileCompleted: true` if basic details and address are also present.

### PUT `/api/v1/profile/addresses/:id`
- **Auth Required**: Yes
- **Description**: Update saved delivery address by ID.

### DELETE `/api/v1/profile/addresses/:id`
- **Auth Required**: Yes
- **Description**: Delete saved delivery address by ID.

### PUT `/api/v1/profile/pets/:id`
- **Auth Required**: Yes
- **Description**: Update pet profile by ID.

### DELETE `/api/v1/profile/pets/:id`
- **Auth Required**: Yes
- **Description**: Delete pet profile by ID.

---

## 5. Home Feed & Content

Base Path: `/api/v1`

### GET `/api/v1/home`
- **Auth Required**: No (Query `petId` optional)
- **Description**: Returns home page banners, category highlights, trending products, and best sellers.

### GET `/api/v1/home/banners`
- **Auth Required**: No
- **Description**: Returns active promotional banners.

### GET `/api/v1/blogs`
- **Auth Required**: No
- **Query Params**: `page`, `limit`, `categoryId`, `tag`
- **Description**: Returns paginated list of published blog posts.

### GET `/api/v1/blogs/categories`
- **Auth Required**: No
- **Description**: List blog categories.

### GET `/api/v1/blogs/:slug`
- **Auth Required**: No
- **Description**: Get single blog article by kebab-case slug.

---

## 6. Products Catalog

Base Path: `/api/v1/products`

### GET `/api/v1/products`
- **Auth Required**: No
- **Query Params**: `page`, `limit`, `categoryId`, `sort` (`price_asc`, `price_desc`, `popularity`, `newest`, `rating`), `priceMin`, `priceMax`, `brand`, `petSpecies`, `diet`, `inStock`, `rating`
- **Description**: Browse product catalog with dynamic filtering and pagination.

### GET `/api/v1/products/:id`
- **Auth Required**: No
- **Description**: Detailed product info by UUID.

### GET `/api/v1/products/:id/variants`
- **Auth Required**: No
- **Description**: Get product SKU variants (size, weight, flavor).

### GET `/api/v1/products/:id/media`
- **Auth Required**: No
- **Description**: Get all image and video media for product.

### GET `/api/v1/products/:id/related`
- **Auth Required**: No
- **Query Param**: `limit`
- **Description**: Related products in same category/species.

### GET `/api/v1/products/:id/reviews`
- **Auth Required**: No
- **Query Params**: `page`, `limit`, `rating`, `sort`, `hasPhotos`, `verifiedOnly`
- **Description**: Paginated customer reviews for a product.

### GET `/api/v1/products/trending`
- **Auth Required**: No
- **Description**: Get trending products list.

### GET `/api/v1/products/best-sellers`
- **Auth Required**: No
- **Description**: Get top best sellers list.

### GET `/api/v1/products/recommended`
- **Auth Required**: Optional (or `petId` query param)
- **Description**: Personalised product recommendations.

### GET `/api/v1/products/buy-again`
- **Auth Required**: Yes
- **Description**: Past purchased products for fast reordering.

---

## 7. Categories Catalog

Base Path: `/api/v1/categories`

### GET `/api/v1/categories`
- **Auth Required**: No
- **Description**: Flat list of active categories.

### GET `/api/v1/categories/tree`
- **Auth Required**: No
- **Description**: Hierarchical category tree (parents with subcategories).

### GET `/api/v1/categories/:id`
- **Auth Required**: No
- **Description**: Get single category details by UUID.

### GET `/api/v1/categories/:id/products`
- **Auth Required**: No
- **Query Params**: `page`, `limit`, `sort`, `priceMin`, `priceMax`, `inStock`, `brand`, `petSpecies`, `diet`
- **Description**: Paginated list of products belonging to a category.

---

## 8. Search & Discovery

Base Path: `/api/v1/search`

### GET `/api/v1/search`
- **Auth Required**: No
- **Query Params**: `q` (min 2 chars), `categoryId`, `priceMin`, `priceMax`, `rating`, `petSpecies`, `diet`, `brand`, `sort`, `page`, `limit`
- **Description**: Full-text search with dynamic facets.

### GET `/api/v1/search/suggestions`
- **Auth Required**: No
- **Query Param**: `q`
- **Description**: Autocomplete keyword suggestions.

### GET `/api/v1/search/recent`
- **Auth Required**: Yes
- **Description**: List of logged-in user's recent search queries.

### DELETE `/api/v1/search/recent/:queryId`
- **Auth Required**: Yes
- **Description**: Delete a specific recent search query entry.

### GET `/api/v1/search/trending`
- **Auth Required**: No
- **Description**: Trending search keywords.

### GET `/api/v1/search/filters`
- **Auth Required**: No
- **Query Param**: `categoryId`
- **Description**: Available filter facets (brands, price range min/max, pet species, diets).

---

## 9. Cart & Guest Checkout

Base Path: `/api/v1/cart`

### GET `/api/v1/cart`
- **Auth Required**: Yes
- **Description**: Get shopping cart summary (subtotal, discounts, delivery fee, grand total) and item list.

### POST `/api/v1/cart/items`
- **Auth Required**: Yes
- **Request Body**: `{ "productId": "UUID", "variantId": "UUID", "quantity": 1 }`
- **Description**: Add item to cart (quantity 1–100) with stock check.

### PUT `/api/v1/cart/items/:itemId`
- **Auth Required**: Yes
- **Request Body**: `{ "quantity": 3 }`
- **Description**: Update item quantity in cart.

### DELETE `/api/v1/cart/items/:itemId`
- **Auth Required**: Yes
- **Description**: Remove item from cart.

### POST `/api/v1/cart/buy-now`
- **Auth Required**: Yes
- **Request Body**: `{ "productId": "UUID", "quantity": 1 }`
- **Description**: Create instant buy-now checkout session.

### POST `/api/v1/cart/guest`
- **Auth Required**: No
- **Request Body**: `{ "guestSessionId": "UUID", "productId": "UUID", "quantity": 1 }`
- **Description**: Add item to guest cart.

### GET `/api/v1/cart/guest/:sessionId`
- **Auth Required**: No
- **Description**: Get guest cart summary by session ID.

### POST `/api/v1/cart/merge`
- **Auth Required**: Yes
- **Request Body**: `{ "guestSessionId": "UUID" }`
- **Description**: Merge guest cart items into user cart upon login.

---

## 10. Wishlist Management

Base Path: `/api/v1/wishlist`

### GET `/api/v1/wishlist`
- **Auth Required**: Yes
- **Query Params**: `page`, `limit`
- **Description**: List products in user's wishlist.

### POST `/api/v1/wishlist`
- **Auth Required**: Yes
- **Request Body**: `{ "productId": "UUID", "variantId": "UUID" }`
- **Description**: Add product to wishlist.

### DELETE `/api/v1/wishlist/:productId`
- **Auth Required**: Yes
- **Description**: Remove product from wishlist.

### POST `/api/v1/wishlist/:productId/move-to-cart`
- **Auth Required**: Yes
- **Request Body**: `{ "quantity": 1 }`
- **Description**: Move wishlist item directly into shopping cart.

---

## 11. Checkout & Order Placement

Base Path: `/api/v1/checkout`

### GET `/api/v1/checkout`
- **Auth Required**: Yes
- **Description**: Returns checkout summary, saved user addresses, payment methods, and triggers 10-minute stock reservation.

### POST `/api/v1/checkout/validate-address`
- **Auth Required**: Yes
- **Request Body**: `{ "addressId": "UUID" }`
- **Description**: Validates delivery address pincode serviceability and shipping fee.

### GET `/api/v1/checkout/payment-methods`
- **Auth Required**: Yes
- **Query Params**: `orderAmount`, `pincode`
- **Description**: Available payment methods (`UPI`, `CARD`, `WALLET`, `NETBANKING`, `COD`).

### POST `/api/v1/checkout/place-order`
- **Auth Required**: Yes
- **Headers**: `Idempotency-Key: <UUID v4>`
- **Request Body**:
  ```json
  {
    "addressId": "UUID",
    "paymentMethod": "UPI",
    "upiId": "user@okaxis",
    "deliveryInstructions": "Leave at door"
  }
  ```
- **Description**: Idempotent order placement.

---

## 12. Orders & Tracking

Base Path: `/api/v1/orders`

### GET `/api/v1/orders`
- **Auth Required**: Yes
- **Query Params**: `page`, `limit`, `status`, `dateFrom`, `dateTo`, `type` (`ongoing`, `past`, `all`)
- **Description**: List user orders with status filters.

### GET `/api/v1/orders/:id`
- **Auth Required**: Yes
- **Description**: Get full order details.

### GET `/api/v1/orders/:id/timeline`
- **Auth Required**: Yes
- **Description**: Get order status progression timeline.

### GET `/api/v1/orders/:id/tracking`
- **Auth Required**: Yes
- **Description**: Package tracking history and courier details.

### GET `/api/v1/orders/:id/tracking-live`
- **Auth Required**: Yes
- **Description**: Live delivery agent GPS location tracking.

### GET `/api/v1/orders/:id/invoice`
- **Auth Required**: Yes
- **Description**: Get tax invoice details and PDF URL.

### PATCH `/api/v1/orders/:id/cancel`
- **Auth Required**: Yes
- **Request Body**: `{ "reason": "changed_mind", "reasonOther": "" }`
- **Description**: Cancel order prior to shipping.

### POST `/api/v1/orders/:id/reorder`
- **Auth Required**: Yes
- **Description**: Re-add items from past order to shopping cart.

---

## 13. Returns & Refunds

Base Paths: `/api/v1/orders` & `/api/v1/returns`

### POST `/api/v1/orders/:id/return`
- **Auth Required**: Yes
- **Request Body**:
  ```json
  {
    "items": [
      {
        "orderItemId": "UUID",
        "reason": "damaged",
        "photos": ["https://example.com/photo.jpg"]
      }
    ],
    "pickupInstructions": "Ring bell"
  }
  ```
- **Description**: Submit return request within 7 days of delivery.

### GET `/api/v1/returns`
- **Auth Required**: Yes
- **Query Params**: `page`, `limit`, `status`
- **Description**: List user return requests.

### GET `/api/v1/returns/:id`
- **Auth Required**: Yes
- **Description**: Get return request details.

---

## 14. Payments Processing

Base Path: `/api/v1/payments`

### POST `/api/v1/payments/create-order`
- **Auth Required**: Yes
- **Headers**: `Idempotency-Key: <UUID v4>`
- **Request Body**: `{ "orderId": "UUID", "paymentMethod": "upi", "upiId": "user@okaxis" }`
- **Description**: Creates payment transaction and Razorpay order ID.

### POST `/api/v1/payments/verify`
- **Auth Required**: Yes
- **Request Body**: `{ "razorpayOrderId": "str", "razorpayPaymentId": "str", "signature": "hex", "orderId": "UUID" }`
- **Description**: Verifies Razorpay HMAC signature and confirms payment.

### POST `/api/v1/payments/retry`
- **Auth Required**: Yes
- **Headers**: `Idempotency-Key: <UUID v4>`
- **Request Body**: `{ "orderId": "UUID", "paymentMethod": "card" }`
- **Description**: Retry failed payment within 30 minutes.

### GET `/api/v1/payments/:id`
- **Auth Required**: Yes
- **Description**: Get payment transaction status.

### POST `/api/v1/payments/cod/confirm`
- **Auth Required**: Yes
- **Headers**: `Idempotency-Key: <UUID v4>`
- **Request Body**: `{ "orderId": "UUID" }`
- **Description**: Confirm Cash on Delivery payment selection.

### POST `/api/v1/payments/webhook`
- **Auth Required**: No (Razorpay HMAC Header Verification)
- **Headers**: `x-razorpay-signature`
- **Description**: Webhook callback listener for Razorpay payment events.

---

## 15. Customer Product Reviews

Base Path: `/api/v1/reviews`

### POST `/api/v1/reviews`
- **Auth Required**: Yes
- **Request Body**: `{ "productId": "UUID", "orderId": "UUID", "rating": 5, "comment": "Great product!", "photos": [] }`
- **Description**: Submit review for verified purchase.

### GET `/api/v1/reviews`
- **Auth Required**: No
- **Query Params**: `productId`, `page`, `limit`, `rating`, `sort`, `hasPhotos`, `verifiedOnly`
- **Description**: Public reviews listing with filter options.

### GET `/api/v1/reviews/:id`
- **Auth Required**: No
- **Description**: Get single review detail.

### PATCH `/api/v1/reviews/:id/helpful`
- **Auth Required**: Yes
- **Description**: Vote review as helpful.

---

## 16. User Notifications

Base Path: `/api/v1/notifications`

### GET `/api/v1/notifications`
- **Auth Required**: Yes
- **Query Params**: `page`, `limit`
- **Description**: Get paginated in-app notification feed.

### PATCH `/api/v1/notifications/read-all`
- **Auth Required**: Yes
- **Description**: Mark all notifications as read.

### PATCH `/api/v1/notifications/:id/read`
- **Auth Required**: Yes
- **Description**: Mark single notification as read.
