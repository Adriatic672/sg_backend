import 'dotenv/config';
import * as mysql from 'mysql2/promise';

const pool = mysql.createPool({
  connectionLimit: 2,
  host: process.env.HOST_NAME || process.env.DB_HOST || 'sg-backend-0cs6.onrender.com',
  port: parseInt(process.env.DB_PORT || '26523'),
  user: process.env.USER_NAME || 'root',
  password: process.env.PASSWORD || 'hLmZUoJdSshZuEbUvhITGppJrNTVbhEo',
  database: process.env.DBNAME || 'socialgems_test',
  ssl: { rejectUnauthorized: false },
  connectTimeout: 60000,
});

(async () => {
  const conn = await pool.getConnection();

  const [users]: any = await conn.execute(
    `SELECT u.user_id, u.email, u.status FROM users u WHERE u.email = 'business@example1.com'`
  );
  console.log('users row:', users[0]);

  const userId = users[0]?.user_id;

  const [profile]: any = await conn.execute(
    `SELECT user_id, username, first_name, last_name FROM users_profile WHERE user_id = ?`, [userId]
  );
  console.log('users_profile row:', profile[0] ?? 'MISSING');

  const [bp]: any = await conn.execute(
    `SELECT business_id, name, verification_status FROM business_profile WHERE business_id = ?`, [userId]
  );
  console.log('business_profile row:', bp[0] ?? 'MISSING');

  conn.release();
  await pool.end();
})().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });
