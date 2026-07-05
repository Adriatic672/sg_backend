require('dotenv').config();
const mysql = require('mysql2/promise');
const crypto = require('crypto');

const pool = mysql.createPool({
  host: 'sg-backend-0cs6.onrender.com',
  port: 26523,
  user: 'root',
  password: 'hLmZUoJdSshZuEbUvhITGppJrNTVbhEo',
  database: 'socialgems_test',
  waitForConnections: true,
  connectionLimit: 10
});

function randId(prefix, len) {
  return prefix + Math.random().toString(36).substring(2, 2 + len) + Date.now().toString(36).substring(2, 10);
}

function hashPwd(pwd) {
  return crypto.createHash('sha256').update(pwd).digest('hex');
}

const brands = [
  { email: "fashionhub@brand.com", name: "FashionHub Kenya", desc: "Leading fashion brand" },
  { email: "techgear@brand.com", name: "TechGear Africa", desc: "Premier tech retailer" },
  { email: "healthylife@brand.com", name: "HealthyLife Organics", desc: "Organic health products" },
  { email: "beautybliss@brand.com", name: "BeautyBliss Cosmetics", desc: "Premium skincare" },
  { email: "fitlife@brand.com", name: "FitLife Gym", desc: "Fitness center" },
];

const influencers = [
  { fn: "Amina", ln: "Ochieng", un: "amina_style", plats: ["instagram", "tiktok"], flw: { instagram: 45000, tiktok: 82000 } },
  { fn: "Brian", ln: "Muthama", un: "brian_tech", plats: ["instagram", "twitter", "tiktok"], flw: { instagram: 28000, twitter: 15000, tiktok: 65000 } },
  { fn: "Clara", ln: "Wambui", un: "clara_wellness", plats: ["instagram", "tiktok", "youtube"], flw: { instagram: 120000, tiktok: 95000, youtube: 45000 } },
  { fn: "David", ln: "Kiprop", un: "david_fitness", plats: ["instagram", "tiktok"], flw: { instagram: 35000, tiktok: 72000 } },
  { fn: "Fatuma", ln: "Hassan", un: "fatuma_beauty", plats: ["instagram", "tiktok"], flw: { instagram: 89000, tiktok: 55000 } },
  { fn: "George", ln: "Omondi", un: "george_travels", plats: ["instagram", "youtube"], flw: { instagram: 67000, youtube: 38000 } },
  { fn: "Hawa", ln: "Kariuki", un: "hawa_foodie", plats: ["instagram", "tiktok"], flw: { instagram: 52000, tiktok: 98000 } },
  { fn: "Ivan", ln: "Maina", un: "ivan_gaming", plats: ["twitter", "tiktok"], flw: { twitter: 18000, tiktok: 125000 } },
  { fn: "Janet", ln: "Akinyi", un: "janet_mom", plats: ["instagram", "tiktok"], flw: { instagram: 150000, tiktok: 78000 } },
  { fn: "Kevin", ln: "Otieno", un: "kevin_music", plats: ["instagram", "twitter", "tiktok"], flw: { instagram: 92000, twitter: 45000, tiktok: 110000 } },
];

const platMap = { instagram: 4, tiktok: 2, twitter: 1, facebook: 3, youtube: 6 };

async function run() {
  const conn = await pool.getConnection();
  try {
    console.log('=== SEEDING STARTED ===\n');

    // Create brands
    for (let i = 0; i < brands.length; i++) {
      const b = brands[i];
      const uid = randId('b', 16);
      const sid = randId('stf', 20);
      const pwd = `TempPass${i + 1}!`;
      const hp = hashPwd(pwd);

      // Use exact query from accounts.model.ts login
      await conn.execute(
        `INSERT INTO users (user_id, status, email, user_type, password, email_verified, role, business_id, level_id) VALUES (?, 'active', ?, 'brand', ?, 'yes', 'admin', ?, 1)`,
        [uid, b.email, hp, uid]
      );
      await conn.execute(
        `INSERT INTO business_profile (business_id, name, address, description, owner_id, phone, email, is_registered, country, verification_status, created_by_type, rejection_reason) VALUES (?, ?, 'Nairobi, Kenya', ?, ?, '+254700000000', ?, 'yes', 'KE', 'pending', 'brand', '')`,
        [uid, b.name, b.desc, sid, b.email]
      );
      await conn.execute(
        `INSERT INTO users_profile (user_id, username, first_name, last_name, iso_code, phone, influencer_rating, platforms_most_content) VALUES (?, ?, ?, ?, 'KE', '+254700000000', ?, ?)`,
        [uid, b.name.toLowerCase().replace(/[^a-z0-9]/g, '') + '_brand', b.name.split(' ')[0], b.name.split(' ').slice(1).join(' ') || 'Brand', 3, JSON.stringify(['instagram', 'facebook'])]
      );
      console.log(`✅ Brand: ${b.name} | ${b.email} / ${pwd}`);
    }

    // Create influencers
    for (let i = 0; i < influencers.length; i++) {
      const inf = influencers[i];
      const uid = randId('u', 16);
      const pwd = `TempPass${i + 1}!`;
      const hp = hashPwd(pwd);

      await conn.execute(
        `INSERT INTO users (user_id, user_type, email, password, status, email_verified, role, business_id, level_id) VALUES (?, 'influencer', ?, ?, 'active', 'yes', 'admin', '', 3)`,
        [uid, `${inf.un}@influencer.com`, hp]
      );
      await conn.execute(
        `INSERT INTO users_profile (user_id, username, first_name, last_name, iso_code, phone, influencer_rating, platforms_most_content) VALUES (?, ?, ?, ?, 'KE', ?, ?, ?)`,
        [uid, inf.un, inf.fn, inf.ln, `+254700${String(i+1).padStart(7,'0')}`, Math.floor(Math.random() * 3) + 3, JSON.stringify(inf.plats)]
      );

      for (const pl of inf.plats) {
        const sid = platMap[pl];
        if (sid) await conn.execute(
          `INSERT INTO sm_site_users (site_id, user_id, username, is_verified, followers, link, last_synced_at) VALUES (?, ?, ?, 'yes', ?, ?, NOW())`,
          [sid, uid, `${inf.un}_${pl}`, inf.flw[pl] || 1000, `https://${pl}.com/${inf.un}_${pl}`]
        );
      }
      await conn.execute(`INSERT INTO user_industries (user_in_id, user_id, industry_id) VALUES (?, ?, 1)`, [uid, uid]);
      console.log(`✅ Influencer: @${inf.un} | ${inf.un}@influencer.com / ${pwd}`);
    }

    // Create jobs
    const jobs = [
      { title: "Summer Collection Launch", amt: 15000, niche: "Fashion", days: 14 },
      { title: "Tech Review Video", amt: 25000, niche: "Technology", days: 21 },
      { title: "Organic Product Unboxing", amt: 18000, niche: "Health", days: 10 },
      { title: "Makeup Tutorial", amt: 12000, niche: "Beauty", days: 7 },
      { title: "Fitness Challenge", amt: 30000, niche: "Fitness", days: 35 },
    ];
    const [brandRows] = await conn.execute(`SELECT business_id FROM business_profile ORDER BY created_on DESC LIMIT 5`);
    for (let i = 0; i < brandRows.length; i++) {
      const j = jobs[i];
      const jid = randId('job', 14);
      const dl = new Date(); dl.setDate(dl.getDate() + j.days);
      await conn.execute(
        `INSERT INTO jb_job_posts (job_id, brand_id, title, description, comp_amount, comp_currency, comp_type, min_followers, niche, deadline, status) VALUES (?, ?, ?, ?, ?, 'KES', 'cash', 5000, ?, ?, 'active')`,
        [jid, brandRows[i].business_id, j.title, `Create content for ${j.title}`, j.amt, j.niche, dl.toISOString().slice(0, 10)]
      );
      console.log(`✅ Job: ${j.title}`);
    }

    // Create campaigns
    const camps = [
      { title: "Back to School Promo", budget: 5000, start: "2026-05-01", end: "2026-06-30", num: 10 },
      { title: "Ramadan Sale", budget: 8000, start: "2026-03-01", end: "2026-04-20", num: 15 },
      { title: "Smart Watch Launch", budget: 10000, start: "2026-04-15", end: "2026-05-15", num: 20 },
    ];
    for (let i = 0; i < brandRows.length; i++) {
      const c = camps[i % camps.length];
      const cid = randId('camp', 14);
      await conn.execute(
        `INSERT INTO act_campaigns (campaign_id, created_by, title, description, objective, budget, number_of_influencers, start_date, end_date, status, image_urls) VALUES (?, ?, ?, ?, 'Brand awareness', ?, ?, ?, ?, 'draft', '[]')`,
        [cid, brandRows[i].business_id, c.title, `Promote ${c.title}`, c.budget, c.num, c.start, c.end]
      );
      console.log(`✅ Campaign: ${c.title}`);
    }

    console.log('\n=== SEEDING COMPLETE ===');
    console.log('\nBrand Logins: ' + brands.map((b, i) => `${b.email}/TempPass${i+1}!`).join(', '));
    console.log('Influencer Logins: ' + influencers.map((inf, i) => `${inf.un}@influencer.com/TempPass${i+1}!`).join(', '));

  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    conn.release();
    await pool.end();
  }
}

run();