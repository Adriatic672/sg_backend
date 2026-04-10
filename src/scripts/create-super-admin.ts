import Model from "../helpers/model";
import dotenv from 'dotenv';

dotenv.config();

const model = new Model();

const SUPER_ADMIN = {
  first_name: "System",
  last_name: "Administrator",
  email: "admin@socialgems.com",
  password: "Admin123!",
  country: "KE"
};

async function createSuperAdmin() {
  try {
    console.log("===========================================");
    console.log("     CREATING SUPER ADMIN USER     ");
    console.log("===========================================");

    // Check if super admin already exists
    const existing = await model.callQuerySafe(
      `SELECT * FROM admin_users WHERE role = 'super_admin' AND email = ?`,
      [SUPER_ADMIN.email]
    );

    if (existing.length > 0) {
      console.log(`❌ Super admin already exists with email: ${SUPER_ADMIN.email}`);
      console.log("\nExisting user details:");
      console.log(`  User ID: ${existing[0].user_id}`);
      console.log(`  Email: ${existing[0].email}`);
      console.log(`  Name: ${existing[0].first_name} ${existing[0].last_name}`);
      console.log(`  Status: ${existing[0].status}`);
      process.exit(0);
    }

    const hashedPassword = model.hashPassword(SUPER_ADMIN.password);

    const superAdmin = {
      user_id: model.getRandomString(),
      first_name: SUPER_ADMIN.first_name,
      last_name: SUPER_ADMIN.last_name,
      email: SUPER_ADMIN.email,
      country: SUPER_ADMIN.country,
      password: hashedPassword,
      role: "super_admin",
      user_type: "admin",
      status: 'active',
      level_id: 1,
      email_verified: 'yes',
      has_temporary_password: true
    };

    await model.insertData("admin_users", superAdmin);

    console.log("✅ Super admin created successfully!");
    console.log("\nCredentials:");
    console.log(`  Email: ${SUPER_ADMIN.email}`);
    console.log(`  Password: ${SUPER_ADMIN.password}`);
    console.log("\n⚠️  IMPORTANT: Change this password immediately after first login!");
    console.log("\nYou can now use these credentials to login to the admin dashboard.");

    process.exit(0);
  } catch (error: any) {
    console.error("❌ Error creating super admin:", error.message);
    process.exit(1);
  }
}

createSuperAdmin();
