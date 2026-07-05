/**
 * Demo Data Seed Script
 * Sets up clean accounts, campaigns, wallets, and subscriptions for video recording.
 *
 * Run: ts-node src/scripts/seed-demo.ts
 *
 * Accounts created:
 *   Brand      demo.brand@socialgems.me   / Demo@brand123
 *   Creator    demo.creator@socialgems.me / Demo@creator123   (free tier)
 *   Pro        demo.pro@socialgems.me     / Demo@pro123       (pro tier)
 */

import 'dotenv/config';
import * as mysql from 'mysql2/promise';
import * as crypto from 'crypto';

const pool = mysql.createPool({
  connectionLimit: 5,
  host: process.env.DB_HOST || 'maglev.proxy.rlwy.net',
  port: parseInt(process.env.DB_PORT || '26523'),
  user: process.env.USER_NAME || 'root',
  password: process.env.PASSWORD || 'hLmZUoJdSshZuEbUvhITGppJrNTVbhEo',
  database: process.env.DBNAME || 'socialgems_test',
  ssl: { rejectUnauthorized: false },
  connectTimeout: 60000,
});

function uid(prefix = ''): string {
  return prefix + crypto.randomBytes(12).toString('hex');
}

function sha256(str: string): string {
  return crypto.createHash('sha256').update(str).digest('hex');
}

async function q(sql: string, params: any[] = []): Promise<any[]> {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.execute(sql, params);
    return rows as any[];
  } finally {
    conn.release();
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────────

async function upsertUser(email: string, password: string, userType: 'brand' | 'influencer') {
  const existing = await q(`SELECT user_id FROM users WHERE email = ? LIMIT 1`, [email]);
  if (existing.length) {
    const id = existing[0].user_id;
    await q(`UPDATE users SET password = ? WHERE user_id = ?`, [sha256(password), id]);
    console.log(`  ↩  Reused ${email} → ${id}`);
    return id;
  }
  const id = userType === 'brand' ? uid('b') : uid('u');
  await q(
    `INSERT INTO users (user_id, business_id, user_type, email, password, status, email_verified)
     VALUES (?, ?, ?, ?, ?, 'active', 'yes')`,
    [id, id, userType, email, sha256(password)]
  );
  return id;
}

async function upsertProfile(userId: string, first: string, last: string, username: string) {
  const existing = await q(`SELECT user_id FROM users_profile WHERE user_id = ? LIMIT 1`, [userId]);
  if (existing.length) {
    await q(
      `UPDATE users_profile SET first_name = ?, last_name = ?, username = ? WHERE user_id = ?`,
      [first, last, username, userId]
    );
    return;
  }
  await q(
    `INSERT INTO users_profile (user_id, username, first_name, last_name, iso_code, phone, email_verified)
     VALUES (?, ?, ?, ?, 'KE', '+254700000000', 'yes')`,
    [userId, username, first, last]
  );
}

async function upsertBusiness(businessId: string, name: string, email: string) {
  const staffId = uid('stf');
  const existing = await q(`SELECT business_id FROM business_profile WHERE business_id = ? LIMIT 1`, [businessId]);
  if (existing.length) return;
  await q(
    `INSERT INTO business_profile (business_id, name, owner_id, phone, email, is_registered, country, verification_status, created_by_type)
     VALUES (?, ?, ?, '+254700000000', ?, 'yes', 'KE', 'verified', 'brand')`,
    [businessId, name, staffId, email]
  );
  await q(
    `INSERT INTO business_staff (staff_id, business_id, first_name, last_name, email, role, added_by, password, status, verification_status)
     VALUES (?, ?, 'Demo', 'Brand', ?, 'owner', ?, ?, 'active', 'verified')`,
    [staffId, businessId, email, staffId, sha256('Demo@brand123')]
  );
}

async function upsertWallet(userId: string, asset: 'KES' | 'USD', balance: number) {
  const existing = await q(
    `SELECT wallet_id FROM user_wallets WHERE user_id = ? AND asset = ? LIMIT 1`,
    [userId, asset]
  );
  if (existing.length) {
    await q(
      `UPDATE user_wallets SET balance = ?, balance_available = ?, total_earned = ? WHERE user_id = ? AND asset = ?`,
      [balance, balance, balance, userId, asset]
    );
    return existing[0].wallet_id;
  }
  const walletId = uid('wl');
  await q(
    `INSERT INTO user_wallets (wallet_id, user_id, asset, balance, balance_available, total_earned, status)
     VALUES (?, ?, ?, ?, ?, ?, 'active')`,
    [walletId, userId, asset, balance, balance, balance]
  );
  return walletId;
}

async function setTier(userId: string, tier: 'free' | 'plus' | 'pro') {
  const badge = tier === 'free' ? 'none' : tier;
  await q(`UPDATE users SET subscription_tier = ? WHERE user_id = ?`, [tier, userId]);
  await q(`UPDATE users_profile SET subscription_badge = ? WHERE user_id = ?`, [badge, userId]);

  if (tier !== 'free') {
    const subTag = tier === 'pro' ? 'CREATOR_PRO' : 'CREATOR_PLUS';
    const subRow = await q(`SELECT id FROM subscriptions WHERE sub_tag = ? LIMIT 1`, [subTag]);
    if (subRow.length) {
      // Upsert active subscription record
      const existingSub = await q(
        `SELECT id FROM user_subscriptions WHERE user_id = ? AND subscription_id = ? AND status = 'active' LIMIT 1`,
        [userId, subRow[0].id]
      );
      if (!existingSub.length) {
        await q(
          `INSERT INTO user_subscriptions (user_id, subscription_id, status, started_at, next_billing_at)
           VALUES (?, ?, 'active', NOW(), DATE_ADD(NOW(), INTERVAL 1 MONTH))`,
          [userId, subRow[0].id]
        );
      }
    }
  }
}

async function upsertCampaign(opts: {
  brandId: string;
  title: string;
  description: string;
  budget: number;
  status: string;
  accessTier: 'free' | 'plus' | 'pro';
  earningType: 'fixed' | 'affiliate';
  affiliateLink?: string;
  fundingStatus?: string;
}): Promise<string> {
  const existing = await q(
    `SELECT campaign_id FROM act_campaigns WHERE title = ? AND created_by = ? LIMIT 1`,
    [opts.title, opts.brandId]
  );
  if (existing.length) {
    const id = existing[0].campaign_id;
    console.log(`  ↩  Reused campaign "${opts.title}" → ${id}`);
    return id;
  }

  const campaignId = uid('cp');
  const start = new Date();
  start.setDate(start.getDate() + 4);
  const end = new Date(start);
  end.setDate(end.getDate() + 30);

  await q(
    `INSERT INTO act_campaigns
       (campaign_id, created_by, created_by_user_id, title, description, objective,
        budget, number_of_influencers, start_date, end_date, status, access_tier,
        earning_type, affiliate_link, funding_status, image_urls, created_on)
     VALUES (?, ?, ?, ?, ?, 'Brand Awareness', ?, 10, ?, ?, ?, ?, ?, ?, ?, 'https://images.unsplash.com/photo-1563986768609-322da13575f3?w=800', NOW())`,
    [
      campaignId,
      opts.brandId,
      opts.brandId,
      opts.title,
      opts.description,
      opts.budget,
      start.toISOString().slice(0, 10),
      end.toISOString().slice(0, 10),
      opts.status,
      opts.accessTier,
      opts.earningType,
      opts.affiliateLink || null,
      opts.fundingStatus || 'unfunded',
    ]
  );

  console.log(`  ✅ Campaign "${opts.title}" → ${campaignId}`);
  return campaignId;
}

async function inviteCreator(campaignId: string, creatorId: string, applicationStatus: string) {
  const existing = await q(
    `SELECT id FROM act_campaign_invites WHERE campaign_id = ? AND user_id = ? LIMIT 1`,
    [campaignId, creatorId]
  );
  if (existing.length) return;
  await q(
    `INSERT INTO act_campaign_invites
       (campaign_id, user_id, invite_status, application_status, payable_amount, invited_on)
     VALUES (?, ?, 'accepted', ?, 1500, NOW())`,
    [campaignId, creatorId, applicationStatus]
  );
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║     SocialGems Demo Seed Script          ║');
  console.log('╚══════════════════════════════════════════╝\n');

  // ── 1. Brand account ──────────────────────────────────────────────────────
  console.log('► Creating Demo Brand…');
  const brandId = await upsertUser('demo.brand@socialgems.me', 'Demo@brand123', 'brand');
  await upsertProfile(brandId, 'Demo', 'Brand', 'demobrand_sg');
  await upsertBusiness(brandId, 'SocialGems Demo Co.', 'demo.brand@socialgems.me');
  await upsertWallet(brandId, 'KES', 50000);
  await upsertWallet(brandId, 'USD', 500);
  console.log(`  ✅ Brand → ${brandId}\n`);

  // ── 2. Free creator ───────────────────────────────────────────────────────
  console.log('► Creating Demo Creator (free tier)…');
  const freeId = await upsertUser('demo.creator@socialgems.me', 'Demo@creator123', 'influencer');
  await upsertProfile(freeId, 'Demo', 'Creator', 'democreator_sg');
  await setTier(freeId, 'free');
  await upsertWallet(freeId, 'KES', 0);
  console.log(`  ✅ Free creator → ${freeId}\n`);

  // ── 3. Pro creator ────────────────────────────────────────────────────────
  console.log('► Creating Demo Pro Creator (pro tier)…');
  const proId = await upsertUser('demo.pro@socialgems.me', 'Demo@pro123', 'influencer');
  await upsertProfile(proId, 'Demo', 'ProCreator', 'demopro_sg');
  await setTier(proId, 'pro');
  await upsertWallet(proId, 'KES', 8500);
  console.log(`  ✅ Pro creator → ${proId}\n`);

  // ── 4. Campaigns ──────────────────────────────────────────────────────────
  console.log('► Creating demo campaigns…');

  // Open campaign — free tier, open_to_applications, funded (ready to activate)
  const openCampaignId = await upsertCampaign({
    brandId,
    title: '[DEMO] Open Campaign — Grow With Us',
    description: 'Create a 60-second product review video and post it on your social channels. Perfect for creators of all levels.',
    budget: 15000,
    status: 'open_to_applications',
    accessTier: 'free',
    earningType: 'fixed',
    fundingStatus: 'funded',
  });

  // Plus-gated campaign
  const plusCampaignId = await upsertCampaign({
    brandId,
    title: '[DEMO] Plus Campaign — Premium Collab',
    description: 'Exclusive brand partnership for Creator Plus and above. Higher payout, priority placement in our marketing.',
    budget: 30000,
    status: 'open_to_applications',
    accessTier: 'plus',
    earningType: 'fixed',
    fundingStatus: 'funded',
  });

  // Pro-gated active campaign with the pro creator already approved
  const proCampaignId = await upsertCampaign({
    brandId,
    title: '[DEMO] Pro Campaign — Top Tier Activation',
    description: 'Creator Pro exclusive. Campaign is live. Your deliverable is due in 7 days.',
    budget: 50000,
    status: 'active',
    accessTier: 'pro',
    earningType: 'fixed',
    fundingStatus: 'funded',
  });
  await inviteCreator(proCampaignId, proId, 'approved');

  // Affiliate campaign
  const affiliateCampaignId = await upsertCampaign({
    brandId,
    title: '[DEMO] Affiliate — Summer Collection',
    description: 'Earn 20% commission on every sale you drive. Share your unique link and track conversions in real time.',
    budget: 20000,
    status: 'open_to_applications',
    accessTier: 'free',
    earningType: 'affiliate',
    affiliateLink: 'https://shop.socialgems.me/summer?ref=DEMO',
    fundingStatus: 'funded',
  });

  // Draft campaign (brand will publish this live on camera)
  const draftCampaignId = await upsertCampaign({
    brandId,
    title: '[DEMO] Draft — Ready to Publish',
    description: 'A campaign sitting in draft state. We will publish and fund this live during the demo.',
    budget: 10000,
    status: 'draft',
    accessTier: 'free',
    earningType: 'fixed',
    fundingStatus: 'unfunded',
  });

  // ── 5. Pre-populate the free creator's invite list for the open campaign
  await inviteCreator(openCampaignId, freeId, 'pending');
  // Also invite the free creator to the affiliate campaign
  await inviteCreator(affiliateCampaignId, freeId, 'pending');

  // ── 6. Summary ────────────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║         DEMO SEED COMPLETE               ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('\n📋 Login Credentials:\n');
  console.log('  BRAND');
  console.log('  Email   : demo.brand@socialgems.me');
  console.log('  Password: Demo@brand123');
  console.log('  Wallet  : KES 50,000 | USD 500\n');
  console.log('  FREE CREATOR');
  console.log('  Email   : demo.creator@socialgems.me');
  console.log('  Password: Demo@creator123');
  console.log('  Tier    : free | Wallet KES 0\n');
  console.log('  PRO CREATOR');
  console.log('  Email   : demo.pro@socialgems.me');
  console.log('  Password: Demo@pro123');
  console.log('  Tier    : pro | Wallet KES 8,500\n');
  console.log('📋 Campaign IDs:');
  console.log(`  Open (free)      : ${openCampaignId}`);
  console.log(`  Plus-gated       : ${plusCampaignId}`);
  console.log(`  Pro active       : ${proCampaignId}`);
  console.log(`  Affiliate        : ${affiliateCampaignId}`);
  console.log(`  Draft            : ${draftCampaignId}`);
}

main()
  .then(() => pool.end())
  .catch((e) => { console.error('\n❌ Seed failed:', e); process.exit(1); });
