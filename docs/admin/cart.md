# Admin & Server Cart Engine Documentation

The Kickat E-Commerce Cart Engine provides guest and authenticated user cart operations, real-time stock validation, item quantity safety limits, dynamic fee calculation (delivery, service fee, GST tax), Buy-Now session management, and guest cart merging.

---

## Table of Contents

1. [Cart Architecture & Business Logic Overview](#cart-architecture--business-logic-overview)
2. [Cart Fee & Summary Calculation Engine](#cart-fee--summary-calculation-engine)
3. [Stock Validation & Inventory Protections](#stock-validation--inventory-protections)
4. [Guest Cart Parity & Session Merging Protocol](#guest-cart-parity--session-merging-protocol)
5. [Cart & Fee Settings Configuration](#cart--fee-settings-configuration)
6. [API Specifications](#api-specifications)
   - [1. Retrieve Customer Cart](#1-retrieve-customer-cart)
   - [2. Add Item to Customer Cart](#2-add-item-to-customer-cart)
   - [3. Update Item Quantity](#3-update-item-quantity)
   - [4. Remove Item from Cart](#4-remove-item-from-cart)
   - [5. Initiate Direct Buy Now Session](#5-initiate-direct-buy-now-session)
   - [6. Add Item to Guest Cart](#6-add-item-to-guest-cart)
   - [7. Retrieve Guest Cart](#7-retrieve-guest-cart)
   - [8. Merge Guest Cart into User Account](#8-merge-guest-cart-into-user-account)
7. [Frontend Integration Guide (TypeScript & Axios)](#frontend-integration-guide-typescript--axios)

---

## Cart Architecture & Business Logic Overview

The Kickat server handles cart state across two distinct tiers:

1. **Authenticated Customer Cart (`CartItem`)**: Tied directly to the `userId` in PostgreSQL via Prisma ORM.
2. **Guest Session Cart (`GuestCartItem`)**: Indexed by a unique client-generated UUID (`guestSessionId`). When a guest logs in or registers, calling `/api/v1/cart/merge` safely merges guest items into their authenticated cart inside an isolated Prisma database transaction.

```
+------------------+         +-----------------------+
|  Guest Visitor   |         | Authenticated User    |
| (guestSessionId) |         | (userId in DB)        |
+--------+---------+         +-----------+-----------+
         |                               |
         v                               v
+------------------+         +-----------------------+
| GuestCartItem DB |         |     CartItem DB       |
+--------+---------+         +-----------+-----------+
         |                               |
         +---------> MERGE POST --------->+
                     (Transaction)
```

---

## Cart Fee & Summary Calculation Engine

Every cart payload returns a computed `summary` block calculated by the server engine:

$$\text{Grand Total} = \text{Subtotal} + \text{Delivery Fee} + \text{Service Fee} + \text{Tax Amount} - \text{Discounts}$$

### Dynamic Computation Rules
- **Subtotal**: Sum of active unit prices (`discountPrice` if present, else standard `price`) multiplied by quantity.
- **Delivery Fee**: Fetched from delivery settings (`defaultShippingFee`). Applied if `subtotal < freeShippingThreshold`. If `subtotal >= freeShippingThreshold`, `deliveryFee = 0.00`.
- **Platform / Service Fee**: Optional flat charge configured in store settings.
- **Product Discount**: Difference between MRP sum (`originalTotal`) and selling price sum (`subtotal`).

#### Example Cart Summary Response Block:
```json
{
  "summary": {
    "itemCount": 3,
    "productDiscount": 400.0,
    "subtotal": 2499.0,
    "deliveryFee": 0.0,
    "freeShippingThreshold": 999.0,
    "amountNeededForFreeShipping": 0.0,
    "serviceFee": 15.0,
    "taxAmount": 449.82,
    "grandTotal": 2963.82
  }
}
```

---

## Stock Validation & Inventory Protections

> [!IMPORTANT]
> **Quantity Limit Safety Threshold**: To prevent inventory lock attacks, no individual cart line item may exceed **100 units** (`ConflictException: Maximum allowed item quantity (100) exceeded`).

- **Variant Stock Priority**: If a product has variants (e.g. `1.5 kg` vs `3 kg`), stock availability is strictly evaluated against `variant.stock`. If no variant is selected, `product.stock` is enforced.
- **Real-Time Stock Checks**: Adding items or updating quantities checks total requested quantity against current available stock (`ConflictException: Insufficient stock available`).

---

## Guest Cart Parity & Session Merging Protocol

When a guest user logs into an existing account or creates a new one, the frontend triggers cart merging:

- **Database Transaction (`$transaction`)**: Ensures zero item loss.
- **Quantity Aggregation**: If an item (`productId` + `variantId`) already exists in the user's cart, quantities are summed (capped at 100 units).
- **Cleanup**: On completion, all `GuestCartItem` records for `guestSessionId` are deleted.

---

## Cart & Fee Settings Configuration

Administrators adjust fee calculation rules via Admin Settings:

- **Delivery Rules**: `PATCH /api/v1/admin/settings/delivery`
  - `defaultShippingFee` (e.g., `50.00`)
  - `freeShippingThreshold` (e.g., `999.00`)
- **Tax Rules**: `PATCH /api/v1/admin/settings/tax`
  - `defaultTaxRate` (e.g., `18%`)
  - `taxInclusive` (boolean)

---

## API Specifications

### 1. Retrieve Customer Cart

- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/cart`
- **Auth:** Required (`Bearer <accessToken>`)

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "summary": {
    "itemCount": 2,
    "productDiscount": 200.0,
    "subtotal": 1499.0,
    "deliveryFee": 0.0,
    "freeShippingThreshold": 999.0,
    "amountNeededForFreeShipping": 0.0,
    "serviceFee": 10.0,
    "grandTotal": 1509.0
  },
  "items": [
    {
      "id": "cart-item-uuid-1",
      "productId": "prod-uuid-1",
      "variantId": "var-uuid-1",
      "quantity": 1,
      "unitPrice": 1499.0,
      "totalPrice": 1499.0,
      "product": {
        "id": "prod-uuid-1",
        "name": "Chicken & Rice Puppy Food",
        "price": 1699.0,
        "discountPrice": 1499.0,
        "imageUrl": "https://cdn.kickat.co.in/products/puppy.png",
        "stock": 50
      },
      "variant": {
        "id": "var-uuid-1",
        "name": "1.5 kg",
        "price": 1699.0,
        "discountPrice": 1499.0,
        "stock": 30
      }
    }
  ]
}
```

---

### 2. Add Item to Customer Cart

- **HTTP Method:** `POST`
- **Endpoint:** `/api/v1/cart/items`
- **Auth:** Required (`Bearer <accessToken>`)

#### Request Body
```json
{
  "productId": "prod-uuid-1",
  "variantId": "var-uuid-1",
  "quantity": 2
}
```

---

### 3. Update Item Quantity

- **HTTP Method:** `PUT`
- **Endpoint:** `/api/v1/cart/items/:itemId`
- **Auth:** Required (`Bearer <accessToken>`)

#### Request Body
```json
{
  "quantity": 3
}
```

---

### 4. Remove Item from Cart

- **HTTP Method:** `DELETE`
- **Endpoint:** `/api/v1/cart/items/:itemId`
- **Auth:** Required (`Bearer <accessToken>`)

---

### 5. Initiate Direct Buy Now Session

- **HTTP Method:** `POST`
- **Endpoint:** `/api/v1/cart/buy-now`
- **Auth:** Required (`Bearer <accessToken>`)

#### Request Body
```json
{
  "productId": "prod-uuid-1",
  "variantId": "var-uuid-1",
  "quantity": 1
}
```

---

### 6. Add Item to Guest Cart

- **HTTP Method:** `POST`
- **Endpoint:** `/api/v1/cart/guest`
- **Auth:** Public

#### Request Body
```json
{
  "guestSessionId": "sess-guest-9928172641",
  "productId": "prod-uuid-1",
  "variantId": "var-uuid-1",
  "quantity": 1
}
```

---

### 7. Retrieve Guest Cart

- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/cart/guest/:sessionId`
- **Auth:** Public

---

### 8. Merge Guest Cart into User Account

- **HTTP Method:** `POST`
- **Endpoint:** `/api/v1/cart/merge`
- **Auth:** Required (`Bearer <accessToken>`)

#### Request Body
```json
{
  "guestSessionId": "sess-guest-9928172641"
}
```

---

## Frontend Integration Guide (TypeScript & Axios)

```typescript
// services/cartService.ts
import axios from "axios";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://api.kickat.co.in/api/v1";

const cartClient = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

cartClient.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("access_token");
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

export interface CartSummary {
  itemCount: number;
  productDiscount: number;
  subtotal: number;
  deliveryFee: number;
  freeShippingThreshold: number;
  amountNeededForFreeShipping: number;
  serviceFee: number;
  grandTotal: number;
}

export interface CartItem {
  id: string;
  productId: string;
  variantId?: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  product: { id: string; name: string; price: number; discountPrice?: number | null; imageUrl: string; stock: number };
  variant?: { id: string; name: string; price: number; discountPrice?: number | null; stock: number } | null;
}

export const CartService = {
  async getCart() {
    const res = await cartClient.get("/cart");
    return res.data;
  },

  async addItem(productId: string, quantity: number, variantId?: string) {
    const res = await cartClient.post("/cart/items", { productId, variantId, quantity });
    return res.data;
  },

  async updateQuantity(itemId: string, quantity: number) {
    const res = await cartClient.put(`/cart/items/${itemId}`, { quantity });
    return res.data;
  },

  async removeItem(itemId: string) {
    const res = await cartClient.delete(`/cart/items/${itemId}`);
    return res.data;
  },

  async buyNow(productId: string, quantity: number, variantId?: string) {
    const res = await cartClient.post("/cart/buy-now", { productId, variantId, quantity });
    return res.data;
  },

  async addGuestItem(guestSessionId: string, productId: string, quantity: number, variantId?: string) {
    const res = await cartClient.post("/cart/guest", { guestSessionId, productId, variantId, quantity });
    return res.data;
  },

  async getGuestCart(guestSessionId: string) {
    const res = await cartClient.get(`/cart/guest/${guestSessionId}`);
    return res.data;
  },

  async mergeCart(guestSessionId: string) {
    const res = await cartClient.post("/cart/merge", { guestSessionId });
    return res.data;
  },
};
```
