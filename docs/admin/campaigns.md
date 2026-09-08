# Admin Marketing Campaigns & Messaging API Specification

All marketing broadcast endpoints are served under `/api/v1/admin/campaigns` and require Admin Authentication (`@AdminAuth()`).

---

## Table of Contents

1. [Architecture & Frontend Integration Overview](#architecture--frontend-integration-overview)
2. [Endpoints Overview](#endpoints-overview)
3. [Campaign Channel & Audience Enums](#campaign-channel--audience-enums)
4. [Endpoint Specifications](#endpoint-specifications)
   - [1. List Campaigns (Filter by Channel, Status, Audience)](#1-list-campaigns-filter-by-channel-status-audience)
   - [2. Get Campaign Configuration](#2-get-campaign-configuration)
   - [3. Create Campaign (Draft or Scheduled)](#3-create-campaign-draft-or-scheduled)
   - [4. Update Campaign Details](#4-update-campaign-details)
   - [5. Delete or Cancel Campaign](#5-delete-or-cancel-campaign)
   - [6. Dispatch Campaign via BullMQ Queue](#6-dispatch-campaign-via-bullmq-queue)
   - [7. Cancel Active or Scheduled Campaign Broadcast](#7-cancel-active-or-scheduled-campaign-broadcast)
   - [8. Real-Time Delivery Metrics & Stats](#8-real-time-delivery-metrics--stats)
5. [Frontend Integration Guide (TypeScript & Axios)](#frontend-integration-guide-typescript--axios)

---

## Architecture & Frontend Integration Overview

- **Base URL:** `https://api.kickat.co.in/api/v1/admin/campaigns` (or `http://localhost:3000/api/v1/admin/campaigns` in development)
- **Content Type:** `application/json`
- **Authentication Scheme:** `Authorization: Bearer <accessToken>`
- **Channels Supported:** WhatsApp Business API, Transactional/Promotional SMS, and Email.
- **Audience Segmentation:** `ALL_CUSTOMERS`, `ACTIVE_CUSTOMERS`, `INACTIVE_CUSTOMERS`, `PET_OWNERS_DOG`, `PET_OWNERS_CAT`, `HIGH_SPENDERS`.
- **Queue Architecture:** Bulk message dispatches are placed onto background BullMQ workers to ensure high throughput without blocking server threads.

---

## Endpoints Overview

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/campaigns` | Yes (`Bearer`) | List campaigns with channel and status filters |
| `GET` | `/api/v1/admin/campaigns/:id` | Yes (`Bearer`) | Retrieve single campaign configuration and message body |
| `POST` | `/api/v1/admin/campaigns` | Yes (`Bearer`) | Create WhatsApp/SMS/Email campaign |
| `PATCH` | `/api/v1/admin/campaigns/:id` | Yes (`Bearer`) | Edit draft or scheduled campaign |
| `DELETE` | `/api/v1/admin/campaigns/:id` | Yes (`Bearer`) | Delete draft campaign |
| `POST` | `/api/v1/admin/campaigns/:id/send` | Yes (`Bearer`) | Trigger immediate dispatch to BullMQ queue |
| `POST` | `/api/v1/admin/campaigns/:id/cancel` | Yes (`Bearer`) | Cancel a scheduled or actively sending campaign |
| `GET` | `/api/v1/admin/campaigns/:id/stats` | Yes (`Bearer`) | Retrieve live delivery counts (sent, delivered, failed) |

---

## Campaign Channel & Audience Enums

### Channels (`CampaignChannelEnum`)
- `WHATSAPP` | `SMS` | `EMAIL`

### Campaign Status (`CampaignStatusEnum`)
- `DRAFT` | `SCHEDULED` | `SENDING` | `COMPLETED` | `CANCELLED` | `FAILED`

### Audience Segment (`CampaignAudienceEnum`)
- `ALL_CUSTOMERS` | `ACTIVE_CUSTOMERS` | `INACTIVE_CUSTOMERS` | `PET_OWNERS_DOG` | `PET_OWNERS_CAT` | `HIGH_SPENDERS` | `CUSTOM`

---

## Endpoint Specifications

### 1. List Campaigns

- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/admin/campaigns`
- **Headers:** `Authorization: Bearer <accessToken>`

#### Query Parameters: `page`, `limit`, `channel`, `status`, `audienceType`, `search`, `sort`

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "data": {
    "campaigns": [
      {
        "id": "camp-uuid-1",
        "name": "Diwali Pet Treats 20% Off",
        "channel": "WHATSAPP",
        "status": "COMPLETED",
        "audienceType": "ALL_CUSTOMERS",
        "totalRecipients": 1250,
        "sentCount": 1240,
        "deliveredCount": 1210,
        "failedCount": 10,
        "scheduledAt": null,
        "sentAt": "2026-09-01T10:00:00.000Z",
        "createdAt": "2026-08-30T15:00:00.000Z"
      }
    ],
    "pagination": { "total": 12, "page": 1, "limit": 10, "totalPages": 2 },
    "summary": {
      "totalCampaigns": 12,
      "draftCount": 2,
      "scheduledCount": 3,
      "completedCount": 7
    }
  }
}
```

---

### 2. Create Campaign

- **HTTP Method:** `POST`
- **Endpoint:** `/api/v1/admin/campaigns`
- **Headers:** `Authorization: Bearer <accessToken>`, `Content-Type: application/json`

#### Request Body
```json
{
  "name": "Weekend Monsoon Sale - Dog Raincoats & Grooming",
  "channel": "WHATSAPP",
  "message": "Hi {{name}}, keep your pet dry this monsoon! Enjoy 15% off all raincoats with code MONSOON15 at kickat.co.in",
  "templateId": "monsoon_sale_v1",
  "audienceType": "PET_OWNERS_DOG",
  "scheduledAt": "2026-09-12T10:00:00.000Z"
}
```

#### Expected Success Response (`201 Created`)
```json
{
  "success": true,
  "message": "Campaign created successfully",
  "data": {
    "id": "camp-new-uuid",
    "name": "Weekend Monsoon Sale - Dog Raincoats & Grooming",
    "channel": "WHATSAPP",
    "status": "SCHEDULED",
    "scheduledAt": "2026-09-12T10:00:00.000Z"
  }
}
```

---

### 3. Dispatch Campaign via BullMQ

- **HTTP Method:** `POST`
- **Endpoint:** `/api/v1/admin/campaigns/:id/send`
- **Headers:** `Authorization: Bearer <accessToken>`

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "message": "Campaign queued for broadcast successfully",
  "data": {
    "campaignId": "camp-new-uuid",
    "status": "SENDING",
    "targetAudienceCount": 380,
    "jobId": "bullmq-job-98214"
  }
}
```

---

### 4. Real-Time Delivery Metrics & Stats

- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/admin/campaigns/:id/stats`
- **Headers:** `Authorization: Bearer <accessToken>`

#### Expected Success Response (`200 OK`)
```json
{
  "success": true,
  "data": {
    "campaignId": "camp-new-uuid",
    "channel": "WHATSAPP",
    "status": "COMPLETED",
    "totalRecipients": 380,
    "sentCount": 380,
    "deliveredCount": 372,
    "readCount": 298,
    "failedCount": 8,
    "deliveryRate": 97.89,
    "readRate": 78.42
  }
}
```

---

## Frontend Integration Guide (TypeScript & Axios)

```typescript
// services/adminCampaignService.ts
import axios from "axios";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.kickat.co.in/api/v1";

const campaignApi = axios.create({
  baseURL: `${BASE_URL}/admin/campaigns`,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

campaignApi.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("admin_access_token");
    if (token && config.headers) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const AdminCampaignService = {
  async getCampaigns(params?: any) {
    const res = await campaignApi.get("", { params });
    return res.data;
  },

  async getCampaignById(id: string) {
    const res = await campaignApi.get(`/${id}`);
    return res.data;
  },

  async createCampaign(payload: any) {
    const res = await campaignApi.post("", payload);
    return res.data;
  },

  async updateCampaign(id: string, payload: any) {
    const res = await campaignApi.patch(`/${id}`, payload);
    return res.data;
  },

  async sendCampaign(id: string) {
    const res = await campaignApi.post(`/${id}/send`);
    return res.data;
  },

  async cancelCampaign(id: string) {
    const res = await campaignApi.post(`/${id}/cancel`);
    return res.data;
  },

  async getStats(id: string) {
    const res = await campaignApi.get(`/${id}/stats`);
    return res.data;
  },

  async deleteCampaign(id: string) {
    const res = await campaignApi.delete(`/${id}`);
    return res.data;
  },
};
```
