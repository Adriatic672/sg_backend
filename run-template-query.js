require('dotenv').config();
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(
  process.env.DBNAME,
  process.env.USER_NAME,
  process.env.PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: 'mysql',
    logging: false,
  }
);

async function runQuery() {
  try {
    await sequelize.authenticate();
    console.log('✅ Connected to database successfully.\n');

    const [results] = await sequelize.query(`
      SELECT operation, title, body 
      FROM notification_templates 
      WHERE operation = 'RESET_PASSWORD_REQUEST'
    `);

    if (results.length === 0) {
      console.log('❌ No row found for operation = "RESET_PASSWORD_REQUEST"');
    } else {
      console.log('✅ Found template:');
      console.dir(results[0], { depth: null });
    }
  } catch (error) {
    console.error('❌ Database connection or query failed:');
    console.error(error);
  } finally {
    await sequelize.close();
  }
}

runQuery();
