# Search Validation Guide

This guide explains how the search validation system ensures that agents can only adjust amounts, not change which influencers are selected.

---

## 🎯 **Purpose**

When agents adjust fees/budgets dynamically, we need to ensure:
1. ✅ The **same influencers** are returned
2. ✅ Only the **payout amounts** change
3. ❌ No influencers are added or removed
4. ❌ No influencers are swapped

---

## 🗄️ **Database Schema**

### **Migration Added:**
```sql
ALTER TABLE `elig_searches` 
ADD `eligible_users` TEXT NULL AFTER `response`;
```

**What it stores:**
- `eligible_users`: JSON array of influencers with their user IDs
- Used for quick comparison without parsing full response

---

## 🔍 **How It Works**

### **Step 1: Initial Search (Brand/Agent)**
```javascript
// User performs search
POST /campaigns/search-influencers
{
  "min_level_id": 2,
  "min_points": 100,
  "platforms": ["INSTAGRAM"],
  "number_of_influencers": 10
}

// Response saved with requestId
{
  "requestId": "search_123",
  "eligibleInfluencers": [
    { "user_id": "u1", "username": "john", "amount": 50 },
    { "user_id": "u2", "username": "jane", "amount": 75 }
  ]
}
```

**Saved to database:**
```javascript
elig_searches {
  search_id: "search_123",
  response: JSON.stringify(fullResponse),
  eligible_users: JSON.stringify([
    { "user_id": "u1", "username": "john", "amount": 50 },
    { "user_id": "u2", "username": "jane", "amount": 75 }
  ])
}
```

---

### **Step 2: Agent Adjusts Fees (Dynamic Fees)**

Agent changes fees in frontend:
```javascript
// Agent adjusts budget distribution
const adjustedSearch = {
  eligibleInfluencers: [
    { "user_id": "u1", "username": "john", "amount": 60 },  // Changed!
    { "user_id": "u2", "username": "jane", "amount": 85 }   // Changed!
  ],
  totalBudget: 145
}
```

---

### **Step 3: Validation on Invite**

When agent invites influencers:
```javascript
POST /campaigns/invite-users
{
  "campaign_id": "cp123",
  "requestId": "search_123",
  "role": "agent",
  "dynamic_fees": true,
  "adjusted_search": adjustedSearch,  // With new amounts
  "business_id": "b456"
}
```

**Backend validates:**
```javascript
const comparison = await compareSearchUsers(requestId, adjustedSearch);

if (!comparison.valid) {
  return error: "User lists do not match"
}
```

---

## 📊 **Validation Logic**

### **Comparison Function:**
```typescript
async compareSearchUsers(requestId: string, newData: any): Promise<any>
```

### **What It Checks:**

1. **Saved search exists?**
   ```javascript
   if (!savedSearch) {
     return { valid: false, error: "NO_SAVED_SEARCH" }
   }
   ```

2. **Same number of users?**
   ```javascript
   if (savedUsers.length !== newUsers.length) {
     return { 
       valid: false, 
       error: "USER_COUNT_MISMATCH",
       savedCount: 10,
       newCount: 8  // ❌ Different!
     }
   }
   ```

3. **Same user IDs?**
   ```javascript
   const savedUserIds = ["u1", "u2", "u3"].sort()
   const newUserIds = ["u1", "u2", "u4"].sort()  // ❌ u4 instead of u3!
   
   if (missingInNew.length > 0 || extraInNew.length > 0) {
     return {
       valid: false,
       error: "USERS_MISMATCH",
       missingInNew: ["u3"],
       extraInNew: ["u4"]
     }
   }
   ```

4. **Track amount changes:**
   ```javascript
   return {
     valid: true,
     message: "Users match - only amounts changed",
     userCount: 10,
     amountChanges: [
       { userId: "u1", savedAmount: 50, newAmount: 60, difference: +10 },
       { userId: "u2", savedAmount: 75, newAmount: 85, difference: +10 }
     ],
     totalAmountChange: +20
   }
   ```

---

## ✅ **Valid Scenarios**

### **1. Only Amounts Changed**
```javascript
// Saved
[
  { user_id: "u1", amount: 50 },
  { user_id: "u2", amount: 75 }
]

// New (VALID ✅)
[
  { user_id: "u1", amount: 60 },  // Amount changed
  { user_id: "u2", amount: 85 }   // Amount changed
]
```

### **2. Same Users, Same Amounts**
```javascript
// Saved
[
  { user_id: "u1", amount: 50 },
  { user_id: "u2", amount: 75 }
]

// New (VALID ✅)
[
  { user_id: "u1", amount: 50 },  // No change
  { user_id: "u2", amount: 75 }   // No change
]
```

---

## ❌ **Invalid Scenarios**

### **1. Different User Count**
```javascript
// Saved (10 users)
[
  { user_id: "u1", amount: 50 },
  { user_id: "u2", amount: 75 },
  // ... 8 more users
]

// New (8 users) ❌ INVALID
[
  { user_id: "u1", amount: 60 },
  { user_id: "u2", amount: 85 },
  // ... 6 more users
]

// Error: "USER_COUNT_MISMATCH"
```

### **2. Different Users**
```javascript
// Saved
[
  { user_id: "u1", amount: 50 },
  { user_id: "u2", amount: 75 },
  { user_id: "u3", amount: 60 }
]

// New ❌ INVALID
[
  { user_id: "u1", amount: 60 },
  { user_id: "u2", amount: 85 },
  { user_id: "u4", amount: 70 }  // ❌ u4 instead of u3!
]

// Error: "USERS_MISMATCH"
// missingInNew: ["u3"]
// extraInNew: ["u4"]
```

### **3. Users Reordered (But Same Set)**
```javascript
// Saved
[
  { user_id: "u1", amount: 50 },
  { user_id: "u2", amount: 75 },
  { user_id: "u3", amount: 60 }
]

// New (reordered) ✅ VALID
[
  { user_id: "u3", amount: 70 },  // Reordered, but same IDs
  { user_id: "u1", amount: 60 },
  { user_id: "u2", amount: 85 }
]
```
**This is VALID because we sort the IDs before comparing!**

---

## 📝 **Response Examples**

### **Success Response:**
```json
{
  "valid": true,
  "message": "Users match - only amounts changed",
  "userCount": 10,
  "amountChanges": [
    {
      "userId": "u1",
      "username": "john_doe",
      "savedAmount": 50,
      "newAmount": 60,
      "difference": 10
    }
  ],
  "totalAmountChange": 20
}
```

### **Error Response (User Count Mismatch):**
```json
{
  "valid": false,
  "message": "User count mismatch. Saved: 10, New: 8",
  "error": "USER_COUNT_MISMATCH",
  "savedCount": 10,
  "newCount": 8
}
```

### **Error Response (Different Users):**
```json
{
  "valid": false,
  "message": "User lists do not match",
  "error": "USERS_MISMATCH",
  "missingInNew": ["u3", "u5"],
  "extraInNew": ["u8", "u9"],
  "savedUserIds": ["u1", "u2", "u3", "u4", "u5"],
  "newUserIds": ["u1", "u2", "u4", "u8", "u9"]
}
```

---

## 🔧 **How to Use in Your Code**

### **Standalone Validation:**
```typescript
import CampaignsModel from '../models/campaigns.model';

const campaignsModel = new CampaignsModel();

const result = await campaignsModel.compareSearchUsers(
  "search_123",  // requestId
  {
    eligibleInfluencers: [
      { user_id: "u1", amount: 60 },
      { user_id: "u2", amount: 85 }
    ]
  }
);

if (!result.valid) {
  console.error("Validation failed:", result.message);
  // Handle error
}

console.log("Amount changes:", result.amountChanges);
```

### **In Campaign Invite (Already Integrated):**
```typescript
// This is automatically called when:
// role === 'agent' && dynamic_fees === true

POST /campaigns/invite-users
{
  "role": "agent",
  "dynamic_fees": true,
  "requestId": "search_123",
  "adjusted_search": { ... }
}

// Backend automatically validates before processing
```

---

## 🛡️ **Security Benefits**

1. **Prevents Fraud:**
   - Agents can't swap in different influencers
   - Agents can't add extra influencers

2. **Maintains Integrity:**
   - Search results are preserved
   - Only fee distribution can change

3. **Audit Trail:**
   - All amount changes are logged
   - Can track who changed what

4. **Business Protection:**
   - Ensures campaign consistency
   - Prevents unauthorized influencer selection

---

## 🧪 **Testing**

### **Test Case 1: Valid Amount Change**
```javascript
// Initial search
const saved = {
  eligibleInfluencers: [
    { user_id: "u1", amount: 50 },
    { user_id: "u2", amount: 75 }
  ]
};

// Adjusted search
const adjusted = {
  eligibleInfluencers: [
    { user_id: "u1", amount: 60 },  // +10
    { user_id: "u2", amount: 85 }   // +10
  ]
};

// Should PASS ✅
```

### **Test Case 2: Invalid User Swap**
```javascript
// Initial search
const saved = {
  eligibleInfluencers: [
    { user_id: "u1", amount: 50 },
    { user_id: "u2", amount: 75 }
  ]
};

// Adjusted search
const adjusted = {
  eligibleInfluencers: [
    { user_id: "u1", amount: 60 },
    { user_id: "u3", amount: 85 }   // ❌ Different user!
  ]
};

// Should FAIL with USERS_MISMATCH ❌
```

---

## 📚 **Error Codes Reference**

| Error Code | Description | Solution |
|-----------|-------------|----------|
| `NO_SAVED_SEARCH` | requestId not found | Do initial search first |
| `PARSE_ERROR` | Invalid JSON in saved data | Re-run search |
| `USER_COUNT_MISMATCH` | Different number of users | Use same search |
| `USERS_MISMATCH` | Different user IDs | Use same search |
| `COMPARISON_ERROR` | Unexpected error | Check logs |

---

## 🎯 **Best Practices**

1. **Always save searches:**
   - Call `/search-influencers` first
   - Get `requestId` from response
   - Use same `requestId` for invites

2. **Frontend validation:**
   - Disable user selection changes after search
   - Only allow amount/budget adjustments
   - Show clear warnings

3. **Error handling:**
   - Display user-friendly error messages
   - Allow re-search if validation fails
   - Log validation failures for audit

4. **Performance:**
   - Validation is fast (ID comparison only)
   - No need to cache results
   - Scales well with large user lists

---

**Last Updated:** October 2025  
**Version:** 1.0



