# Comprehensive Deep Read-Only Backend Business Logic Audit — Kickat Server

> [!NOTE]
> **Audit Status**: Read-Only Architecture Extraction complete. Zero source files, schema definitions, or database records were modified during this audit.

---

# PART 1 — COMPLETE BACKEND STRUCTURE & MODULE MAP

`kickat-server` is built on NestJS with Prisma ORM (v7.9.1 with `@prisma/adapter-pg` PostgreSQL driver adapter). 

### High-Level Architecture Components:
- **Authentication**: JWT-based via `@nestjs/jwt`, `passport-jwt`, `JwtAuthGuard`, and custom `AdminGuard`.
- **Database Access**: `PrismaService` injecting `PrismaClient` with PostgreSQL pooling.
- **Scheduling**: `@nestjs/schedule` initialized globally via `ScheduleModule.forRoot()`.
- **Validation**: Global `ValidationPipe` with `class-validator` and `class-transformer`.

### Module Map

| Module | Controller | Service | Main Responsibility | Customer | Admin | Webhook / Background | Key Prisma Models |
| :--- | :--- | :--- | :--- | :---: | :---: | :---: | :--- |
| `AppModule` | `AppController` | - | Root module, system health checks | ✅ | - | - | - |
| `AuthModule` | `AuthController` | `AuthService` | User auth (OTP, Google OAuth, JWT tokens) | ✅ | - | - | `User`, `OtpLog`, `RefreshToken` |
| `UsersModule` | `UsersController` | `UsersService` | User account profile, password, addresses | ✅ | - | - | `User`, `Address` |
| `ProfileModule` | `ProfileController` | `ProfileService` | Customer profile management | ✅ | - | - | `User` |
| `ProductsModule` | `ProductsController` | `ProductsService` | Public product catalog, filters, details | ✅ | - | - | `Product`, `ProductVariant`, `Category` |
| `CategoriesModule` | `CategoriesController` | `CategoriesService` | Public category tree & product list | ✅ | - | - | `Category`, `Product` |
| `SearchModule` | `SearchController` | `SearchService` | Public search, suggestions, recent searches | ✅ | - | - | `Product`, `RecentSearch` |
| `HomeModule` | `HomeController` | `HomeService` | Banners, trending products, home feeds | ✅ | - | - | `Banner`, `Product`, `Testimonial` |
| `CartModule` | `CartController` | `CartService` | User & guest cart, guest merge, fee rules | ✅ | - | - | `CartItem`, `GuestCartItem`, `Product`, `ProductVariant` |
| `WishlistModule` | `WishlistController` | `WishlistService` | Wishlist items management per variant | ✅ | - | - | `WishlistItem`, `Product`, `ProductVariant` |
| `CheckoutModule` | `CheckoutController` | `CheckoutService`, `StockReservationCleanupService` | Checkout fee computation, order placement, stock cleanup cron | ✅ | - | Cron (`EVERY_5_MINUTES`) | `Order`, `OrderItem`, `CartItem`, `StockReservation` |
| `PaymentsModule` | `PaymentsController` | `PaymentsService`, `RazorpayService` | Razorpay order creation, payment verification, webhooks | ✅ | - | Webhook (`POST /payments/webhook`) | `Order`, `Payment`, `WebhookLog`, `StockReservation` |
| `OrdersModule` | `OrdersController`, `ReturnsController` | `OrdersService` | Customer order history, returns, cancellations, tracking | ✅ | - | - | `Order`, `OrderItem`, `OrderReturn`, `OrderReturnItem` |
| `ReviewsModule` | `ReviewsController` | `ReviewsService` | Product reviews, rating, helpful votes | ✅ | - | - | `ProductReview`, `ReviewHelpfulVote` |
| `CompareModule` | `CompareController` | `CompareService` | *Stub module (unimplemented)* | ✅ | - | - | - |
| `NotificationsModule`| `NotificationsController`| `NotificationsService` | User notifications | ✅ | - | - | `Notification` |
| `AdminAuthModule` | `AdminAuthController` | `AdminAuthService` | Admin login, MFA, session management | - | ✅ | - | `Admin`, `AdminSession`, `AdminResetToken` |
| `AdminProductsModule`| `AdminProductsController`| `AdminProductsService` | Admin product & variant CRUD, stock | - | ✅ | - | `Product`, `ProductVariant`, `ProductMedia` |
| `AdminCategoriesModule`| `AdminCategoriesController`| `AdminCategoriesService` | Category management tree | - | ✅ | - | `Category` |
| `AdminOrdersModule` | `AdminOrdersController` | `AdminOrdersService` | Order updates, cancellations, return receipts, refunds | - | ✅ | - | `Order`, `OrderItem`, `OrderReturn` |
| `AdminCustomersModule`| `AdminCustomersController`| `AdminCustomersService` | Customer management, block/unblock | - | ✅ | - | `User` |
| `AdminReviewsModule` | `AdminReviewsController` | `AdminReviewsService` | Moderating customer product reviews | - | ✅ | - | `ProductReview` |
| `AdminSettingsModule` | `AdminSettingsController` | `AdminSettingsService` | Delivery, tax, payment method settings | - | ✅ | - | `SystemSettings` |
| `AdminShippingModule` | `AdminShippingController` | `AdminShippingService`, `NullShippingProvider` | Courier partner assignment, tracking, return pickup | - | ✅ | Delivery Webhook | `Order` |
| `AdminReportsModule` | `AdminReportsController` | `AdminReportsService` | Revenue, order, category, sales reports | - | ✅ | - | `Order`, `OrderItem` |
| `AdminDashboardModule`| `AdminDashboardController`| `AdminDashboardService` | KPI counters, chart metrics | - | ✅ | - | `Order`, `User`, `Product` |
| `AdminAnalyticsModule`| `AdminAnalyticsController`| `AdminAnalyticsService` | Detailed analytics metrics | - | ✅ | - | `Order`, `Product` |
| `AdminNotificationsModule`| `AdminNotificationsController`| `AdminNotificationsService`| Admin system notification logs | - | ✅ | - | `NotificationLog` |
| `AdminUploadModule` | `AdminUploadController` | `AdminUploadService` | Image / file upload handling | - | ✅ | - | - |
| `AdminBlogsModule` | `AdminBlogsController` | `AdminBlogsService` | Blog & blog categories management | - | ✅ | - | `BlogPost`, `BlogCategory` |
| `AdminTestimonialsModule`| `AdminTestimonialsController`| `AdminTestimonialsService`| Customer testimonial curation | - | ✅ | - | `Testimonial` |

---

# PART 2 — CUSTOMER COMPLETE FLOW

```
REGISTER / LOGIN
  ↓
BROWSE CATALOG / SEARCH / CATEGORIES
  ↓
PRODUCT DETAILS (Select Variant if VARIABLE)
  ↓
ADD TO CART / WISHLIST
  ↓
GET /checkout (Issues 10-min StockReservation session token)
  ↓
POST /checkout/place-order (Deducts Product/Variant stock atomically)
  ├── PaymentMethod == 'COD' ────► Order Placed (PENDING)
  └── PaymentMethod == 'ONLINE' ──► Order Placed (COMPLETED) / Razorpay Payment
                                        ↓
                              Webhook payment.captured
                                        ↓
                             Order Status: PLACED
                                        ↓
                             Courier Assigned (SHIPPED)
                                        ↓
                             DELIVERED (Starts 7-day Return window)
                                        ├── Customer Requests Return ──► Auto-Created (PICKUP_REQUESTED)
                                        │                                        ↓
                                        │                                Warehouse confirms RETURN_RECEIVED
                                        │                                        ↓
                                        │                                Admin Initiates Refund ──► Razorpay Refund / COD Payout
                                        └── Customer Cancels (Pre-shipment) ──► Restocks Inventory
```

### Line-by-Line Flow Details:

1. **Authentication**: Customer registers or logs in via `POST /auth/login` or Google OAuth. `JwtAuthGuard` verifies bearer token and extracts `req.user.id`.
2. **Product Catalog**: Customer browses products via `GET /products` or `GET /categories/:id/products`.
3. **Cart Management**: Item added via `POST /cart/items`. If `variantId` is supplied, variant stock is checked.
4. **Checkout Initialization**: `GET /checkout` verifies cart items and creates a 10-minute `StockReservation` record in PostgreSQL.
5. **Order Placement**: `POST /checkout/place-order`:
   - Validates address and payment payload.
   - Re-evaluates subtotal, delivery fee, tax, COD fee, and grand total.
   - Executes single `prisma.$transaction`:
     - Decrements stock conditionally (`stock >= quantity`) from `Product` or `ProductVariant`.
     - Creates `Order` and `OrderItem` records.
     - Deletes user `CartItem` records.
     - Marks `StockReservation` as `isFulfilled = true`.
6. **Payment Execution**:
   - For COD: Payment status initialized to `PENDING`.
   - For Razorpay: Frontend receives Razorpay Order ID. Webhook `payment.captured` sets payment status `COMPLETED`.
7. **Order Fulfillment**: Admin assigns courier (`POST /admin/shipments/:id/assign`), advancing status to `SHIPPED`, then `DELIVERED`.
8. **Returns & Refunds**:
   - Customer submits return via `POST /orders/:id/return` (within 7 days of delivery).
   - System auto-creates return request (`RETURN_REQUESTED` / `PICKUP_REQUESTED`).
   - Warehouse confirms physical arrival via `POST /admin/orders/returns/:returnId/confirm-received` (`RETURN_RECEIVED`).
   - Admin triggers `POST /admin/orders/:id/refund`. For online orders, calls native Razorpay refund API; for COD, executes COD payout flow.

---

# PART 3 — CUSTOMER CART FLOW

- **Add Simple Product**: `POST /cart/items` with `{ productId, quantity }`. Service verifies `product.status === 'ACTIVE'` and `product.stock >= quantity`.
- **Add Variable Product**: `POST /cart/items` with `{ productId, variantId, quantity }`. Service verifies `variant.productId === productId` and `variant.stock >= quantity`.
- **Price Calculation**: Cart does **NOT** store static unit prices. `getCart()` fetches current prices dynamically (`variant.discountPrice ?? variant.price` or `product.discountPrice ?? product.price`). Price changes immediately reflect in the cart summary.
- **Stock Validation**: Re-validated on every cart read and item update.
- **Quantity Limits**: Hard cap of `100` units per cart item.
- **Guest Cart Merge**: Guest session items stored in `GuestCartItem` table. Calling `POST /cart/merge` transfers items to `CartItem` for the logged-in `userId` and deletes the guest session.

---

# PART 4 — COMPLETE CHECKOUT & TRANSACTION BOUNDARIES

1. `GET /checkout`: Evaluates fees and creates a 10-minute `StockReservation`.
2. `POST /checkout/place-order`:
   - Checks database idempotency (`Order.idempotencyKey`). Returns existing order if found.
   - Verifies `StockReservation` exists and `expiresAt > NOW()`.
   - Re-evaluates cart subtotal and live system fees (`computeFees`).
   - If `expectedTotal` is provided and differs by `> ₹0.01`, throws `ConflictException`.
   - **Atomic Transaction (`prisma.$transaction`)**:
     1. Decrements stock conditionally (`Product.stock` or `ProductVariant.stock`). Throws `ConflictException` if stock insufficient.
     2. Creates `Order` and `OrderItem` records.
     3. Clears `CartItem` records.
     4. Marks `StockReservation.isFulfilled = true`.

---

# PART 5 — PRICING ENGINE — EXTREMELY DETAILED

All fee and tax calculations are central in [`cart.service.ts`](file:///home/sahil-hode/Workspace/sevenx%20labs/kickat-ecommerce/kickat-server/src/modules/cart/cart.service.ts) via `calculateFeesHelper()` and `roundCurrency()`.

### Unit Price Determination:
- **SIMPLE Product**: `product.discountPrice ?? product.price`
- **VARIABLE Product**: `variant.discountPrice ?? variant.price`

### Formulas:
$$\text{roundCurrency}(X) = \frac{\text{Math.round}(X \times 100)}{100}$$

$$\text{Subtotal} = \sum (\text{unitPrice} \times \text{quantity})$$

#### Delivery Fee:
If `delivery.enabled === true`:
- If `subtotal >= delivery.freeThreshold` $\rightarrow$ `deliveryFee = 0`
- Else $\rightarrow$ `deliveryFee = delivery.fee`
- Else $\rightarrow$ `deliveryFee = 0`

#### Tax / GST Amount:
If `tax.enabled === true`:
- If `tax.isInclusive === true`:
  $$\text{gstAmount} = \text{roundCurrency}\left(\text{subtotal} - \frac{\text{subtotal}}{1 + \frac{\text{tax.percentage}}{100}}\right)$$
- If `tax.isInclusive === false`:
  $$\text{gstAmount} = \text{roundCurrency}\left(\text{subtotal} \times \frac{\text{tax.percentage}}{100}\right)$$
- Else $\rightarrow$ `gstAmount = 0`

#### Extra Fee:
If `extraFee.enabled === true` AND (`extraFee.isCompulsory === true` OR `applyOptionalExtraFee === true`):
- If `extraFee.type === 'PERCENTAGE'`:
  $$\text{extraFeeAmount} = \text{roundCurrency}\left(\text{subtotal} \times \frac{\text{extraFee.value}}{100}\right)$$
- If `extraFee.type === 'FIXED'`:
  $$\text{extraFeeAmount} = \text{extraFee.value}$$
- Else $\rightarrow$ `extraFeeAmount = 0`

#### COD Fee:
If `paymentMethod === 'COD'` AND `payment.codEnabled === true`:
- `codFee = payment.codFee`
- Else $\rightarrow$ `codFee = 0`

#### Grand Total:
$$\text{GrandTotal} = \text{roundCurrency}\left(\text{Subtotal} + (\text{tax.isInclusive} ? 0 : \text{gstAmount}) + \text{deliveryFee} + \text{extraFeeAmount} + \text{codFee}\right)$$

---

# PART 6 — PRICING NUMERICAL EXAMPLES

### Example 1: Standard Checkout (Tax Exclusive)
- **Subtotal**: ₹1,000.00
- **Delivery Settings**: Fee = ₹50.00, Free Threshold = ₹1,500.00 (Enabled)
- **Tax Settings**: 18% Exclusive (Enabled)
- **Extra Fee**: Disabled
- **Payment**: Razorpay (Online)
- **Calculations**:
  - `subtotal` = ₹1,000.00
  - `deliveryFee` = ₹50.00
  - `gstAmount` = $\text{roundCurrency}(1000 \times 0.18) =$ ₹180.00
  - `grandTotal` = $1000 + 180 + 50 =$ **₹1,230.00**

### Example 2: COD Checkout with Tax Inclusive
- **Subtotal**: ₹2,000.00
- **Delivery Settings**: Fee = ₹50.00, Free Threshold = ₹1,500.00 (Enabled)
- **Tax Settings**: 18% Inclusive (Enabled)
- **COD Settings**: COD Fee = ₹40.00 (Enabled)
- **Calculations**:
  - `subtotal` = ₹2,000.00
  - `deliveryFee` = ₹0.00 (Exceeds ₹1,500 threshold)
  - `gstAmount` = $\text{roundCurrency}(2000 - (2000 / 1.18)) =$ ₹305.08 (included in subtotal)
  - `codFee` = ₹40.00
  - `grandTotal` = $2000 + 0 + 40 =$ **₹2,040.00**

---

# PART 7 — ADMIN WORKFLOW & CAPACITY SUMMARY

- **Products**: Complete CRUD for `SIMPLE` & `VARIABLE` products. Bulk status updates and soft deletes.
- **Inventory**: Stock updates for simple product or specific variants. Automatic restock on order cancellation.
- **Categories**: Parent-child category tree with recursive product listing.
- **Orders**: Full order management, packing slips, tax invoices, shipping assignments, return receipt confirmation, and refunds.
- **Shipping**: Provider-agnostic architecture (`ShippingProvider`). Defaults safely to `NullShippingProvider` when unconfigured.
- **Reports & Dashboard**: Aggregates gross revenue, completed order counters, product sales breakdown, and low stock metrics.

---

# PART 8 — ORDER STATUS STATE MACHINE

| Status | Meaning | Trigger / Actor | Allowed Transitions | Side Effects |
| :--- | :--- | :--- | :--- | :--- |
| `PENDING` | Created, payment pending | System (Checkout) | `PLACED`, `FAILED`, `CANCELLED` | Stock reserved/deducted |
| `PLACED` | Order confirmed & paid | System / Razorpay Webhook | `PROCESSING`, `PACKED`, `CANCELLED` | Order confirmed |
| `PROCESSING` | Order in fulfillment queue | Admin | `PACKED`, `CANCELLED` | Restock if cancelled |
| `PACKED` | Order packed in warehouse | Admin | `SHIPPED`, `CANCELLED` | Restock if cancelled |
| `SHIPPED` | Dispatched via courier | Admin (Assign Courier) | `OUT_FOR_DELIVERY`, `DELIVERED`, `RETURN_INITIATED` | Tracking generated |
| `OUT_FOR_DELIVERY` | Executive delivering package | Delivery Webhook / Admin | `DELIVERED`, `RETURN_INITIATED` | Delivery alert |
| `DELIVERED` | Delivered to customer | Delivery Webhook / Admin | `RETURN_REQUESTED`, `RETURN_INITIATED` | Starts 7-day return window |
| `CANCELLED` | Cancelled by user/admin | Customer / Admin | None (Terminal state) | Restocks inventory |
| `FAILED` | Payment failed | Razorpay Webhook / System | None (Terminal state) | Restocks inventory |
| `RETURN_REQUESTED` | Customer requested return | Customer (Auto-approved) | `PICKUP_REQUESTED`, `PICKED_UP`, `RETURN_RECEIVED` | Return created |
| `PICKUP_REQUESTED` | Pickup request created | Shipping Provider | `PICKUP_SCHEDULED`, `PICKED_UP` | Courier notified |
| `PICKED_UP` | Courier picked up item | Shipping Provider | `IN_TRANSIT`, `RETURN_RECEIVED` | In-transit tracking |
| `RETURN_RECEIVED` | Item received in hub | Admin (`confirmReturnReceived`) | `REFUND_INITIATED`, `COD_REFUND_INITIATED` | Unlocks refund initiation |
| `REFUND_INITIATED` | Online refund API sent | Admin (`processRefund`) | `REFUNDED` | Razorpay API called |
| `REFUNDED` | Online refund confirmed | Razorpay Webhook | None (Terminal state) | Customer refunded |
| `COD_REFUND_INITIATED`| COD payout initiated | Admin (`processRefund`) | `COD_REFUNDED` | Payout started |
| `COD_REFUNDED` | COD payout confirmed | Admin / Payout System | None (Terminal state) | COD refunded |

---

# PART 9 — PAYMENT FLOW

### Online Payment (Razorpay):
1. `POST /checkout/place-order` creates order and calls `RazorpayService.createOrder()`.
2. Customer completes Razorpay modal.
3. Razorpay sends `payment.captured` webhook to `POST /payments/webhook`.
4. `PaymentsService` verifies HMAC signature (`x-razorpay-signature`). If valid:
   - Sets `Payment.status = COMPLETED`
   - Sets `Order.orderStatus = PLACED`, `Order.paymentStatus = COMPLETED`
   - Sets `StockReservation.isFulfilled = true`

### Production Signature Safety:
In production (`NODE_ENV === 'production'`), mock signature strings (`mock_sig_`, `valid_sig_`) are strictly rejected.

---

# PART 10 — REFUND & RETURN FLOW

1. **Return Submission**: Customer submits return via `POST /orders/:id/return`. Auto-creates return request (`RETURN_REQUESTED` / `PICKUP_REQUESTED`).
2. **Physical Receipt Gate**: Admin confirms physical item arrival at warehouse via `POST /admin/orders/returns/:returnId/confirm-received` (`RETURN_RECEIVED`).
3. **Refund Execution**: Admin initiates refund via `POST /admin/orders/:id/refund`.
   - **Online Razorpay Orders**: Calls native `razorpay.payments.refund`. Status becomes `REFUND_INITIATED`, then `REFUNDED` via webhook.
   - **COD Orders**: Triggers COD payout workflow. Status becomes `COD_REFUND_INITIATED`, then `COD_REFUNDED` upon payout confirmation.

---

# PART 11 — MONETARY STORAGE & ROUNDING

- **Database Fields**: Stored as PostgreSQL `Float` in Prisma (`Order.subtotal`, `Order.deliveryFee`, `Order.gstAmount`, `Order.grandTotal`).
- **Rounding Function**: `roundCurrency()` rounds all intermediate and final calculations to 2 decimal places using `Math.round(val * 100) / 100`.
- **Historical Snapshots**: All monetary fields, tax percentages, and fee details are snapshotted on `Order` and `OrderItem` at checkout time. Future price or tax setting updates do not alter past orders or tax invoices.

---

# PART 12 — FEATURE STATUS MATRIX

| Feature | Implemented? | Customer | Admin | Backend Location | Notes |
| :--- | :---: | :---: | :---: | :--- | :--- |
| **Product Catalog** | **YES** | ✅ | ✅ | `modules/products`, `modules/admin/products` | SIMPLE & VARIABLE support |
| **Product Variants** | **YES** | ✅ | ✅ | `modules/products`, `modules/admin/products` | Per-variant stock, price, SKU |
| **Categories Tree** | **YES** | ✅ | ✅ | `modules/categories`, `modules/admin/categories` | Recursive descendant listing |
| **Cart System** | **YES** | ✅ | - | `modules/cart` | Dynamic pricing, guest cart merge |
| **Wishlist** | **YES** | ✅ | - | `modules/wishlist` | Variant-level identity & unique index |
| **Checkout** | **YES** | ✅ | - | `modules/checkout` | Fee calculations, atomic stock deduction |
| **Stock Reservation** | **YES** | ✅ | - | `modules/checkout` | 10-min session token, cleanup cron |
| **Razorpay Payments** | **YES** | ✅ | - | `modules/payments` | Native API, HMAC webhook verification |
| **COD Support** | **YES** | ✅ | ✅ | `modules/checkout`, `modules/admin/orders` | Configurable COD fee & payout handling |
| **Returns & Refunds** | **YES** | ✅ | ✅ | `modules/orders`, `modules/admin/orders` | Auto-approved returns, receipt-gated refunds |
| **Shipping Abstraction**| **YES** | - | ✅ | `modules/admin/shipping` | Generic `ShippingProvider`, unconfigured fallback |
| **Tax / GST Invoicing** | **YES** | ✅ | ✅ | `modules/admin/orders` | Historical snapshot order invoices |
| **Coupon System** | **NO** | - | - | **NOT IMPLEMENTED** | No Coupon/Promo schema or endpoints |
| **Back-in-Stock Alerts**| **NO** | - | - | **NOT IMPLEMENTED** | No subscription alert module |
| **Subscriptions** | **NO** | - | - | **NOT IMPLEMENTED** | No recurring billing module |
| **Compare System** | **NO** | - | - | `modules/compare` | Empty stub module |
| **Bulk CSV Import** | **NO** | - | - | **NOT IMPLEMENTED** | Single product POST endpoints only |

---

# PART 13 — IMPORTANT BUSINESS RISKS

1. **Prisma `Float` Usage for Currency (LOW/MEDIUM)**:
   - **File**: `prisma/schema.prisma`
   - **Issue**: Currency values are stored as IEEE 754 floating-point numbers (`Float`) instead of `Decimal` or integer paise.
   - **Impact**: While `roundCurrency()` mitigates rounding discrepancies in business logic, PostgreSQL `Decimal` is recommended for financial ledgers.

---

# PART 14 — FINAL SIMPLE SUMMARY

1. **Buying a Product**: Customer selects product (and variant size/color if applicable), adds to cart, and proceeds to checkout. `GET /checkout` generates a 10-minute checkout session token. Placing the order atomically deducts inventory from PostgreSQL.
2. **Pricing & Taxes**: Subtotal is calculated from item quantities $\times$ live unit prices. GST (inclusive or exclusive) and delivery fees (free above threshold) are applied. All values are rounded to 2 decimal places.
3. **Payments**: Customer pays via Razorpay or COD. Razorpay webhooks verify payment authenticity via HMAC signatures before confirming the order.
4. **Returns & Refunds**: Customer return requests are auto-created. Warehouse staff confirm physical item arrival (`RETURN_RECEIVED`) before refund initiation is unlocked. Refunds execute natively via Razorpay for online orders or via COD payout for cash orders.
