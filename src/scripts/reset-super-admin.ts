import Model from "../helpers/model";
import dotenv from "dotenv";

dotenv.config();

const model = new Model();

const SUPER_ADMIN = {
  first_name: "System",
  last_name: "Administrator",
  email: "admin@socialgems.com",
  password: "Admin123!",
  country: "KE",
};

async function resetSuperAdmin() {
  try {
    console.log("===========================================");
    console.log("     RESETTING SUPER ADMIN USER");
    console.log("===========================================");

    const hashedPassword = model.hashPassword(SUPER_ADMIN.password);
    const existing = await model.callQuerySafe(
      "SELECT user_id, email FROM admin_users WHERE email = ? LIMIT 1",
      [SUPER_ADMIN.email]
    );

    if (existing.length > 0) {
      await model.callQuerySafe(
        `UPDATE admin_users
         SET first_name = ?,
             last_name = ?,
             country = ?,
             password = ?,
             role = 'super_admin',
             user_type = 'admin',
             status = 'active',
             level_id = 1,
             email_verified = 'yes',
             has_temporary_password = false
         WHERE email = ?`,
        [
          SUPER_ADMIN.first_name,
          SUPER_ADMIN.last_name,
          SUPER_ADMIN.country,
          hashedPassword,
          SUPER_ADMIN.email,
        ]
      );

      console.log("Super admin reset successfully.");
    } else {
      await model.insertData("admin_users", {
        user_id: model.getRandomString(),
        first_name: SUPER_ADMIN.first_name,
        last_name: SUPER_ADMIN.last_name,
        email: SUPER_ADMIN.email,
        country: SUPER_ADMIN.country,
        password: hashedPassword,
        role: "super_admin",
        user_type: "admin",
        status: "active",
        level_id: 1,
        email_verified: "yes",
        has_temporary_password: false,
      });

      console.log("Super admin created successfully.");
    }

    console.log("\nCredentials:");
    console.log(`  Email: ${SUPER_ADMIN.email}`);
    console.log(`  Password: ${SUPER_ADMIN.password}`);
    console.log("\nChange this password after logging in.");
    process.exit(0);
  } catch (error: any) {
    console.error("Error resetting super admin:", error.message || error);
    process.exit(1);
  }
}

resetSuperAdmin();
