# User Profile & Onboarding API Guide

All profile endpoints are served under the base path `/api/v1/profile` and require standard JWT authentication (`Authorization: Bearer <accessToken>`).

---

## 1. Endpoints Summary

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/profile` | Yes | Get user profile details, saved addresses, and pet profiles |
| `POST` | `/api/v1/profile` | Yes | Create / complete unified profile (Basic Details, Addresses, Pets) & set `isProfileComplete: true` |
| `PUT` | `/api/v1/profile` | Yes | Update user basic profile details (Name, Email, Gender, DOB) |
| `PATCH` | `/api/v1/profile` | Yes | Partial update of user basic profile details |
| `POST` | `/api/v1/profile/addresses` | Yes | Add a new delivery address |
| `PUT` | `/api/v1/profile/addresses/:id` | Yes | Update an existing delivery address by ID |
| `DELETE` | `/api/v1/profile/addresses/:id` | Yes | Delete a delivery address by ID |
| `POST` | `/api/v1/profile/pets` | Yes | Add a new pet profile |
| `PUT` | `/api/v1/profile/pets/:id` | Yes | Update an existing pet profile by ID |
| `DELETE` | `/api/v1/profile/pets/:id` | Yes | Delete a pet profile by ID |

---

## 2. Validation & Rules Reference

| Field | Type | Validation Rules |
| :--- | :--- | :--- |
| **name** | String | Required for profile completion. Min 2 characters, alphabets and spaces only (`/^[a-zA-Z\s]+$/`) |
| **email** | String | Optional. Must be a valid email format |
| **phone** | String | Auto-filled from user account, non-editable |
| **gender** | Enum | `MALE`, `FEMALE`, `PREFER_NOT_TO_SAY` |
| **dob** | Date | ISO Date string (`YYYY-MM-DD`). **Age restriction: Must be 13+ years old** (validated via `@IsAtLeastAge(13)`) |
| **pincode** | String | 5 or 6 digit postal code (`/^\d{5,6}$/`) |
| **species** | Enum | `DOG`, `CAT`, `BIRD`, `FISH`, `RABBIT`, `OTHER` |
| **dietaryPreference** | Enum | `VEG`, `NON_VEG`, `BOTH` |

---

## 3. Detailed Endpoints

### A. Get User Profile

#### `GET /api/v1/profile`

- **Headers**: `Authorization: Bearer <accessToken>`

- **cURL**:
```bash
curl -X GET http://localhost:3000/api/v1/profile \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

#### Expected Responses

##### Success (`200 OK`)
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
    "isProfileComplete": true,
    "isEmailVerified": false,
    "isPhoneVerified": true,
    "addresses": [
      {
        "id": "addr_123456",
        "userId": "f8d22384-912a-4c2e-b153-9a3c109d7e5f",
        "type": "HOME",
        "houseFlat": "Flat 402, Sunshine Heights",
        "buildingStreet": "MG Road",
        "landmark": "Near City Mall",
        "city": "Mumbai",
        "state": "Maharashtra",
        "pincode": "400001",
        "isDefault": true,
        "deliveryInstructions": "Ring bell twice",
        "createdAt": "2026-08-04T10:30:00.000Z"
      }
    ],
    "pets": [
      {
        "id": "pet_654321",
        "userId": "f8d22384-912a-4c2e-b153-9a3c109d7e5f",
        "species": "DOG",
        "name": "Bruno",
        "breed": "Labrador Retriever",
        "dobOrAge": "2 years",
        "gender": "MALE",
        "weight": 24.5,
        "dietaryPreference": "BOTH",
        "allergiesHealthNotes": "Grain allergy",
        "createdAt": "2026-08-04T10:30:00.000Z"
      }
    ]
  }
}
```

---

### B. Create / Complete Unified Profile

#### `POST /api/v1/profile`

Saves user basic details, optional delivery addresses, and optional pet profiles in a single request and sets `isProfileComplete: true`.

- **Headers**:
  - `Authorization: Bearer <accessToken>`
  - `Content-Type: application/json`
- **Request Body**:
```json
{
  "name": "Sahil Hode",
  "email": "sahil@example.com",
  "gender": "MALE",
  "dob": "2000-05-15",
  "addresses": [
    {
      "type": "HOME",
      "houseFlat": "Flat 402, Sunshine Heights",
      "buildingStreet": "MG Road",
      "landmark": "Near City Mall",
      "city": "Mumbai",
      "state": "Maharashtra",
      "pincode": "400001",
      "isDefault": true,
      "deliveryInstructions": "Ring bell twice"
    }
  ],
  "pets": [
    {
      "species": "DOG",
      "name": "Bruno",
      "breed": "Labrador Retriever",
      "dobOrAge": "2 years",
      "gender": "MALE",
      "weight": 24.5,
      "dietaryPreference": "BOTH",
      "allergiesHealthNotes": "Grain allergy"
    }
  ]
}
```

- **cURL**:
```bash
curl -X POST http://localhost:3000/api/v1/profile \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Sahil Hode",
    "email": "sahil@example.com",
    "gender": "MALE",
    "dob": "2000-05-15"
  }'
```

#### Expected Responses

##### Success (`200 OK`)
Returns the complete updated profile object.

##### Validation Error — Age Under 13 (`400 Bad Request`)
```json
{
  "statusCode": 400,
  "message": [
    "Date of birth must indicate age of 13 years or older"
  ],
  "error": "Bad Request"
}
```

##### Validation Error — Invalid Name (`400 Bad Request`)
```json
{
  "statusCode": 400,
  "message": [
    "name must contain alphabets and spaces only"
  ],
  "error": "Bad Request"
}
```

---

### C. Update Basic Profile Details

#### `PUT /api/v1/profile` or `PATCH /api/v1/profile`

- **Headers**:
  - `Authorization: Bearer <accessToken>`
  - `Content-Type: application/json`
- **Request Body**:
```json
{
  "name": "Sahil Kumar Hode",
  "gender": "MALE",
  "dob": "1999-08-20"
}
```

- **cURL**:
```bash
curl -X PUT http://localhost:3000/api/v1/profile \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Sahil Kumar Hode"
  }'
```

---

### D. Add Delivery Address

#### `POST /api/v1/profile/addresses`

- **Headers**:
  - `Authorization: Bearer <accessToken>`
  - `Content-Type: application/json`
- **Request Body**:
```json
{
  "type": "WORK",
  "houseFlat": "Suite 500, Tech Park",
  "buildingStreet": "Outer Ring Road",
  "landmark": "Opposite Metro Station",
  "city": "Bengaluru",
  "state": "Karnataka",
  "pincode": "560103",
  "isDefault": false,
  "deliveryInstructions": "Leave with reception"
}
```

- **cURL**:
```bash
curl -X POST http://localhost:3000/api/v1/profile/addresses \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "WORK",
    "houseFlat": "Suite 500, Tech Park",
    "buildingStreet": "Outer Ring Road",
    "city": "Bengaluru",
    "state": "Karnataka",
    "pincode": "560103"
  }'
```

##### Success (`201 Created`)
```json
{
  "success": true,
  "message": "Address added successfully",
  "address": {
    "id": "addr_987654",
    "userId": "f8d22384-912a-4c2e-b153-9a3c109d7e5f",
    "type": "WORK",
    "houseFlat": "Suite 500, Tech Park",
    "buildingStreet": "Outer Ring Road",
    "landmark": "Opposite Metro Station",
    "city": "Bengaluru",
    "state": "Karnataka",
    "pincode": "560103",
    "isDefault": false,
    "deliveryInstructions": "Leave with reception",
    "createdAt": "2026-08-04T10:35:00.000Z"
  }
}
```

---

### E. Update Delivery Address

#### `PUT /api/v1/profile/addresses/:id`

- **Headers**:
  - `Authorization: Bearer <accessToken>`
  - `Content-Type: application/json`
- **Request Body**:
```json
{
  "houseFlat": "Suite 505, Tech Park",
  "isDefault": true
}
```

---

### F. Delete Delivery Address

#### `DELETE /api/v1/profile/addresses/:id`

- **Headers**: `Authorization: Bearer <accessToken>`

##### Success (`200 OK`)
```json
{
  "success": true,
  "message": "Address deleted successfully"
}
```

---

### G. Add Pet Profile

#### `POST /api/v1/profile/pets`

- **Headers**:
  - `Authorization: Bearer <accessToken>`
  - `Content-Type: application/json`
- **Request Body**:
```json
{
  "species": "CAT",
  "name": "Luna",
  "breed": "Persian Cat",
  "dobOrAge": "1 year",
  "gender": "FEMALE",
  "weight": 4.2,
  "dietaryPreference": "NON_VEG",
  "allergiesHealthNotes": "Sensitive stomach"
}
```

- **cURL**:
```bash
curl -X POST http://localhost:3000/api/v1/profile/pets \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "species": "CAT",
    "name": "Luna",
    "breed": "Persian Cat",
    "gender": "FEMALE"
  }'
```

##### Success (`201 Created`)
```json
{
  "success": true,
  "message": "Pet profile created successfully",
  "pet": {
    "id": "pet_112233",
    "userId": "f8d22384-912a-4c2e-b153-9a3c109d7e5f",
    "species": "CAT",
    "name": "Luna",
    "breed": "Persian Cat",
    "dobOrAge": "1 year",
    "gender": "FEMALE",
    "weight": 4.2,
    "dietaryPreference": "NON_VEG",
    "allergiesHealthNotes": "Sensitive stomach",
    "createdAt": "2026-08-04T10:35:00.000Z"
  }
}
```

---

### H. Update Pet Profile

#### `PUT /api/v1/profile/pets/:id`

- **Headers**:
  - `Authorization: Bearer <accessToken>`
  - `Content-Type: application/json`
- **Request Body**:
```json
{
  "weight": 4.5,
  "allergiesHealthNotes": "None"
}
```

---

### I. Delete Pet Profile

#### `DELETE /api/v1/profile/pets/:id`

- **Headers**: `Authorization: Bearer <accessToken>`

##### Success (`200 OK`)
```json
{
  "success": true,
  "message": "Pet profile deleted successfully"
}
```
