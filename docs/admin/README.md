# Kickat Admin Documentation & API Endpoint Index

This directory contains master technical specifications and frontend integration guides for the Kickat E-Commerce Admin Platform (`/api/v1/admin`).

> **Base URL:** `/api/v1/admin`  
> **Master Reference Index:** [admin_api.md](admin_api.md)

---

## Detailed Specification Modules

| Module | Documentation File | Key Capabilities & Endpoints |
| :--- | :--- | :--- |
| **Authentication & Sessions** | [auth.md](auth.md) | Admin login, JWT tokens, session validation, password reset OTP |
| **Cart Engine & Fees** | [cart.md](cart.md) | Dynamic fee engine, 100-item safety limits, guest session merging, buy now |
| **Categories Management** | [categories.md](categories.md) | Category trees, subcategory hierarchy, reordering, product protection |
| **Products & Inventory** | [products.md](products.md) | Product CRUD, SKUs/variants, bulk status, low stock alerts |
| **Orders & Fulfillment** | [orders.md](orders.md) | Order status lifecycle, PDF tax invoices, packing slips, returns receipt |
| **Payments & Refund Audit** | [payments.md](payments.md) | Razorpay/Stripe/COD/Wallet, Webhook signatures, COD refund confirmation, refund audit logs |
| **Store Settings & Config** | [settings.md](settings.md) | General, Payment keys, Tax/GST rules, Delivery fees, Public metadata |
| **Executive Dashboard** | [dashboard.md](dashboard.md) | KPI metrics, sales revenue charts, order counts, customer velocity |
| **Business Intelligence** | [analytics.md](analytics.md) | Category distribution, top products, sales reports, funnel conversions |
| **Customer Management** | [customers.md](customers.md) | Customer lists, profile views, order history, block/unblock controls |
| **Review Moderation** | [reviews.md](reviews.md) | Customer reviews, approval/rejection moderation, photo moderation |
| **Shipping Logistics** | [shipping.md](shipping.md) | Courier partners, tracking links, delivery zones |
| **Marketing Campaigns** | [campaigns.md](campaigns.md) | Email/SMS/WhatsApp campaigns via BullMQ, recipient scheduling |
| **Editorial Blogs** | [blogs.md](blogs.md) | Blog posts, categories, tags, author metadata |
| **Reports & Financial Ledgers**| [reports.md](reports.md) | Financial ledgers, tax exports, sales data breakdown |
| **Media Uploads** | [upload.md](upload.md) | Supabase image upload, thumbnail generation, media deletion |

---

## Quick Navigation Index

- [System & Health Check](#system--health-check)
- [Authentication & Sessions](#authentication--sessions)
- [Cart Engine](#cart-engine)
- [Categories Management](#categories-management)
- [Products Catalog & Inventory](#products-catalog--inventory)
- [Orders & Refunds](#orders--refunds)
- [Payments & Audit](#payments--audit)
- [Store Settings](#store-settings)

---

## System & Health Check

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | No | Server uptime and health ping check |
| `GET` | `/ready` | No | Database connection readiness verification |
| `GET` | `/metrics` | No | Node version, process uptime, and memory heap statistics |

---

## Cart Engine

📘 Detailed Documentation: [cart.md](cart.md)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/cart` | User | Retrieve customer cart with computed fee summary |
| `POST` | `/api/v1/cart/items` | User | Add product line item to cart |
| `PUT` | `/api/v1/cart/items/:itemId` | User | Update quantity for item |
| `DELETE` | `/api/v1/cart/items/:itemId` | User | Remove item from cart |
| `POST` | `/api/v1/cart/buy-now` | User | Create immediate Buy Now session |
| `POST` | `/api/v1/cart/guest` | Public | Add item to guest session cart |
| `GET` | `/api/v1/cart/guest/:sessionId` | Public | Retrieve guest session cart |
| `POST` | `/api/v1/cart/merge` | User | Merge guest session items into user account |

---

## Orders & Refunds

📘 Detailed Documentation: [orders.md](orders.md)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/orders` | Admin | Filter, search, and paginate store orders |
| `GET` | `/api/v1/admin/orders/:id` | Admin | Get single order details |
| `PATCH` | `/api/v1/admin/orders/:id/status` | Admin | Update order status and courier tracking info |
| `POST` | `/api/v1/admin/orders/:id/cancel` | Admin | Cancel order and restock inventory |
| `POST` | `/api/v1/admin/orders/:id/refund` | Admin | Process automated gateway refund |
| `POST` | `/api/v1/admin/orders/:id/confirm-cod-refund` | Admin | Confirm manual COD refund with bank reference number |
| `POST` | `/api/v1/admin/orders/returns/:returnId/confirm-received` | Admin | Confirm receipt of returned goods at warehouse |
| `GET` | `/api/v1/admin/orders/:id/refunds` | Admin | Get order refund audit trail |
| `GET` | `/api/v1/admin/orders/:id/invoice` | Admin | Generate GST tax invoice data payload |
| `GET` | `/api/v1/admin/orders/:id/invoice/pdf` | Admin | Download PDF tax invoice document |
| `GET` | `/api/v1/admin/orders/:id/packing-slip` | Admin | Generate warehouse fulfillment packing slip |

---

## Payments & Audit

📘 Detailed Documentation: [payments.md](payments.md)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/payments/create-order` | User | Create Razorpay/Stripe payment order |
| `POST` | `/api/v1/payments/verify` | User | Verify payment gateway signature |
| `POST` | `/api/v1/payments/retry` | User | Retry failed payment attempt |
| `POST` | `/api/v1/payments/cod/confirm` | User | Confirm Cash-on-Delivery order |
| `POST` | `/api/v1/payments/webhook` | Public | Handle gateway webhook callback with signature verification |

