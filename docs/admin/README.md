# Admin API Endpoint Index

This file lists all administrative endpoints available under `/api/v1/admin`.

> **Base URL:** `/api/v1/admin`  
> **Total Admin Endpoints:** 100  
> **Master Reference Guide:** [admin_api.md](admin_api.md)

---

## Quick Navigation

- [System & Health](#system--health)
- [Authentication & Session Management](#authentication--session-management)
- [Executive Dashboard](#executive-dashboard)
- [Business Intelligence & Analytics](#business-intelligence--analytics)
- [Customer Management](#customer-management)
- [Products Catalog & Inventory](#products-catalog--inventory)
- [Categories Management](#categories-management)
- [Orders Processing & Fulfillment](#orders-processing--fulfillment)
- [Review Moderation](#review-moderation)
- [Shipping & Courier Logistics](#shipping--courier-logistics)
- [Marketing Campaigns & Messaging](#marketing-campaigns--messaging)
- [Editorial Blogs](#editorial-blogs)
- [Blog Categories](#blog-categories)
- [Reports & Financial Ledgers](#reports--financial-ledgers)
- [Store & System Settings](#store--system-settings)
- [Media Uploads & File Management](#media-uploads--file-management)

---

## System & Health

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | No | Server uptime and health ping check |
| `GET` | `/ready` | No | Database connection readiness verification |
| `GET` | `/metrics` | No | System node version, uptime, and memory heap statistics |

## Authentication & Session Management

📘 Detailed Documentation: [auth.md](auth.md)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/admin/auth/login` | No | Authenticate admin credentials and return JWT access token and session ID |
| `POST` | `/api/v1/admin/auth/forgot-password` | No | Send 6-digit password reset OTP to admin email address |
| `POST` | `/api/v1/admin/auth/verify-reset-otp` | No | Verify password reset OTP for account recovery |
| `POST` | `/api/v1/admin/auth/reset-password` | No | Reset admin password using verified OTP |
| `POST` | `/api/v1/admin/auth/change-password` | Admin | Change current admin password (requires current password verification) |
| `POST` | `/api/v1/admin/auth/logout` | Admin | Terminate and invalidate current admin active session |
| `GET` | `/api/v1/admin/auth/me` | Admin | Retrieve profile information of currently authenticated admin |
| `GET` | `/api/v1/admin/auth/sessions` | Admin | List all active login sessions and devices for current admin |
| `DELETE` | `/api/v1/admin/auth/sessions/:sessionId` | Admin | Terminate and revoke a specific active session by session ID |

## Executive Dashboard

📘 Detailed Documentation: [dashboard.md](dashboard.md)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/dashboard` | Admin | Retrieve consolidated dashboard summary including KPIs, charts, and recent activity |
| `GET` | `/api/v1/admin/dashboard/stats` | Admin | Retrieve high-level KPI cards and metric growth comparisons across selected period |
| `GET` | `/api/v1/admin/dashboard/sales-chart` | Admin | Retrieve time-series sales, revenue, and order volume data for visual charts |
| `GET` | `/api/v1/admin/dashboard/recent-orders` | Admin | Retrieve list of latest orders with customer details, item summaries, and status |
| `GET` | `/api/v1/admin/dashboard/order-status-summary` | Admin | Retrieve count breakdown of orders across all fulfillment lifecycle statuses |
| `GET` | `/api/v1/admin/dashboard/top-categories` | Admin | Retrieve top-selling categories ranked by gross revenue and units sold |
| `GET` | `/api/v1/admin/dashboard/low-stock` | Admin | Retrieve list of products and SKU variants below low-stock threshold |

## Business Intelligence & Analytics

📘 Detailed Documentation: [analytics.md](analytics.md)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/analytics/sales` | Admin | Retrieve sales performance trends, total units sold, and average order value (AOV) |
| `GET` | `/api/v1/admin/analytics/revenue` | Admin | Retrieve gross revenue, net revenue, discounts, refunds, and period comparisons |
| `GET` | `/api/v1/admin/analytics/orders` | Admin | Retrieve order volume trends, status breakdown, and peak ordering time heatmaps |
| `GET` | `/api/v1/admin/analytics/customers` | Admin | Retrieve customer acquisition metrics, cohort retention, repeat buyer rate, and top spenders |
| `GET` | `/api/v1/admin/analytics/products` | Admin | Retrieve product sales velocity, category revenue breakdown, and inventory health |

## Customer Management

📘 Detailed Documentation: [customers.md](customers.md)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/customers` | Admin | Search, filter, sort, and paginate registered customers directory |
| `GET` | `/api/v1/admin/customers/:id` | Admin | Retrieve comprehensive customer profile including lifetime stats and order summary |
| `GET` | `/api/v1/admin/customers/:id/orders` | Admin | Retrieve paginated order history for a specific customer |
| `GET` | `/api/v1/admin/customers/:id/addresses` | Admin | List all saved delivery addresses for a specific customer |
| `GET` | `/api/v1/admin/customers/:id/pets` | Admin | List all registered pet profiles associated with a specific customer |
| `PATCH` | `/api/v1/admin/customers/:id/status` | Admin | Update customer account status (ACTIVE, BLOCKED) and revoke active tokens on block |

## Products Catalog & Inventory

📘 Detailed Documentation: [products.md](products.md)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/products` | Admin | List products catalog with multi-attribute filtering, stock filters, and pagination |
| `POST` | `/api/v1/admin/products` | Admin | Create a new product catalog item with SKU variants, specifications, and media |
| `GET` | `/api/v1/admin/products/:id` | Admin | Retrieve detailed product information by ID or slug including variants and media gallery |
| `PATCH` | `/api/v1/admin/products/:id` | Admin | Update product fields, attributes, SKU variants, and media assets |
| `PATCH` | `/api/v1/admin/products/:id/status` | Admin | Update product publishing status (ACTIVE, DRAFT, INACTIVE) |
| `PATCH` | `/api/v1/admin/products/:id/stock` | Admin | Quick update inventory stock quantities for a product and its variants |
| `DELETE` | `/api/v1/admin/products/:id` | Admin | Soft-delete a product (or permanent delete when query parameter `permanent=true`) |
| `PATCH` | `/api/v1/admin/products/bulk-status` | Admin | Bulk update publishing status for multiple products simultaneously |
| `POST` | `/api/v1/admin/products/bulk-delete` | Admin | Bulk soft-delete or permanently delete multiple products by IDs |

## Categories Management

📘 Detailed Documentation: [categories.md](categories.md)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/categories` | Admin | List categories with parent/child filtering, status filters, and product counts |
| `GET` | `/api/v1/admin/categories/tree` | Admin | Retrieve complete hierarchical category tree (root categories with nested subcategories) |
| `POST` | `/api/v1/admin/categories` | Admin | Create a new root category or subcategory with slug, image, and display order |
| `GET` | `/api/v1/admin/categories/:id` | Admin | Retrieve category details with subcategories list and total assigned product count |
| `PATCH` | `/api/v1/admin/categories/:id` | Admin | Update category details, name, slug, banner image, display order, or parent category |
| `PATCH` | `/api/v1/admin/categories/:id/status` | Admin | Toggle category active/inactive visibility status |
| `PATCH` | `/api/v1/admin/categories/reorder` | Admin | Bulk update display sequence and order index across multiple categories |
| `DELETE` | `/api/v1/admin/categories/:id` | Admin | Delete a category (prevented if active products or child subcategories are assigned) |

## Orders Processing & Fulfillment

📘 Detailed Documentation: [orders.md](orders.md)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/orders` | Admin | List all orders with filters by status, payment, date range, search, and pagination |
| `GET` | `/api/v1/admin/orders/:id` | Admin | Retrieve complete order details including line items, shipping address, and payment info |
| `PATCH` | `/api/v1/admin/orders/:id/status` | Admin | Update order fulfillment status and attach courier tracking number and partner info |
| `POST` | `/api/v1/admin/orders/:id/cancel` | Admin | Cancel an order with specified cancellation reason and automatically restock inventory |
| `POST` | `/api/v1/admin/orders/:id/refund` | Admin | Initiate and process gateway or manual refund for full order or individual line items |
| `GET` | `/api/v1/admin/orders/:id/invoice` | Admin | Generate official GST-compliant tax invoice data and breakdown for an order |
| `GET` | `/api/v1/admin/orders/:id/packing-slip` | Admin | Generate warehouse fulfillment packing slip for shipment dispatch packaging |

## Review Moderation

📘 Detailed Documentation: [reviews.md](reviews.md)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/reviews` | Admin | List product reviews with moderation status filters, star rating filters, and search |
| `GET` | `/api/v1/admin/reviews/:id` | Admin | Retrieve single review details including customer profile, product, and admin reply |
| `PATCH` | `/api/v1/admin/reviews/:id/status` | Admin | Moderate review publishing status (APPROVED, REJECTED, PENDING) |
| `POST` | `/api/v1/admin/reviews/:id/reply` | Admin | Post or update an official store admin response to a customer review |
| `PATCH` | `/api/v1/admin/reviews/:id/spam` | Admin | Flag or unflag a customer review as spam |

## Shipping & Courier Logistics

📘 Detailed Documentation: [shipping.md](shipping.md)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/shipments` | Admin | List all shipments with status filters, courier partner filters, and delivery KPIs (Alias: `/api/v1/admin/shipping`) |
| `GET` | `/api/v1/admin/shipments/:id` | Admin | Retrieve comprehensive shipment details including destination address and courier info |
| `POST` | `/api/v1/admin/shipments/:id/assign` | Admin | Assign courier partner and generate or attach AWB tracking number to shipment |
| `PATCH` | `/api/v1/admin/shipments/:id/status` | Admin | Update shipment delivery milestone status (SHIPPED, OUT_FOR_DELIVERY, DELIVERED, RTO) |
| `GET` | `/api/v1/admin/shipments/:id/tracking` | Admin | Retrieve live tracking timeline checkpoints and courier partner tracking URL |

## Marketing Campaigns & Messaging

📘 Detailed Documentation: [campaigns.md](campaigns.md)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/campaigns` | Admin | List marketing campaigns with channel (WhatsApp/SMS/Email), status, and date filters |
| `POST` | `/api/v1/admin/campaigns` | Admin | Create a new campaign targeting specific customer segments with message template |
| `GET` | `/api/v1/admin/campaigns/:id` | Admin | Retrieve campaign configuration, message body, schedule, and audience criteria |
| `PATCH` | `/api/v1/admin/campaigns/:id` | Admin | Edit draft or scheduled campaign details, message content, or target audience |
| `DELETE` | `/api/v1/admin/campaigns/:id` | Admin | Delete draft campaign or cancel scheduled campaign |
| `POST` | `/api/v1/admin/campaigns/:id/send` | Admin | Trigger immediate dispatch of campaign messages to BullMQ queue |
| `POST` | `/api/v1/admin/campaigns/:id/cancel` | Admin | Cancel a scheduled or actively processing campaign broadcast |
| `GET` | `/api/v1/admin/campaigns/:id/stats` | Admin | Retrieve real-time delivery metrics (sent, delivered, read, and failed counts) |

## Editorial Blogs

📘 Detailed Documentation: [blogs.md](blogs.md)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/blogs` | Admin | List blog articles with publish status, category, tag filters, search, and pagination |
| `POST` | `/api/v1/admin/blogs` | Admin | Create and publish or draft a new rich-content blog article |
| `GET` | `/api/v1/admin/blogs/:id` | Admin | Retrieve single blog post details by UUID or URL slug |
| `PATCH` | `/api/v1/admin/blogs/:id` | Admin | Update blog post title, slug, content, banner image, SEO metadata, and tags |
| `DELETE` | `/api/v1/admin/blogs/:id` | Admin | Soft-delete a blog post (or permanent delete when query parameter `permanent=true`) |

## Blog Categories

📘 Detailed Documentation: [blogs.md](blogs.md)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/blog-categories` | Admin | List all blog categories with article count metrics |
| `POST` | `/api/v1/admin/blog-categories` | Admin | Create a new blog category |
| `PATCH` | `/api/v1/admin/blog-categories/:id` | Admin | Update blog category name, slug, or description |
| `DELETE` | `/api/v1/admin/blog-categories/:id` | Admin | Delete a blog category |

## Reports & Financial Ledgers

📘 Detailed Documentation: [reports.md](reports.md)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/reports/sales` | Admin | Retrieve tabular sales performance report aggregated by day, week, or month |
| `GET` | `/api/v1/admin/reports/sales/export` | Admin | Download sales ledger report as exported CSV or JSON file |
| `GET` | `/api/v1/admin/reports/orders` | Admin | Retrieve order lifecycle, fulfillment efficiency, and cancellation rate report |
| `GET` | `/api/v1/admin/reports/customers` | Admin | Retrieve customer acquisition, repeat purchasing, and lifetime value (LTV) report |
| `GET` | `/api/v1/admin/reports/products` | Admin | Retrieve product sales velocity, top performers, and inventory turnover report |
| `GET` | `/api/v1/admin/reports/refunds` | Admin | Retrieve returns, refunds, and financial adjustments ledger report |
| `GET` | `/api/v1/admin/reports/gst` | Admin | Retrieve GST compliance tax report with CGST, SGST, and IGST breakdowns |

## Store & System Settings

📘 Detailed Documentation: [settings.md](settings.md)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/settings` | Admin | Retrieve consolidated store configuration across all groups (sensitive keys masked) |
| `PATCH` | `/api/v1/admin/settings` | Admin | Bulk update configurations across multiple settings groups simultaneously |
| `GET` | `/api/v1/admin/settings/general` | Admin | Retrieve general platform settings (store name, support email, maintenance mode) |
| `PATCH` | `/api/v1/admin/settings/general` | Admin | Update general platform settings and operational toggles |
| `GET` | `/api/v1/admin/settings/store` | Admin | Retrieve store profile, legal identity, and physical warehouse address |
| `PATCH` | `/api/v1/admin/settings/store` | Admin | Update store contact information, legal business details, and operating currency |
| `GET` | `/api/v1/admin/settings/payment` | Admin | Retrieve payment gateway configuration and active payment options |
| `PATCH` | `/api/v1/admin/settings/payment` | Admin | Update Razorpay credentials, COD availability, and payment method toggles |
| `GET` | `/api/v1/admin/settings/tax` | Admin | Retrieve GST rates, default HSN codes, and tax calculation rules |
| `PATCH` | `/api/v1/admin/settings/tax` | Admin | Update GST tax rates and tax computation preferences |
| `GET` | `/api/v1/admin/settings/delivery` | Admin | Retrieve delivery fee calculation rules, free shipping thresholds, and estimated ETAs |
| `PATCH` | `/api/v1/admin/settings/delivery` | Admin | Update shipping rates, minimum order value for free delivery, and courier defaults |

## Media Uploads & File Management

📘 Detailed Documentation: [upload.md](upload.md)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/upload/config` | Admin | Retrieve upload configurations, allowed MIME types, and file size limits |
| `POST` | `/api/v1/admin/upload` | Admin | Upload a single image file with size validation (2MB to 5MB) |
| `POST` | `/api/v1/admin/upload/multiple` | Admin | Upload multiple image files in batch (up to 10 files per request, 2MB to 5MB each) |
