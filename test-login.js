require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: 'sg-backend-0cs6.onrender.com',
  port: 26523,
  user: 'root',
  password: 'hLmZUoJdSshZuEbUvhITGppJrNTVbhEo',
  database: 'socialgems_test'
});

const crypto = require('crypto');

async function testLogin(email, password) {
  const conn = await pool.getConnection();
  
  // Test exactly what the login query does
  const [users] = await conn.execute(
    `SELECT user_id, status, level_id, email, user_type, email_verified, password FROM users WHERE email = ?`,
    [email]
  );
  
  console.log('Email:', email);
  console.log('Users found:', users.length);
  console.log('User:', users[0]);
  
  if (users.length > 0) {
    const user = users[0];
    console.log('\nPassword verification:');
    console.log('Input password:', password);
    console.log('Stored hash:', user.password);
    
    // SHA-256 test
    const sha256Hash = crypto.createHash('sha256').update(password).digest('hex');
    console.log('SHA-256 of input:', sha256Hash);
    console.log('Match (SHA256):', sha256Hash === user.password);
    
    // bcrypt test
    const bcrypt = require('bcrypt');
    console.log('Match (bcrypt):', bcrypt.compareSync(password, user.password));
  }
  
  conn.release();
  await pool.end();
}

// Test with exact email from DB
testLogin('fashionhub@brand.com', 'TempPass1!')
  .then(() => process.exit(0))
  .catch(e => { console.error(e); process.exit(1); });