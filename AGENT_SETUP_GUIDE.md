# Agent Setup Guide

Quick guide to set up and test the agent endpoints.

---

## 🗄️ Step 1: Run Database Migrations

### Migration 1: Add Verification Status
Run this migration to add verification_status and updated_on columns:

```bash
mysql -u your_username -p your_database < src/db/migrations/013_add_agent_verification_status.sql
```

**What it does:**
- Adds `verification_status` column (pending, verified, rejected, suspended)
- Adds `updated_on` timestamp column
- Adds indexes for better performance
- Backfills existing agents to 'verified' if they're active

### Migration 2: Add Agent Update Fields

**Option A: Safe Automatic Version (RECOMMENDED)**
This version checks if columns exist before adding them:

```bash
mysql -u your_username -p your_database < src/db/migrations/014_agent_update_fields_safe.sql
```

**Option B: Manual Version**
If you prefer manual control:

1. First, check existing columns:
```bash
mysql -u your_username -p your_database < src/db/migrations/014_check_agents_columns.sql
```

2. Edit `014_agent_update_fields.sql` and comment out ALTER statements for existing columns

3. Run the migration:
```bash
mysql -u your_username -p your_database < src/db/migrations/014_agent_update_fields.sql
```

**What it does:**
- Adds `phone` column (if not exists)
- Adds `country` column (if not exists)
- Adds `iso_code` column (if not exists)
- Adds `type` column (if not exists)
- Adds indexes for all new columns

---

## 🧪 Step 2: Test the Endpoints

### Import Postman Collection

1. Open Postman
2. Click **Import**
3. Select `Agent_Endpoints_Postman.json`
4. Set environment variables:
   - `baseUrl`: `http://localhost:3000` (or your API URL)
   - `agentJWT`: (will be auto-set on login)
   - `agentId`: (will be auto-set on login)
   - `businessId`: (set manually for testing)

### Test Flow

1. **Login** → `POST /agents/login`
   - JWT and agentId automatically saved to environment

2. **Get Profile** → `GET /agents/profile`
   - View agent details and verification status

3. **Get Businesses** → `GET /agents/businesses`
   - See all assigned businesses

4. **Change Business** → `POST /agents/change-business`
   - Switch to a specific business context

5. **Get Campaigns** → `GET /agents/campaigns`
   - View campaigns created by this agent

---

## 📋 Step 3: Verification Status Workflow

### Manual Verification (Admin Panel)

```sql
-- Verify an agent
UPDATE agents 
SET verification_status = 'verified' 
WHERE agent_id = 'agt123';

-- Reject an agent
UPDATE agents 
SET verification_status = 'rejected' 
WHERE agent_id = 'agt123';

-- Suspend an agent
UPDATE agents 
SET verification_status = 'suspended' 
WHERE agent_id = 'agt123';
```

### Check Verification Status

```sql
SELECT 
  agent_id,
  first_name,
  last_name,
  email,
  status,
  verification_status,
  created_on
FROM agents
WHERE verification_status = 'pending';
```

---

## 🔐 Step 4: Password Reset Flow

### Test Password Reset

1. **Request Reset:**
   ```bash
   POST /agents/reset-password-request
   {
     "email": "agent@example.com"
   }
   ```

2. **Check Email for OTP** (or check database):
   ```sql
   SELECT * FROM user_otp 
   WHERE account_no = 'agent@example.com' 
   ORDER BY created_at DESC 
   LIMIT 1;
   ```

3. **Reset Password:**
   ```bash
   POST /agents/reset-password
   {
     "email": "agent@example.com",
     "otp": "123456",
     "newPassword": "newSecurePass123"
   }
   ```

4. **Login with New Password:**
   ```bash
   POST /agents/login
   {
     "email": "agent@example.com",
     "password": "newSecurePass123"
   }
   ```

---

## 📊 Step 5: View Agent Statistics

### Get Agent Profile (includes stats)

```bash
GET /agents/profile
Authorization: Bearer {agentJWT}
```

**Returns:**
- Agent details (name, email, phone, country)
- Verification status
- Number of assigned businesses
- Number of campaigns created

---

## 🛠️ Common SQL Queries

### View All Agents with Stats

```sql
SELECT 
  a.agent_id,
  CONCAT(a.first_name, ' ', a.last_name) as name,
  a.email,
  a.status,
  a.verification_status,
  COUNT(DISTINCT aca.business_id) as businesses_assigned,
  COUNT(DISTINCT c.campaign_id) as campaigns_created
FROM agents a
LEFT JOIN agent_company_assignments aca 
  ON a.agent_id = aca.agent_id AND aca.status = 'active'
LEFT JOIN act_campaigns c 
  ON a.agent_id = c.created_by_user_id AND c.creator_type = 'agent'
GROUP BY a.agent_id
ORDER BY campaigns_created DESC;
```

### Find Agents by Verification Status

```sql
SELECT 
  agent_id,
  CONCAT(first_name, ' ', last_name) as name,
  email,
  verification_status,
  created_on
FROM agents
WHERE verification_status = 'pending'
ORDER BY created_on DESC;
```

### Agent Activity Report

```sql
SELECT 
  a.agent_id,
  CONCAT(a.first_name, ' ', a.last_name) as agent_name,
  b.business_id,
  b.name as business_name,
  COUNT(c.campaign_id) as campaigns_created,
  SUM(CASE WHEN c.status = 'active' THEN 1 ELSE 0 END) as active_campaigns,
  SUM(CASE WHEN c.status = 'completed' THEN 1 ELSE 0 END) as completed_campaigns
FROM agents a
JOIN agent_company_assignments aca ON a.agent_id = aca.agent_id
JOIN business_profile b ON aca.business_id = b.business_id
LEFT JOIN act_campaigns c 
  ON a.agent_id = c.created_by_user_id 
  AND c.business_id = b.business_id
  AND c.creator_type = 'agent'
WHERE aca.status = 'active'
GROUP BY a.agent_id, b.business_id
ORDER BY campaigns_created DESC;
```

---

## ⚠️ Troubleshooting

### Issue: "Email not found" on login

**Check if agent exists:**
```sql
SELECT * FROM agents WHERE email = 'agent@example.com';
```

**If not, create agent via admin:**
```bash
POST /admin/agents
{
  "first_name": "John",
  "last_name": "Doe",
  "email": "agent@example.com",
  "country": "United States",
  "iso_code": "US",
  "phone": "+1234567890"
}
```

### Issue: "Account is inactive"

**Activate agent:**
```sql
UPDATE agents 
SET status = 'active', verification_status = 'verified'
WHERE email = 'agent@example.com';
```

### Issue: "No company assignments found"

**Assign agent to business:**
```bash
POST /admin/agents/companies
{
  "agent_id": "agt123",
  "business_ids": ["b456", "b789"]
}
```

### Issue: JWT token expired

**Re-login to get new token:**
```bash
POST /agents/login
```

### Issue: Can't see campaigns

**Verify campaigns exist:**
```sql
SELECT * FROM act_campaigns 
WHERE creator_type = 'agent' 
AND created_by_user_id = 'agt123';
```

---

## 📝 API Endpoints Summary

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/agents/login` | POST | No | Agent login |
| `/agents/change-business` | POST | Yes | Switch business context |
| `/agents/profile` | GET | Yes | Get agent profile |
| `/agents/businesses` | GET | Yes | Get assigned businesses |
| `/agents/campaigns` | GET | Yes | Get agent campaigns |
| `/agents/reset-password-request` | POST | No | Request password reset |
| `/agents/reset-password` | POST | No | Reset password with OTP |
| `/agents/change-password` | POST | Yes | Change password |

---

## 🎯 Next Steps

1. ✅ Run migration
2. ✅ Create test agent via admin panel
3. ✅ Assign agent to businesses
4. ✅ Test login
5. ✅ Test password reset
6. ✅ Test profile viewing
7. ✅ Test campaign retrieval

---

## 📚 Additional Resources

- **Full API Documentation**: `AGENTS_API_ENDPOINTS.md`
- **Postman Collection**: `Agent_Endpoints_Postman.json`
- **Migration File**: `src/db/migrations/013_add_agent_verification_status.sql`

---

**Last Updated:** October 2025  
**Version:** 1.0

