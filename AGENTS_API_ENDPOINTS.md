# Agent API Endpoints Documentation

Complete documentation for all agent-related API endpoints.

---

## 🔐 Authentication Endpoints

### 1. Agent Login
**Endpoint:** `POST /agents/login`  
**Authentication:** None (Public)

**Request Body:**
```json
{
  "email": "agent@example.com",
  "password": "securePassword123"
}
```

**Response (200):**
```json
{
  "status": 200,
  "message": "Login successful",
  "data": {
    "agentId": "agt123",
    "first_name": "John",
    "last_name": "Doe",
    "email": "agent@example.com",
    "type": "access",
    "business_id": null,
    "jwt": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Error Responses:**
- `404` - Incorrect email or password
- `403` - Account is inactive

---

### 2. Change Business Context
**Endpoint:** `POST /agents/change-business`  
**Authentication:** Required (JWT)

**Request Body:**
```json
{
  "businessId": "b456"
}
```

**Response (200):**
```json
{
  "status": 200,
  "message": "Business changed successfully",
  "data": {
    "agentId": "agt123",
    "first_name": "John",
    "last_name": "Doe",
    "email": "agent@example.com",
    "type": "access",
    "user_id": "agt123",
    "business_id": "b456",
    "business_name": "Acme Corp",
    "jwt": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Error Responses:**
- `400` - businessId is required
- `403` - You do not have access to this business
- `404` - Agent not found

---

## 👤 Profile Management

### 3. Get Agent Profile
**Endpoint:** `GET /agents/profile`  
**Authentication:** Required (JWT)

**Response (200):**
```json
{
  "status": 200,
  "message": "Agent profile retrieved successfully",
  "data": {
    "agent": {
      "agent_id": "agt123",
      "first_name": "John",
      "last_name": "Doe",
      "email": "agent@example.com",
      "phone": "+1234567890",
      "country": "United States",
      "iso_code": "US",
      "status": "active",
      "type": "standard",
      "verification_status": "verified",
      "created_on": "2025-01-15 10:30:00",
      "updated_on": "2025-01-20 14:20:00"
    },
    "statistics": {
      "assignedBusinesses": 5,
      "campaignsCreated": 12
    }
  }
}
```

**Verification Status Values:**
- `pending` - Awaiting verification
- `verified` - Agent is verified
- `rejected` - Verification rejected
- `suspended` - Agent is suspended

---

### 4. Update Agent Profile
**Endpoint:** `PUT /agents/profile`  
**Authentication:** Required (JWT)

**Request Body (all fields optional):**
```json
{
  "first_name": "John",
  "last_name": "Doe",
  "phone": "+1234567890",
  "country": "United States",
  "iso_code": "US"
}
```

**Response (200):**
```json
{
  "status": 200,
  "message": "Profile updated successfully",
  "data": {
    "agent_id": "agt123",
    "first_name": "John",
    "last_name": "Doe",
    "email": "agent@example.com",
    "phone": "+1234567890",
    "country": "United States",
    "iso_code": "US",
    "status": "active",
    "type": "standard",
    "verification_status": "verified",
    "created_on": "2025-01-15 10:30:00",
    "updated_on": "2025-10-11 15:30:00"
  }
}
```

**Error Responses:**
- `400` - No fields to update
- `403` - Account is inactive
- `404` - Agent not found

**Notes:**
- Email cannot be changed via this endpoint (for security)
- Status and verification_status can only be changed by admins
- Updated_on timestamp is automatically updated
- You can update one or all fields at once

---

## 🔑 Password Management

### 5. Request Password Reset
**Endpoint:** `POST /agents/reset-password-request`  
**Authentication:** None (Public)

**Request Body:**
```json
{
  "email": "agent@example.com"
}
```

**Response (200):**
```json
{
  "status": 200,
  "message": "Reset password OTP sent to your email"
}
```

**Error Responses:**
- `400` - Email is required
- `403` - Account is inactive
- `404` - Email not found

---

### 6. Reset Password (with OTP)
**Endpoint:** `POST /agents/reset-password`  
**Authentication:** None (Public)

**Request Body:**
```json
{
  "email": "agent@example.com",
  "otp": "123456",
  "newPassword": "newSecurePassword123"
}
```

**Response (200):**
```json
{
  "status": 200,
  "message": "Password reset successful"
}
```

**Error Responses:**
- `400` - OTP, email, and new password are required
- `400` - Password must be at least 8 characters
- `400` - Invalid or expired OTP

---

### 7. Change Password (Authenticated)
**Endpoint:** `POST /agents/change-password`  
**Authentication:** Required (JWT)

**Request Body:**
```json
{
  "currentPassword": "oldPassword123",
  "newPassword": "newSecurePassword123"
}
```

**Response (200):**
```json
{
  "status": 200,
  "message": "Password changed successfully"
}
```

**Error Responses:**
- `400` - Current password and new password are required
- `400` - New password must be at least 8 characters
- `400` - Current password is incorrect
- `403` - Account is inactive
- `404` - Agent not found

---

## 🏢 Business Management

### 8. Get Assigned Businesses
**Endpoint:** `GET /agents/businesses`  
**Authentication:** Required (JWT)

**Response (200):**
```json
{
  "status": 200,
  "message": "Businesses retrieved successfully",
  "data": {
    "agentId": "agt123",
    "agentName": "John Doe",
    "businesses": [
      {
        "business_id": "b456",
        "business_name": "Acme Corp",
        "verification_status": "verified",
        "assignment_status": "active",
        "assigned_on": "2025-01-10 09:00:00"
      },
      {
        "business_id": "b789",
        "business_name": "Tech Solutions Inc",
        "verification_status": "verified",
        "assignment_status": "active",
        "assigned_on": "2025-01-05 11:30:00"
      }
    ]
  }
}
```

---

## 📊 Campaign Management

### 9. Get Agent Campaigns
**Endpoint:** `GET /agents/campaigns`  
**Authentication:** Required (JWT)

**Query Parameters:**
- `business_id` (optional) - Filter campaigns by business
- `status` (optional) - Filter by campaign status (draft, active, closed, etc.)

**Examples:**
```
GET /agents/campaigns
GET /agents/campaigns?business_id=b456
GET /agents/campaigns?status=active
GET /agents/campaigns?business_id=b456&status=draft
```

**Response (200):**
```json
{
  "status": 200,
  "message": "Agent campaigns retrieved successfully",
  "data": {
    "agentId": "agt123",
    "agentName": "John Doe",
    "totalCampaigns": 12,
    "campaigns": [
      {
        "campaign_id": "cp789",
        "title": "Summer Fashion Campaign",
        "description": "Promote our summer collection...",
        "business_id": "b456",
        "business_name": "Acme Corp",
        "budget": 5000,
        "status": "active",
        "number_of_influencers": 10,
        "start_date": "2025-06-01",
        "end_date": "2025-08-31",
        "created_on": "2025-05-15 10:30:00",
        "published_date": "2025-05-20 14:00:00",
        "creator_type": "agent",
        "created_by_user_id": "agt123"
      }
    ]
  }
}
```

**Campaign Status Values:**
- `draft` - Campaign is being created
- `open_to_applications` - Accepting influencer applications
- `active` - Campaign is running
- `closed` - Campaign has ended
- `completed` - Campaign completed and paid
- `expired` - Campaign expired
- `deleted` - Campaign was deleted

---

## 🔒 JWT Token Structure

### Access Token Payload (Before Business Selection):
```json
{
  "role": "agent",
  "agentId": "agt123",
  "business_id": null,
  "email": "agent@example.com",
  "type": "access",
  "exp": 1234567890,
  "iat": 1234567890
}
```

### Access Token Payload (After Business Selection):
```json
{
  "role": "agent",
  "agentId": "agt123",
  "user_id": "agt123",
  "business_id": "b456",
  "email": "agent@example.com",
  "type": "access",
  "exp": 1234567890,
  "iat": 1234567890
}
```

---

## 🗄️ Database Schema

### Agents Table Structure:
```sql
CREATE TABLE agents (
  agent_id VARCHAR(100) PRIMARY KEY,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  country VARCHAR(100),
  iso_code VARCHAR(5),
  status ENUM('active', 'inactive') DEFAULT 'active',
  type VARCHAR(50),
  verification_status ENUM('pending', 'verified', 'rejected', 'suspended') DEFAULT 'pending',
  created_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_email (email),
  INDEX idx_status (status),
  INDEX idx_verification_status (verification_status)
);
```

### Agent Company Assignments Table:
```sql
CREATE TABLE agent_company_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agent_id VARCHAR(100) NOT NULL,
  business_id VARCHAR(100) NOT NULL,
  status ENUM('active', 'inactive') DEFAULT 'active',
  created_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_agent_id (agent_id),
  INDEX idx_business_id (business_id),
  INDEX idx_status (status)
);
```

---

## 📝 Migration Files Required

Run these migrations in order:

1. **013_add_agent_verification_status.sql**
   - Adds `verification_status` column
   - Adds `updated_on` column
   - Backfills existing data

---

## 🔄 Common Workflows

### Agent Registration Flow:
1. Admin creates agent via `/admin/agents` (POST)
2. Agent receives email with credentials
3. Agent status: `pending` verification
4. Admin verifies agent → status: `verified`

### Agent Login & Work Flow:
1. Agent logs in → `POST /agents/login`
2. Agent views assigned businesses → `GET /agents/businesses`
3. Agent selects business → `POST /agents/change-business`
4. Agent creates campaigns for that business
5. Agent views their campaigns → `GET /agents/campaigns`

### Password Reset Flow:
1. Agent requests reset → `POST /agents/reset-password-request`
2. Agent receives OTP via email
3. Agent submits OTP + new password → `POST /agents/reset-password`
4. Agent can log in with new password

### Password Change Flow (Logged In):
1. Agent provides current + new password → `POST /agents/change-password`
2. System validates current password
3. Password updated, notification email sent

### Profile Update Flow:
1. Agent views profile → `GET /agents/profile`
2. Agent updates information → `PUT /agents/profile`
3. System validates and saves changes
4. Returns updated profile with new `updated_on` timestamp

---

## ⚠️ Important Notes

1. **Authentication**: Most endpoints require JWT authentication
2. **Business Context**: After login, agent must select a business to work on campaigns
3. **Verification Status**: Only verified agents can work on campaigns
4. **OTP Expiry**: OTPs expire after a certain time (check `user_otp` table)
5. **Password Requirements**: Minimum 8 characters
6. **Email Notifications**: Sent for password changes and resets

---

## 🧪 Testing with Postman

Import the collection and set these environment variables:
- `baseUrl`: Your API base URL (e.g., `http://localhost:3000`)
- `agentJWT`: JWT token received from login
- `agentId`: Agent ID from login response
- `businessId`: Business ID to work with

---

## 🐛 Common Error Codes

- `200` - Success
- `400` - Bad Request (validation error)
- `401` - Unauthorized (missing/invalid JWT)
- `403` - Forbidden (inactive account or no access)
- `404` - Not Found
- `500` - Internal Server Error

---

**Last Updated:** October 2025  
**API Version:** 1.0

