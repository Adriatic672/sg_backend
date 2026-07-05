import 'dotenv/config';
import * as mysql from 'mysql2/promise';

const pool = mysql.createPool({
  connectionLimit: 5,
  host: process.env.HOST_NAME || process.env.DB_HOST || 'sg-backend-0cs6.onrender.com',
  port: parseInt(process.env.DB_PORT || process.env.PORT || '26523'),
  user: process.env.USER_NAME || process.env.DB_USER || 'root',
  password: process.env.PASSWORD || process.env.DB_PASSWORD || 'hLmZUoJdSshZuEbUvhITGppJrNTVbhEo',
  database: process.env.DBNAME || process.env.DB_NAME || 'socialgems_test',
  // SSL required for Railway/Render hosted MySQL
  ssl: {
    rejectUnauthorized: false // For self-signed certificates
  },
  connectTimeout: 60000,
});

function getRandomString(): string {
  return Math.random().toString(36).substring(2, 18) + Date.now().toString(36);
}

function hashPassword(password: string): string {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(password).digest('hex');
}

async function insertQuery(query: string, values: any[] = []) {
  const conn = await pool.getConnection();
  try {
    const [result] = await conn.execute(query, values);
    return result;
  } finally {
    conn.release();
  }
}

async function getOrCreateAffiliateBrand() {
  const brandEmail = "business@example1.com";
  const brandName = "Business Affiliate 1";
  const brandDescription = "Affiliate partner for testing and demonstration purposes";

  // Check if brand already exists
  try {
    const existingUsers: any = await insertQuery(
      `SELECT user_id, business_id FROM users WHERE email = ? AND user_type = 'brand'`,
      [brandEmail]
    );

    if (existingUsers.length > 0) {
      console.log(`✅ Affiliate brand already exists with email: ${brandEmail}`);
      console.log(`   User ID: ${existingUsers[0].user_id}`);
      console.log(`   Business ID: ${existingUsers[0].business_id}`);
      // Update password to the requested one
      const hashedPassword = hashPassword("password@123");
      await insertQuery(
        `UPDATE users SET password = ? WHERE user_id = ?`,
        [hashedPassword, existingUsers[0].user_id]
      );
      console.log(`   Password updated to: password@123`);
      return existingUsers[0].business_id;
    }
  } catch (error: any) {
    console.error(`Error checking existing brand, will attempt to create:`, error.message);
  }

  // Create new brand
  const userId = "b" + getRandomString().substring(0, 16);
  const staffId = "stf" + getRandomString().substring(0, 20);
  const password = "password@123";
  const hashedPassword = hashPassword(password);

  console.log(`\n=== Creating Affiliate Brand ===`);
  console.log(`Brand Name: ${brandName}`);
  console.log(`Email: ${brandEmail}`);
  console.log(`Password: ${password}`);
  console.log(`User ID: ${userId}`);
  console.log(`Staff ID: ${staffId}`);

  await insertQuery(
    `INSERT INTO users (user_id, business_id, user_type, email, password, status, email_verified) VALUES (?, ?, 'brand', ?, ?, 'active', 'yes')`,
    [userId, userId, brandEmail, hashedPassword]
  );

  await insertQuery(
    `INSERT INTO business_profile (business_id, name, description, owner_id, phone, email, is_registered, country, verification_status, created_by_type) VALUES (?, ?, ?, ?, '+254700000000', ?, 'yes', 'KE', 'pending', 'brand')`,
    [userId, brandName, brandDescription, staffId, brandEmail]
  );

  await insertQuery(
    `INSERT INTO business_staff (staff_id, business_id, first_name, last_name, email, role, added_by, password, status, verification_status) VALUES (?, ?, ?, ?, ?, 'admin', ?, ?, 'active', 'verified')`,
    [staffId, userId, "Business", "Admin", brandEmail, staffId, hashedPassword]
  );

  const username = brandName.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/\s+/g, "") + "_brand";
  await insertQuery(
    `INSERT INTO users_profile (user_id, username, first_name, last_name, iso_code, phone, email_verified) VALUES (?, ?, ?, ?, 'KE', '+254700000000', 'yes')`,
    [userId, username, "Business", "Admin"]
  );

  console.log(`✅ Affiliate brand created: ${brandName} (${brandEmail} / ${password})`);
  return userId;
}

async function createAffiliateCampaign(brandId: string, campaign: any, index: number) {
  try {
    const campaignId = "camp" + getRandomString().substring(0, 14);

    // Check if campaign with same title already exists for this brand
    const existing: any = await insertQuery(
      `SELECT campaign_id FROM act_campaigns WHERE title = ? AND created_by = ?`,
      [campaign.title, brandId]
    );

    if (existing.length > 0) {
      console.log(`⏭️  Campaign already exists: ${campaign.title} (${existing[0].campaign_id})`);
      return existing[0].campaign_id;
    }

    console.log(`\n=== Creating Affiliate Campaign: ${campaign.title} ===`);
    console.log(`Campaign ID: ${campaignId}`);

    // Include image_urls (required column)
    const placeholderImage = 'https://social-gems.s3.amazonaws.com/gems/placeholder.png';

    await insertQuery(
      `INSERT INTO act_campaigns (campaign_id, created_by, title, description, objective, budget, number_of_influencers, start_date, end_date, status, created_on, earning_type, affiliate_link, image_urls) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NOW(), 'affiliate', ?, ?)`,
      [campaignId, brandId, campaign.title, campaign.description, campaign.objective, campaign.budget, campaign.number_of_influencers, campaign.start_date, campaign.end_date, campaign.affiliate_link, placeholderImage]
    );

    console.log(`✅ Affiliate campaign created: ${campaign.title}`);
    return campaignId;
  } catch (error: any) {
    console.error(`❌ Error creating affiliate campaign ${campaign.title}:`, error.message);
    return null;
  }
}

const affiliateCampaigns = [
  {
    title: "Affiliate - Tech Product Launch",
    description: "Promote the latest tech gadgets and earn commission on every sale. This is an exclusive affiliate campaign offering 15% commission on all referred sales. Use your unique affiliate link to track conversions and earn passive income.",
    objective: "Drive sales through affiliate referrals",
    budget: 10000,
    start_date: "2026-05-01",
    end_date: "2026-07-31",
    number_of_influencers: 50,
    affiliate_link: "https://business.example.com/affiliate/tech-launch?ref=socialgems"
  },
  {
    title: "Affiliate - Fashion Collection",
    description: "Partner with us to showcase our new summer fashion line. Earn 20% commission on all sales generated through your affiliate code. This campaign is perfect for fashion influencers and content creators looking to monetize their audience.",
    objective: "Generate affiliate sales and brand awareness",
    budget: 8000,
    start_date: "2026-05-15",
    end_date: "2026-08-15",
    number_of_influencers: 30,
    affiliate_link: "https://business.example.com/affiliate/fashion-collection?ref=socialgems"
  },
  {
    title: "Affiliate - Wellness Products",
    description: "Promote our organic wellness supplements and health products. Earn recurring commissions on subscription-based products. High converting offers with competitive commission rates. Perfect for health and wellness influencers.",
    objective: "Build long-term affiliate partnerships",
    budget: 12000,
    start_date: "2026-06-01",
    end_date: "2026-09-30",
    number_of_influencers: 40,
    affiliate_link: "https://business.example.com/affiliate/wellness?ref=socialgems"
  }
];

async function seedAffiliateData() {
  console.log("===========================================");
  console.log("   SEEDING AFFILIATE DUMMY DATA FOR       ");
  console.log("   business@example1.com / password@123    ");
  console.log("===========================================");

  const brandId = await getOrCreateAffiliateBrand();

  if (!brandId) {
    console.error("❌ Failed to get or create affiliate brand. Exiting.");
    process.exit(1);
  }

  console.log("\n\n### CREATING AFFILIATE CAMPAIGNS ###");
  for (let i = 0; i < affiliateCampaigns.length; i++) {
    const campaign = affiliateCampaigns[i];
    await createAffiliateCampaign(brandId, campaign, i);
  }

  console.log("\n\n===========================================");
  console.log("       AFFILIATE SEEDING COMPLETED         ");
  console.log("===========================================");

  console.log("\n📌 Login credentials:");
  console.log(`   Email: business@example1.com`);
  console.log(`   Password: password@123`);

  await pool.end();
}

seedAffiliateData()
  .then(() => {
    console.log("\n✅ Affiliate script completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Script failed:", error);
    process.exit(1);
  });
