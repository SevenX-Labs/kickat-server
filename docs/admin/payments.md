# Admin Payment Gateways, Webhooks & Refund Audit Specification

The Kickat E-Commerce Payment Module handles online transactions (Razorpay, Stripe, Cashfree), Cash-On-Delivery (COD), Wallet balances, Webhook verification, Idempotent transaction processing, Admin COD refund confirmations, and immutable Refund Audit Logging.

---

## Table of Contents

1. [Payment Architecture & Supported Gateways](#payment-architecture--supported-gateways)
2. [Idempotency & Webhook Signature Protocol](#idempotency--webhook-signature-protocol)
3. [Refund Audit & Compliance Engine](#refund-audit--compliance-engine)
4. [Payment Settings Configuration](#payment-settings-configuration)
5. [API Specifications](#api-specifications)
   - [1. Create Gateway Payment Order](#1-create-gateway-payment-order)
   - [2. Verify Gateway Payment Signature](#2-verify-gateway-payment-signature)
   - [3. Retry Failed Payment Transaction](#3-retry-failed-payment-transaction)
   - [4. Confirm Cash on Delivery (COD) Order](#4-confirm-cash-on-delivery-cod-order)
   - [5. Process Automated Gateway Refund](#5-process-automated-gateway-refund)
   - [6. Confirm Manual COD Refund (Admin Only)](#6-confirm-manual-cod-refund-admin-only)
   - [7. Retrieve Order Refund Audit History (Admin Only)](#7-retrieve-order-refund-audit-history-admin-only)
   - [8. Process Gateway Webhook Callback](#8-process-gateway-webhook-callback)
6. [Frontend Integration Guide (TypeScript & Axios)](#frontend-integration-guide-typescript--axios)

---

## Payment Architecture & Supported Gateways

Kickat supports multi-channel payment flows:

| Payment Method | Provider | Gateway Flow | Refund Handling |
| :--- | :--- | :--- | :--- |
| **Razorpay** | Razorpay SDK | Order Creation -> Client Checkout -> Signature Verification | Automated via Razorpay Refund API |
| **Stripe** | Stripe SDK | PaymentIntent Creation -> Client Confirmation | Automated via Stripe Refund API |
| **Cashfree** | Cashfree API | Order Token -> SDK Checkout -> Webhook | Automated via Cashfree Refund API |
| **Cash-On-Delivery** | Native COD | Instant Order Creation (Status `PLACED`) | Manual Bank Transfer confirmed by Admin (`confirm-cod-refund`) |
| **Wallet** | Native Wallet | Instant Balance Deduction & Transaction Record | Wallet Credit |

---

## Idempotency & Webhook Signature Protocol

### Idempotency Key Header (`idempotency-key`)
To prevent duplicate payment charges on network retries or double clicks, client requests to `/payments/create-order`, `/payments/retry`, and `/payments/cod/confirm` must include an `idempotency-key` header (UUID v4).

### Webhook Signature Verification (`x-razorpay-signature`)
- All webhooks posted to `/api/v1/payments/webhook` are cryptographically verified using HMAC SHA-256 against the `webhookSecret` stored in Payment Settings.
- Requests failing signature verification return HTTP `400 Bad Request`.

---

## Refund Audit & Compliance Engine

> [!NOTE]
> Every refund initiated (whether automated gateway refund or manual COD refund) writes an immutable record to the `RefundAudit` database table.

### Audit Log Fields:
- `orderId`: Associated Order UUID.
- `paymentId`: Associated Payment record UUID.
- `refundAmount`: Decimal amount refunded.
- `refundMethod`: `ORIGINAL_PAYMENT`, `COD_BANK_TRANSFER`, or `WALLET_CREDIT`.
- `processedBy`: UUID of Admin user (or `SYSTEM` for automated webhooks).
- `referenceNumber`: Gateway refund ID (e.g. `rfnd_K81294812`) or Bank UTR number.
- `status`: `PENDING`, `COMPLETED`, or `FAILED`.

---

## Payment Settings Configuration

Administrators can toggle gateways and update credentials via `/api/v1/admin/settings/payment`:

```json
{
  "razorpay": {
    "enabled": true,
    "keyId": "rzp_live_xxxxxxxx",
    "keySecret": "••••••••",
    "webhookSecret": "••••••••"
  },
  "cod": {
    "enabled": true,
    "minOrderAmount": 200.0,
    "maxOrderAmount": 10000.0
  }
}
```

---

## API Specifications

### 1. Create Gateway Payment Order

- **HTTP Method:** `POST`
- **Endpoint:** `/api/v1/payments/create-order`
- **Auth:** Customer Auth (`Bearer <accessToken>`)
- **Headers:** `idempotency-key: <uuid-v4>`

#### Request Body
```json
{
  "orderId": "ord-uuid-1",
  "provider": "RAZORPAY"
}
```

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "data": {
    "paymentId": "pay-uuid-1",
    "provider": "RAZORPAY",
    "gatewayOrderId": "order_K78192847192",
    "amount": 2499.0,
    "currency": "INR",
    "keyId": "rzp_live_xxxxxxxx"
  }
}
```

---

### 2. Verify Gateway Payment Signature

- **HTTP Method:** `POST`
- **Endpoint:** `/api/v1/payments/verify`
- **Auth:** Customer Auth (`Bearer <accessToken>`)

#### Request Body
```json
{
  "paymentId": "pay-uuid-1",
  "razorpayPaymentId": "pay_K78192847101",
  "razorpayOrderId": "order_K78192847192",
  "razorpaySignature": "4c90e5f29...9128a"
}
```

---

### 3. Retry Failed Payment Transaction

- **HTTP Method:** `POST`
- **Endpoint:** `/api/v1/payments/retry`
- **Auth:** Customer Auth (`Bearer <accessToken>`)
- **Headers:** `idempotency-key: <uuid-v4>`

#### Request Body
```json
{
  "orderId": "ord-uuid-1"
}
```

---

### 4. Confirm Cash on Delivery (COD) Order

- **HTTP Method:** `POST`
- **Endpoint:** `/api/v1/payments/cod/confirm`
- **Auth:** Customer Auth (`Bearer <accessToken>`)

#### Request Body
```json
{
  "orderId": "ord-uuid-1"
}
```

---

### 5. Process Automated Gateway Refund

- **HTTP Method:** `POST`
- **Endpoint:** `/api/v1/admin/orders/:id/refund`
- **Auth:** Admin Auth (`Bearer <adminToken>`)

#### Request Body
```json
{
  "amount": 1499.0,
  "reason": "Defective item return",
  "refundMethod": "ORIGINAL_PAYMENT",
  "notes": "Razorpay instant refund"
}
```

---

### 6. Confirm Manual COD Refund (Admin Only)

- **HTTP Method:** `POST`
- **Endpoint:** `/api/v1/admin/orders/:id/confirm-cod-refund`
- **Auth:** Admin Auth (`Bearer <adminToken>`)

#### Request Body
```json
{
  "amount": 1499.0,
  "referenceNumber": "UTR99281726419",
  "notes": "NEFT transfer executed to customer ICICI account"
}
```

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "message": "COD refund confirmed and recorded in audit log",
  "data": {
    "refundAuditId": "ref-audit-uuid-1",
    "orderId": "ord-uuid-1",
    "amount": 1499.0,
    "refundMethod": "COD_BANK_TRANSFER",
    "referenceNumber": "UTR99281726419",
    "status": "COMPLETED",
    "confirmedBy": "admin-uuid-1"
  }
}
```

---

### 7. Retrieve Order Refund Audit History (Admin Only)

- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/admin/orders/:id/refunds`
- **Auth:** Admin Auth (`Bearer <adminToken>`)

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "data": [
    {
      "id": "ref-audit-uuid-1",
      "orderId": "ord-uuid-1",
      "amount": 1499.0,
      "refundMethod": "ORIGINAL_PAYMENT",
      "referenceNumber": "rfnd_K81294812",
      "reason": "Defective item return",
      "status": "COMPLETED",
      "processedBy": "admin-uuid-1",
      "createdAt": "2026-09-14T10:30:00.000Z"
    }
  ]
}
```

---

### 8. Process Gateway Webhook Callback

- **HTTP Method:** `POST`
- **Endpoint:** `/api/v1/payments/webhook`
- **Auth:** None (Gateway Callback)
- **Headers:** `x-razorpay-signature: <hmac-signature>`, `x-razorpay-event-id: <event-id>`

---

## Frontend Integration Guide (TypeScript & Axios)

```typescript
// services/paymentService.ts
import axios from "axios";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://api.kickat.co.in/api/v1";

const paymentClient = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

paymentClient.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("admin_access_token") || localStorage.getItem("access_token");
    if (token && config.headers) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const PaymentService = {
  async createPaymentOrder(orderId: string, provider: "RAZORPAY" | "STRIPE" | "CASHFREE", idempotencyKey: string) {
    const res = await paymentClient.post(
      "/payments/create-order",
      { orderId, provider },
      { headers: { "idempotency-key": idempotencyKey } }
    );
    return res.data;
  },

  async verifyPayment(payload: { paymentId: string; razorpayPaymentId: string; razorpayOrderId: string; razorpaySignature: string }) {
    const res = await paymentClient.post("/payments/verify", payload);
    return res.data;
  },

  async confirmCod(orderId: string, idempotencyKey: string) {
    const res = await paymentClient.post(
      "/payments/cod/confirm",
      { orderId },
      { headers: { "idempotency-key": idempotencyKey } }
    );
    return res.data;
  },

  async confirmCodRefundAdmin(orderId: string, payload: { amount: number; referenceNumber: string; notes?: string }) {
    const res = await paymentClient.post(`/admin/orders/${orderId}/confirm-cod-refund`, payload);
    return res.data;
  },

  async getRefundHistoryAdmin(orderId: string) {
    const res = await paymentClient.get(`/admin/orders/${orderId}/refunds`);
    return res.data;
  },
};
```
