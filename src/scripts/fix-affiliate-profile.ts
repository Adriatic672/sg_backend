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

  const [r]: any = await conn.execute(
    `UPDATE users_profile
     SET username = 'businessaffiliate1_brand', first_name = 'Business', last_name = 'Affiliate'
     WHERE user_id = 'bd2a919fbf8714ecd870c0d370d58d110'`
  );
  console.log('users_profile updated:', r.affectedRows, 'row(s)');

  const [r2]: any = await conn.execute(
    `UPDATE business_profile SET name = 'Business Affiliate 1' WHERE business_id = 'bd2a919fbf8714ecd870c0d370d58d110'`
  );
  console.log('business_profile updated:', r2.affectedRows, 'row(s)');

  conn.release();
  await pool.end();
})().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });
