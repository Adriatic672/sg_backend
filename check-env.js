require('dotenv').config();
const mysql = require('mysql2');

const pool = mysql.createPool({
  host: process.env.HOST_NAME,
  port: parseInt(process.env.DB_PORT || process.env.PORT || '3306'),
  database: process.env.DBNAME,
  user: process.env.USER_NAME,
  password: process.env.PASSWORD,
});

console.log('Env vars:');
console.log('HOST_NAME:', process.env.HOST_NAME);
console.log('DB_PORT:', process.env.DB_PORT);
console.log('PORT:', process.env.PORT);
console.log('DBNAME:', process.env.DBNAME);
console.log('USER_NAME:', process.env.USER_NAME);

pool.query("SELECT email, user_type FROM users WHERE email LIKE '%brand.com' LIMIT 5", (err, rows) => {
  if (err) {
    console.error('Error:', err.message);
  } else {
    console.log('Users found:', rows);
  }
  pool.end();
});