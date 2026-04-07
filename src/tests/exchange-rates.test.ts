import Wallet from '../models/wallet.model';
import dotenv from 'dotenv';

dotenv.config();

async function testExchangeRatesUpdate() {
  console.log('💱 Testing Exchange Rates Update...\n');
  
  const wallet = new Wallet();
  
  try {
    console.log('🔄 Fetching supported currencies and updating exchange rates...');
    
    const result = await wallet.fetchAndUpdateExchangeRates();
    
    console.log('\n📊 Response:');
    console.log('=' .repeat(50));
    console.log(JSON.stringify(result, null, 2));
    console.log('=' .repeat(50));
    
    if (result.status === 200) {
      console.log('\n✅ Exchange rates updated successfully!');
      console.log(`✓ Total rates processed: ${result.data?.totalRates || 0}`);
      console.log(`✓ New rates added: ${result.data?.newRates || 0}`);
      console.log(`✓ Currencies: ${result.data?.currencies?.join(', ') || 'N/A'}`);
    } else {
      console.log('\n⚠️ Non-200 status:', result.status);
      console.log(`Message: ${result.message}`);
    }
    
  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
  }
}

testExchangeRatesUpdate();
