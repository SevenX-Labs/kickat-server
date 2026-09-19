# Customer Profile API Specification

All customer profile and user management endpoints are served under `/api/v1/profile` and `/api/v1/users`.

---

## Endpoints Overview

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/profile` | Yes | Get the full user profile including addresses & pets |
| `PUT` | `/api/v1/profile` | Yes | Update basic user details (name, avatar) |
| `POST` | `/api/v1/profile/addresses` | Yes | Add a new shipping address |
| `PUT` | `/api/v1/profile/addresses/:id` | Yes | Edit an existing address |
| `DELETE`| `/api/v1/profile/addresses/:id` | Yes | Remove an address |
| `POST` | `/api/v1/profile/pets` | Yes | Add a new pet profile |
| `PUT` | `/api/v1/profile/pets/:id` | Yes | Edit an existing pet profile |
| `DELETE`| `/api/v1/profile/pets/:id` | Yes | Remove a pet profile |
| `POST` | `/api/v1/users/me/recently-viewed` | Yes | Add product to recently viewed list |
| `GET` | `/api/v1/users/me/recently-viewed` | Yes | Get recently viewed products |

---

## Endpoint Details

### 1. Basic Profile Management
- **GET** `/api/v1/profile`
  - Returns `User` object, `addresses[]`, and `pets[]`.
- **PUT / PATCH** `/api/v1/profile`
  - Accepts basic fields like `firstName`, `lastName`, `avatarUrl`.

### 2. Address Book
Users can store multiple delivery addresses. One address is typically flagged as `isDefault: true`.
- **POST** `/api/v1/profile/addresses`
  - Body: `{ fullName, phone, addressLine1, city, state, pincode, type }`
- **PUT** `/api/v1/profile/addresses/:id`
  - Updates the specific address.
- **DELETE** `/api/v1/profile/addresses/:id`
  - Deletes the address. Cannot delete if it is actively tied to a pending order dispatch.

### 3. Pet Profiles
Collecting pet details (species, breed, age, weight) allows for personalized feeds and targeted campaign promotions.
- **POST** `/api/v1/profile/pets`
  - Body: `{ name, species (DOG/CAT), breed, dob, weight, gender }`
- **PUT** `/api/v1/profile/pets/:id`
  - Updates the pet detail.
- **DELETE** `/api/v1/profile/pets/:id`

### 4. User Interactions
- **POST** `/api/v1/users/me/recently-viewed`
  - Used by the frontend to track history when a user lands on a Product Details Page (PDP).
- **GET** `/api/v1/users/me/recently-viewed`
  - Returns the latest viewed products for the home page carousel.
