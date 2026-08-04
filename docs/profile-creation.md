# Production User Profile & Onboarding API Guide

All profile endpoints are served under the base path `/api/v1/profile` and require standard JWT authentication (`Authorization: Bearer <accessToken>`).

---

## 1. Onboarding & Authentication Architecture

### Authentication Flow Rules:
1. **Mobile OTP Login**:
   - Mobile number is verified upon OTP verification (`isPhoneVerified: true`).
   - Email is optional, editable, and unverified by default (`isEmailVerified: false`).
   - Onboarding requires setting: `name`, `email` (optional), `gender`, `dob` (13+ years old).
2. **Google Login**:
   - Google email is pre-filled and marked verified (`isEmailVerified: true`).
   - Google email is **read-only** and cannot be modified.
   - Requires linking and verifying a **Mobile Number** via OTP (`isPhoneVerified: true`).
   - Onboarding collects: `gender`, `dob` (13+ years old).

---

## 2. Endpoints Summary

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/profile` | Yes | Get user profile details, saved addresses, and pet profiles |
| `POST` | `/api/v1/profile/basic` | Yes | **Step 1**: Save User Basic Profile (Name, Email, Gender, DOB) |
| `POST` | `/api/v1/profile/address` | Yes | **Step 2**: Add Delivery Address (Type, House/Flat, Street, City, State, Country, Pincode) |
| `POST` | `/api/v1/profile/pet` | Yes | **Step 3**: Add Pet Profile (Species, Breed, Date of Birth / Age + Unit, Weight + Unit, Allergies[], Health Notes) |
| `POST` | `/api/v1/profile/complete` | Yes | **Step 4**: Complete Onboarding & set `isProfileComplete: true` / `profileCompleted: true` |
| `POST` | `/api/v1/profile` | Yes | Save unified single-call profile (Basic Details, Addresses, Pets) |
| `PUT` / `PATCH` | `/api/v1/profile` | Yes | Update user basic details |
| `PUT` | `/api/v1/profile/addresses/:id` | Yes | Update delivery address by ID |
| `DELETE` | `/api/v1/profile/addresses/:id` | Yes | Delete delivery address by ID |
| `PUT` | `/api/v1/profile/pets/:id` | Yes | Update pet profile by ID |
| `DELETE` | `/api/v1/profile/pets/:id` | Yes | Delete pet profile by ID |

---

## 3. Validation & Rules Reference

| Field | Type | Validation Rules |
| :--- | :--- | :--- |
| **name** | String | Required for profile completion. Min 2 characters, alphabets and spaces only (`/^[a-zA-Z\s]+$/`) |
| **email** | String | Optional for OTP login. Editable if OTP user, **read-only** if Google user |
| **gender** | Enum | `MALE`, `FEMALE`, `PREFER_NOT_TO_SAY` |
| **dob** | Date | ISO Date string (`YYYY-MM-DD`). **Age restriction: Must be 13+ years old** (validated via `@IsAtLeastAge(13)`) |
| **profileImage** | String | Optional URL string |
| **country** | String | Optional. Defaults to `"India"` |
| **pincode** | String | 5 or 6 digit postal code (`/^\d{5,6}$/`) |
| **dateOfBirth** | Date | Pet DOB ISO string (`YYYY-MM-DD`) |
| **age** | Int | Pet age integer |
| **ageUnit** | Enum | `MONTHS`, `YEARS` |
| **weightUnit** | Enum | `KG`, `LBS` (defaults to `"KG"`) |
| **allergies** | Array | List of allergy strings (`allergies: ["Grain", "Dust"]`) |

---

## 4. Step-by-Step Onboarding APIs

### Step 1 — Basic Details

#### `POST /api/v1/profile/basic`

- **Headers**: `Authorization: Bearer <accessToken>`, `Content-Type: application/json`
- **Request Body**:
```json
{
  "name": "Sahil Hode",
  "email": "sahil@example.com",
  "gender": "MALE",
  "dob": "2000-05-15",
  "profileImage": "https://example.com/avatar.jpg"
}
```

- **cURL**:
```bash
curl -X POST http://localhost:3000/api/v1/profile/basic \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Sahil Hode",
    "email": "sahil@example.com",
    "gender": "MALE",
    "dob": "2000-05-15"
  }'
```

---

### Step 2 — Delivery Address

#### `POST /api/v1/profile/address`

- **Headers**: `Authorization: Bearer <accessToken>`, `Content-Type: application/json`
- **Request Body**:
```json
{
  "type": "HOME",
  "houseFlat": "Flat 402, Sunshine Heights",
  "buildingStreet": "MG Road",
  "landmark": "Near City Mall",
  "city": "Mumbai",
  "state": "Maharashtra",
  "country": "India",
  "pincode": "400001",
  "isDefault": true,
  "deliveryInstructions": "Ring bell twice"
}
```

---

### Step 3 — Pet Profile

#### `POST /api/v1/profile/pet`

- **Headers**: `Authorization: Bearer <accessToken>`, `Content-Type: application/json`
- **Request Body**:
```json
{
  "species": "DOG",
  "name": "Bruno",
  "breed": "Labrador Retriever",
  "dateOfBirth": "2022-03-10",
  "age": 2,
  "ageUnit": "YEARS",
  "gender": "MALE",
  "weight": 24.5,
  "weightUnit": "KG",
  "dietaryPreference": "BOTH",
  "allergies": ["Grain", "Chicken"],
  "healthNotes": "Sensitive stomach"
}
```

---

### Step 4 — Complete Profile Onboarding

#### `POST /api/v1/profile/complete`

Marks `isProfileComplete: true` and `profileCompleted: true`.

- **Headers**: `Authorization: Bearer <accessToken>`

##### Success Response (`200 OK`)
```json
{
  "success": true,
  "profile": {
    "id": "f8d22384-912a-4c2e-b153-9a3c109d7e5f",
    "name": "Sahil Hode",
    "email": "sahil@example.com",
    "phone": "+919876543210",
    "gender": "MALE",
    "dob": "2000-05-15T00:00:00.000Z",
    "profileImage": "https://example.com/avatar.jpg",
    "isProfileComplete": true,
    "profileCompleted": true,
    "isEmailVerified": false,
    "isPhoneVerified": true,
    "addresses": [
      {
        "id": "addr_123456",
        "type": "HOME",
        "houseFlat": "Flat 402, Sunshine Heights",
        "buildingStreet": "MG Road",
        "landmark": "Near City Mall",
        "city": "Mumbai",
        "state": "Maharashtra",
        "country": "India",
        "pincode": "400001",
        "isDefault": true,
        "deliveryInstructions": "Ring bell twice"
      }
    ],
    "pets": [
      {
        "id": "pet_654321",
        "species": "DOG",
        "name": "Bruno",
        "breed": "Labrador Retriever",
        "dateOfBirth": "2022-03-10T00:00:00.000Z",
        "age": 2,
        "ageUnit": "YEARS",
        "gender": "MALE",
        "weight": 24.5,
        "weightUnit": "KG",
        "dietaryPreference": "BOTH",
        "allergies": ["Grain", "Chicken"],
        "healthNotes": "Sensitive stomach"
      }
    ]
  }
}
```
