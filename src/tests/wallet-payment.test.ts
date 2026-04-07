import Wallet from '../models/wallet.model';
import dotenv from 'dotenv';

dotenv.config();

async function testKESDeposit() {
  console.log('💰 Testing KES Deposit Request...\n');
  
  const wallet = new Wallet();
  
  
  const testData = {
    userId: 'u2daf21c9343942839005bbb0091b232f',
    amount: 10,
    paymentMethod: 'MOBILE',
    currency: 'KES',
    account_number: '254',
    redirect_url: 'https://www.web.socialgems.me/payment-success'
  };
  
  try {
    console.log('📋 Test Parameters:', testData);
    console.log('\n🚀 Initiating deposit request...');
    
    const result = await wallet.depositRequest(testData);
    
    console.log('\n📊 Response:', JSON.stringify(result, null, 2));
    
    if (result.status === 200) {
      console.log('\n✅ Test Passed!');
    } else {
      console.log('\n⚠️ Non-200 status:', result.status);
    }
    
  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
  }
}

testKESDeposit();

