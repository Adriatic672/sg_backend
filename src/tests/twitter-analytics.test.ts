
import RapiAPI from '../thirdparty/Rapid.X';
import dotenv from 'dotenv';

dotenv.config();

async function testTwitterAnalytics() {
  console.log('🐦 Testing Twitter/X Analytics with trackInfluencerPerformance...\n');
  
  const testUsername = 'elonmusk';
  const platforms = ['twitter'];
  
  try {
    const influencerAnalytics = new RapiAPI();
    const result = await influencerAnalytics.getUserAnalytics(testUsername);
    console.log("influencerAnalyticsX", result);
    console.log(`📊 Testing analytics for: @${testUsername}`);
    
    console.log('\n✅ Test Completed Successfully!');
    console.log('=' .repeat(50));
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testTwitterAnalytics().then(() => {
  console.log('\n🏁 Test execution completed');
  process.exit(0);
}).catch((error) => {
  console.error('💥 Test execution failed:', error);
  process.exit(1);
}); 