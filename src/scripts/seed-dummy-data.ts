import Model from "../helpers/model";

const model = new Model();

const brands = [
  { email: "fashionhub@brand.com", name: "FashionHub Kenya", description: "Leading fashion and lifestyle brand in East Africa" },
  { email: "techgear@brand.com", name: "TechGear Africa", description: "Premier tech gadgets and accessories retailer" },
  { email: "healthylife@brand.com", name: "HealthyLife Organics", description: "Organic health products and wellness supplements" },
  { email: "beautybliss@brand.com", name: "BeautyBliss Cosmetics", description: "Premium skincare and cosmetics in Kenya" },
  { email: "fitlife@brand.com", name: "FitLife Gym", description: "Fitness center and sports nutrition brand" },
];

const influencers = [
  { first_name: "Amina", last_name: "Ochieng", username: "amina_style", niche: "Fashion", platforms: ["instagram", "tiktok"], followers: { instagram: 45000, tiktok: 82000 } },
  { first_name: "Brian", last_name: "Muthama", username: "brian_tech", niche: "Technology", platforms: ["instagram", "twitter", "tiktok"], followers: { instagram: 28000, twitter: 15000, tiktok: 65000 } },
  { first_name: "Clara", last_name: "Wambui", username: "clara_wellness", niche: "Health & Wellness", platforms: ["instagram", "tiktok", "youtube"], followers: { instagram: 120000, tiktok: 95000, youtube: 45000 } },
  { first_name: "David", last_name: "Kiprop", username: "david_fitness", niche: "Fitness", platforms: ["instagram", "tiktok"], followers: { instagram: 35000, tiktok: 72000 } },
  { first_name: "Fatuma", last_name: "Hassan", username: "fatuma_beauty", niche: "Beauty", platforms: ["instagram", "tiktok", "facebook"], followers: { instagram: 89000, tiktok: 55000, facebook: 22000 } },
  { first_name: "George", last_name: "Omondi", username: "george_travels", niche: "Travel", platforms: ["instagram", "youtube", "tiktok"], followers: { instagram: 67000, youtube: 38000, tiktok: 41000 } },
  { first_name: "Hawa", last_name: "Kariuki", username: "hawa_foodie", niche: "Food & Dining", platforms: ["instagram", "tiktok"], followers: { instagram: 52000, tiktok: 98000 } },
  { first_name: "Ivan", last_name: "Maina", username: "ivan_gaming", niche: "Gaming", platforms: ["twitter", "tiktok", "youtube"], followers: { twitter: 18000, tiktok: 125000, youtube: 28000 } },
  { first_name: "Janet", last_name: "Akinyi", username: "janet_mom", niche: "Parenting", platforms: ["instagram", "tiktok", "facebook"], followers: { instagram: 150000, tiktok: 78000, facebook: 35000 } },
  { first_name: "Kevin", last_name: "Otieno", username: "kevin_music", niche: "Music", platforms: ["instagram", "twitter", "tiktok", "youtube"], followers: { instagram: 92000, twitter: 45000, tiktok: 110000, youtube: 68000 } },
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

async function createBrand(email: string, brandName: string, description: string) {
  try {
    const userId = "b" + model.getTrimedString(16);
    const staffId = "stf" + model.getTrimedString(20);
    const password = model.generateRandomPassword();
    const hashPassword = model.hashPassword(password);

    console.log(`\n=== Creating Brand: ${brandName} ===`);
    console.log(`User ID: ${userId}`);
    console.log(`Staff ID: ${staffId}`);
    console.log(`Password: ${password}`);

    await model.insertData("users", {
      user_id: userId,
      business_id: userId,
      user_type: "brand",
      email: email,
      password: hashPassword,
      status: "active",
      email_verified: "yes"
    });

    await model.insertData("business_profile", {
      business_id: userId,
      name: brandName,
      description: description,
      owner_id: staffId,
      phone: "+254700000000",
      email: email,
      is_registered: "yes",
      country: "KE",
      verification_status: "verified",
      created_by_type: "brand"
    });

    await model.insertData("business_staff", {
      staff_id: staffId,
      business_id: userId,
      first_name: brandName.split(" ")[0],
      last_name: "Admin",
      email: email,
      role: "owner",
      added_by: staffId,
      password: hashPassword,
      status: "active",
      verification_status: "verified"
    });

    const username = brandName.toLowerCase().replace(/[^a-z0-9]/g, "") + "_brand";
    await model.insertData("users_profile", {
      user_id: userId,
      username: username,
      first_name: brandName.split(" ")[0],
      last_name: brandName.split(" ").slice(1).join(" ") || "Brand",
      iso_code: "KE",
      phone: "+254700000000",
      email_verified: "yes"
    });

    console.log(`✅ Brand created: ${brandName} (${email} / ${password})`);
    return userId;
  } catch (error: any) {
    console.error(`❌ Error creating brand ${brandName}:`, error.message);
    return null;
  }
}

async function createInfluencer(influencer: any, index: number) {
  try {
    const userId = "u" + model.getTrimedString(16);
    const password = model.generateRandomPassword();
    const hashPassword = model.hashPassword(password);
    const username = influencer.username;

    console.log(`\n=== Creating Influencer: ${influencer.first_name} ${influencer.last_name} ===`);
    console.log(`User ID: ${userId}`);
    console.log(`Username: ${username}`);
    console.log(`Password: ${password}`);

    await model.insertData("users", {
      user_id: userId,
      user_type: "influencer",
      email: `${username}@influencer.com`,
      password: hashPassword,
      status: "active",
      email_verified: "yes",
      level_id: 3
    });

    await model.insertData("users_profile", {
      user_id: userId,
      username: username,
      first_name: influencer.first_name,
      last_name: influencer.last_name,
      iso_code: "KE",
      phone: `+254700${String(index + 1).padStart(7, '0')}`,
      influencer_rating: Math.floor(Math.random() * 3) + 3,
      industry_ids: JSON.stringify([1, 2, 3]),
      platforms_most_content: JSON.stringify(influencer.platforms),
      content_types_enjoyed_most: JSON.stringify(["posts", "videos", "stories"]),
      email_verified: "yes"
    });

    for (const platform of influencer.platforms) {
      const siteId = platformMap[platform];
      if (siteId) {
        const smUsername = `${username}_${platform}`;
        const followers = influencer.followers[platform] || 1000;
        
        await model.insertData("sm_site_users", {
          site_id: siteId,
          user_id: userId,
          username: smUsername,
          is_verified: "yes",
          followers: followers,
          link: `https://${platform}.com/${smUsername}`,
          last_synced_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
        });
      }
    }

    await model.insertData("user_industries", {
      user_id: userId,
      industry_id: 1
    });

    console.log(`✅ Influencer created: ${username} (${password})`);
    return userId;
  } catch (error: any) {
    console.error(`❌ Error creating influencer ${influencer.username}:`, error.message);
    return null;
  }
}

async function createJob(brandId: string, job: any, index: number) {
  try {
    const jobId = "job" + model.getTrimedString(14);
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + job.deadline_days);

    console.log(`\n=== Creating Job: ${job.title} ===`);
    console.log(`Job ID: ${jobId}`);

    await model.insertData("jb_job_posts", {
      job_id: jobId,
      brand_id: brandId,
      title: job.title,
      description: job.description,
      comp_amount: job.comp_amount,
      comp_currency: job.comp_currency,
      comp_type: "cash",
      min_followers: 5000,
      niche: job.niche,
      deadline: deadline.toISOString().slice(0, 19).replace('T', ' '),
      status: "active",
      created_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
    });

    console.log(`✅ Job created: ${job.title}`);
    return jobId;
  } catch (error: any) {
    console.error(`❌ Error creating job ${job.title}:`, error.message);
    return null;
  }
}

async function createCampaign(brandId: string, campaign: any, index: number) {
  try {
    const campaignId = "camp" + model.getTrimedString(14);

    console.log(`\n=== Creating Campaign: ${campaign.title} ===`);
    console.log(`Campaign ID: ${campaignId}`);

    await model.insertData("act_campaigns", {
      campaign_id: campaignId,
      created_by: brandId,
      title: campaign.title,
      description: campaign.description,
      objective: campaign.objective,
      budget: campaign.budget,
      number_of_influencers: campaign.number_of_influencers,
      start_date: campaign.start_date,
      end_date: campaign.end_date,
      status: "draft",
      created_on: new Date().toISOString().slice(0, 19).replace('T', ' ')
    });

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
    const brandId = await createBrand(brand.email, brand.name, brand.description);
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

  console.log("\nNote: Use the generated passwords shown in the output above to log in.");
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