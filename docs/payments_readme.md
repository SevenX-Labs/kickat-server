# Payments API Specification & Guide

All Payments endpoints are served under `/api/v1/payments` and require standard JWT authentication (`Authorization: Bearer <accessToken>`).

---

## Endpoints Summary

| Method | Endpoint | Auth Required | Idempotent | Description |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/payments/create-order` | Yes | 🔒 Yes (`Idempotency-Key` header) | Create payment transaction & Razorpay order for an order |
| `POST` | `/api/v1/payments/verify` | Yes | No | Verify Razorpay HMAC payment signature and finalize payment |
| `POST` | `/api/v1/payments/retry` | Yes | 🔒 Yes (`Idempotency-Key` header) | Retry failed or pending payment for an order |
| `GET` | `/api/v1/payments/:id` | Yes | No | Get payment details by payment UUID |
| `POST` | `/api/v1/payments/cod/confirm` | Yes | 🔒 Yes (`Idempotency-Key` header) | Confirm Cash on Delivery (COD) order payment |

---

## 1. Create Payment Order

#### `POST /api/v1/payments/create-order`

- **Headers**:
  - `Authorization: Bearer <accessToken>`
  - `Idempotency-Key: <UUID v4>`
  - `Content-Type: application/json`
- **Body**:
  ```json
  {
    "orderId": "22222222-2222-4222-8222-222222222222",
    "paymentMethod": "upi",
    "upiId": "user@okaxis",
    "savedCardId": "optional-uuid",
    "walletProvider": "gpay",
    "bankCode": "HDFC",
    "saveCard": false
  }
  ```
- **Error Codes**:
  - `400`: Invalid input / invalid UUID / missing idempotency key
  - `401`: Unauthorized
  - `404`: Order not found
  - `409`: Payment already initiated / order expired / order already paid

---

## 2. Verify Payment Signature

#### `POST /api/v1/payments/verify`

- **Headers**: `Authorization: Bearer <accessToken>`
- **Body**:
  ```json
  {
    "razorpayOrderId": "order_mock_12345",
    "razorpayPaymentId": "pay_mock_67890",
    "signature": "generated_hmac_hex_signature",
    "orderId": "22222222-2222-4222-8222-222222222222"
  }
  ```
- **Error Codes**:
  - `400`: Invalid input / invalid UUID
  - `401`: Unauthorized
  - `404`: Payment not found
  - `409`: Signature verification failed / payment already verified

---

## 3. Retry Payment

#### `POST /api/v1/payments/retry`

- **Headers**:
  - `Authorization: Bearer <accessToken>`
  - `Idempotency-Key: <UUID v4>`
- **Body**:
  ```json
  {
    "orderId": "22222222-2222-4222-8222-222222222222",
    "paymentMethod": "card"
  }
  ```
- **Error Codes**:
  - `400`: Invalid input / invalid UUID
  - `401`: Unauthorized
  - `404`: Order not found
  - `409`: Order not in retryable state / retry window expired (> 30 mins)

---

## 4. Get Payment Details

#### `GET /api/v1/payments/:id`

- **Headers**: `Authorization: Bearer <accessToken>`
- **Param**: `:id` (valid UUID v4)
- **Error Codes**:
  - `400`: Invalid UUID
  - `401`: Unauthorized
  - `404`: Payment not found

---

## 5. Confirm COD Payment

#### `POST /api/v1/payments/cod/confirm`

- **Headers**:
  - `Authorization: Bearer <accessToken>`
  - `Idempotency-Key: <UUID v4>`
- **Body**:
  ```json
  {
    "orderId": "22222222-2222-4222-8222-222222222222"
  }
  ```
- **Error Codes**:
  - `400`: Invalid UUID
  - `401`: Unauthorized
  - `404`: Order not found
  - `409`: COD not selected for order / order already paid
