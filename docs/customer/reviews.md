# Customer Reviews API Specification

All customer review endpoints are served under `/api/v1/reviews`.

---

## Endpoints Overview

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/reviews` | No | Get paginated product reviews |
| `GET` | `/api/v1/reviews/summary` | No | Get rating summary & distribution |
| `GET` | `/api/v1/reviews/:id` | No | Get a single review |
| `POST` | `/api/v1/reviews` | Yes | Submit a new review for a purchased product |
| `PATCH`| `/api/v1/reviews/:id/helpful` | Yes | Toggle helpful vote on a review |

---

## Endpoint Details

### 1. Fetching Reviews

#### Get Product Reviews
- **GET** `/api/v1/reviews`
- **Query Params:** `productId` (**Required**, UUID v4), `page`, `limit` (max 50), `rating` (1-5), `sort` (`newest`, `highest`, `lowest`, `helpful`).
- **Response:** Paginated list of approved reviews for the product.

#### Get Rating Summary
- **GET** `/api/v1/reviews/summary`
- **Query Params:** `productId` (**Required**, UUID v4).
- **Response:** Average rating, total review count, and rating distribution (counts for 1 to 5 stars).

#### Get Single Review
- **GET** `/api/v1/reviews/:id`
- **Response:** Details for a single review including user alias, rating, and content.

### 2. User Interactions

#### Submit Review
- **POST** `/api/v1/reviews`
- **Request Body:**
  ```json
  {
    "productId": "uuid", // Required (UUID v4) - Product being reviewed
    "orderId": "uuid",   // Required (UUID v4) - Delivered order containing product
    "rating": 5,          // Required (Integer 1-5)
    "title": "Great quality!", // Optional (string, max 200 chars)
    "comment": "My dog loves this kibble.", // Required (string, 10-2000 chars)
    "photos": ["url1", "url2"] // Optional array of valid photo URLs (max 5)
  }
  ```
- **Constraints:** The user must have a delivered order containing the product specified by `productId` and `orderId` before submitting a review. Each product-order pair can only be reviewed once.

#### Mark / Unmark as Helpful (Toggle)
- **PATCH** `/api/v1/reviews/:id/helpful` (Also supports `POST`)
- **Description:** Toggles helpful vote on a review. First call increments count (+1); second call removes vote (-1). Rate limited to 20 req/min/IP.
