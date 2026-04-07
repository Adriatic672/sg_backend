import Wallet from '../models/wallet.model';
import dotenv from 'dotenv';
import RelworxMobileMoney from '../thirdparty/Relworx';
import Campaigns from '../models/campaigns.model';
const relworx = new RelworxMobileMoney();

dotenv.config();

export default class Test {
    constructor() {
        this.testKESDeposit();
    }
   
 async testKESDeposit() {
  const campaigns = new Campaigns();
  await campaigns.closeExpiredCampaignInvitations();
  return;

  console.log('💰 Testing KES Deposit Request...\n');
  
  const wallet = new Wallet();
  return ;
  const request_currency = await wallet.detectCurrency('+254710883976')
  console.log("request_currency", request_currency)

  const testData = {
    userId: 'u2daf21c9343942839005bbb0091b232f',
    amount: 10,
    paymentMethod: 'MOBILE',
    currency: 'KES',
    account_number: '254710883976',
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

}
