# Customer Checkout API Specification

All checkout endpoints are served under `/api/v1/checkout`.

---

## Endpoints Overview

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/checkout` | Yes | Get checkout summary & cart totals |
| `POST` | `/api/v1/checkout/validate-address` | Yes | Validate delivery pincode and address |
| `GET` | `/api/v1/checkout/payment-methods` | Yes | Get eligible payment methods based on amount |
| `POST` | `/api/v1/checkout/place-order` | Yes | Idempotent endpoint to place order |

---

## Endpoint Details

### 1. Get Checkout Session
- **GET** `/api/v1/checkout`
- **Description:** Retrieves the active cart, calculating the subtotal, taxes, shipping fees, and the grand total required for checkout.

### 2. Validate Address
- **POST** `/api/v1/checkout/validate-address`
- **Request Body:**
  ```json
  {
    "addressId": "uuid" // ID of the address from the user's profile
  }
  ```
- **Description:** Validates if the selected address pincode is serviceable by the active shipping zones.

### 3. Payment Methods
- **GET** `/api/v1/checkout/payment-methods`
- **Query Params:**
  - `orderAmount`: Float
  - `pincode`: String
- **Description:** Returns available payment methods (e.g., `COD`, `RAZORPAY`) based on minimum/maximum cart values for COD and pincode serviceability.

### 4. Place Order
- **POST** `/api/v1/checkout/place-order`
- **Headers:** `idempotency-key: <uuid>` (Required to prevent double-charging)
- **Request Body:**
  ```json
  {
    "addressId": "uuid",
    "paymentMethod": "RAZORPAY", // or "COD"
    "notes": "Please deliver after 5 PM" // Optional
  }
  ```
- **Response:**
  - If `COD`: Returns order confirmation details immediately.
  - If `RAZORPAY`: Returns order details along with an `orderId` to be passed to the `/api/v1/payments/create-order` endpoint.
