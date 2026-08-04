# Checkout & Order Placement API Guide

All Checkout endpoints are served under the base path `/api/v1/checkout` and require standard JWT authentication (`Authorization: Bearer <accessToken>`).

---

## 1. Endpoints Summary

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/checkout` | Yes | Get checkout summary, saved user addresses, delivery charges, and trigger a 10-minute stock reservation |
| `POST` | `/api/v1/checkout/validate-address` | Yes | Validate delivery address serviceability and pincode |
| `GET` | `/api/v1/checkout/payment-methods` | Yes | Get available payment methods (UPI, CARD, WALLET, NETBANKING, COD) for order amount & pincode |
| `POST` | `/api/v1/checkout/place-order` | Yes | **Idempotent** order placement with `Idempotency-Key` header |

---

## 2. Validation & Parameter Rules

| Parameter / Field | Type | Validation Rules |
| :--- | :--- | :--- |
| **Idempotency-Key** | Header | Valid UUID v4 string (Required) |
| **addressId** | UUID | Valid UUID v4 string |
| **pincode** | String | Exactly 6 digits (`/^\d{6}$/`) |
| **orderAmount** | Number | Positive decimal > 0 |
| **paymentMethod** | Enum | `UPI`, `CARD`, `WALLET`, `NETBANKING`, `COD` |
| **upiId** | String | Required if `paymentMethod = UPI` |
| **savedCardId** | UUID | Required if `paymentMethod = CARD` |
| **walletProvider** | Enum | `GPAY`, `PHONEPE`, `PAYTM`, `AMAZON_PAY` (Required if `paymentMethod = WALLET`) |
| **bankCode** | String | Required if `paymentMethod = NETBANKING` |

---

## 3. Detailed Endpoints & Response Examples

### A. Get Checkout Details & Trigger Stock Reservation

#### `GET /api/v1/checkout`

- **Headers**: `Authorization: Bearer <accessToken>`
- **cURL**:
```bash
curl -X GET "http://localhost:3000/api/v1/checkout" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

##### Success Response (`200 OK`)
```json
{
  "success": true,
  "summary": {
    "itemCount": 2,
    "subtotal": 2598.0,
    "deliveryFee": 0,
    "grandTotal": 2598.0
  },
  "addresses": [
    {
      "id": "addr_01",
      "type": "HOME",
      "houseFlat": "Flat 402, Sunshine Heights",
      "buildingStreet": "MG Road",
      "city": "Mumbai",
      "pincode": "400001",
      "isDefault": true
    }
  ],
  "paymentMethods": ["UPI", "CARD", "WALLET", "NETBANKING", "COD"],
  "stockReservation": {
    "reservationId": "res_889123",
    "expiresAt": "2026-08-04T18:48:30.000Z"
  }
}
```

---

### B. Validate Address Serviceability

#### `POST /api/v1/checkout/validate-address`

- **Headers**:
  - `Authorization: Bearer <accessToken>`
  - `Content-Type: application/json`
- **Request Body**:
```json
{
  "addressId": "addr_01"
}
```

##### Success Response (`200 OK`)
```json
{
  "success": true,
  "serviceable": true,
  "deliveryCharge": 49,
  "estimatedDays": "2-3 business days"
}
```

---

### C. Available Payment Methods

#### `GET /api/v1/checkout/payment-methods`

- **Headers**: `Authorization: Bearer <accessToken>`
- **Query Params**: `orderAmount=2598&pincode=400001`
- **cURL**:
```bash
curl -X GET "http://localhost:3000/api/v1/checkout/payment-methods?orderAmount=2598&pincode=400001" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

### D. Place Order (Idempotent)

#### `POST /api/v1/checkout/place-order`

- **Headers**:
  - `Authorization: Bearer <accessToken>`
  - `Idempotency-Key: c1a23b45-6789-40de-f123-456789abcdef`
  - `Content-Type: application/json`
- **Request Body**:
```json
{
  "addressId": "addr_01",
  "paymentMethod": "UPI",
  "upiId": "user@okaxis",
  "deliveryInstructions": "Leave package with security"
}
```

##### Success Response (`201 Created`)
```json
{
  "success": true,
  "message": "Order placed successfully",
  "orderId": "ord_8829123",
  "orderNumber": "ORD-177000123-4567",
  "status": "PLACED",
  "grandTotal": 2598.0
}
```
