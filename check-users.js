require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: 'sg-backend-0cs6.onrender.com',
  port: 26523,
  user: 'root',
  password: 'hLmZUoJdSshZuEbUvhITGppJrNTVbhEo',
  database: 'socialgems_test'
});

async function check() {
  const conn = await pool.getConnection();
  const [users] = await conn.execute(`SELECT user_id, email, user_type, status, LEFT(password, 20) as pwd_prefix FROM users WHERE email LIKE '%brand.com%' OR email LIKE '%influencer.com%' LIMIT 10`);
  console.log(JSON.stringify(users, null, 2));
  conn.release();
  await pool.end();
}
check();