# Test Suite Documentation

## Overview
Comprehensive test suite for the Social Gems platform covering campaigns, wallet payments, and social media analytics.

## Files
- `campaigns.tests.ts` - Campaign workflow test suite
- `wallet-payment.test.ts` - Wallet deposit and payment test suite
- `tiktok-analytics.test.ts` - TikTok analytics integration tests
- `instagram-analytics.test.ts` - Instagram analytics integration tests
- `twitter-analytics.test.ts` - Twitter/X analytics integration tests
- `index.ts` - Test runner with utility methods

## Test Coverage

### ✅ **Phase 1: Campaign Creation**
- Create draft campaign
- Get draft campaign details  
- Update draft campaign
- Get eligible users

### ✅ **Phase 2: Campaign Publishing**
- Publish campaign
- Send invites to users
- Get applications

### ✅ **Phase 3: Application Handling**
- Handle campaign invites (accept/reject)
- Submit applications
- Batch process applications

### ✅ **Phase 4: Campaign Activation**
- Activate campaign (with payment processing)
- Start campaign execution
- Complete activities

### ✅ **Phase 5: Statistics & Analytics**
- Campaign statistics
- Influencer statistics
- Business statistics

### ✅ **Phase 6: Error Scenarios**
- Unauthorized access attempts
- Invalid status transitions
- Missing required fields
- Non-existent resources

### ✅ **Phase 7: Edge Cases**
- Empty batch processing
- No eligible users
- Campaign deletion

## How to Run Tests

### Method 1: Run All Tests
```typescript
// In src/tests/index.ts, uncomment:
new Test();

// Then uncomment in constructor:
this.runCampaignTests()
```

### Method 2: Import and Run Directly
```typescript
import CampaignTests from './tests/campaigns.tests';

// Run all tests
const campaignTests = new CampaignTests();

// Or run specific test
await campaignTests.runSpecificTest('createDraft');
```

### Method 3: Run from Test Class
```typescript
import Test from './tests/index';

const test = new Test();

// Run all campaign tests
await test.runCampaignTests();

// Run specific test
await test.runSpecificCampaignTest('publish');
```

## Available Specific Tests

| Test Name | Description |
|-----------|-------------|
| `createDraft` | Test campaign creation |
| `publish` | Test campaign publishing |
| `invite` | Test user invitation |
| `activate` | Test campaign activation & payment |
| `stats` | Test statistics retrieval |

## Test Data

The tests use predefined test user IDs:
- **Brand User**: `test_brand_123`
- **Influencer User**: `test_influencer_456`

## Expected Output

```
🧪 Starting Campaign Tests...

✅ Create Draft Campaign: Campaign created successfully
✅ Get Draft Campaign: Draft campaign retrieved successfully
✅ Update Draft Campaign: Campaign updated successfully
✅ Get Eligible Users: Found 5 eligible users
✅ Publish Campaign: Campaign published successfully
✅ Invite Users: Users invited successfully
...

============================================================
🧪 CAMPAIGN TESTS SUMMARY
============================================================

✅ PASSED: 23
❌ FAILED: 2
📊 TOTAL: 25
🎯 SUCCESS RATE: 92%

🎉 Test suite completed! Campaign ID used: cp1234567890
============================================================
```

## Test Results Structure

```typescript
interface TestResult {
  testName: string;
  status: 'PASS' | 'FAIL';
  message: string;
  data?: any;
  error?: any;
}
```

## Business Flow Tested

```
1. Create Draft (FREE)
2. Publish Campaign (makes visible)
3. Send Invites (NO payment)
4. Review Applications
5. Batch Process (approve/reject)
6. Activate Campaign (PAYMENT PROCESSED)
7. Execute Campaign
8. Complete & Track
```

## Error Handling

The tests verify proper error handling for:
- ❌ Invalid authentication
- ❌ Insufficient permissions  
- ❌ Invalid status transitions
- ❌ Missing required fields
- ❌ Non-existent resources
- ❌ Business logic violations

## Integration with Real Database

⚠️ **Warning**: These tests interact with the actual database. Make sure to:
1. Use test data that won't conflict with production
2. Run tests in a development environment
3. Clean up test data after completion

## Debugging

- All test results are logged using the logger utility
- Failed tests include detailed error information
- Test data and responses are captured for debugging
- Use specific test methods to isolate issues

## Contributing

When adding new campaign features:
1. Add corresponding test methods
2. Update the test coverage documentation
3. Ensure error scenarios are covered
4. Test both positive and negative cases

---

**Ready to test?** Uncomment the test runner and start testing your campaign functionality! 