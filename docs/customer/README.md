# Customer API Endpoint Index

This file lists all customer-facing endpoints available under `/api/v1`.

## System

| Method | Endpoint | Auth |
| :--- | :--- | :--- |
| `GET` | `/api/v1/health` | No |
| `GET` | `/api/v1/ready` | No |
| `GET` | `/api/v1/metrics` | No |

## Authentication

| Method | Endpoint | Auth |
| :--- | :--- | :--- |
| `POST` | `/api/v1/auth/otp/send` | No |
| `POST` | `/api/v1/auth/otp/verify` | No |
| `POST` | `/api/v1/auth/google` | No |
| `GET` | `/api/v1/auth/login/google` | No |
| `GET` | `/api/v1/auth/callback/google` | No |
| `POST` | `/api/v1/auth/refresh` | Cookie |
| `POST` | `/api/v1/auth/logout` | Yes |
| `POST` | `/api/v1/auth/logout-all` | Yes |

## User Identity & Verification

| Method | Endpoint | Auth |
| :--- | :--- | :--- |
| `GET` | `/api/v1/users/me` | Yes |
| `POST` | `/api/v1/users/me/recently-viewed` | Yes |
| `GET` | `/api/v1/users/me/recently-viewed` | Yes |
| `POST` | `/api/v1/users/email/send-verification` | Yes |
| `POST` | `/api/v1/users/email/verify` | Yes |
| `POST` | `/api/v1/users/mobile/send-verification` | Yes |
| `POST` | `/api/v1/users/mobile/verify` | Yes |

## Profile & Pet Onboarding

| Method | Endpoint | Auth |
| :--- | :--- | :--- |
| `GET` | `/api/v1/profile` | Yes |
| `POST` | `/api/v1/profile/basic` | Yes |
| `POST` | `/api/v1/profile/address` | Yes |
| `POST` | `/api/v1/profile/addresses` | Yes |
| `POST` | `/api/v1/profile/pet` | Yes |
| `POST` | `/api/v1/profile/pets` | Yes |
| `PUT` | `/api/v1/profile/addresses/:id` | Yes |
| `DELETE` | `/api/v1/profile/addresses/:id` | Yes |
| `PUT` | `/api/v1/profile/pets/:id` | Yes |
| `DELETE` | `/api/v1/profile/pets/:id` | Yes |

## Home & Content

| Method | Endpoint | Auth |
| :--- | :--- | :--- |
| `GET` | `/api/v1/home` | No |
| `GET` | `/api/v1/home/banners` | No |
| `GET` | `/api/v1/blogs` | No |
| `GET` | `/api/v1/blogs/categories` | No |
| `GET` | `/api/v1/blogs/:slug` | No |

## Products Catalog

| Method | Endpoint | Auth |
| :--- | :--- | :--- |
| `GET` | `/api/v1/products` | No |
| `GET` | `/api/v1/products/:id` | No |
| `GET` | `/api/v1/products/:id/variants` | No |
| `GET` | `/api/v1/products/:id/media` | No |
| `GET` | `/api/v1/products/:id/images` | No |
| `GET` | `/api/v1/products/:id/videos` | No |
| `GET` | `/api/v1/products/:id/related` | No |
| `GET` | `/api/v1/products/:id/reviews` | No |
| `GET` | `/api/v1/products/trending` | No |
| `GET` | `/api/v1/products/best-sellers` | No |
| `GET` | `/api/v1/products/recommended` | Optional |
| `GET` | `/api/v1/products/buy-again` | Yes |

## Categories

| Method | Endpoint | Auth |
| :--- | :--- | :--- |
| `GET` | `/api/v1/categories` | No |
| `GET` | `/api/v1/categories/tree` | No |
| `GET` | `/api/v1/categories/:id` | No |
| `GET` | `/api/v1/categories/:id/products` | No |

## Search & Discovery

| Method | Endpoint | Auth |
| :--- | :--- | :--- |
| `GET` | `/api/v1/search` | No |
| `GET` | `/api/v1/search/suggestions` | No |
| `GET` | `/api/v1/search/recent` | Yes |
| `DELETE` | `/api/v1/search/recent/:queryId` | Yes |
| `GET` | `/api/v1/search/trending` | No |
| `GET` | `/api/v1/search/popular` | No |
| `GET` | `/api/v1/search/filters` | No |

## Cart & Guest Checkout

| Method | Endpoint | Auth |
| :--- | :--- | :--- |
| `GET` | `/api/v1/cart` | Yes |
| `POST` | `/api/v1/cart/items` | Yes |
| `PUT` | `/api/v1/cart/items/:itemId` | Yes |
| `DELETE` | `/api/v1/cart/items/:itemId` | Yes |
| `POST` | `/api/v1/cart/buy-now` | Yes |
| `POST` | `/api/v1/cart/guest` | No |
| `GET` | `/api/v1/cart/guest/:sessionId` | No |
| `POST` | `/api/v1/cart/merge` | Yes |

## Wishlist

| Method | Endpoint | Auth |
| :--- | :--- | :--- |
| `GET` | `/api/v1/wishlist` | Yes |
| `POST` | `/api/v1/wishlist` | Yes |
| `DELETE` | `/api/v1/wishlist/:productId` | Yes |
| `POST` | `/api/v1/wishlist/:productId/move-to-cart` | Yes |

## Checkout & Order Placement

| Method | Endpoint | Auth |
| :--- | :--- | :--- |
| `GET` | `/api/v1/checkout` | Yes |
| `POST` | `/api/v1/checkout/validate-address` | Yes |
| `GET` | `/api/v1/checkout/payment-methods` | Yes |
| `POST` | `/api/v1/checkout/place-order` | Yes |

## Orders & Tracking

| Method | Endpoint | Auth |
| :--- | :--- | :--- |
| `GET` | `/api/v1/orders` | Yes |
| `GET` | `/api/v1/orders/:id` | Yes |
| `GET` | `/api/v1/orders/:id/timeline` | Yes |
| `GET` | `/api/v1/orders/:id/tracking` | Yes |
| `GET` | `/api/v1/orders/:id/tracking-live` | Yes |
| `GET` | `/api/v1/orders/:id/invoice` | Yes |
| `PATCH` | `/api/v1/orders/:id/cancel` | Yes |
| `POST` | `/api/v1/orders/:id/reorder` | Yes |

## Returns & Refunds

| Method | Endpoint | Auth |
| :--- | :--- | :--- |
| `POST` | `/api/v1/orders/:id/return` | Yes |
| `GET` | `/api/v1/returns` | Yes |
| `GET` | `/api/v1/returns/:id` | Yes |

## Payments

| Method | Endpoint | Auth |
| :--- | :--- | :--- |
| `POST` | `/api/v1/payments/create-order` | Yes |
| `POST` | `/api/v1/payments/verify` | Yes |
| `POST` | `/api/v1/payments/retry` | Yes |
| `GET` | `/api/v1/payments/:id` | Yes |
| `POST` | `/api/v1/payments/cod/confirm` | Yes |
| `POST` | `/api/v1/payments/webhook` | No |

## Reviews

| Method | Endpoint | Auth |
| :--- | :--- | :--- |
| `POST` | `/api/v1/reviews` | Yes |
| `GET` | `/api/v1/reviews` | No |
| `GET` | `/api/v1/reviews/:id` | No |
| `PATCH` | `/api/v1/reviews/:id/helpful` | Yes |

## Notifications

| Method | Endpoint | Auth |
| :--- | :--- | :--- |
| `GET` | `/api/v1/notifications` | Yes |
| `PATCH` | `/api/v1/notifications/read-all` | Yes |
| `PATCH` | `/api/v1/notifications/:id/read` | Yes |
