# Kickat Master Admin API & Integration Reference

Welcome to the Kickat E-Commerce Master Admin API reference guide. All endpoints are served under the base URL prefix `/api/v1/admin` (and related `/api/v1` routes) and require Admin Authentication (`@AdminAuth()`), except for public callbacks or store settings.

---

## Technical Specifications Index

| Module | Document | Total Endpoints | Key Operational Scope |
| :--- | :--- | :--- | :--- |
| **Authentication & Sessions** | [auth.md](auth.md) | 6 | Admin login, JWT tokens, session validation, 6-digit OTP reset, password change |
| **Cart Engine & Fees** | [cart.md](cart.md) | 8 | Cart summary, fee calculation engine, 100-item safety limit, guest cart merging, buy-now |
| **Categories Hierarchy** | [categories.md](categories.md) | 8 | Category tree, subcategories, reordering sequence, product deletion protections |
| **Products & Inventory** | [products.md](products.md) | 9 | Product catalog, SKUs, dietary filters, low stock alert system, bulk status, bulk delete |
| **Order Processing & Invoices**| [orders.md](orders.md) | 11 | Order lifecycle, PDF tax invoice, COD refund confirmation, warehouse returns, packing slip |
| **Payments & Refund Audit** | [payments.md](payments.md) | 8 | Razorpay, Stripe, Cashfree, COD, Wallet, Webhook HMAC signatures, immutable refund audit logs |
| **Store & Platform Settings** | [settings.md](settings.md) | 11 | General, Payment keys, Tax/GST rules, Delivery fees, Public store metadata, secret masking |
| **Testimonials & Social Proof**| [testimonials.md](testimonials.md) | 8 | Homepage customer feedback, rating moderation, display reordering sequence, status toggles |
| **Executive Dashboard** | [dashboard.md](dashboard.md) | 5 | Real-time sales metrics, revenue analytics, customer acquisition velocity, top products |
| **Business Analytics** | [analytics.md](analytics.md) | 6 | Deep-dive revenue charts, sales funnel conversion stats, category market share |
| **Customer Management** | [customers.md](customers.md) | 7 | Customer profile, lifetime value (LTV), block/unblock controls, order history timeline |
| **Review Moderation** | [reviews.md](reviews.md) | 6 | Review approval/rejection workflows, rating summary, admin response publishing |
| **Shipping Logistics** | [shipping.md](shipping.md) | 5 | Courier partners (Delhivery, BlueDart), tracking URL formats, shipping zone rules |
| **Marketing Campaigns** | [campaigns.md](campaigns.md) | 8 | Email/SMS/WhatsApp campaigns via BullMQ, audience targeting, delivery statistics |
| **Editorial Blogs & CMS** | [blogs.md](blogs.md) | 8 | Article creation, markdown content, tags, blog categories, author attribution |
| **Financial Ledgers** | [reports.md](reports.md) | 4 | GST reports, sales tax ledgers, financial CSV exports |
| **Media Uploads & Assets** | [upload.md](upload.md) | 4 | Supabase storage file uploads, mime-type validation, CDN image deletion |

---

## Core System Architecture & Integration Guidelines

### 1. Base URL & Protocol
- **Production Base URL:** `https://api.kickat.co.in/api/v1`
- **Development Base URL:** `http://localhost:3000/api/v1`

### 2. Global Headers Protocol

```http
Authorization: Bearer <accessToken>
Content-Type: application/json
idempotency-key: <uuid-v4> (Required for payment / checkout mutations)
```

### 3. Global Error Response Standard

When an operation fails or validation constraints are violated, the API returns a standardized JSON structure:

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Validation failed: Quantity must be between 1 and 100",
  "path": "/api/v1/cart/items",
  "timestamp": "2026-09-15T16:58:00.000Z",
  "errors": [
    "quantity must not be greater than 100"
  ]
}
```

#### HTTP Status Codes Standard:
- `200 OK`: Successful retrieval or synchronous update operation.
- `201 Created`: Successful creation of a new entity.
- `400 Bad Request`: Validation failure, illegal argument, or domain invariant violation.
- `401 Unauthorized`: Missing or expired JWT Access Token.
- `403 Forbidden`: Admin role permissions insufficient.
- `404 Not Found`: Target resource UUID does not exist.
- `409 Conflict`: Business logic conflict (e.g. insufficient stock, duplicate slug, max quantity exceeded).
- `422 Unprocessable Entity`: Invalid entity format or signature verification failure.
- `500 Internal Server Error`: Unhandled server exception.

---

## Cross-Module Integration Map for Frontend Applications

Below is the complete interaction matrix mapping frontend user flows to backend administrative and core modules:

```
+-------------------+        +----------------------+        +------------------------+
|  Store Front      | ---->  |  Cart & Checkout     | ---->  | Payments Gateway       |
|  (Catalog/Search) |        |  (Fee Engine & Stock)|        | (Razorpay/Stripe/COD)  |
+-------------------+        +----------------------+        +-----------+------------+
                                                                         |
                                                                         v
+-------------------+        +----------------------+        +-----------+------------+
| Admin Dashboard   | <----- | Orders & Fulfillment | <----- | Webhooks & Refund Audit|
| (KPIs & Metrics)  |        | (Invoicing & Slips)  |        | (RefundAudit Table)    |
+-------------------+        +----------------------+        +------------------------+
```

1. **Product Management -> Cart Engine**: Products & Variant SKUs configured in `products.md` dictate stock levels verified in `cart.md`.
2. **Cart Engine -> Orders & Payments**: Fees configured in `settings.md` drive the cart `summary` block in `cart.md`, which creates orders in `orders.md` and initializes transactions in `payments.md`.
3. **Orders -> Invoicing & Refunds**: Completed orders generate PDF invoices via `orders.md`. Cancellations or returns invoke automated/manual refunds logged in `payments.md`.
4. **Notifications & Low Stock System**: Stock decrements in `orders.md` evaluate low-stock limits and trigger alerts via `campaigns.md` / `StockAlertService`.

---

## Frontend Antigravity Integration Checklist

To ensure proper frontend integration:
- [x] Use Axios Interceptors to attach `Authorization: Bearer <accessToken>` from `localStorage` or `cookies`.
- [x] Set `idempotency-key` header on critical payment/checkout calls (`/payments/create-order`, `/payments/retry`, `/payments/cod/confirm`).
- [x] Handle standard success (`{ success: true, data: ... }`) and error formats consistently.
- [x] Integrate PDF Blob downloading for invoices via `window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))`.
- [x] Use `guestSessionId` stored in `localStorage` for non-logged-in users, and execute `/api/v1/cart/merge` immediately post-authentication.

