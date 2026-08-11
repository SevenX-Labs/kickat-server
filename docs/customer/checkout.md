# Customer Checkout API Specification

All checkout endpoints are served under `/api/v1/checkout`.

---

## Endpoints Overview

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/checkout` | Yes | Get checkout summary, saved user addresses, payment options, and trigger 10-min stock reservation |
| `POST` | `/api/v1/checkout/validate-address` | Yes | Validate delivery address pincode serviceability and shipping fee |
| `GET` | `/api/v1/checkout/payment-methods` | Yes | Get available payment methods (`UPI`, `CARD`, `WALLET`, `NETBANKING`, `COD`) |
| `POST` | `/api/v1/checkout/place-order` | Yes | **Idempotent** order placement with `Idempotency-Key` header |

---

## Detailed Endpoints

### Place Order (Idempotent)
`POST /api/v1/checkout/place-order`
- **Headers**: `Authorization: Bearer <accessToken>`, `Idempotency-Key: <UUID v4>`
- **Request Body**:
```json
{
  "addressId": "addr_01",
  "paymentMethod": "UPI",
  "upiId": "user@okaxis",
  "deliveryInstructions": "Leave with security guard"
}
```
- **Response (`201 Created`)**:
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
