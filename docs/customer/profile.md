# Customer Profile & Onboarding API Specification

Endpoints for profile management, address book, pet profiles, and email/mobile OTP verifications under `/api/v1/users` and `/api/v1/profile`.

---

## Endpoints Overview

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/users/me` | Yes | Get authenticated user profile state and onboarding completion flags |
| `POST` | `/api/v1/users/me/recently-viewed` | Yes | Add product to user's recently viewed list |
| `GET` | `/api/v1/users/me/recently-viewed` | Yes | Get user's recently viewed products list |
| `POST` | `/api/v1/users/email/send-verification` | Yes | Send Email OTP via SMTP |
| `POST` | `/api/v1/users/email/verify` | Yes | Verify Email OTP (`isEmailVerified: true`) |
| `POST` | `/api/v1/users/mobile/send-verification` | Yes | Send Mobile OTP via SMS |
| `POST` | `/api/v1/users/mobile/verify` | Yes | Verify Mobile OTP (`isPhoneVerified: true`) |
| `GET` | `/api/v1/profile` | Yes | Fetch complete profile with addresses and pets |
| `POST` | `/api/v1/profile/basic` | Yes | **Step 1**: Save Basic Profile (Name, Email, Gender, DOB) |
| `POST` | `/api/v1/profile/address` | Yes | **Step 2**: Add Delivery Address |
| `POST` | `/api/v1/profile/pet` | Yes | **Step 3**: Add Pet Profile (Triggers auto `profileCompleted: true`) |
| `POST` | `/api/v1/profile` | Yes | Unified single-call profile setup |
| `PUT` / `PATCH` | `/api/v1/profile` | Yes | Update basic profile details |
| `POST` | `/api/v1/profile/addresses` | Yes | Add new delivery address |
| `PUT` | `/api/v1/profile/addresses/:id` | Yes | Update delivery address by ID |
| `DELETE` | `/api/v1/profile/addresses/:id` | Yes | Delete delivery address by ID |
| `POST` | `/api/v1/profile/pets` | Yes | Add new pet profile |
| `PUT` | `/api/v1/profile/pets/:id` | Yes | Update pet profile by ID |
| `DELETE` | `/api/v1/profile/pets/:id` | Yes | Delete pet profile by ID |

---

## Profile Completion Rules

The backend automatically calculates:
- **`profileCompleted = true`** ONLY IF:
  1. Basic details (`name`, `gender`, `dob`) exist
  2. At least 1 delivery address exists
  3. At least 1 pet profile exists

---

## Detailed Endpoints

### 1. Step 1: Basic Profile
`POST /api/v1/profile/basic`
- **Request Body**:
```json
{
  "name": "Sahil Hode",
  "email": "sahil@example.com",
  "gender": "MALE",
  "dob": "2000-05-15"
}
```

### 2. Step 2: Delivery Address
`POST /api/v1/profile/address`
- **Request Body**:
```json
{
  "type": "HOME",
  "houseFlat": "Flat 402, Sunshine Heights",
  "buildingStreet": "MG Road",
  "city": "Mumbai",
  "state": "Maharashtra",
  "country": "India",
  "pincode": "400001",
  "isDefault": true
}
```

### 3. Step 3: Pet Profile
`POST /api/v1/profile/pet`
- **Request Body**:
```json
{
  "species": "DOG",
  "name": "Bruno",
  "breed": "Labrador Retriever",
  "age": 2,
  "ageUnit": "YEARS",
  "gender": "MALE",
  "weight": 24.5,
  "weightUnit": "KG",
  "dietaryPreference": "BOTH",
  "allergies": ["Grain"]
}
```
