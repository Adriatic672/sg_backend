import express, { Request, Response } from 'express';
import * as crypto from 'crypto';
import Model from "../helpers/model";
import db from "../helpers/db.helper";
import EmailSender from "../helpers/email.helper";

const router = express.Router();
const model = new Model();

function randomId(prefix: string, len: number): string {
  return prefix + crypto.randomBytes(len).toString('hex').substring(0, len);
}

function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

router.get('/ping-db', async (_req: Request, res: Response) => {
  try {
    const result = await db.pdo('SELECT 1 AS ok');
    res.json({ db: 'connected', result });
  } catch (error: any) {
    res.status(500).json({ db: 'failed', error: error.message, code: error.code });
  }
});

router.post('/debug-login', async (req: Request, res: Response) => {
  const { email } = req.body;
  console.log('Debug login - email:', email);

  const users: any = await model.callQuerySafe(`SELECT user_id, email, user_type, status FROM users WHERE email = '${email}'`);
  console.log('Users found:', users.length, users);

  res.json({ email, usersFound: users.length, users });
});

router.post('/seed-affiliate', async (_req: Request, res: Response) => {
  const brandEmail = 'business@example1.com';
  const password = 'password@123';
  const hashedPassword = sha256(password);
  const placeholderImage = 'https://social-gems.s3.amazonaws.com/gems/placeholder.png';

  try {
    // Check if already exists
    const existing: any = await db.pdo(
      `SELECT user_id, business_id FROM users WHERE email = ? AND user_type = 'brand'`,
      [brandEmail]
    );

    let brandId: string;

    if (existing.length > 0) {
      brandId = existing[0].business_id;
      await db.pdo(`UPDATE users SET password = ? WHERE user_id = ?`, [hashedPassword, existing[0].user_id]);
    } else {
      brandId = randomId('b', 16);
      const staffId = randomId('stf', 20);

      await db.pdo(
        `INSERT INTO users (user_id, business_id, user_type, email, password, status, email_verified) VALUES (?, ?, 'brand', ?, ?, 'active', 'yes')`,
        [brandId, brandId, brandEmail, hashedPassword]
      );
      await db.pdo(
        `INSERT INTO business_profile (business_id, name, description, owner_id, phone, email, is_registered, country, verification_status, created_by_type) VALUES (?, ?, ?, ?, '+254700000001', ?, 'yes', 'KE', 'verified', 'brand')`,
        [brandId, 'Business Affiliate 1', 'Affiliate partner for testing and demonstration purposes', staffId, brandEmail]
      );
      await db.pdo(
        `INSERT INTO business_staff (staff_id, business_id, first_name, last_name, email, role, added_by, password, status, verification_status) VALUES (?, ?, 'Business', 'Admin', ?, 'owner', ?, ?, 'active', 'verified')`,
        [staffId, brandId, brandEmail, staffId, hashedPassword]
      );
      await db.pdo(
        `INSERT INTO users_profile (user_id, username, first_name, last_name, iso_code, phone, email_verified) VALUES (?, 'businessaffiliate1_brand', 'Business', 'Admin', 'KE', '+254700000001', 'yes')`,
        [brandId]
      );
    }

    const affiliateCampaigns = [
      {
        title: 'Affiliate - Tech Product Launch',
        description: 'Promote the latest tech gadgets and earn commission on every sale. 15% commission on all referred sales.',
        objective: 'Drive sales through affiliate referrals',
        budget: 10000, number_of_influencers: 50,
        start_date: '2026-05-01', end_date: '2026-07-31',
        affiliate_link: 'https://business.example1.com/affiliate/tech-launch?ref=socialgems'
      },
      {
        title: 'Affiliate - Fashion Collection',
        description: 'Partner with us to showcase our new summer fashion line. Earn 20% commission on all sales.',
        objective: 'Generate affiliate sales and brand awareness',
        budget: 8000, number_of_influencers: 30,
        start_date: '2026-05-15', end_date: '2026-08-15',
        affiliate_link: 'https://business.example1.com/affiliate/fashion-collection?ref=socialgems'
      },
      {
        title: 'Affiliate - Wellness Products',
        description: 'Promote our organic wellness supplements. Earn recurring commissions on subscription-based products.',
        objective: 'Build long-term affiliate partnerships',
        budget: 12000, number_of_influencers: 40,
        start_date: '2026-06-01', end_date: '2026-09-30',
        affiliate_link: 'https://business.example1.com/affiliate/wellness?ref=socialgems'
      }
    ];

    const created: string[] = [];
    const skipped: string[] = [];

    for (const c of affiliateCampaigns) {
      const dup: any = await db.pdo(
        `SELECT campaign_id FROM act_campaigns WHERE title = ? AND created_by = ?`,
        [c.title, brandId]
      );
      if (dup.length > 0) { skipped.push(c.title); continue; }

      const campaignId = randomId('camp', 14);
      await db.pdo(
        `INSERT INTO act_campaigns (campaign_id, created_by, title, description, objective, budget, number_of_influencers, start_date, end_date, status, created_on, earning_type, affiliate_link, image_urls) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', NOW(), 'affiliate', ?, ?)`,
        [campaignId, brandId, c.title, c.description, c.objective, c.budget, c.number_of_influencers, c.start_date, c.end_date, c.affiliate_link, placeholderImage]
      );
      created.push(c.title);
    }

    res.json({
      status: 200,
      message: 'Affiliate dummy data seeded',
      credentials: { email: brandEmail, password },
      brandId,
      campaignsCreated: created,
      campaignsSkipped: skipped
    });
  } catch (error: any) {
    res.status(500).json({ status: 500, message: error.message });
  }
});

// Temporary test route for SMTP2GO (protected by secret)
router.get('/send-test-email', async (req: Request, res: Response) => {
  const { to, secret } = req.query;

  const expectedSecret = process.env.EMAIL_TEST_SECRET;

  if (!expectedSecret || secret !== expectedSecret) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  if (!to || typeof to !== 'string') {
    return res.status(400).json({ error: 'Missing "to" query parameter' });
  }

  try {
    const emailSender = new EmailSender();

    const success = await emailSender.sendMail(
      to,
      'SMTP2GO Test from Render',
      'SMTP2GO Integration Test',
      `This is a test email sent from the deployed app on Render using SMTP2GO.<br><br>
       Timestamp: ${new Date().toISOString()}<br>
       Recipient: ${to}`
    );

    if (success) {
      res.json({ success: true, message: `Test email sent to ${to}` });
    } else {
      res.status(500).json({ success: false, message: 'Failed to send email' });
    }
  } catch (error: any) {
    console.error('Test email error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;