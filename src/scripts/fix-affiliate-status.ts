import 'dotenv/config';
import * as mysql from 'mysql2/promise';

const pool = mysql.createPool({
  connectionLimit: 2,
  host: process.env.HOST_NAME || process.env.DB_HOST || 'sg-backend-0cs6.onrender.com',
  port: parseInt(process.env.DB_PORT || process.env.PORT || '26523'),
  user: process.env.USER_NAME || process.env.DB_USER || 'root',
  password: process.env.PASSWORD || process.env.DB_PASSWORD || 'hLmZUoJdSshZuEbUvhITGppJrNTVbhEo',
  database: process.env.DBNAME || process.env.DB_NAME || 'socialgems_test',
  ssl: { rejectUnauthorized: false },
  connectTimeout: 60000,
});

(async () => {
  const conn = await pool.getConnection();
  const [r]: any = await conn.execute(
    `UPDATE act_campaigns SET status = 'active'
     WHERE created_by = (SELECT user_id FROM users WHERE email = 'business@example1.com')
     AND earning_type = 'affiliate'`
  );
  conn.release();
  console.log(`Updated ${r.affectedRows} affiliate campaign(s) to active.`);
  await pool.end();
})().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });
