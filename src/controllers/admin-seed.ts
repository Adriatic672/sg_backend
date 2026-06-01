import express, { Request, Response } from 'express';
import Model from "../helpers/model";

const router = express.Router();
const model = new Model();

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
  { title: "Summer Collection Launch Campaign", description: "Create 3 Instagram posts and 2 TikTok videos showcasing our new summer fashion line.", comp_amount: 15000, comp_currency: "KES", niche: "Fashion", deadline_days: 14 },
  { title: "Tech Review Video", description: "Produce a 3-minute review video of our new wireless earbuds.", comp_amount: 25000, comp_currency: "KES", niche: "Technology", deadline_days: 21 },
  { title: "Organic Product Unboxing", description: "Create an engaging unboxing video of our wellness package.", comp_amount: 18000, comp_currency: "KES", niche: "Health", deadline_days: 10 },
  { title: "Makeup Tutorial Feature", description: "Create a step-by-step makeup tutorial using our new eyeshadow palette.", comp_amount: 12000, comp_currency: "KES", niche: "Beauty", deadline_days: 7 },
  { title: "Fitness Transformation Challenge", description: "Document a 30-day fitness journey using our supplements.", comp_amount: 30000, comp_currency: "KES", niche: "Fitness", deadline_days: 35 },
];

const campaigns = [
  { title: "Back to School Promo", description: "Promote our school supplies for the new academic year", budget: 5000, objective: "Generate sales and brand awareness", start_date: "2026-05-01", end_date: "2026-06-30", number_of_influencers: 10 },
  { title: "Ramadan Sale Campaign", description: "Showcase our exclusive Ramadan collection and special discounts", budget: 8000, objective: "Drive traffic to e-commerce store", start_date: "2026-03-01", end_date: "2026-04-20", number_of_influencers: 15 },
  { title: "New Product Launch - Smart Watch", description: "Create buzz around our latest smart watch release", budget: 10000, objective: "Product launch awareness", start_date: "2026-04-15", end_date: "2026-05-15", number_of_influencers: 20 },
];

const platformMap: { [key: string]: number } = {
  instagram: 4, tiktok: 2, twitter: 1, facebook: 3, youtube: 6
};

router.post('/seed-dummy-data', async (req: Request, res: Response) => {
  try {
    console.log("=== STARTING SEED DATA ===");
    const createdBrands: { id: string; name: string }[] = [];
    const createdInfluencers: { id: string; username: string }[] = [];

    // Create Brands
    for (let i = 0; i < brands.length; i++) {
      const brand = brands[i];
      const userId = "b" + getRandomString().substring(0, 16);
      const staffId = "stf" + getRandomString().substring(0, 20);
      const password = "TempPass" + (i + 1) + "!";
      const hashedPassword = hashPassword(password);

      await model.insertData("users", {
        user_id: userId, business_id: userId, user_type: "brand",
        email: brand.email, password: hashedPassword, status: "active", email_verified: "yes"
      });

      await model.insertData("business_profile", {
        business_id: userId, name: brand.name, description: brand.description,
        owner_id: staffId, phone: "+254700000000", email: brand.email,
        is_registered: "yes", country: "KE", verification_status: "verified", created_by_type: "brand"
      });

      await model.insertData("business_staff", {
        staff_id: staffId, business_id: userId, first_name: brand.name.split(" ")[0],
        last_name: "Admin", email: brand.email, role: "owner", added_by: staffId,
        password: hashedPassword, status: "active", verification_status: "verified"
      });

      const username = brand.name.toLowerCase().replace(/[^a-z0-9]/g, "") + "_brand";
      await model.insertData("users_profile", {
        user_id: userId, username: username, first_name: brand.name.split(" ")[0],
        last_name: brand.name.split(" ").slice(1).join(" ") || "Brand",
        iso_code: "KE", phone: "+254700000000", email_verified: "yes"
      });

      createdBrands.push({ id: userId, name: brand.name });
      console.log(`✅ Brand: ${brand.name} - ${brand.email} / ${password}`);
    }

    // Create Influencers
    for (let i = 0; i < influencers.length; i++) {
      const inf = influencers[i];
      const userId = "u" + getRandomString().substring(0, 16);
      const password = "TempPass" + (i + 1) + "!";
      const hashedPassword = hashPassword(password);
      const username = inf.username;

      await model.insertData("users", {
        user_id: userId, user_type: "influencer", email: `${username}@influencer.com`,
        password: hashedPassword, status: "active", email_verified: "yes", level_id: 3
      });

      await model.insertData("users_profile", {
        user_id: userId, username: username, first_name: inf.first_name, last_name: inf.last_name,
        iso_code: "KE", phone: `+254700${String(i + 1).padStart(7, '0')}`,
        influencer_rating: Math.floor(Math.random() * 3) + 3,
        platforms_most_content: JSON.stringify(inf.platforms), email_verified: "yes"
      });

      for (const platform of inf.platforms) {
        const siteId = platformMap[platform];
        if (siteId) {
          await model.insertData("sm_site_users", {
            site_id: siteId, user_id: userId, username: `${username}_${platform}`,
            is_verified: "yes", followers: inf.followers[platform] || 1000,
            link: `https://${platform}.com/${username}_${platform}`, last_synced_at: new Date()
          });
        }
      }

      await model.insertData("user_industries", { user_id: userId, industry_id: 1 });

      createdInfluencers.push({ id: userId, username });
      console.log(`✅ Influencer: @${username} - ${username}@influencer.com / ${password}`);
    }

    // Create Jobs
    for (let i = 0; i < createdBrands.length; i++) {
      const brand = createdBrands[i];
      const job = jobs[i % jobs.length];
      const jobId = "job" + getRandomString().substring(0, 14);
      const deadline = new Date();
      deadline.setDate(deadline.getDate() + job.deadline_days);

      await model.insertData("jb_job_posts", {
        job_id: jobId, brand_id: brand.id, title: job.title, description: job.description,
        comp_amount: job.comp_amount, comp_currency: job.comp_currency, comp_type: "cash",
        min_followers: 5000, niche: job.niche, deadline: deadline, status: "active"
      });

      console.log(`✅ Job: ${job.title}`);
    }

    // Create Campaigns
    for (let i = 0; i < createdBrands.length; i++) {
      const brand = createdBrands[i];
      const campaign = campaigns[i % campaigns.length];
      const campaignId = "camp" + getRandomString().substring(0, 14);

      await model.insertData("act_campaigns", {
        campaign_id: campaignId, created_by: brand.id, title: campaign.title,
        description: campaign.description, objective: campaign.objective, budget: campaign.budget,
        number_of_influencers: campaign.number_of_influencers,
        start_date: campaign.start_date, end_date: campaign.end_date, status: "draft"
      });

      console.log(`✅ Campaign: ${campaign.title}`);
    }

    console.log("=== SEED DATA COMPLETE ===");
    res.json({ status: 200, message: "Dummy data seeded successfully", brands, influencers });
  } catch (error: any) {
    console.error("Seed error:", error);
    res.status(500).json({ status: 500, message: error.message });
  }
});

export default router;