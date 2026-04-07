import { InfluencerAnalytics } from '../thirdparty/InfluencerAnalytics';
import dotenv from 'dotenv';

dotenv.config();

async function testInstagramAnalytics() {
  console.log('📸 Testing Instagram Analytics with trackInfluencerPerformance...\n');
  
  const testUsername = 'cristiano'; // Cristiano Ronaldo - popular Instagram account
  const platforms = ['instagram'];
  
  try {
    const influencerAnalytics = new InfluencerAnalytics();
    
    console.log(`📊 Testing analytics for: @${testUsername}`);
    console.log(`🎯 Platforms: ${platforms.join(', ')}`);
    console.log('=' .repeat(50));
    
    // Single test: Call trackInfluencerPerformance
    console.log('\n🚀 Running trackInfluencerPerformance...');
    const result = await influencerAnalytics.trackInfluencerPerformance(testUsername, platforms);
    
    console.log('\n✅ Test Completed Successfully!');
    console.log('=' .repeat(50));
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testInstagramAnalytics().then(() => {
  console.log('\n🏁 Test execution completed');
  process.exit(0);
}).catch((error) => {
  console.error('💥 Test execution failed:', error);
  process.exit(1);
}); 