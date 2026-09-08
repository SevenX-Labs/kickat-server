# Complete Admin API Reference Guide

Welcome to the Kickat E-Commerce Admin API reference guide. All endpoints are served under the base URL prefix `/api/v1/admin` and require Admin Authentication (`@AdminAuth()`).

---

## Quick Navigation

- [1. Admin Authentication & Session Management](#1-admin-authentication--session-management)
- [2. Executive Dashboard](#2-executive-dashboard)
- [3. Business Intelligence & Analytics](#3-business-intelligence--analytics)
- [4. Customer Management](#4-customer-management)
- [5. Products & Inventory Management](#5-products--inventory-management)
- [6. Category Hierarchy & Reordering](#6-category-hierarchy--reordering)
- [7. Order Processing, Invoicing & Refunds](#7-order-processing-invoicing--refunds)
- [8. Review Moderation & Store Replies](#8-review-moderation--store-replies)
- [9. Shipping & Courier Logistics](#9-shipping--courier-logistics)
- [10. Marketing Campaigns & Messaging](#10-marketing-campaigns--messaging)
- [11. Editorial Blogs & CMS](#11-editorial-blogs--cms)
- [12. Reports & Financial Ledgers](#12-reports--financial-ledgers)
- [13. Store & System Settings](#13-store--system-settings)
- [14. Media Uploads & File Management](#14-media-uploads--file-management)

---

## 1. Admin Authentication & Session Management

📘 Detailed Specification & Frontend Guide: [auth.md](auth.md)

Base Path: `/api/v1/admin/auth`

### POST `/api/v1/admin/auth/login`
- **Auth Required**: No
- **Request Body**: `{ "adminId": "kickat2021", "password": "SecurePassword123" }`
- **Description**: Admin login returning JWT `accessToken`, `refreshToken`, and admin profile details.

### POST `/api/v1/admin/auth/forgot-password`
- **Auth Required**: No
- **Request Body**: `{ "adminId": "kickat2021" }`
- **Description**: Sends 6-digit password reset OTP to admin registered email (Max 3/hr).

### POST `/api/v1/admin/auth/verify-reset-otp`
- **Auth Required**: No
- **Request Body**: `{ "adminId": "kickat2021", "otp": "123456" }`
- **Description**: Verifies OTP and returns temporary UUID `resetToken` valid for 10 minutes.

### POST `/api/v1/admin/auth/reset-password`
- **Auth Required**: No
- **Request Body**: `{ "resetToken": "UUID_V4", "newPassword": "NewSecurePassword@123", "confirmPassword": "NewSecurePassword@123" }`
- **Description**: Resets admin password using verified `resetToken`.

### POST `/api/v1/admin/auth/change-password`
- **Auth Required**: Admin Auth (`Bearer <token>`)
- **Request Body**: `{ "currentPassword": "OldPassword@123", "newPassword": "NewPassword@123", "confirmPassword": "NewPassword@123" }`
- **Description**: Changes logged-in admin password.

### POST `/api/v1/admin/auth/logout`
- **Auth Required**: Admin Auth (`Bearer <token>`)
- **Request Body**: `{ "refreshToken": "eyJhbGciOi..." }`
- **Description**: Invalidate refresh token and revoke active database session.

### GET `/api/v1/admin/auth/me`
- **Auth Required**: Admin Auth (`Bearer <token>`)
- **Description**: Retrieves current logged-in admin profile, role, and permissions.

### GET `/api/v1/admin/auth/sessions`
- **Auth Required**: Admin Auth (`Bearer <token>`)
- **Description**: Returns all active login sessions and devices for the admin.

### DELETE `/api/v1/admin/auth/sessions/:sessionId`
- **Auth Required**: Admin Auth (`Bearer <token>`)
- **Description**: Revokes a specific active admin session by session UUID.

---

## 2. Executive Dashboard

📘 Detailed Specification & Frontend Guide: [dashboard.md](dashboard.md)

Base Path: `/api/v1/admin/dashboard`

### GET `/api/v1/admin/dashboard`
- **Auth Required**: Admin Auth (`Bearer <token>`)
- **Query Params**: `period` (today, 7d, 30d, etc.), `startDate`, `endDate`, `lowStockThreshold`, `recentOrdersLimit`, `topCategoriesLimit`
- **Description**: Consolidated dashboard summary returning stats, sales charts, order status breakdown, top categories, recent orders, low stock, and payment methods.

### GET `/api/v1/admin/dashboard/stats`
- **Auth Required**: Admin Auth (`Bearer <token>`)
- **Query Params**: `period`, `startDate`, `endDate`, `lowStockThreshold`
- **Description**: KPI cards (total revenue, orders, customers, today sales, pending orders, low-stock count, refund requests, and growth % vs previous period).

### GET `/api/v1/admin/dashboard/sales-chart`
- **Auth Required**: Admin Auth (`Bearer <token>`)
- **Query Params**: `period` (`today`, `7d`, `30d`, `this_month`, `this_year`, `12m`, `all`, `custom`), `groupBy` (`hour`, `day`, `week`, `month`), `startDate`, `endDate`
- **Description**: Time-series chart series (revenue, order counts, items count, AOV) for Recharts / Chart.js.

### GET `/api/v1/admin/dashboard/recent-orders`
- **Auth Required**: Admin Auth (`Bearer <token>`)
- **Query Params**: `limit` (default: 10), `status` (`OrderStatusEnum`)
- **Description**: Recent orders stream with customer profile, items summary, fulfillment status, and payment details.

### GET `/api/v1/admin/dashboard/order-status-summary`
- **Auth Required**: Admin Auth (`Bearer <token>`)
- **Description**: Order count, revenue, and percentage distribution across all 10 order lifecycle statuses.

### GET `/api/v1/admin/dashboard/top-categories`
- **Auth Required**: Admin Auth (`Bearer <token>`)
- **Query Params**: `period`, `limit` (default: 5), `startDate`, `endDate`
- **Description**: Top-selling categories ranked by revenue, units sold, and % share of total store sales.

### GET `/api/v1/admin/dashboard/low-stock`
- **Auth Required**: Admin Auth (`Bearer <token>`)
- **Query Params**: `threshold` (default: 10), `limit` (default: 20), `page` (default: 1)
- **Description**: Paginated list of products and SKU variants below the stock threshold, sorted by lowest stock.

---

## 3. Business Intelligence & Analytics

📘 Detailed Specification & Frontend Guide: [analytics.md](analytics.md)

Base Path: `/api/v1/admin/analytics`

### GET `/api/v1/admin/analytics/sales`
- **Description**: Sales performance trends, units sold, and AOV.

### GET `/api/v1/admin/analytics/revenue`
- **Description**: Gross & net revenue, refunds, and period comparisons.

### GET `/api/v1/admin/analytics/orders`
- **Description**: Order volume breakdown and hourly distribution.

### GET `/api/v1/admin/analytics/customers`
- **Description**: Customer acquisition trends and retention metrics.

### GET `/api/v1/admin/analytics/products`
- **Description**: Product performance ranking and category metrics.

---

## 4. Customer Management

📘 Detailed Specification & Frontend Guide: [customers.md](customers.md)

Base Path: `/api/v1/admin/customers`

### GET `/api/v1/admin/customers`
- **Query Params**: `page`, `limit`, `search`, `status` (`ACTIVE`, `BLOCKED`)
- **Description**: Paginated customer directory with search and status filter.

### GET `/api/v1/admin/customers/:id`
- **Description**: Full customer detail including lifetime spend and order metrics.

### GET `/api/v1/admin/customers/:id/orders`
- **Description**: Customer's complete order history.

### GET `/api/v1/admin/customers/:id/addresses`
- **Description**: Customer's saved delivery addresses.

### GET `/api/v1/admin/customers/:id/pets`
- **Description**: Customer's registered pet profiles.

### PATCH `/api/v1/admin/customers/:id/status`
- **Request Body**: `{ "status": "BLOCKED", "reason": "Fraudulent activity" }`
- **Description**: Block or unblock customer (revokes tokens on block).

---

## 5. Products & Inventory Management

📘 Detailed Specification & Frontend Guide: [products.md](products.md)

Base Path: `/api/v1/admin/products`

### GET `/api/v1/admin/products`
- **Query Params**: `page`, `limit`, `search`, `status`, `categoryId`, `stock`
- **Description**: List products with filter, search, and pagination.

### GET `/api/v1/admin/products/:id`
- **Description**: Single product detail by ID or Slug.

### POST `/api/v1/admin/products`
- **Request Body**: Product object with variants and media.
- **Description**: Create a new catalog product.

### PATCH `/api/v1/admin/products/:id`
- **Description**: Edit product details, variants, or images.

### PATCH `/api/v1/admin/products/:id/status`
- **Request Body**: `{ "status": "ACTIVE" | "DRAFT" | "INACTIVE" }`
- **Description**: Change product status.

### PATCH `/api/v1/admin/products/:id/stock`
- **Request Body**: `{ "stock": 50, "variantStock": [{ "variantId": "UUID", "stock": 20 }] }`
- **Description**: Quick update stock levels.

### DELETE `/api/v1/admin/products/:id`
- **Query Param**: `permanent=true` (optional)
- **Description**: Soft-delete or permanently delete product.

### PATCH `/api/v1/admin/products/bulk-status`
- **Request Body**: `{ "productIds": ["UUID"], "status": "ACTIVE" }`
- **Description**: Bulk status update.

### POST `/api/v1/admin/products/bulk-delete`
- **Request Body**: `{ "productIds": ["UUID"], "permanent": false }`
- **Description**: Bulk deletion of products.

---

## 6. Category Hierarchy & Reordering

📘 Detailed Specification & Frontend Guide: [categories.md](categories.md)

Base Path: `/api/v1/admin/categories`

### GET `/api/v1/admin/categories`
- **Description**: List all categories with product counts.

### GET `/api/v1/admin/categories/tree`
- **Description**: Complete hierarchical category tree.

### GET `/api/v1/admin/categories/:id`
- **Description**: Get category details.

### POST `/api/v1/admin/categories`
- **Request Body**: `{ "name": "Cat Toys", "slug": "cat-toys", "parentId": "UUID" }`
- **Description**: Create category or subcategory.

### PATCH `/api/v1/admin/categories/:id`
- **Description**: Update category fields, slug, image, or parentId.

### PATCH `/api/v1/admin/categories/:id/status`
- **Request Body**: `{ "isActive": true }`
- **Description**: Toggle category active status.

### PATCH `/api/v1/admin/categories/reorder`
- **Request Body**: `{ "orders": [{ "id": "UUID", "displayOrder": 1 }] }`
- **Description**: Reorder category display sequence.

### DELETE `/api/v1/admin/categories/:id`
- **Description**: Delete category (protected if products exist).

---

## 7. Order Processing, Invoicing & Refunds

📘 Detailed Specification & Frontend Guide: [orders.md](orders.md)

Base Path: `/api/v1/admin/orders`

### GET `/api/v1/admin/orders`
- **Query Params**: `page`, `limit`, `search`, `status`, `paymentStatus`, `dateFrom`, `dateTo`
- **Description**: Master orders ledger with search and filters.

### GET `/api/v1/admin/orders/:id`
- **Description**: Complete order details with customer, items, payment & shipment status.

### GET `/api/v1/admin/orders/:id/invoice`
- **Description**: Generate official tax invoice with GST breakdown.

### GET `/api/v1/admin/orders/:id/packing-slip`
- **Description**: Generate warehouse fulfillment packing slip.

### PATCH `/api/v1/admin/orders/:id/status`
- **Request Body**: `{ "status": "SHIPPED", "courierName": "BlueDart", "trackingNumber": "BD123456" }`
- **Description**: Update order lifecycle status and tracking information.

### POST `/api/v1/admin/orders/:id/cancel`
- **Request Body**: `{ "reason": "Out of stock item", "restock": true }`
- **Description**: Cancel order and restock inventory.

### POST `/api/v1/admin/orders/:id/refund`
- **Request Body**: `{ "amount": 1299.0, "reason": "Customer return approved" }`
- **Description**: Issue refund for order.

---

## 8. Review Moderation & Store Replies

📘 Detailed Specification & Frontend Guide: [reviews.md](reviews.md)

Base Path: `/api/v1/admin/reviews`

### GET `/api/v1/admin/reviews`
- **Query Params**: `page`, `limit`, `status` (`PENDING`, `APPROVED`, `REJECTED`), `rating`, `isSpam`
- **Description**: List product reviews for moderation.

### GET `/api/v1/admin/reviews/:id`
- **Description**: Single review detail.

### PATCH `/api/v1/admin/reviews/:id/status`
- **Request Body**: `{ "status": "APPROVED" }`
- **Description**: Approve or reject review.

### POST `/api/v1/admin/reviews/:id/reply`
- **Request Body**: `{ "reply": "Thank you for your feedback! We are delighted you loved the product." }`
- **Description**: Add official store admin response to customer review.

### PATCH `/api/v1/admin/reviews/:id/spam`
- **Request Body**: `{ "isSpam": true }`
- **Description**: Flag or unflag review as spam.

---

## 9. Shipping & Courier Logistics

📘 Detailed Specification & Frontend Guide: [shipping.md](shipping.md)

Base Path: `/api/v1/admin/shipments` (or `/api/v1/admin/shipping`)

### GET `/api/v1/admin/shipments`
- **Query Params**: `page`, `limit`, `status`, `courier`
- **Description**: List all shipments and courier tracking states.

### GET `/api/v1/admin/shipments/:id`
- **Description**: Detailed shipment info.

### GET `/api/v1/admin/shipments/:id/tracking`
- **Description**: Live tracking checkpoints and courier URL.

### POST `/api/v1/admin/shipments/:id/assign`
- **Request Body**: `{ "courierName": "Delhivery", "awbNumber": "DLV987654321" }`
- **Description**: Assign courier partner and generate AWB.

### PATCH `/api/v1/admin/shipments/:id/status`
- **Request Body**: `{ "status": "OUT_FOR_DELIVERY" }`
- **Description**: Update shipment delivery status.

---

## 10. Marketing Campaigns & Messaging

📘 Detailed Specification & Frontend Guide: [campaigns.md](campaigns.md)

Base Path: `/api/v1/admin/campaigns`

### GET `/api/v1/admin/campaigns`
- **Description**: List WhatsApp, SMS, and Email marketing campaigns.

### GET `/api/v1/admin/campaigns/:id`
- **Description**: Campaign configuration and message template.

### POST `/api/v1/admin/campaigns`
- **Request Body**: `{ "name": "Festive Sale", "channel": "WHATSAPP", "message": "Special 20% Off!" }`
- **Description**: Create campaign.

### PATCH `/api/v1/admin/campaigns/:id`
- **Description**: Edit draft or scheduled campaign.

### DELETE `/api/v1/admin/campaigns/:id`
- **Description**: Delete campaign.

### POST `/api/v1/admin/campaigns/:id/send`
- **Description**: Dispatch campaign via BullMQ queues.

### POST `/api/v1/admin/campaigns/:id/cancel`
- **Description**: Cancel scheduled campaign.

### GET `/api/v1/admin/campaigns/:id/stats`
- **Description**: Delivery performance metrics (Sent, Delivered, Failed).

---

## 11. Editorial Blogs & CMS

📘 Detailed Specification & Frontend Guide: [blogs.md](blogs.md)

Base Paths: `/api/v1/admin/blogs` & `/api/v1/admin/blog-categories`

### GET `/api/v1/admin/blogs`
- **Description**: List blog posts with publish status filters.

### GET `/api/v1/admin/blogs/:id`
- **Description**: Get single blog post by ID or Slug.

### POST `/api/v1/admin/blogs`
- **Description**: Create blog post.

### PATCH `/api/v1/admin/blogs/:id`
- **Description**: Edit blog post content or publish status.

### DELETE `/api/v1/admin/blogs/:id`
- **Description**: Soft or permanent delete blog post.

### GET `/api/v1/admin/blog-categories`
- **Description**: List blog categories.

### POST `/api/v1/admin/blog-categories`
- **Description**: Create blog category.

### PATCH `/api/v1/admin/blog-categories/:id`
- **Description**: Edit blog category.

### DELETE `/api/v1/admin/blog-categories/:id`
- **Description**: Delete blog category.

---

## 12. Reports & Financial Ledgers

📘 Detailed Specification & Frontend Guide: [reports.md](reports.md)

Base Path: `/api/v1/admin/reports`

### GET `/api/v1/admin/reports/sales`
- **Description**: Tabular sales performance report.

### GET `/api/v1/admin/reports/sales/export`
- **Query Params**: `format` (`csv` | `json`), `startDate`, `endDate`
- **Description**: Downloadable CSV or JSON sales report export.

### GET `/api/v1/admin/reports/orders`
- **Description**: Order lifecycle fulfillment report.

### GET `/api/v1/admin/reports/customers`
- **Description**: Customer acquisition & LTV report.

### GET `/api/v1/admin/reports/products`
- **Description**: Inventory movement and sales volume report.

### GET `/api/v1/admin/reports/refunds`
- **Description**: Refund and return ledger.

### GET `/api/v1/admin/reports/gst`
- **Description**: GST tax compliance and tax ledger.

---

## 13. Store & System Settings

📘 Detailed Specification & Frontend Guide: [settings.md](settings.md)

Base Path: `/api/v1/admin/settings`

### GET `/api/v1/admin/settings`
- **Description**: Consolidated view of all platform settings (secrets masked).

### PATCH `/api/v1/admin/settings`
- **Description**: Bulk update settings.

### GET `/api/v1/admin/settings/general` & PATCH
- **Description**: App name, support email, contact phone, maintenance mode.

### GET `/api/v1/admin/settings/store` & PATCH
- **Description**: Currency, regional preferences, store address.

### GET `/api/v1/admin/settings/payment` & PATCH
- **Description**: Razorpay API keys, COD availability rules, minimum COD amount.

### GET `/api/v1/admin/settings/tax` & PATCH
- **Description**: GST percentage rate, HSN codes, tax inclusive settings.

### GET `/api/v1/admin/settings/delivery` & PATCH
- **Description**: Free delivery threshold amount, default shipping fees, courier rules.


---

## 14. Media Uploads & File Management

📘 Detailed Specification & Frontend Guide: [upload.md](upload.md)

Base Path: `/api/v1/admin/upload`

### GET `/api/v1/admin/upload/config`
- **Auth Required**: Admin Auth (`Bearer <token>`)
- **Description**: Returns allowed image MIME types, active Supabase bucket, and size constraints (2MB to 5MB).

### POST `/api/v1/admin/upload`
- **Auth Required**: Admin Auth (`Bearer <token>`)
- **Headers**: `Content-Type: multipart/form-data`
- **Body**: `file` (Binary image file, 2MB–5MB)
- **Description**: Uploads single image file targeting Supabase Storage with local disk fallback.

### POST `/api/v1/admin/upload/multiple`
- **Auth Required**: Admin Auth (`Bearer <token>`)
- **Headers**: `Content-Type: multipart/form-data`
- **Body**: `files` (Array of binary image files, max 10 files, 2MB–5MB each)
- **Description**: Batch upload multiple images in a single request.
