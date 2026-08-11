# Customer Payments API Specification

All payment processing endpoints are served under `/api/v1/payments`.

---

## Endpoints Overview

| Method | Endpoint | Auth Required | Idempotent | Description |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/payments/create-order` | Yes | 🔒 Yes (`Idempotency-Key`) | Create payment transaction & Razorpay order |
| `POST` | `/api/v1/payments/verify` | Yes | No | Verify Razorpay HMAC signature & finalize payment |
| `POST` | `/api/v1/payments/retry` | Yes | 🔒 Yes (`Idempotency-Key`) | Retry failed/pending payment (30 min window) |
| `GET` | `/api/v1/payments/:id` | Yes | No | Get payment transaction details by ID |
| `POST` | `/api/v1/payments/cod/confirm` | Yes | 🔒 Yes (`Idempotency-Key`) | Confirm Cash on Delivery payment |
| `POST` | `/api/v1/payments/webhook` | No | Public | Razorpay webhook callback listener |

---

## Detailed Endpoints

### 1. Create Payment Order
`POST /api/v1/payments/create-order`
- **Headers**: `Authorization: Bearer <accessToken>`, `Idempotency-Key: <UUID v4>`
- **Request Body**:
```json
{
  "orderId": "22222222-2222-4222-8222-222222222222",
  "paymentMethod": "upi",
  "upiId": "user@okaxis",
  "walletProvider": "gpay",
  "bankCode": "HDFC",
  "saveCard": false
}
```

---

### 2. Verify Razorpay Payment Signature
`POST /api/v1/payments/verify`
- **Request Body**:
```json
{
  "razorpayOrderId": "order_mock_12345",
  "razorpayPaymentId": "pay_mock_67890",
  "signature": "generated_hmac_hex_signature",
  "orderId": "22222222-2222-4222-8222-222222222222"
}
```

---

### 3. Retry Payment
`POST /api/v1/payments/retry`
- **Headers**: `Idempotency-Key: <UUID v4>`
- **Request Body**:
```json
{
  "orderId": "22222222-2222-4222-8222-222222222222",
  "paymentMethod": "card"
}
```

---

### 4. Confirm COD Payment
`POST /api/v1/payments/cod/confirm`
- **Headers**: `Idempotency-Key: <UUID v4>`
- **Request Body**:
```json
{
  "orderId": "22222222-2222-4222-8222-222222222222"
}
```
