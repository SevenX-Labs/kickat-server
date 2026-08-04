# Production User Profile & Onboarding API Guide

All profile endpoints are served under the base path `/api/v1/profile` and require standard JWT authentication (`Authorization: Bearer <accessToken>`).

---

## 1. Onboarding & Authentication Architecture

### Authentication & Verification Rules:
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
| `GET` | `/api/v1/users/me` | Yes | Get latest user profile, completion status, addresses, and pet profiles |
| `GET` | `/api/v1/profile` | Yes | Get user profile details, saved addresses, and pet profiles |
| `POST` | `/api/v1/profile/basic` | Yes | **Step 1**: Save User Basic Profile (Name, Email, Gender, DOB) |
| `POST` | `/api/v1/profile/address` | Yes | **Step 2**: Add Delivery Address (Type, House/Flat, Street, City, State, Country, Pincode) |
| `POST` | `/api/v1/profile/pet` | Yes | **Step 3**: Add Pet Profile (Species, Breed, Date of Birth / Age + Unit, Weight + Unit, Allergies[], Health Notes) |
| `POST` | `/api/v1/profile` | Yes | Save unified single-call profile (Basic Details, Addresses, Pets) |
| `PUT` / `PATCH` | `/api/v1/profile` | Yes | Update user basic details |
| `PUT` | `/api/v1/profile/addresses/:id` | Yes | Update delivery address by ID |
| `DELETE` | `/api/v1/profile/addresses/:id` | Yes | Delete delivery address by ID |
| `PUT` | `/api/v1/profile/pets/:id` | Yes | Update pet profile by ID |
| `DELETE` | `/api/v1/profile/pets/:id` | Yes | Delete pet profile by ID |

---

## 3. Automatic Backend Profile Completion Rules

**The backend is the single source of truth for onboarding completion.** There is no manual "complete profile" endpoint.

After every create/update/delete operation, the backend automatically evaluates:
- **`profileCompleted = true` ONLY IF ALL 3 CONDITIONS ARE MET**:
  1. Basic profile details exist (`name`, `gender`, `dob`).
  2. At least 1 delivery address exists in `addresses`.
  3. At least 1 pet profile exists in `pets`.
- **If any condition is missing**, `profileCompleted` remains `false`.

---

## 4. Detailed Endpoints & cURL Testing Guide

### Step 0: Check Current User State

#### `GET /api/v1/users/me`

- **Headers**: `Authorization: Bearer <accessToken>`
- **cURL**:
```bash
curl -X GET http://localhost:3000/api/v1/users/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

##### Response Example (`profileCompleted: false`)
```json
{
  "success": true,
  "user": {
    "id": "f8d22384-912a-4c2e-b153-9a3c109d7e5f",
    "name": null,
    "email": "user@example.com",
    "phone": "+919876543210",
    "gender": null,
    "dob": null,
    "isNewUser": true,
    "profileCompleted": false,
    "isProfileComplete": false,
    "isEmailVerified": false,
    "isPhoneVerified": true,
    "addresses": [],
    "petProfiles": []
  }
}
```

---

### Step 1: Submit Basic Details

#### `POST /api/v1/profile/basic`

- **Headers**: `Authorization: Bearer <accessToken>`, `Content-Type: application/json`
- **Request Body**:
```json
{
  "name": "Sahil Hode",
  "email": "sahil@example.com",
  "gender": "MALE",
  "dob": "2000-05-15"
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

### Step 2: Add Delivery Address

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

- **cURL**:
```bash
curl -X POST http://localhost:3000/api/v1/profile/address \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "HOME",
    "houseFlat": "Flat 402, Sunshine Heights",
    "buildingStreet": "MG Road",
    "landmark": "Near City Mall",
    "city": "Mumbai",
    "state": "Maharashtra",
    "country": "India",
    "pincode": "400001",
    "isDefault": true
  }'
```

---

### Step 3: Add Pet Profile

#### `POST /api/v1/profile/pet`

Submitting Step 3 completes all mandatory onboarding requirements. The backend automatically marks `profileCompleted: true`.

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

- **cURL**:
```bash
curl -X POST http://localhost:3000/api/v1/profile/pet \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
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
  }'
```

---

### Step 4: Verify Final State (`GET /api/v1/users/me`)

```bash
curl -X GET http://localhost:3000/api/v1/users/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

##### Response Example (`profileCompleted: true`)
```json
{
  "success": true,
  "user": {
    "id": "f8d22384-912a-4c2e-b153-9a3c109d7e5f",
    "name": "Sahil Hode",
    "email": "sahil@example.com",
    "phone": "+919876543210",
    "gender": "MALE",
    "dob": "2000-05-15T00:00:00.000Z",
    "isNewUser": false,
    "profileCompleted": true,
    "isProfileComplete": true,
    "isEmailVerified": false,
    "isPhoneVerified": true,
    "addresses": [
      {
        "id": "addr_123456",
        "type": "HOME",
        "houseFlat": "Flat 402, Sunshine Heights",
        "buildingStreet": "MG Road",
        "city": "Mumbai",
        "state": "Maharashtra",
        "country": "India",
        "pincode": "400001"
      }
    ],
    "petProfiles": [
      {
        "id": "pet_654321",
        "species": "DOG",
        "name": "Bruno",
        "breed": "Labrador Retriever",
        "age": 2,
        "ageUnit": "YEARS",
        "gender": "MALE",
        "weight": 24.5,
        "weightUnit": "KG",
        "allergies": ["Grain"]
      }
    ]
  }
}
```
