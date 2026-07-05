import * as mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const pool = mysql.createPool({
  connectionLimit: 5,
  host: process.env.HOST_NAME || 'sg-backend-0cs6.onrender.com',
  database: process.env.DBNAME || 'socialgems_test',
  user: process.env.USER_NAME || 'root',
  password: process.env.PASSWORD || 'hLmZUoJdSshZuEbUvhITGppJrNTVbhEo',
});

function getRandomString(): string {
  return Math.random().toString(36).substring(2, 18) + Date.now().toString(36);
}

function hashPassword(password: string): string {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(password).digest('hex');
}

const brands = [
  { email: "fashionhub@brand.com", name: "FashionHub Kenya", description: "Leading fashion and lifestyle brand in East Africa" },
  { email: "techgear@brand.com", name: "TechGear Africa", description: "Premier tech gadgets and accessories retailer" },
  { email: "healthylife@brand.com", name: "HealthyLife Organics", description: "Organic health products and wellness supplements" },
  { email: "beautybliss@brand.com", name: "BeautyBliss Cosmetics", description: "Premium skincare and cosmetics in Kenya" },
  { email: "fitlife@brand.com", name: "FitLife Gym", description: "Fitness center and sports nutrition brand" },
];

const influencers = [
  { first_name: "Amina", last_name: "Ochieng", username: "amina_style", platforms: ["instagram", "tiktok"], followers: { instagram: 45000, tiktok: 82000 } },
  { first_name: "Brian", last_name: "Muthama", username: "brian_tech", platforms: ["instagram", "twitter", "tiktok"], followers: { instagram: 28000, twitter: 15000, tiktok: 65000 } },
  { first_name: "Clara", last_name: "Wambui", username: "clara_wellness", platforms: ["instagram", "tiktok", "youtube"], followers: { instagram: 120000, tiktok: 95000, youtube: 45000 } },
  { first_name: "David", last_name: "Kiprop", username: "david_fitness", platforms: ["instagram", "tiktok"], followers: { instagram: 35000, tiktok: 72000 } },
  { first_name: "Fatuma", last_name: "Hassan", username: "fatuma_beauty", platforms: ["instagram", "tiktok", "facebook"], followers: { instagram: 89000, tiktok: 55000, facebook: 22000 } },
  { first_name: "George", last_name: "Omondi", username: "george_travels", platforms: ["instagram", "youtube", "tiktok"], followers: { instagram: 67000, youtube: 38000, tiktok: 41000 } },
  { first_name: "Hawa", last_name: "Kariuki", username: "hawa_foodie", platforms: ["instagram", "tiktok"], followers: { instagram: 52000, tiktok: 98000 } },
  { first_name: "Ivan", last_name: "Maina", username: "ivan_gaming", platforms: ["twitter", "tiktok", "youtube"], followers: { twitter: 18000, tiktok: 125000, youtube: 28000 } },
  { first_name: "Janet", last_name: "Akinyi", username: "janet_mom", platforms: ["instagram", "tiktok", "facebook"], followers: { instagram: 150000, tiktok: 78000, facebook: 35000 } },
  { first_name: "Kevin", last_name: "Otieno", username: "kevin_music", platforms: ["instagram", "twitter", "tiktok", "youtube"], followers: { instagram: 92000, twitter: 45000, tiktok: 110000, youtube: 68000 } },
];

const jobs = [
  { title: "Summer Collection Launch Campaign", description: "Create 3 Instagram posts and 2 TikTok videos showcasing our new summer fashion line. Must include product tags and use our brand hashtag.", comp_amount: 15000, comp_currency: "KES", niche: "Fashion", deadline_days: 14 },
  { title: "Tech Review Video", description: "Produce a 3-minute review video of our new wireless earbuds. Must be posted on YouTube and TikTok with proper product demonstration.", comp_amount: 25000, comp_currency: "KES", niche: "Technology", deadline_days: 21 },
  { title: "Organic Product Unboxing", description: "Create an engaging unboxing video of our wellness package. Include storytime about your wellness journey and how our products fit into your routine.", comp_amount: 18000, comp_currency: "KES", niche: "Health", deadline_days: 10 },
  { title: "Makeup Tutorial Feature", description: "Create a step-by-step makeup tutorial using our new eyeshadow palette. Tag our brand and use provided discount code in caption.", comp_amount: 12000, comp_currency: "KES", niche: "Beauty", deadline_days: 7 },
  { title: "Fitness Transformation Challenge", description: "Document a 30-day fitness journey using our supplements. Post weekly updates on Instagram and TikTok with progress photos.", comp_amount: 30000, comp_currency: "KES", niche: "Fitness", deadline_days: 35 },
];

const campaigns = [
  { title: "Back to School Promo", description: "Promote our school supplies and backpacks for the new academic year", budget: 5000, objective: "Generate sales and brand awareness", start_date: "2026-05-01", end_date: "2026-06-30", number_of_influencers: 10 },
  { title: "Ramadan Sale Campaign", description: "Showcase our exclusive Ramadan collection and special discounts", budget: 8000, objective: "Drive traffic to e-commerce store", start_date: "2026-03-01", end_date: "2026-04-20", number_of_influencers: 15 },
  { title: "New Product Launch - Smart Watch", description: "Create buzz around our latest smart watch release with unboxing and feature highlights", budget: 10000, objective: "Product launch awareness", start_date: "2026-04-15", end_date: "2026-05-15", number_of_influencers: 20 },
];

const platformMap: { [key: string]: number } = {
  instagram: 4,
  tiktok: 2,
  twitter: 1,
  facebook: 3,
  youtube: 6,
};

async function insertQuery(query: string, values: any[] = []) {
  const conn = await pool.getConnection();
  try {
    const [result] = await conn.execute(query, values);
    return result;
  } finally {
    conn.release();
  }
}

async function createBrand(brand: any, index: number) {
  try {
    const userId = "b" + getRandomString().substring(0, 16);
    const staffId = "stf" + getRandomString().substring(0, 20);
    const password = "TempPass" + (index + 1) + "!";
    const hashedPassword = hashPassword(password);

    console.log(`\n=== Creating Brand: ${brand.name} ===`);
    console.log(`User ID: ${userId}`);
    console.log(`Password: ${password}`);

    await insertQuery(
      `INSERT INTO users (user_id, business_id, user_type, email, password, status, email_verified) VALUES (?, ?, 'brand', ?, ?, 'active', 'yes')`,
      [userId, userId, brand.email, hashedPassword]
    );

    await insertQuery(
      `INSERT INTO business_profile (business_id, name, description, owner_id, phone, email, is_registered, country, verification_status, created_by_type) VALUES (?, ?, ?, ?, '+254700000000', ?, 'yes', 'KE', 'verified', 'brand')`,
      [userId, brand.name, brand.description, staffId, brand.email]
    );

    await insertQuery(
      `INSERT INTO business_staff (staff_id, business_id, first_name, last_name, email, role, added_by, password, status, verification_status) VALUES (?, ?, ?, ?, ?, 'owner', ?, ?, 'active', 'verified')`,
      [staffId, userId, brand.name.split(" ")[0], "Admin", brand.email, staffId, hashedPassword]
    );

    const username = brand.name.toLowerCase().replace(/[^a-z0-9]/g, "") + "_brand";
    await insertQuery(
      `INSERT INTO users_profile (user_id, username, first_name, last_name, iso_code, phone, email_verified) VALUES (?, ?, ?, ?, 'KE', '+254700000000', 'yes')`,
      [userId, username, brand.name.split(" ")[0], brand.name.split(" ").slice(1).join(" ") || "Brand"]
    );

    console.log(`✅ Brand created: ${brand.name} (${brand.email} / ${password})`);
    return userId;
  } catch (error: any) {
    console.error(`❌ Error creating brand ${brand.name}:`, error.message);
    return null;
  }
}

async function createInfluencer(influencer: any, index: number) {
  try {
    const userId = "u" + getRandomString().substring(0, 16);
    const password = "TempPass" + (index + 1) + "!";
    const hashedPassword = hashPassword(password);
    const username = influencer.username;

    console.log(`\n=== Creating Influencer: ${influencer.first_name} ${influencer.last_name} ===`);
    console.log(`User ID: ${userId}`);
    console.log(`Username: ${username}`);
    console.log(`Password: ${password}`);

    await insertQuery(
      `INSERT INTO users (user_id, user_type, email, password, status, email_verified, level_id) VALUES (?, 'influencer', ?, ?, 'active', 'yes', 3)`,
      [userId, `${username}@influencer.com`, hashedPassword]
    );

    await insertQuery(
      `INSERT INTO users_profile (user_id, username, first_name, last_name, iso_code, phone, influencer_rating, platforms_most_content, email_verified) VALUES (?, ?, ?, ?, 'KE', ?, ?, ?, 'yes')`,
      [userId, username, influencer.first_name, influencer.last_name, `+254700${String(index + 1).padStart(7, '0')}`, Math.floor(Math.random() * 3) + 3, JSON.stringify(influencer.platforms)]
    );

    for (const platform of influencer.platforms) {
      const siteId = platformMap[platform];
      if (siteId) {
        const smUsername = `${username}_${platform}`;
        const followers = influencer.followers[platform] || 1000;
        
        await insertQuery(
          `INSERT INTO sm_site_users (site_id, user_id, username, is_verified, followers, link, last_synced_at) VALUES (?, ?, ?, 'yes', ?, ?, NOW())`,
          [siteId, userId, smUsername, followers, `https://${platform}.com/${smUsername}`]
        );
      }
    }

    await insertQuery(
      `INSERT INTO user_industries (user_id, industry_id) VALUES (?, 1)`,
      [userId]
    );

    console.log(`✅ Influencer created: ${username} (${password})`);
    return userId;
  } catch (error: any) {
    console.error(`❌ Error creating influencer ${influencer.username}:`, error.message);
    return null;
  }
}

async function createJob(brandId: string, job: any, index: number) {
  try {
    const jobId = "job" + getRandomString().substring(0, 14);
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + job.deadline_days);

    console.log(`\n=== Creating Job: ${job.title} ===`);
    console.log(`Job ID: ${jobId}`);

    await insertQuery(
      `INSERT INTO jb_job_posts (job_id, brand_id, title, description, comp_amount, comp_currency, comp_type, min_followers, niche, deadline, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'cash', 5000, ?, ?, 'active', NOW())`,
      [jobId, brandId, job.title, job.description, job.comp_amount, job.comp_currency, job.niche, deadline.toISOString().slice(0, 19).replace('T', ' ')]
    );

    console.log(`✅ Job created: ${job.title}`);
    return jobId;
  } catch (error: any) {
    console.error(`❌ Error creating job ${job.title}:`, error.message);
    return null;
  }
}

async function createCampaign(brandId: string, campaign: any, index: number) {
  try {
    const campaignId = "camp" + getRandomString().substring(0, 14);

    console.log(`\n=== Creating Campaign: ${campaign.title} ===`);
    console.log(`Campaign ID: ${campaignId}`);

    await insertQuery(
      `INSERT INTO act_campaigns (campaign_id, created_by, title, description, objective, budget, number_of_influencers, start_date, end_date, status, created_on) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', NOW())`,
      [campaignId, brandId, campaign.title, campaign.description, campaign.objective, campaign.budget, campaign.number_of_influencers, campaign.start_date, campaign.end_date]
    );

    console.log(`✅ Campaign created: ${campaign.title}`);
    return campaignId;
  } catch (error: any) {
    console.error(`❌ Error creating campaign ${campaign.title}:`, error.message);
    return null;
  }
}

async function seedData() {
  console.log("===========================================");
  console.log("     SEEDING DUMMY DATA FOR SOCIALGEMS     ");
  console.log("===========================================");

  const createdBrands: { id: string; name: string }[] = [];
  const createdInfluencers: { id: string; username: string }[] = [];

  console.log("\n\n### CREATING BRANDS ###");
  for (let i = 0; i < brands.length; i++) {
    const brand = brands[i];
    const brandId = await createBrand(brand, i);
    if (brandId) {
      createdBrands.push({ id: brandId, name: brand.name });
    }
  }

  console.log("\n\n### CREATING INFLUENCERS ###");
  for (let i = 0; i < influencers.length; i++) {
    const influencer = influencers[i];
    const influencerId = await createInfluencer(influencer, i);
    if (influencerId) {
      createdInfluencers.push({ id: influencerId, username: influencer.username });
    }
  }

  console.log("\n\n### CREATING JOBS ###");
  for (let i = 0; i < createdBrands.length; i++) {
    const brand = createdBrands[i];
    const jobIndex = i % jobs.length;
    const job = jobs[jobIndex];
    await createJob(brand.id, job, i);
  }

  console.log("\n\n### CREATING CAMPAIGNS ###");
  for (let i = 0; i < createdBrands.length; i++) {
    const brand = createdBrands[i];
    const campaignIndex = i % campaigns.length;
    const campaign = campaigns[campaignIndex];
    await createCampaign(brand.id, campaign, i);
  }

  console.log("\n\n===========================================");
  console.log("           SEEDING COMPLETED            ");
  console.log("===========================================");

  console.log("\n### BRANDS (Login with email/password) ###");
  brands.forEach((b, i) => {
    console.log(`- ${b.name}: ${b.email} / TempPass${i + 1}!`);
  });

  console.log("\n### INFLUENCERS (Login with username/password) ###");
  influencers.forEach((inf, i) => {
    console.log(`- @${inf.username}: ${inf.username}@influencer.com / TempPass${i + 1}!`);
  });

  await pool.end();
}

seedData()
  .then(() => {
    console.log("\n✅ Script completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Script failed:", error);
    process.exit(1);
  });