# Customer Payment API Specification

All payment processing endpoints are served under `/api/v1/payments`. This handles online gateway integrations (e.g., Razorpay) and COD verifications.

---

## Endpoints Overview

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/payments/create-order` | Yes | Initialize gateway order (Razorpay Order ID) |
| `POST` | `/api/v1/payments/verify` | Yes | Verify frontend payment success signature |
| `POST` | `/api/v1/payments/retry` | Yes | Retry a failed payment |
| `GET` | `/api/v1/payments/:id` | Yes | Get payment status/details |
| `POST` | `/api/v1/payments/cod/confirm` | Yes | Confirm COD order with OTP if required |
| `POST` | `/api/v1/payments/webhook` | No | Public webhook for Razorpay server-to-server callbacks |

---

## Endpoint Details

### 1. Create Payment Order
- **POST** `/api/v1/payments/create-order`
- **Headers:** `idempotency-key: <uuid>`
- **Request Body:**
  ```json
  {
    "orderId": "uuid" // Internal DB Order ID created from /checkout/place-order
  }
  ```
- **Response:**
  ```json
  {
    "success": true,
    "providerOrderId": "order_Fxxxxxx", // Razorpay Order ID
    "amount": 150000, // Amount in lowest denomination (paise)
    "currency": "INR",
    "key": "rzp_test_xxxxxx"
  }
  ```

### 2. Verify Payment
Called by the frontend immediately after the Razorpay checkout script succeeds.
- **POST** `/api/v1/payments/verify`
- **Request Body:**
  ```json
  {
    "orderId": "uuid",
    "razorpay_payment_id": "pay_Fxxxxxx",
    "razorpay_order_id": "order_Fxxxxxx",
    "razorpay_signature": "signature_hash"
  }
  ```
- **Response:** `{ "success": true, "message": "Payment verified and order confirmed" }`

### 3. Retry Payment
- **POST** `/api/v1/payments/retry`
- **Headers:** `idempotency-key: <uuid>`
- **Request Body:** `{ "orderId": "uuid" }`
- **Description:** Generates a new `providerOrderId` for a previously failed or pending payment.

### 4. Webhook (Server-to-Server)
- **POST** `/api/v1/payments/webhook`
- **Headers:** `x-razorpay-signature`, `x-razorpay-event-id`
- **Description:** Handles async payment captures, failures, and refunds directly from the payment gateway.
