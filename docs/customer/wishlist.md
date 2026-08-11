# Customer Wishlist API Specification

All wishlist endpoints are served under `/api/v1/wishlist`.

---

## Endpoints Overview

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/wishlist` | Yes | List items in user's wishlist |
| `POST` | `/api/v1/wishlist` | Yes | Add product or variant to wishlist |
| `DELETE` | `/api/v1/wishlist/:productId` | Yes | Remove product from wishlist |
| `POST` | `/api/v1/wishlist/:productId/move-to-cart` | Yes | Move wishlist item directly to shopping cart |
