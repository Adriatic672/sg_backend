/**
 * Stellar Account Verification Script
 * Run with: npx ts-node src/scripts/check-stellar-accounts.ts
 */

import { Server } from 'stellar-sdk';

const server = new Server('https://horizon-testnet.stellar.org');

// REQUIRED accounts (must be funded)
const REQUIRED_ACCOUNTS = {
  escrow: 'GCHPWACIQTATJ57GPZ7H5FOZAOX53WRMNQSZ5I7N6OFWI43CZ6DDPVBK',
  issuer: 'GDVIY6BZNB63ZYMKEWOEFN4PYCJNE6U2CNAS6L2CC5NTG66BZWYXGX2I'
};

// OPTIONAL - only needed for auto-funding new user wallets
const OPTIONAL_ACCOUNTS = {
  // airdrop: 'GCHPWACIQTATJ57GPZ7H5FOZAOX53WRMNQSZ5I7N6OFWI43CZ6DDPVBK' // Uses random keypair if not set
};

const TOKEN_ISSUER = 'GDVIY6BZNB63ZYMKEWOEFN4PYCJNE6U2CNAS6L2CC5NTG66BZWYXGX2I';

async function checkAccount(publicKey: string, name: string) {
  console.log(`\n📋 Checking ${name} account: ${publicKey}`);
  console.log('─'.repeat(60));
  
  try {
    const account = await server.loadAccount(publicKey);
    
    console.log(`✅ Account exists on testnet!`);
    console.log(`   Sequence: ${account.sequence}`);
    console.log(`   Balances:`);
    
    for (const balance of account.balances) {
      if (balance.asset_type === 'native') {
        console.log(`   - XLM (native): ${balance.balance}`);
      } else {
        console.log(`   - ${balance.asset_code}: ${balance.balance}`);
        console.log(`     Issuer: ${balance.asset_issuer}`);
      }
    }
    
    // Check for SBX trust line if it's the escrow account
    if (name === 'Escrow') {
      const hasSBXTrust = account.balances.some(
        (b: any) => b.asset_code === 'SBX' && b.asset_issuer === TOKEN_ISSUER
      );
      console.log(`\n   SBX Trust Line: ${hasSBXTrust ? '✅ Yes' : '❌ No (needs to be created)'}`);
    }
    
    return true;
  } catch (error: any) {
    console.log(`❌ Account NOT found on testnet`);
    console.log(`   Error: ${error.message || 'Account not found'}`);
    console.log(`   Action needed: Fund this account via Friendbot`);
    return false;
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('       STELLAR TESTNET ACCOUNT VERIFICATION');
  console.log('═══════════════════════════════════════════════════════════');
  
  const results = {
    escrow: await checkAccount(REQUIRED_ACCOUNTS.escrow, 'Escrow (REQUIRED)'),
    issuer: await checkAccount(REQUIRED_ACCOUNTS.issuer, 'Issuer (REQUIRED)')
  };
  
  console.log('\n' + '═'.repeat(60));
  console.log('                    SUMMARY');
  console.log('═'.repeat(60));
  
  const allReady = results.escrow && results.issuer;
  
  if (allReady) {
    console.log('\n🎉 All accounts are activated on testnet!');
    console.log('\nNext steps:');
    console.log('  1. Create trust line: Escrow → Issuer (for SBX)');
    console.log('  2. Issue SBX tokens: Issuer → Escrow');
    console.log('  3. Test payment flow');
    console.log('\nSee STELLAR_SETUP_GUIDE.md for detailed instructions.');
  } else {
    console.log('\n⚠️  Some accounts need funding!');
    console.log('\nTo fund accounts:');
    console.log('  1. Go to: https://friendbot.stellar.org');
    console.log('  2. Enter the public key for each unfunded account');
    console.log('  3. Receive 10,000 testnet XLM per account');
  }
  
  console.log('\n');
}

main().catch(console.error);
