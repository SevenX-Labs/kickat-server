# Customer Reviews API Specification

All customer review endpoints are served under `/api/v1/reviews`.

---

## Endpoints Overview

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/reviews` | No | Get paginated product reviews |
| `GET` | `/api/v1/reviews/:id` | No | Get a single review |
| `POST` | `/api/v1/reviews` | Yes | Submit a new review for a purchased product |
| `PATCH`| `/api/v1/reviews/:id/helpful` | Yes | Mark a review as helpful |

---

## Endpoint Details

### 1. Fetching Reviews

#### Get All Reviews
- **GET** `/api/v1/reviews`
- **Query Params:** `productId`, `page`, `limit`, `rating` (e.g., `5`), `sort` (`newest`, `highest`, `lowest`).
- **Response:** Paginated list of approved reviews for the product.

#### Get Single Review
- **GET** `/api/v1/reviews/:id`
- **Response:** Details for a single review including user alias, rating, and content.

### 2. User Interactions

#### Submit Review
- **POST** `/api/v1/reviews`
- **Request Body:**
  ```json
  {
    "productId": "uuid",
    "rating": 5, // Integer 1-5
    "title": "Great quality!",
    "content": "My dog loves this kibble.",
    "images": ["url1", "url2"] // Optional array of image URLs
  }
  ```
- **Constraints:** The user must have successfully purchased and received the product before submitting a review.

#### Mark as Helpful
- **PATCH** `/api/v1/reviews/:id/helpful` (Also supports `POST`)
- **Description:** Toggles or increments the "helpful" vote count for a review. Rate limited to prevent spam.
